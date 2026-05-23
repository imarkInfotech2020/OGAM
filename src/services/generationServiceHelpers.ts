/**
 * GenerationService helper implementations — extracted to keep generationService.ts under 350 lines.
 * All functions receive the GenerationService instance as `svc: any` and mutate its internal state.
 */
import { llmService } from './llm';
import { liteRTService } from './litert';
import { useAppStore, useChatStore, useRemoteServerStore } from '../stores';
import { useDebugLogsStore } from '../stores/debugLogsStore';
import type { Message, GenerationMeta } from '../types';
import { runToolLoop, buildLiteRTHistory } from './generationToolLoop';
import type { ToolResult } from './tools/types';
import type { GenerationOptions, CompletionResult } from './providers/types';
import logger from '../utils/logger';

export const FLUSH_INTERVAL_MS = 50; // ~20 updates/sec
type StreamChunk = string | { content?: string; reasoningContent?: string };

/** Returns true when the currently active model uses LiteRT engine. */
function isLiteRTActive(): boolean {
  const { downloadedModels, activeModelId } = useAppStore.getState();
  const activeModel = downloadedModels.find((m: any) => m.id === activeModelId);
  return activeModel?.engine === 'litert';
}

export interface GenerationRequest {
  conversationId: string;
  messages: Message[];
  onFirstToken?: () => void;
}

export interface GenerationWithToolsRequest {
  conversationId: string;
  messages: Message[];
  options: {
    enabledToolIds: string[];
    projectId?: string;
    onToolCallStart?: (name: string, args: Record<string, any>) => void;
    onToolCallComplete?: (name: string, result: ToolResult) => void;
    onFirstToken?: () => void;
  };
}

export function buildGenerationMetaImpl(svc: any): GenerationMeta {
  if (svc.isUsingRemoteProvider()) {
    const remoteStore = useRemoteServerStore.getState();
    const activeServer = remoteStore.getActiveServer();
    // Estimate token count from streaming content (roughly 4 chars per token), including reasoning tokens
    const contentLength = svc.state.streamingContent.length + svc.totalReasoningLength;
    const estimatedTokens = Math.ceil(contentLength / 4);
    const generationTime = svc.state.startTime ? (Date.now() - svc.state.startTime) / 1000 : 0;
    const tokensPerSecond = generationTime > 0 ? estimatedTokens / generationTime : undefined;

    return {
      gpu: false,
      gpuBackend: 'Remote',
      modelName: activeServer?.name || 'Remote Model',
      tokenCount: estimatedTokens,
      tokensPerSecond,
      timeToFirstToken: svc.remoteTimeToFirstToken,
    };
  }

  const { downloadedModels, activeModelId, settings } = useAppStore.getState();
  const modelName = downloadedModels.find((m: any) => m.id === activeModelId)?.name;

  // LiteRT path — use real BenchmarkInfo stats if available, else estimate
  if (isLiteRTActive()) {
    const backend = liteRTService.getActiveBackend() ?? 'cpu';
    // svc.liteRTBenchmarkStats is set on the direct (non-tool) path;
    // liteRTService.getLastBenchmarkStats() covers the generateRaw (tool loop) path
    const stats = svc.liteRTBenchmarkStats ?? liteRTService.getLastBenchmarkStats();
    if (stats) {
      return {
        gpu: backend !== 'cpu',
        gpuBackend: backend.toUpperCase(),
        modelName,
        decodeTokensPerSecond: stats.decodeTokensPerSecond,
        prefillTokensPerSecond: stats.prefillTokensPerSecond,
        timeToFirstToken: stats.ttft,
        tokenCount: stats.prefillTokenCount,
        modelLoadTimeSeconds: stats.initTimeSeconds > 0 ? stats.initTimeSeconds : undefined,
      };
    }
    // BenchmarkInfo unavailable — return backend info only, no estimated tps
    return {
      gpu: backend !== 'cpu',
      gpuBackend: backend.toUpperCase(),
      modelName,
    };
  }

  // llama.cpp path — real perf data from native engine
  const { gpu, gpuBackend, gpuLayers } = llmService.getGpuInfo();
  const perf = llmService.getPerformanceStats();
  return {
    gpu, gpuBackend, gpuLayers,
    modelName,
    tokensPerSecond: perf.lastTokensPerSecond,
    decodeTokensPerSecond: perf.lastDecodeTokensPerSecond,
    timeToFirstToken: perf.lastTimeToFirstToken,
    tokenCount: perf.lastTokenCount,
    cacheType: settings.cacheType,
  };
}

