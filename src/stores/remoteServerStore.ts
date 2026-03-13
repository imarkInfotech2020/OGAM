/* eslint-disable max-lines */
/**
 * Remote Server Store
 *
 * Zustand store for managing remote LLM server configurations.
 * Handles server CRUD, model discovery, and active server selection.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RemoteServer,
  RemoteModel,
  ServerTestResult,
} from '../types';
import { testEndpoint, detectServerType } from '../services/httpClient';
import logger from '../utils/logger';
import { generateId } from '../utils/generateId';

interface RemoteServerState {
  /** Configured remote servers */
  servers: RemoteServer[];
  /** Currently active server ID (null = local only) */
  activeServerId: string | null;
  /** Models discovered per server */
  discoveredModels: Record<string, RemoteModel[]>;
  /** Server health status */
  serverHealth: Record<string, { isHealthy: boolean; lastCheck: string }>;
  /** Loading states */
  isLoading: boolean;
  testingServerId: string | null;
  discoveringServerId: string | null;

  /** Active remote text model ID (when using remote for text generation) */
  activeRemoteTextModelId: string | null;
  /** Active remote image/vision model ID (when using remote for vision) */
  activeRemoteImageModelId: string | null;

  // Server CRUD
  addServer: (server: Omit<RemoteServer, 'id' | 'createdAt'>) => string;
  updateServer: (id: string, updates: Partial<RemoteServer>) => void;
  removeServer: (id: string) => void;

  // Active server
  setActiveServerId: (id: string | null) => void;
  getActiveServer: () => RemoteServer | null;

  // Active remote model selection
  setActiveRemoteTextModelId: (id: string | null) => void;
  setActiveRemoteImageModelId: (id: string | null) => void;
  getActiveRemoteTextModel: () => RemoteModel | null;
  getActiveRemoteImageModel: () => RemoteModel | null;

  // Model discovery
  discoverModels: (serverId: string) => Promise<RemoteModel[]>;
  setDiscoveredModels: (serverId: string, models: RemoteModel[]) => void;
  clearDiscoveredModels: (serverId: string) => void;

  // Health check
  testConnection: (serverId: string) => Promise<ServerTestResult>;
  testConnectionByEndpoint: (endpoint: string, apiKey?: string) => Promise<ServerTestResult>;
  updateServerHealth: (serverId: string, isHealthy: boolean) => void;

  // Utility
  getServerById: (id: string) => RemoteServer | null;
  getModelById: (serverId: string, modelId: string) => RemoteModel | null;
  clearAllServers: () => void;
}


