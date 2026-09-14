import { remoteServerManager } from './remoteServerManager';
import type { RemoteMediaModelIds, RemoteServer } from '../types';
import { REMOTE_FETCH_REDIRECT_POLICY, remoteAuthorizationHeaders } from './remoteTransportPolicy';
import { remoteHttpErrorMessage } from './httpClient';
import { OverridableMemoryError } from './modelLoadErrors';

export interface RemoteImageResult {
  base64?: string;
  url?: string;
}

export interface RemoteVoiceResult {
  audio: ArrayBuffer;
  contentType: string;
}

export interface RemoteMediaRequestOptions {
  signal?: AbortSignal;
  override?: boolean;
}

function endpoint(server: RemoteServer, path: string): string {
  let base = server.endpoint;
  while (base.endsWith('/')) base = base.slice(0, -1);
  return `${base}${base.endsWith('/v1') && path.startsWith('/v1/') ? path.slice(3) : path}`;
}

async function request<T>(
  input: {
    server: RemoteServer;
    path: string;
    init: RequestInit;
    signal?: AbortSignal;
  },
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const { server, path, init, signal } = input;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const apiKey = await remoteServerManager.getApiKey(server.id);
    if (controller.signal.aborted) throw new Error('Remote request cancelled');
    const response = await fetch(endpoint(server, path), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init.headers,
        ...remoteAuthorizationHeaders(server.endpoint, apiKey),
      },
      signal: controller.signal,
      redirect: REMOTE_FETCH_REDIRECT_POLICY,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const message = remoteHttpErrorMessage(detail, response.status);
      try {
        const body = JSON.parse(detail) as { error?: { code?: unknown }; code?: unknown };
        const marker = 'OFFGRID_IMAGE_MEMORY_LIMIT:';
        if ((body.error?.code ?? body.code) === 'OFFGRID_IMAGE_MEMORY_LIMIT' || message.includes(marker)) {
          throw Object.assign(new OverridableMemoryError(message.replace(marker, '').trim()), { remote: true });
        }
      } catch (error) {
        if (error instanceof OverridableMemoryError) throw error;
      }
      throw new Error(message);
    }
    // Keep caller cancellation attached until the response body is
    // consumed. A successful header is not a completed image/audio transfer.
    return await consume(response);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Remote request cancelled');
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

function requiredModel(
  server: RemoteServer,
  kind: keyof RemoteMediaModelIds,
): string {
  const model = server.mediaModels?.[kind]?.trim();
  if (!model) throw new Error(`No remote ${kind} model is configured`);
  return model;
}

/** Thin OpenAI-compatible adapters. The server record owns every endpoint and model choice. */
export const remoteMediaRuntime = {
  async generateImage(
    server: RemoteServer,
    input: { prompt: string; size?: string },
    options: RemoteMediaRequestOptions = {},
  ): Promise<RemoteImageResult> {
    const openRouter = new URL(server.endpoint).hostname === 'openrouter.ai';
    const payload = await request({
      server,
      path: openRouter ? '/v1/chat/completions' : '/v1/images/generations',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(openRouter
          ? {
              model: requiredModel(server, 'image'),
              messages: [{ role: 'user', content: input.prompt }],
              modalities: ['image', 'text'],
              stream: false,
            }
          : {
              model: requiredModel(server, 'image'),
              prompt: input.prompt,
              size: input.size ?? '1024x1024',
              response_format: 'b64_json',
              ...(options.override ? { allow_unsafe_memory_override: true } : {}),
            }),
      },
      signal: options.signal,
    }, response => response.json() as Promise<{
      data?: Array<{ b64_json?: string; url?: string }>;
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    }>);
    const image = payload.data?.[0];
    const imageUrl = image?.url ?? payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!image?.b64_json && !imageUrl) throw new Error('Remote server returned no image');
    return { base64: image?.b64_json, url: imageUrl };
  },

  async transcribe(
    server: RemoteServer,
    input: { fileUri: string; language?: string },
    options: RemoteMediaRequestOptions = {},
  ): Promise<string> {
    const body = new FormData();
    body.append('model', requiredModel(server, 'transcription'));
    if (input.language) body.append('language', input.language);
    body.append('file', {
      uri: input.fileUri,
      name: 'recording.wav',
      type: 'audio/wav',
    } as unknown as Blob);
    const payload = await request({
      server,
      path: '/v1/audio/transcriptions',
      init: { method: 'POST', body },
      signal: options.signal,
    }, response => response.json() as Promise<{ text?: unknown }>);
    if (typeof payload.text !== 'string') {
      throw new TypeError('Remote server returned no transcript');
    }
    return payload.text.trim();
  },

  async synthesizeVoice(
    server: RemoteServer,
    input: { text: string; voice?: string },
    options: RemoteMediaRequestOptions = {},
  ): Promise<RemoteVoiceResult> {
    return request({
      server,
      path: '/v1/audio/speech',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: requiredModel(server, 'voice'),
          input: input.text,
          ...(input.voice ? { voice: input.voice } : {}),
        }),
      },
      signal: options.signal,
    }, async response => ({
      audio: await response.arrayBuffer(),
      contentType: response.headers.get('content-type') ?? 'audio/mpeg',
    }));
  },

  async listVoices(server: RemoteServer, options: RemoteMediaRequestOptions = {}): Promise<string[]> {
    const payload = await request({
      server,
      path: '/v1/audio/voices',
      init: { method: 'GET' },
      signal: options.signal,
    }, response => response.json() as Promise<{ voices?: unknown }>);
    return Array.isArray(payload.voices)
      ? payload.voices.filter((voice): voice is string => typeof voice === 'string')
      : [];
  },
};