export function buildToolLoopHandlersImpl(svc: any) {
  return {
    isAborted: () => svc.abortRequested,
    onThinkingDone: () => svc.updateState({ isThinking: false }),
    onStream: (data: StreamChunk) => {
      if (svc.abortRequested) return;
      const chunk = typeof data === 'string' ? { content: data } : data;
      const dbg = useDebugLogsStore.getState().addLog;
      if (chunk.content) {
        if (!svc.state.streamingContent && svc.remoteTimeToFirstToken === undefined) {
          svc.remoteTimeToFirstToken = svc.state.startTime
            ? (Date.now() - svc.state.startTime) / 1000
            : undefined;
        }
        if (!svc.state.streamingContent) {
          dbg('log', `[Stream] first content token — reasoningAccum=${svc.reasoningBuffer.length + svc.totalReasoningLength}ch flushTimer=${svc.flushTimer != null}`);
        }
        svc.state.streamingContent += chunk.content;
        svc.tokenBuffer += chunk.content;
      }
      if (chunk.reasoningContent) {
        const wasEmpty = svc.reasoningBuffer.length === 0 && svc.totalReasoningLength === 0;
        svc.reasoningBuffer += chunk.reasoningContent;
        svc.totalReasoningLength += chunk.reasoningContent.length;
        if (wasEmpty) {
          dbg('log', `[Stream] first reasoning token — token="${chunk.reasoningContent.substring(0, 40)}" flushTimer=${svc.flushTimer != null}`);
        }
      }
      if (!svc.flushTimer) {
        svc.flushTimer = setTimeout(() => svc.flushTokenBuffer(), FLUSH_INTERVAL_MS);
      }
    },
    onStreamReset: () => {
      svc.forceFlushTokens();
      svc.state.streamingContent = '';
      svc.tokenBuffer = '';
    },
    onFinalResponse: (content: string) => {
      svc.state.streamingContent = content;
      useChatStore.getState().appendToStreamingMessage(content);
    },
  };
}

export async function prepareGenerationImpl(svc: any, conversationId: string): Promise<boolean> {
  if (svc.state.isGenerating) return false;
  svc.updateState({
    isGenerating: true, isThinking: true, conversationId,
    streamingContent: '', startTime: Date.now(),
  });
  useChatStore.getState().startStreaming(conversationId);
  // Drain pending native stop so LLM is idle before we start.
  if (svc.pendingStop !== null) await svc.pendingStop;
  if (!svc.state.isGenerating) return false; // stop called during drain
  svc.abortRequested = false;

  const dbg = useDebugLogsStore.getState().addLog;

  // Check provider readiness
  const failPrepare = (msg: string) => {
    svc.resetState();
    useChatStore.getState().clearStreamingMessage();
    throw new Error(msg);
  };
  if (svc.isUsingRemoteProvider()) {
    const provider = svc.getCurrentProvider();
    if (!provider) failPrepare('Remote provider not found');
    const ready = await provider.isReady();
    if (!ready) failPrepare('Remote provider not ready');
  } else if (isLiteRTActive()) {
    const loaded = liteRTService.isModelLoaded();
    dbg('log', `[LiteRT] prepareGeneration — isLoaded=${loaded}`);
    if (!loaded) { dbg('error', '[LiteRT] prepareGeneration failed: no model loaded'); failPrepare('No LiteRT model loaded'); }
  } else {
    if (!llmService.isModelLoaded()) failPrepare('No model loaded');
    if (llmService.isCurrentlyGenerating()) failPrepare('LLM service busy');
  }

  svc.tokenBuffer = '';
  svc.reasoningBuffer = '';
  svc.totalReasoningLength = 0;
  svc.remoteTimeToFirstToken = undefined;
  return true;
}

