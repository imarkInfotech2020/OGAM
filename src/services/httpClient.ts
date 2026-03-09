/**
 * HTTP Client for Remote LLM Servers
 *
 * Handles HTTP requests and Server-Sent Events (SSE) parsing for
 * communicating with OpenAI-compatible and Anthropic-compatible servers.
 */

import logger from '../utils/logger';

/** SSE event from streaming response */
export interface SSEEvent {
  /** Event type (e.g., "message", "content_block_delta") */
  event?: string;
  /** Event data (parsed JSON or raw string) */
  data: string | Record<string, unknown>;
  /** Raw event ID if present */
  id?: string;
}

/** Options for fetch with timeout */
export interface FetchOptions extends RequestInit {
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Retry count for failed requests */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

/** Parsed SSE message from OpenAI-compatible API */
export interface OpenAIStreamMessage {
  id?: string;
  object?: string;
  choices?: Array<{
    index?: number;
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

/** Parsed SSE message from Anthropic API */
export interface AnthropicStreamMessage {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
  };
  content_block?: {
    type?: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  message?: {
    id?: string;
    model?: string;
    stop_reason?: string;
  };
  error?: {
    type?: string;
    message?: string;
  };
}

/** Default timeouts */
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

/**
 * Fetch with timeout and retry support
 */
export async function fetchWithTimeout<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Try to parse as JSON, fall back to text
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json() as Promise<T>;
      }
      return response.text() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort (user cancelled)
      if ((error as Error).name === 'AbortError') {
        throw new Error('Request cancelled');
      }

