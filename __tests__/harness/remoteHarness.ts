/**
 * remoteHarness — makes a REMOTE (OpenAI-compatible / Ollama) model ACTIVE and replays a CAPTURED device
 * SSE response at the real network boundary (XMLHttpRequest, which createStreamingRequest uses), so the
 * REAL transport adapter + Shared GenerationService + processDelta + chat render run on top. Fake ONLY
 * the external transport; everything we own runs.
 *
 * Ground the SSE in a real captured response (docs/wire-captures/*lmstudio* / *ollama*), never a guess.
 */

/** Behavior-faithful fake of the streaming XMLHttpRequest transport. Replays `sseBody` incrementally via
 *  onprogress (as chunked SSE arrives on device), then completes 200 — exactly what createStreamingRequest
 *  consumes (reads xhr.responseText in onprogress, finalises on readyState 4). Install before a remote send. */
export function installRemoteStream(
  sseBody: string | string[] | ((requestBody: string) => string),
): { release: () => void } {
  // Accept a QUEUE of per-request bodies so a multi-turn remote flow (a tool loop: request 1 returns
  // tool_calls, request 2 — sent WITH the tool results — returns the final reply) replays the right body per
  // XHR. A single string keeps the old behavior; with an array each send() shifts the next body, the last
  // repeats for any extra requests.
  //
  // A body line that is exactly `__PAUSE__` HALTS the pump there (the deltas before it are delivered, the
  // stream is NOT completed) until the returned release() is called — so a test can observe the mid-stream
  // rendered state (e.g. the thinking-box header WHILE reasoning is still streaming). No pause line = no-op.
  const bodyFactory = typeof sseBody === 'function' ? sseBody : null;
  const bodies: string[] = bodyFactory
    ? []
    : Array.isArray(sseBody)
    ? [...sseBody]
    : [sseBody as string];
  let releaseFn: (() => void) | null = null;
  class FakeXHR {
    responseText = '';
    readyState = 0;
    status = 0;
    onprogress: null | (() => void) = null;
    onreadystatechange: null | (() => void) = null;
    onerror: null | (() => void) = null;
    ontimeout: null | (() => void) = null;
    open(): void {
      this.readyState = 1;
    }
    setRequestHeader(): void {
      /* headers irrelevant to the fake */
    }
    abort(): void {
      /* no-op */
    }
    send(requestBody?: string): void {
      // Emit the captured body line-by-line, one per macrotask, so the REAL incremental parser runs like it
      // does on device — works for both OpenAI SSE (`data: {…}\n\n`) and Ollama NDJSON (`{…}\n`).
      const body = bodyFactory
        ? bodyFactory(requestBody ?? '')
        : bodies.length > 1
        ? bodies.shift()!
        : bodies[0];
      this.responseText = '';
      const chunks = body.match(/[^\n]*\n/g) ?? [body];
      let i = 0;
      const pump = (): void => {
        if (i < chunks.length) {
          const chunk = chunks[i++];
          if (chunk.trim() === '__PAUSE__') {
            releaseFn = () => setTimeout(pump, 0);
            return;
          } // hold here
          this.responseText += chunk;
          this.onprogress?.();
          setTimeout(pump, 0);
        } else {
          this.readyState = 4;
          this.status = 200;
          this.onreadystatechange?.();
        }
      };
      setTimeout(pump, 0);
    }
  }
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
  return { release: () => releaseFn?.() };
}

/** Make a remote OpenAI-compatible model the ACTIVE model — the real connect flow's end state (server
 *  added, its models discovered, the transport registered, and its canonical route selected). Discovery is the
 *  network boundary; we pre-place its result, then mount + gesture as the user. `caps` mirrors what a
 *  server actually advertises (LM Studio/Ollama do NOT advertise supportsThinking → no thinking toggle). */
export async function installRemoteModel(
  opts: {
    name?: string;
    endpoint?: string;
    provider?: 'openai-compatible' | 'anthropic';
    caps?: Partial<{
      supportsVision: boolean;
      supportsToolCalling: boolean;
      supportsThinking: boolean;
    }>;
  } = {},
): Promise<{ serverId: string; modelId: string }> {
  const { useRemoteServerStore } = require('../../src/stores');
  const {
    remoteServerManager,
  } = require('../../src/services/modelServices/remoteServerController');
  const { llmService } = require('../../src/services/llm');
  const {
    clearMobileModel,
    selectMobileModel,
  } = require('../../src/services/modelServices');

  // A remote model is only USED when no local model is loaded/selected: generationService prefers a loaded
  // local model, and the dispatch keys off appStore.activeModelId. On device, selecting a remote model
  // clears the local selection and no local model is loaded — mirror that so the send routes remote.
  await llmService.unloadModel();
  await clearMobileModel('text');
  const name = opts.name ?? 'LM Studio';
  const endpoint = opts.endpoint ?? 'http://localhost:1234';
  const provider = opts.provider ?? 'openai-compatible';
  const modelId = 'remote-model';

  const server = await remoteServerManager.addServer({
    name,
    endpoint,
    provider,
  });
  const serverId = server.id;
  const model = {
    id: modelId,
    name: 'Remote Model',
    serverId,
    lastUpdated: 't',
    capabilities: {
      supportsVision: false,
      supportsToolCalling: false,
      supportsThinking: false,
      acceptsThinkingKwarg: !!opts.caps?.supportsThinking,
      maxContextLength: 4096,
      ...opts.caps,
    },
  };
  const store = useRemoteServerStore.getState();
  store.setDiscoveredModels(serverId, [model]);

  // The application service registers the transport as part of the atomic save transaction.
  // Select through the shared route owner after projecting the discovered catalog.
  await selectMobileModel({
    source: 'remote',
    hostId: serverId,
    modality: 'text',
    modelId,
  });
  return { serverId, modelId };
}

/** Select a remote image model through the same remote catalog and route used by the app. */
export async function installRemoteImageModel(
  opts: {
    name?: string;
    endpoint?: string;
    modelId?: string;
  } = {},
): Promise<{ serverId: string; modelId: string }> {
  const { useRemoteServerStore } = require('../../src/stores');
  const {
    remoteServerManager,
  } = require('../../src/services/modelServices/remoteServerController');
  const { selectMobileModel } = require('../../src/services/modelServices');

  const current = useRemoteServerStore.getState().servers[0];
  const server =
    current ??
    (await remoteServerManager.addServer({
      name: opts.name ?? 'Remote Image Server',
      endpoint: opts.endpoint ?? 'http://localhost:1234',
      provider: 'openai-compatible',
    }));
  const modelId = opts.modelId ?? 'remote-image-model';
  await remoteServerManager.updateServer(server.id, {
    catalog: {
      ...server.catalog,
      image: [{ id: modelId, name: 'Remote Image Model' }],
    },
  });
  await selectMobileModel({
    source: 'remote',
    hostId: server.id,
    modality: 'image',
    modelId,
  });
  return { serverId: server.id, modelId };
}

/** Replay one OpenAI-compatible image response at the external HTTP boundary. */
export function installRemoteImageResponse(): void {
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ b64_json: 'aW1hZ2U=' }] }),
    text: async () => '',
  })) as unknown as typeof fetch;
}