export async function generateResponseImpl(
  svc: any,
  req: GenerationRequest,
): Promise<void> {
  const { conversationId, messages, onFirstToken } = req;
  if (!(await prepareGenerationImpl(svc, conversationId))) return;
  const chatStore = useChatStore.getState();
  let firstTokenReceived = false;

  // LiteRT path — stateful engine, send only current user message
  if (isLiteRTActive()) {
    const dbg = useDebugLogsStore.getState().addLog;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) {
      dbg('warn', '[LiteRT] generateResponse: no user message found');
      chatStore.clearStreamingMessage();
      svc.resetState();
      return;
    }
    const systemMsg = messages.find(m => m.role === 'system');
    const systemPrompt = typeof systemMsg?.content === 'string' ? systemMsg.content : '';
    const allAttachments = lastUser.attachments ?? [];
    const imageAttachment = allAttachments.find((a: any) => a.type === 'image');
    const imageUri = imageAttachment?.uri as string | undefined;

    dbg('log', `[Vision] attachments — total=${allAttachments.length} types=[${allAttachments.map((a: any) => a.type).join(',')}] imageFound=${!!imageAttachment}`);
    dbg('log', `[Vision] imageUri — ${imageUri ? imageUri.substring(0, 80) : 'none'}`);
    dbg('log', `[LiteRT] generateResponse — hasImage=${!!imageUri} conversationId=${conversationId.substring(0, 8)} messages=${messages.length} systemLen=${systemPrompt.length} userTextLen=${typeof lastUser.content === 'string' ? lastUser.content.length : 0}`);

    // Guard: image attached but model was not imported with vision support
    if (imageUri) {
      const { downloadedModels, activeModelId } = useAppStore.getState();
      const activeModel = downloadedModels.find((m: any) => m.id === activeModelId);
      dbg('log', `[Vision] model check — activeModelId=${activeModelId?.substring(0, 12)} liteRTVision=${activeModel?.liteRTVision} modelFound=${!!activeModel}`);
      if (!activeModel?.liteRTVision) {
        dbg('warn', '[Vision] BLOCKED — model does not have vision support (liteRTVision=false). Re-import model with vision enabled.');
        chatStore.clearStreamingMessage();
        svc.resetState();
        throw new Error('This model does not support images. Import it with vision enabled, or remove the image.');
      }
      dbg('log', '[Vision] model vision check passed');
    }

    const history = buildLiteRTHistory(messages);
    dbg('log', `[Vision] history built — turns=${history.length} (messages before last user turn, excluding system)`);

    try {
      const { settings } = useAppStore.getState();
      await liteRTService.prepareConversation(conversationId, systemPrompt, {
        samplerConfig: { temperature: settings.temperature, topP: settings.topP },
        history,
      });
      dbg('log', `[Vision] calling sendMessage — imageUri=${imageUri ? imageUri.substring(0, 60) : 'none'} textLen=${typeof lastUser.content === 'string' ? lastUser.content.length : 0}`);

      await liteRTService.sendMessage(
        typeof lastUser.content === 'string' ? lastUser.content : '',
        {
          onToken: (token: string) => {
            if (svc.abortRequested) return;
            if (!firstTokenReceived) {
              firstTokenReceived = true;
              svc.updateState({ isThinking: false });
              onFirstToken?.();
              dbg('log', '[LiteRT] first token received');
            }
            svc.state.streamingContent += token;
            svc.tokenBuffer += token;
            if (!svc.flushTimer) {
              svc.flushTimer = setTimeout(() => svc.flushTokenBuffer(), FLUSH_INTERVAL_MS);
            }
          },
          onReasoning: (token: string) => {
            if (svc.abortRequested) return;
            svc.reasoningBuffer += token;
            if (!svc.flushTimer) {
              svc.flushTimer = setTimeout(() => svc.flushTokenBuffer(), FLUSH_INTERVAL_MS);
            }
          },
          onComplete: (_content: string, _reasoning: string, stats) => {
            if (svc.abortRequested) return;
            svc.forceFlushTokens();
            svc.liteRTBenchmarkStats = stats;
            const generationTime = svc.state.startTime ? Date.now() - svc.state.startTime : undefined;
            dbg('log', `[LiteRT] generation complete — ${generationTime}ms, tok/s=${stats?.decodeTokensPerSecond?.toFixed(1) ?? 'n/a'}`);
            chatStore.finalizeStreamingMessage(conversationId, generationTime, buildGenerationMetaImpl(svc));
            svc.checkSharePrompt();
            svc.resetState();
          },
          onError: (err: Error) => {
            if (svc.abortRequested) return;
            dbg('error', `[LiteRT] sendMessage error: ${err.message}`);
            if (svc.flushTimer) { clearTimeout(svc.flushTimer); svc.flushTimer = null; }
            svc.tokenBuffer = '';
            chatStore.clearStreamingMessage();
            svc.resetState();
          },
        },
        imageUri,
      );
    } catch (error: any) {
      if (svc.abortRequested) return;
      dbg('error', `[LiteRT] generateResponse caught: ${error?.message ?? error}`);
      if (svc.flushTimer) { clearTimeout(svc.flushTimer); svc.flushTimer = null; }
      svc.tokenBuffer = '';
      chatStore.clearStreamingMessage();
      svc.resetState();
      throw error;
    }
    return;
  }

  // llama.cpp path — unchanged
  try {
    await llmService.generateResponse(
      messages,
      (data) => {
        if (svc.abortRequested) return;
        const chunk = typeof data === 'string' ? { content: data, reasoningContent: undefined } : data;
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          svc.updateState({ isThinking: false });
          onFirstToken?.();
        }
        if (chunk.content) {
          svc.state.streamingContent += chunk.content;
          svc.tokenBuffer += chunk.content;
        }
        if (chunk.reasoningContent) {
          svc.reasoningBuffer += chunk.reasoningContent;
        }
        if (!svc.flushTimer) {
          svc.flushTimer = setTimeout(() => svc.flushTokenBuffer(), FLUSH_INTERVAL_MS);
        }
      },
      () => {
        // If aborted, stopGeneration() already handled cleanup — don't clobber new generation state.
        if (svc.abortRequested) return;
        svc.forceFlushTokens();
        const generationTime = svc.state.startTime ? Date.now() - svc.state.startTime : undefined;
        chatStore.finalizeStreamingMessage(conversationId, generationTime, buildGenerationMetaImpl(svc));
        svc.checkSharePrompt();
        svc.resetState();
      },
    );
  } catch (error) {
    if (svc.abortRequested) return;
    logger.error('[GenerationService] Generation error:', error);
    if (svc.flushTimer) { clearTimeout(svc.flushTimer); svc.flushTimer = null; }
    svc.tokenBuffer = '';
    chatStore.clearStreamingMessage();
    svc.resetState();
    throw error;
  }
}