      // Retry on network errors
      if (attempt < retries) {
        logger.log(`[HTTP] Retry ${attempt + 1}/${retries} after error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw lastError || new Error('Request failed');
}

/**
 * Parse SSE events from a stream
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<SSEEvent, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: Partial<SSEEvent> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          // Empty line signals end of event
          if (currentEvent.data !== undefined) {
            yield {
              event: currentEvent.event,
              data: currentEvent.data,
              id: currentEvent.id,
            } as SSEEvent;
            currentEvent = {};
          }
          continue;
        }

        // Parse SSE field
        if (trimmed.startsWith('event:')) {
          currentEvent.event = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          // Handle multiple data lines for same event
          if (typeof currentEvent.data === 'string') {
            currentEvent.data += '\n' + dataStr;
          } else {
            currentEvent.data = dataStr;
          }
        } else if (trimmed.startsWith('id:')) {
          currentEvent.id = trimmed.slice(3).trim();
        }
        // Ignore other fields (retry, etc.)
      }
    }

    // Yield any remaining event
    if (currentEvent.data !== undefined) {
      yield {
        event: currentEvent.event,
        data: currentEvent.data,
        id: currentEvent.id,
      } as SSEEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse SSE events from text (for React Native compatibility)
 */
function* parseSSEFromText(text: string): Generator<SSEEvent, void, unknown> {
  const lines = text.split('\n');
  let currentEvent: Partial<SSEEvent> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Empty line signals end of event
      if (currentEvent.data !== undefined) {
        yield {
          event: currentEvent.event,
          data: currentEvent.data,
          id: currentEvent.id,
        } as SSEEvent;
        currentEvent = {};
      }
      continue;
    }

    // Parse SSE field
    if (trimmed.startsWith('event:')) {
      currentEvent.event = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      const dataStr = trimmed.slice(5).trim();
      // Handle multiple data lines for same event
      if (typeof currentEvent.data === 'string') {
        currentEvent.data += '\n' + dataStr;
      } else {
        currentEvent.data = dataStr;
      }
    } else if (trimmed.startsWith('id:')) {
      currentEvent.id = trimmed.slice(3).trim();
    }
  }

  // Yield any remaining event
  if (currentEvent.data !== undefined) {
    yield {
      event: currentEvent.event,
      data: currentEvent.data,
      id: currentEvent.id,
    } as SSEEvent;
  }
}

/**
 * Create a streaming request with SSE handling
 * Uses XMLHttpRequest for React Native compatibility with real-time streaming
 */
export async function createStreamingRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  onEvent: (event: SSEEvent) => void,
  timeout: number = 300000 // 5 minutes default
): Promise<void> {
  logger.log('[HttpClient] Creating streaming request to:', url);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const timeoutId = setTimeout(() => {
      xhr.abort();
      reject(new Error('Request timeout'));
    }, timeout);

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 1) {
        logger.log('[HttpClient] Request opened');
      } else if (xhr.readyState === 2) {
        logger.log('[HttpClient] Headers received, status:', xhr.status);
      } else if (xhr.readyState === 3) {
        logger.log('[HttpClient] Loading data...');
      } else if (xhr.readyState === 4) {
        logger.log('[HttpClient] Request complete, status:', xhr.status);
      }
    };

    xhr.onerror = () => {
      logger.error('[HttpClient] Network error:', xhr.status, xhr.statusText);
      reject(new Error(`Network error: ${xhr.status} ${xhr.statusText}`));
    };

    xhr.ontimeout = () => {
      logger.error('[HttpClient] Request timeout');
      reject(new Error('Request timeout'));
    };

    // Track processed length for incremental parsing
    let processedLength = 0;

    const processChunk = (newData: string) => {
      // Parse only new data incrementally
      const lines = newData.split('\n');
      let currentEvent: Partial<SSEEvent> = {};
      let buffer = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          // Empty line signals end of event
          if (currentEvent.data !== undefined) {
            onEvent({
              event: currentEvent.event,
              data: currentEvent.data,
              id: currentEvent.id,
            } as SSEEvent);
            currentEvent = {};
          }
          continue;
        }

        // Parse SSE field
        if (trimmed.startsWith('event:')) {
          currentEvent.event = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (typeof currentEvent.data === 'string') {
            currentEvent.data += '\n' + dataStr;
          } else {
            currentEvent.data = dataStr;
          }
        } else if (trimmed.startsWith('id:')) {
          currentEvent.id = trimmed.slice(3).trim();
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        clearTimeout(timeoutId);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            // Process any remaining data
            const responseText = xhr.responseText;
            if (responseText.length > processedLength) {
              const newData = responseText.slice(processedLength);
              processedLength = responseText.length;
              // Parse final chunk
              const lines = newData.split('\n');
              let currentEvent: Partial<SSEEvent> = {};

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                  if (currentEvent.data !== undefined) {
                    onEvent({
                      event: currentEvent.event,
                      data: currentEvent.data,
                      id: currentEvent.id,
                    } as SSEEvent);
                    currentEvent = {};
                  }
                  continue;
                }

                if (trimmed.startsWith('event:')) {
                  currentEvent.event = trimmed.slice(6).trim();
                } else if (trimmed.startsWith('data:')) {
                  const dataStr = trimmed.slice(5).trim();
                  if (typeof currentEvent.data === 'string') {
                    currentEvent.data += '\n' + dataStr;
                  } else {
                    currentEvent.data = dataStr;
                  }
                } else if (trimmed.startsWith('id:')) {
                  currentEvent.id = trimmed.slice(3).trim();
                }
              }
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || 'Unknown error'}`));
        }
      }
    };

    // Handle progress events for real-time streaming
    xhr.onprogress = () => {
      const responseText = xhr.responseText;
      if (responseText.length > processedLength) {
        const newData = responseText.slice(processedLength);
        processedLength = responseText.length;

        // Process new lines
        const lines = newData.split('\n');
        let currentEvent: Partial<SSEEvent> = {};

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            if (currentEvent.data !== undefined) {
              onEvent({
                event: currentEvent.event,
                data: currentEvent.data,
                id: currentEvent.id,
              } as SSEEvent);
              currentEvent = {};
            }
            continue;
          }

          if (trimmed.startsWith('event:')) {
            currentEvent.event = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (typeof currentEvent.data === 'string') {
              currentEvent.data += '\n' + dataStr;
            } else {
              currentEvent.data = dataStr;
            }
          } else if (trimmed.startsWith('id:')) {
            currentEvent.id = trimmed.slice(3).trim();
          }
        }
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Network error'));
    };

    xhr.ontimeout = () => {
      clearTimeout(timeoutId);
      reject(new Error('Request timeout'));
    };

    try {
      const bodyStr = JSON.stringify(body);
      logger.log('[HttpClient] Sending request body, length:', bodyStr.length);
      xhr.send(bodyStr);
    } catch (err) {
      clearTimeout(timeoutId);
      logger.error('[HttpClient] Error sending request:', err);
      reject(err);
    }
  });
}

/**
 * Parse OpenAI streaming message from SSE event
 */
export function parseOpenAIMessage(event: SSEEvent): OpenAIStreamMessage | null {
  if (typeof event.data !== 'string') return null;

  const data = event.data.trim();
  if (data === '[DONE]') {
    return { object: 'done' };
  }

  try {
    return JSON.parse(data) as OpenAIStreamMessage;
  } catch {
    logger.warn('[HTTP] Failed to parse OpenAI message:', data);
    return null;
  }
}

/**
 * Parse Anthropic streaming message from SSE event
 */
