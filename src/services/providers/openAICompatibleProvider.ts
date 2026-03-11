/* eslint-disable max-lines, max-params, complexity */
/**
 * OpenAI-Compatible Provider
 *
 * Provider implementation for OpenAI-compatible servers (Ollama, LM Studio, LocalAI, etc.)
 * Handles model discovery, streaming generation, vision, and tool calling.
 */

import { Message } from '../../types';
import type {
  LLMProvider,
  ProviderType,
  ProviderCapabilities,
  GenerationOptions,
  StreamCallbacks,
} from './types';
import {
  createStreamingRequest,
  parseOpenAIMessage,
  imageToBase64DataUrl,
} from '../httpClient';
import { useAppStore } from '../../stores';
import logger from '../../utils/logger';
import { generateId } from '../../utils/generateId';

/** OpenAI model info */
interface _OpenAIModel {
  id: string;
  object?: string;
  owned_by?: string;
}

/** OpenAI chat message */
interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[];
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/** OpenAI content part */
interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/** OpenAI tool call */
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** OpenAI API configuration */
interface OpenAIConfig {
  endpoint: string;
  apiKey?: string;
  modelId: string;
}

/**
 * OpenAI-Compatible Provider Implementation
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly type: ProviderType = 'openai-compatible';

  private config: OpenAIConfig;
  private abortController: AbortController | null = null;
  private modelCapabilities: ProviderCapabilities;

  constructor(
    public readonly id: string,
    config: OpenAIConfig
  ) {
    this.config = config;
    this.modelCapabilities = {
      supportsVision: false,
      supportsToolCalling: true, // Assume true for OpenAI-compatible
      supportsThinking: false,
    };
  }

  get capabilities(): ProviderCapabilities {
    return this.modelCapabilities;
  }

  /**
   * Update configuration (endpoint, model, API key)
   */
  updateConfig(config: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async loadModel(modelId: string): Promise<void> {
    logger.log('[OpenAIProvider] loadModel called:', { modelId, currentEndpoint: this.config.endpoint || '(empty)' });
    this.config.modelId = modelId;
    logger.log('[OpenAIProvider] After loadModel, config:', { modelId: this.config.modelId, endpoint: this.config.endpoint });

    // For remote providers, "loading" just means setting the model ID
    // The actual model selection happens on the server

    // Try to detect capabilities from model name
    this.modelCapabilities = {
      ...this.modelCapabilities,
      supportsVision: this.detectVisionCapability(modelId),
    };
  }

  /**
   * Detect if model supports vision based on name patterns
   */
  private detectVisionCapability(modelId: string): boolean {
    const visionPatterns = [
      'vision', 'llava', 'bakllava', 'moondream', 'cogvlm',
      'cogagent', 'fuyu', 'idefics', 'qwen-vl', 'gpt-4-vision',
      'gpt-4o', 'claude-3', 'gemini', 'pixtral', 'phi-3.5-vision',
    ];
    const lowerModelId = modelId.toLowerCase();
    return visionPatterns.some(pattern => lowerModelId.includes(pattern));
  }

  async unloadModel(): Promise<void> {
    this.config.modelId = '';
    this.abortController = null;
  }

  isModelLoaded(): boolean {
    return !!this.config.modelId;
  }

  getLoadedModelId(): string | null {
    return this.config.modelId || null;
  }

  async generate(
    messages: Message[],
    options: GenerationOptions,
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!this.config.modelId) {
      callbacks.onError(new Error('No model selected'));
      return;
    }

    this.abortController = new AbortController();

    try {
      // Build the API request
      const openaiMessages = await this.buildOpenAIMessages(messages, options);

      const requestBody: Record<string, unknown> = {
        model: this.config.modelId,
        messages: openaiMessages,
        stream: true,
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.maxTokens !== undefined && { max_tokens: options.maxTokens }),
        ...(options.topP !== undefined && { top_p: options.topP }),
      };

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      // Make the streaming request
      let baseUrl = this.config.endpoint;
      while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
      const url = `${baseUrl}/v1/chat/completions`;
      logger.log('[OpenAIProvider] Making request to:', url, 'with model:', this.config.modelId);

      let fullContent = '';
      let fullReasoningContent = '';
      let toolCalls: OpenAIToolCall[] = [];
      let currentToolCall: Partial<OpenAIToolCall> | null = null;
      let completeCalled = false;
      let streamErrorOccurred = false;

      await createStreamingRequest(
        url,
        requestBody,
        headers,
        (event) => {
          // Check if aborted
          if (this.abortController?.signal.aborted) {
            return;
          }

          const message = parseOpenAIMessage(event);
          if (!message) return;

          // Handle errors — abort the XHR so no further events arrive
          if (message.error) {
            streamErrorOccurred = true;
            callbacks.onError(new Error(message.error.message || 'API error'));
            this.abortController?.abort();
            return;
          }

          // Handle completion
          if (message.object === 'done') {
            return;
          }

          // Handle streaming chunks
          if (message.choices && message.choices.length > 0) {
            const choice = message.choices[0];
            const delta = choice.delta;

            if (delta) {
              // Text content
              if (delta.content) {
                fullContent += delta.content;
                callbacks.onToken(delta.content);
              }

              // Reasoning content (Ollama extension)
              if (delta.reasoning_content) {
                fullReasoningContent += delta.reasoning_content;
                if (callbacks.onReasoning) {
                  callbacks.onReasoning(delta.reasoning_content);
                }
              }

              // Tool calls
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.id) {
                    // New tool call
                    currentToolCall = { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
                    toolCalls.push(currentToolCall as OpenAIToolCall);
                  }
                  if (tc.function?.name) {
                    if (currentToolCall) {
                      currentToolCall.function!.name = tc.function.name;
                    }
                  }
                  if (tc.function?.arguments) {
                    if (currentToolCall) {
                      currentToolCall.function!.arguments += tc.function.arguments;
                    }
                  }
                }
              }
            }

            // Check for finish reason
            if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
              // Generation complete
              completeCalled = true;
              callbacks.onComplete({
                content: fullContent,
                reasoningContent: fullReasoningContent || undefined,
                meta: {
                  gpu: false,
                  gpuBackend: 'Remote',
                },
                toolCalls: toolCalls.filter(tc => tc.function?.name).length > 0
                  ? toolCalls.filter(tc => tc.function?.name).map(tc => ({
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  })) : undefined,
              });
            }
          }
        },
        300000, // 5 minute timeout
        this.abortController.signal
      );

      // Fallback: if stream ended without a recognised finish_reason (e.g. 'length',
      // 'content_filter', null), ensure the generation is finalised.
      // Skip if an error was already reported or the stream was aborted by the user.
      const completedToolCalls = toolCalls.filter(tc => tc.function?.name);
      if (!completeCalled && !streamErrorOccurred) {
        callbacks.onComplete({
          content: fullContent,
          reasoningContent: fullReasoningContent || undefined,
          meta: { gpu: false, gpuBackend: 'Remote' },
          toolCalls: completedToolCalls.length > 0 ? completedToolCalls.map(tc => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })) : undefined,
        });
      }
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        // Cancelled by user
        callbacks.onComplete({
          content: '',
          meta: { gpu: false },
        });
        return;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      callbacks.onError(err);
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Build OpenAI chat messages from app messages
   */
  private async buildOpenAIMessages(
    messages: Message[],
    options: GenerationOptions
  ): Promise<OpenAIChatMessage[]> {
    const openaiMessages: OpenAIChatMessage[] = [];

    // Check if messages array already contains a system message
    const hasSystemMessage = messages.some(m => m.role === 'system');

    // Add system prompt if provided and no system message exists in messages
    const systemPrompt = options.systemPrompt || useAppStore.getState().settings.systemPrompt;
    if (systemPrompt && !hasSystemMessage) {
      openaiMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Convert messages
    for (const msg of messages) {
      if (msg.role === 'system') {
        openaiMessages.push({
          role: 'system',
          content: msg.content,
        });
        continue;
      }

      if (msg.role === 'tool') {
        // Tool result
        openaiMessages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId || '',
        });
        continue;
      }

      // User or assistant
      const _hasAttachments = msg.attachments && msg.attachments.length > 0;
      const hasImages = msg.attachments?.some(a => a.type === 'image');

      if (msg.role === 'user' && hasImages && this.modelCapabilities.supportsVision) {
        // Build multimodal content
        const content: OpenAIContentPart[] = [];

        // Add text first
        content.push({ type: 'text', text: msg.content });

        // Add images
        for (const attachment of msg.attachments || []) {
          if (attachment.type === 'image') {
            try {
              const dataUrl = await imageToBase64DataUrl(attachment.uri);
              content.push({
                type: 'image_url',
                image_url: { url: dataUrl },
              });
            } catch (error) {
              logger.warn('[OpenAIProvider] Failed to encode image:', error);
            }
          }
        }

        openaiMessages.push({
          role: 'user',
          content,
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant with tool calls
        openaiMessages.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id || `call_${generateId()}`,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        });
      } else {
        // Simple text message
        openaiMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return openaiMessages;
  }

  async stopGeneration(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async getTokenCount(text: string): Promise<number> {
    // Approximate token count for remote providers
    // Most models use ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  async isReady(): Promise<boolean> {
    const ready = !!this.config.modelId && !!this.config.endpoint;
    logger.log('[OpenAIProvider] isReady check:', {
      ready,
      modelId: this.config.modelId || '(empty)',
      endpoint: this.config.endpoint || '(empty)',
    });
    return ready;
  }

  async dispose(): Promise<void> {
    await this.stopGeneration();
    this.config.modelId = '';
  }
}

/**
 * Factory to create an OpenAI-compatible provider
 */
export function createOpenAIProvider(
  serverId: string,
  endpoint: string,
  apiKey?: string,
  modelId?: string
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(serverId, {
    endpoint,
    apiKey,
    modelId: modelId || '',
  });
}