export async function generateRemoteResponseImpl(
  svc: any,
  req: GenerationRequest,
): Promise<void> {
  const { conversationId, messages, onFirstToken } = req;
  if (!(await prepareGenerationImpl(svc, conversationId))) return;
  const chatStore = useChatStore.getState();
  const provider = svc.getCurrentProvider();

  if (!provider) { svc.resetState(); throw new Error('No remote provider available'); }
  let firstTokenReceived = false;
  svc.remoteTimeToFirstToken = undefined;

  svc.currentRemoteAbortController = new AbortController();
  // Capture signal per-generation so callbacks stay guarded even after
  // abortRequested is reset by the next generation's prepareGeneration().
  const { signal: generationSignal } = svc.currentRemoteAbortController;

  const { temperature, maxTokens, topP, thinkingEnabled } = useAppStore.getState().settings;
  const options: GenerationOptions = {
    temperature, maxTokens, topP,
    stopSequences: [],
    enableThinking: thinkingEnabled && provider.capabilities.supportsThinking,
  };

  try {
    await provider.generate(messages, options, {
      onToken: (token: string) => {
        if (generationSignal.aborted) return;
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          svc.remoteTimeToFirstToken = svc.state.startTime
            ? (Date.now() - svc.state.startTime) / 1000
            : undefined;
          svc.updateState({ isThinking: false });
          onFirstToken?.();
        }
        svc.state.streamingContent += token;
        svc.tokenBuffer += token;
        if (!svc.flushTimer) {
          svc.flushTimer = setTimeout(() => svc.flushTokenBuffer(), FLUSH_INTERVAL_MS);
        }
      },
      onReasoning: (content: string) => {
        if (generationSignal.aborted) return;
        svc.reasoningBuffer += content;
        svc.totalReasoningLength += content.length;
        if (!svc.flushTimer) {
          svc.flushTimer = setTimeout(() => svc.flushTokenBuffer(), FLUSH_INTERVAL_MS);
        }
      },
      onComplete: (_result: CompletionResult) => {
        if (generationSignal.aborted) return;
        svc.forceFlushTokens();
        const generationTime = svc.state.startTime ? Date.now() - svc.state.startTime : undefined;
        chatStore.finalizeStreamingMessage(conversationId, generationTime, buildGenerationMetaImpl(svc));
        svc.checkSharePrompt();
        svc.resetState();
      },
      onError: (error: Error) => {
        if (generationSignal.aborted) return;
        logger.error('[GenerationService] Remote generation error:', error);
        if (svc.flushTimer) { clearTimeout(svc.flushTimer); svc.flushTimer = null; }
        svc.tokenBuffer = '';
        chatStore.clearStreamingMessage();
        svc.resetState();
        throw error;
      },
    });
  } catch (error) {
    if (generationSignal.aborted) return;
    logger.error('[GenerationService] Remote generation error:', error);
    // Mark server as offline so the Remote Servers screen reflects the failure
    const failedServerId = useRemoteServerStore.getState().activeServerId;
    if (failedServerId) useRemoteServerStore.getState().updateServerHealth(failedServerId, false);
    if (svc.flushTimer) { clearTimeout(svc.flushTimer); svc.flushTimer = null; }
    svc.tokenBuffer = '';
    chatStore.clearStreamingMessage();
    svc.resetState();
    throw error;
  } finally {
    svc.currentRemoteAbortController = null;
  }
}