export const useRemoteServerStore = create<RemoteServerState>()(
  persist(
    (set, get) => ({
      servers: [],
      activeServerId: null,
      discoveredModels: {},
      serverHealth: {},
      isLoading: false,
      testingServerId: null,
      discoveringServerId: null,
      activeRemoteTextModelId: null,
      activeRemoteImageModelId: null,

      // Server CRUD
      addServer: (serverData) => {
        const id = generateId();
        const server: RemoteServer = {
          ...serverData,
          id,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          servers: [...state.servers, server],
        }));
        logger.log('[RemoteServer] Added server:', server.name);
        return id;
      },

      updateServer: (id, updates) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
        logger.log('[RemoteServer] Updated server:', id);
      },

      removeServer: (id) => {
        const state = get();
        // Clear active server and model IDs if removing the active server
        if (state.activeServerId === id) {
          set({
            activeServerId: null,
            activeRemoteTextModelId: null,
            activeRemoteImageModelId: null,
          });
        }
        set((prev) => ({
          servers: prev.servers.filter((srv) => srv.id !== id),
          discoveredModels: Object.fromEntries(
            Object.entries(prev.discoveredModels).filter(([key]) => key !== id)
          ),
          serverHealth: Object.fromEntries(
            Object.entries(prev.serverHealth).filter(([key]) => key !== id)
          ),
        }));
        logger.log('[RemoteServer] Removed server:', id);
      },

      // Active server
      setActiveServerId: (id) => {
        set({ activeServerId: id });
        logger.log('[RemoteServer] Active server set to:', id || 'local');
      },

      getActiveServer: () => {
        const { servers, activeServerId } = get();
        return servers.find((s) => s.id === activeServerId) || null;
      },

      // Active remote model selection
      setActiveRemoteTextModelId: (id) => {
        set({ activeRemoteTextModelId: id });
        logger.log('[RemoteServer] Active remote text model set to:', id || 'none');
      },

      setActiveRemoteImageModelId: (id) => {
        set({ activeRemoteImageModelId: id });
        logger.log('[RemoteServer] Active remote image model set to:', id || 'none');
      },

      getActiveRemoteTextModel: () => {
        const { activeRemoteTextModelId, activeServerId, discoveredModels } = get();
        if (!activeRemoteTextModelId || !activeServerId) return null;
        const models = discoveredModels[activeServerId] || [];
        return models.find((m) => m.id === activeRemoteTextModelId) || null;
      },

      getActiveRemoteImageModel: () => {
        const { activeRemoteImageModelId, activeServerId, discoveredModels } = get();
        if (!activeRemoteImageModelId || !activeServerId) return null;
        const models = discoveredModels[activeServerId] || [];
        return models.find((m) => m.id === activeRemoteImageModelId) || null;
      },

      // Model discovery
      discoverModels: async (serverId) => {
        const { servers } = get();
        const server = servers.find((s) => s.id === serverId);
        if (!server) {
          throw new Error(`Server not found: ${serverId}`);
        }

        set({ discoveringServerId: serverId, isLoading: true });

        try {
          const models = await fetchModelsFromServer(server);
          set((state) => ({
            discoveredModels: {
              ...state.discoveredModels,
              [serverId]: models,
            },
            isLoading: false,
            discoveringServerId: null,
          }));
          logger.log('[RemoteServer] Discovered models:', models.length);
          return models;
        } catch (error) {
          set({ isLoading: false, discoveringServerId: null });
          throw error;
        }
      },

      setDiscoveredModels: (serverId, models) => {
        set((state) => ({
          discoveredModels: {
            ...state.discoveredModels,
            [serverId]: models,
          },
        }));
      },

      clearDiscoveredModels: (serverId) => {
        set((state) => {
          const newDiscovered = { ...state.discoveredModels };
          delete newDiscovered[serverId];
          return { discoveredModels: newDiscovered };
        });
      },

      // Health check
      testConnection: async (serverId) => {
        const { servers } = get();
        const server = servers.find((s) => s.id === serverId);
        if (!server) {
          return { success: false, error: 'Server not found' };
        }

        set({ testingServerId: serverId, isLoading: true });

        try {
          const result = await testServerConnection(server);

          set((state) => ({
            serverHealth: {
              ...state.serverHealth,
              [serverId]: {
                isHealthy: result.success,
                lastCheck: new Date().toISOString(),
              },
            },
            isLoading: false,
            testingServerId: null,
          }));

          // Update models if discovered
          if (result.success && result.models) {
            set((state) => ({
              discoveredModels: {
                ...state.discoveredModels,
                [serverId]: result.models!,
              },
            }));
          }

          return result;
        } catch (error) {
          set({ isLoading: false, testingServerId: null });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },

      testConnectionByEndpoint: async (endpoint, apiKey) => {
        set({ isLoading: true });
        try {
          const result = await testEndpointAndGetModels(endpoint, apiKey);
          set({ isLoading: false });
          return result;
        } catch (error) {
          set({ isLoading: false });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },

      updateServerHealth: (serverId, isHealthy) => {
        set((state) => ({
          serverHealth: {
            ...state.serverHealth,
            [serverId]: {
              isHealthy,
              lastCheck: new Date().toISOString(),
            },
          },
        }));
      },

      // Utility
      getServerById: (id) => {
        const { servers } = get();
        return servers.find((s) => s.id === id) || null;
      },

      getModelById: (serverId, modelId) => {
        const { discoveredModels } = get();
        const models = discoveredModels[serverId] || [];
        return models.find((m) => m.id === modelId) || null;
      },

      clearAllServers: () => {
        set({
          servers: [],
          activeServerId: null,
          discoveredModels: {},
          serverHealth: {},
          activeRemoteTextModelId: null,
          activeRemoteImageModelId: null,
        });
      },
    }),
    {
      name: 'remote-servers',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        servers: state.servers,
        activeServerId: state.activeServerId,
        activeRemoteTextModelId: state.activeRemoteTextModelId,
        activeRemoteImageModelId: state.activeRemoteImageModelId,
        discoveredModels: state.discoveredModels,
        // Don't persist health status - it should be refreshed
      }),
    }
  )
);