export function parseAnthropicMessage(event: SSEEvent): AnthropicStreamMessage | null {
  if (typeof event.data !== 'string') return null;

  const data = event.data.trim();
  if (!data) return null;

  try {
    return JSON.parse(data) as AnthropicStreamMessage;
  } catch {
    logger.warn('[HTTP] Failed to parse Anthropic message:', data);
    return null;
  }
}

/**
 * Convert image URI to base64 data URL
 */
export async function imageToBase64DataUrl(uri: string): Promise<string> {
  // Handle already-encoded data URLs
  if (uri.startsWith('data:')) {
    return uri;
  }

  // Handle file:// URIs (React Native)
  const RNFS = require('react-native-fs');
  if (uri.startsWith('file://') || uri.startsWith(RNFS.DocumentDirectoryPath)) {
    const filePath = uri.replace('file://', '');
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      throw new Error(`Image file not found: ${filePath}`);
    }

    // Determine MIME type from extension
    const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    const base64 = await RNFS.readFile(filePath, 'base64');
    return `data:${mimeType};base64,${base64}`;
  }

  // Handle remote URLs - fetch and encode
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image as base64'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Validate that an endpoint is on a private network
 * Returns true for private IPs, false for public internet addresses
 */
export function isPrivateNetworkEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname;

    // localhost (including IPv6 localhost with brackets)
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return true;
    }

    // Private IP ranges
    // 10.0.0.0 - 10.255.255.255
    if (hostname.startsWith('10.') || hostname.match(/^10\.\d+\.\d+\.\d+$/)) {
      return true;
    }

    // 172.16.0.0 - 172.31.255.255
    const match = hostname.match(/^172\.(\d+)\.\d+\.\d+$/);
    if (match) {
      const second = parseInt(match[1], 10);
      if (second >= 16 && second <= 31) {
        return true;
      }
    }

    // 192.168.0.0 - 192.168.255.255
    if (hostname.startsWith('192.168.')) {
      return true;
    }

    // 169.254.0.0 - 169.254.255.255 (link-local)
    if (hostname.startsWith('169.254.')) {
      return true;
    }

    // .local (mDNS/Bonjour)
    if (hostname.endsWith('.local')) {
      return true;
    }

    return false;
  } catch {
    // Invalid URL - be conservative
    return false;
  }
}

/**
 * Check if endpoint URL is valid and reachable
 */
export async function testEndpoint(
  endpoint: string,
  timeout: number = 5000
): Promise<{ success: boolean; error?: string; latency?: number }> {
  const startTime = Date.now();

  try {
    // Normalize endpoint (remove trailing slash)
    const url = endpoint.replace(/\/+$/, '');

    // Try to reach the base URL first
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${url}/v1/models`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (!response.ok) {
      // Try alternate health endpoints
      const altUrls = ['/api/tags', '/health', '/'];
      for (const alt of altUrls) {
        try {
          const altResponse = await fetch(`${url}${alt}`, {
            method: 'GET',
            signal: controller.signal,
          });
          if (altResponse.ok) {
            return { success: true, latency };
          }
        } catch {
          // Continue to next
        }
      }

      return {
        success: false,
        error: `Server returned ${response.status}`,
        latency,
      };
    }

    return { success: true, latency };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latency,
    };
  }
}

/**
 * Detect server type from endpoint
 */
export async function detectServerType(
  endpoint: string,
  timeout: number = 5000
): Promise<{ type: string; version?: string } | null> {
  try {
    const url = endpoint.replace(/\/+$/, '');

    // Try OpenAI-style version endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${url}/v1/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        // Check for Ollama-specific headers
        const server = response.headers.get('server') || '';
        if (server.toLowerCase().includes('ollama')) {
          return { type: 'ollama' };
        }

        // Try to get version from response
        try {
          const data = await response.json();
          if (data?.object === 'list' || Array.isArray(data?.data)) {
            // OpenAI-compatible, assume generic
            return { type: 'openai-compatible' };
          }
        } catch {
          // Can't parse, assume generic
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }

    // Try Ollama-specific endpoint
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const ollamaResponse = await fetch(`${url}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (ollamaResponse.ok) {
        return { type: 'ollama' };
      }
    } catch {
      // Not Ollama
    }

    // Try LM Studio endpoint
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const lmstudioResponse = await fetch(`${url}/v1/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (lmstudioResponse.ok) {
        const data = await lmstudioResponse.json();
        // LM Studio typically returns model list with specific structure
        if (data?.data?.some?.((m: { id: string }) => m.id?.includes('gguf'))) {
          return { type: 'lmstudio' };
        }
      }
    } catch {
      // Not LM Studio
    }

    return null;
  } catch {
    return null;
  }
}