export async function generateRemoteWithToolsImpl(
  svc: any,
  req: GenerationWithToolsRequest,
): Promise<void> {
  const { conversationId, messages, options } = req;
  logger.log(`[GenService][DEBUG] generateRemoteWithToolsImpl — conv=${conversationId}, messages=${messages.length}, enabledToolIds=[${options.enabledToolIds.join(', ')}]`);
  if (!(await prepareGenerationImpl(svc, conversationId))) {
    logger.log(`[GenService][DEBUG] prepareGeneration returned false, aborting`);
    return;
  }
  const provider = svc.getCurrentProvider();

  if (!provider) { svc.resetState(); throw new Error('No remote provider available'); }
  logger.log(`[GenService][DEBUG] Provider ready — type=${provider.type}, capabilities=${JSON.stringify(provider.capabilities)}`);

  const { enabledToolIds, projectId, ...callbacks } = options;

  // Use the same tool loop but with remote provider
  await runToolLoop({
    conversationId, messages, enabledToolIds, projectId, callbacks,
    ...buildToolLoopHandlersImpl(svc),
    forceRemote: true,
  });

  if (svc.abortRequested) {
    logger.log(`[GenService][DEBUG] Generation was aborted, skipping finalize`);
  } else {
    svc.forceFlushTokens();
    const generationTime = svc.state.startTime ? Date.now() - svc.state.startTime : undefined;
    logger.log(`[GenService][DEBUG] Finalizing — streamingContent length=${svc.state.streamingContent?.length || 0}, generationTime=${generationTime}ms`);
    useChatStore.getState().finalizeStreamingMessage(
      conversationId, generationTime, buildGenerationMetaImpl(svc),
    );
    svc.checkSharePrompt();
    svc.resetState();
  }
}