// Helper functions

async function testServerConnection(server: RemoteServer): Promise<ServerTestResult> {
  try {
    const testResult = await testEndpoint(server.endpoint, 10000);

    if (!testResult.success) {
      return {
        success: false,
        error: testResult.error,
        latency: testResult.latency,
      };
    }

    // Try to discover models
    const models = await fetchModelsFromServer(server);

    // Detect server type
    const serverType = await detectServerType(server.endpoint);

    return {
      success: true,
      latency: testResult.latency,
      models,
      serverInfo: {
        name: serverType?.type,
        version: serverType?.version,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function testEndpointAndGetModels(
  endpoint: string,
  apiKey?: string
): Promise<ServerTestResult> {
  try {
    const testResult = await testEndpoint(endpoint, 10000);

    if (!testResult.success) {
      return {
        success: false,
        error: testResult.error,
        latency: testResult.latency,
      };
    }

    // Try to discover models with a temporary server config
    const tempServer: RemoteServer = {
      id: 'temp',
      name: 'temp',
      endpoint,
      providerType: 'openai-compatible',
      createdAt: new Date().toISOString(),
      apiKey,
    };

    const models = await fetchModelsFromServer(tempServer);
    const serverType = await detectServerType(endpoint);

    return {
      success: true,
      latency: testResult.latency,
      models,
      serverInfo: {
        name: serverType?.type,
        version: serverType?.version,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface OllamaModelInfo {
  contextLength: number;
  supportsVision: boolean;
}

/**
 * Fetches model capabilities for an Ollama model via POST /api/show.
 * Vision is detected by inspecting model_info keys for "vision" or "clip" —
 * Ollama populates these for multimodal models (e.g. clip.vision.block_count).
 * Falls back to contextLength=4096, supportsVision=false on any failure.
 */
async function fetchOllamaModelInfo(endpoint: string, modelName: string): Promise<OllamaModelInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${endpoint}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return { contextLength: 4096, supportsVision: false };

    const data = await response.json();

    let contextLength = 4096;
    let supportsVision = false;

    if (data?.model_info && typeof data.model_info === 'object') {
      for (const key of Object.keys(data.model_info)) {
        if (key.endsWith('.context_length')) {
          const val = data.model_info[key];
          if (typeof val === 'number' && val > 0) contextLength = val;
        }
        // Ollama sets keys like "clip.vision.block_count" or "llava.image_token_index"
        // for multimodal models — presence of any vision/clip key means vision support
        if (key.includes('vision') || key.includes('clip')) {
          supportsVision = true;
        }
      }
    }

    // Fallback context length from parameters string
    if (contextLength === 4096 && typeof data?.parameters === 'string') {
      const match = data.parameters.match(/num_ctx\s+(\d+)/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > 0) contextLength = val;
      }
    }

    return { contextLength, supportsVision };
  } catch {
    // Timeout, network error, parse error
  }

  return { contextLength: 4096, supportsVision: false };
}

/**
 * Fetches model capabilities for an LM Studio server via GET /api/v1/models.
 * LM Studio's native endpoint exposes vision and tool-use capability per model.
 * Falls back to contextLength=4096, supportsVision=false on any failure.
 */
async function fetchLmStudioModelInfo(endpoint: string, modelId: string): Promise<OllamaModelInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${endpoint}/api/v1/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return { contextLength: 4096, supportsVision: false };

    const data = await response.json();
    // LM Studio /api/v1/models returns { models: [...] } with each entry keyed by "key" field
    const models: unknown[] = Array.isArray(data?.models) ? data.models : [];

    const model = models.find(
      (m): m is Record<string, unknown> =>
        typeof m === 'object' && m !== null && (m as Record<string, unknown>).key === modelId,
    );

    if (!model) return { contextLength: 4096, supportsVision: false };

    // LM Studio capabilities: { vision: bool, trained_for_tool_use: bool }
    // Note: type is always "llm" even for VL models — use capabilities.vision instead
    const supportsVision =
      typeof model.capabilities === 'object' &&
      model.capabilities !== null &&
      (model.capabilities as Record<string, unknown>).vision === true;

    const contextLength =
      typeof model.max_context_length === 'number' && model.max_context_length > 0
        ? model.max_context_length
        : 4096;

    return { contextLength, supportsVision: Boolean(supportsVision) };
  } catch {
    // Timeout, network error, parse error
  }

  return { contextLength: 4096, supportsVision: false };
}

/** Returns true for models that generate text/images — filters out embedding, reranker, etc. */
function isGenerativeModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  const nonGenerativePatterns = [
    'embed', 'embedding', 'rerank', 'reranker', 'classifier',
    'bge-', 'e5-', 'gte-', 'minilm', 'arctic-embed',
  ];
  return !nonGenerativePatterns.some(p => id.includes(p));
}


async function fetchModelsFromServer(server: RemoteServer): Promise<RemoteModel[]> {
  let url = server.endpoint;
  while (url.endsWith('/')) url = url.slice(0, -1);

  // Headers for authentication
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (server.apiKey) {
    headers.Authorization = `Bearer ${server.apiKey}`;
  }

  // Try OpenAI-compatible endpoint first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${url}/v1/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();

      // OpenAI format: { object: "list", data: [{ id, object, owned_by, ... }] }
      if (data?.object === 'list' && Array.isArray(data.data)) {
        const isLmStudio = url.includes(':1234');
        const isOllama = url.includes(':11434');
        const generativeModels = data.data.filter((model: { id: string }) => isGenerativeModel(model.id));
        const modelInfos = await Promise.all(
          generativeModels.map((model: { id: string }) => {
            if (isOllama) return fetchOllamaModelInfo(url, model.id);
            if (isLmStudio) return fetchLmStudioModelInfo(url, model.id);
            return Promise.resolve({ contextLength: 4096, supportsVision: false });
          })
        );
        return generativeModels.map((model: { id: string; owned_by?: string; max_context_length?: number }, i: number) => ({
          id: model.id,
          name: model.id,
          serverId: server.id,
          capabilities: {
            supportsVision: modelInfos[i].supportsVision,
            supportsToolCalling: false,
            supportsThinking: false,
            maxContextLength: modelInfos[i].contextLength,
          },
          lastUpdated: new Date().toISOString(),
        }));
      }

      // Ollama format via /v1/models: { models: [{ name, ... }] }
      if (Array.isArray(data.models)) {
        const isOllama = url.includes(':11434');
        const generativeModels = data.models.filter(
          (model: { name: string }) => isGenerativeModel(model.name)
        );
        const modelInfos = await Promise.all(
          generativeModels.map((model: { name: string }) =>
            isOllama ? fetchOllamaModelInfo(url, model.name) : Promise.resolve({ contextLength: 4096, supportsVision: false })
          )
        );
        return generativeModels.map(
          (model: { name: string; details?: Record<string, unknown> }, i: number) => ({
            id: model.name,
            name: model.name,
            serverId: server.id,
            capabilities: {
              supportsVision: modelInfos[i].supportsVision,
              supportsToolCalling: false,
              supportsThinking: false,
              maxContextLength: modelInfos[i].contextLength,
            },
            details: model.details,
            lastUpdated: new Date().toISOString(),
          })
        );
      }
    }
  } catch (error) {
    logger.warn('[RemoteServer] Failed to fetch from /v1/models:', error);
  }

  // Try Ollama-specific endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${url}/api/tags`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();

      if (Array.isArray(data.models)) {
        const isOllama = url.includes(':11434');
        const generativeModels = data.models.filter(
          (model: { name: string }) => isGenerativeModel(model.name)
        );
        const modelInfos = await Promise.all(
          generativeModels.map((model: { name: string }) =>
            isOllama ? fetchOllamaModelInfo(url, model.name) : Promise.resolve({ contextLength: 4096, supportsVision: false })
          )
        );
        return generativeModels.map(
          (model: { name: string; details?: Record<string, unknown> }, i: number) => ({
            id: model.name,
            name: model.name,
            serverId: server.id,
            capabilities: {
              supportsVision: modelInfos[i].supportsVision,
              supportsToolCalling: false,
              supportsThinking: false,
              maxContextLength: modelInfos[i].contextLength,
            },
            details: model.details,
            lastUpdated: new Date().toISOString(),
          })
        );
      }
    }
  } catch (error) {
    logger.warn('[RemoteServer] Failed to fetch from /api/tags:', error);
  }

  // No models found
  return [];
}