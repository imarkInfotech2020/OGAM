/**
 * Remote Server Store Unit Tests
 *
 * Tests for Zustand store managing remote LLM server configurations.
 */

import { act } from '@testing-library/react-native';
import { useRemoteServerStore } from '../../../src/stores/remoteServerStore';
import * as httpClient from '../../../src/services/httpClient';

// Mock httpClient
jest.mock('../../../src/services/httpClient', () => ({
  testEndpoint: jest.fn(),
  detectServerType: jest.fn(),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('remoteServerStore', () => {
  beforeEach(() => {
    // Reset store before each test
    act(() => {
      useRemoteServerStore.getState().clearAllServers();
    });
    jest.clearAllMocks();
  });

  describe('addServer', () => {
    it('should add a new server with generated ID', () => {
      const serverData = {
        name: 'Test Server',
        endpoint: 'http://192.168.1.50:11434',
        providerType: 'openai-compatible' as const,
      };

      let serverId: string = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer(serverData);
      });

      const servers = useRemoteServerStore.getState().servers;

      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe(serverId);
      expect(servers[0].name).toBe('Test Server');
      expect(servers[0].endpoint).toBe('http://192.168.1.50:11434');
      expect(servers[0].createdAt).toBeDefined();
    });

    it('should store notes if provided', () => {
      const serverData = {
        name: 'Ollama Server',
        endpoint: 'http://localhost:11434',
        providerType: 'openai-compatible' as const,
        notes: 'Local development server',
      };

      act(() => {
        useRemoteServerStore.getState().addServer(serverData);
      });

      const servers = useRemoteServerStore.getState().servers;

      expect(servers[0].notes).toBe('Local development server');
    });
  });

  describe('updateServer', () => {
    it('should update existing server', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Original Name',
          endpoint: 'http://original:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().updateServer(serverId, {
          name: 'Updated Name',
          endpoint: 'http://updated:11434',
        });
      });

      const server = useRemoteServerStore.getState().getServerById(serverId);

      expect(server?.name).toBe('Updated Name');
      expect(server?.endpoint).toBe('http://updated:11434');
    });

    it('should not modify other servers', () => {
      let server1Id = '';
      let _server2Id = '';
      act(() => {
        server1Id = useRemoteServerStore.getState().addServer({
          name: 'Server 1',
          endpoint: 'http://server1:11434',
          providerType: 'openai-compatible',
        });
        _server2Id = useRemoteServerStore.getState().addServer({
          name: 'Server 2',
          endpoint: 'http://server2:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().updateServer(server1Id, { name: 'Updated Server 1' });
      });

      const servers = useRemoteServerStore.getState().servers;

      expect(servers[0].name).toBe('Updated Server 1');
      expect(servers[1].name).toBe('Server 2');
    });
  });

  describe('removeServer', () => {
    it('should remove server from list', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().removeServer(serverId);
      });

      const servers = useRemoteServerStore.getState().servers;

      expect(servers).toHaveLength(0);
    });

    it('should clear activeServerId if removed server was active', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Active Server',
          endpoint: 'http://active:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().setActiveServerId(serverId);
      });

      expect(useRemoteServerStore.getState().activeServerId).toBe(serverId);

      act(() => {
        useRemoteServerStore.getState().removeServer(serverId);
      });

      expect(useRemoteServerStore.getState().activeServerId).toBeNull();
    });
  });

  describe('setActiveServerId', () => {
    it('should set active server', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().setActiveServerId(serverId);
      });

      expect(useRemoteServerStore.getState().activeServerId).toBe(serverId);
    });

    it('should allow clearing active server', () => {
      act(() => {
        useRemoteServerStore.getState().setActiveServerId(null);
      });

      expect(useRemoteServerStore.getState().activeServerId).toBeNull();
    });
  });

  describe('getActiveServer', () => {
    it('should return active server', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Active Server',
          endpoint: 'http://active:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().setActiveServerId(serverId);
      });

      const activeServer = useRemoteServerStore.getState().getActiveServer();

      expect(activeServer?.name).toBe('Active Server');
    });

    it('should return null when no server is active', () => {
      const activeServer = useRemoteServerStore.getState().getActiveServer();

      expect(activeServer).toBeNull();
    });
  });

  describe('setDiscoveredModels', () => {
    it('should store discovered models for a server', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().setDiscoveredModels(serverId, [
          { id: 'llama2', name: 'Llama 2', serverId, capabilities: { supportsVision: false, supportsToolCalling: true, supportsThinking: false }, lastUpdated: new Date().toISOString() },
          { id: 'mistral', name: 'Mistral', serverId, capabilities: { supportsVision: false, supportsToolCalling: true, supportsThinking: false }, lastUpdated: new Date().toISOString() },
        ]);
      });

      const models = useRemoteServerStore.getState().discoveredModels[serverId];

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama2');
    });
  });

  describe('clearDiscoveredModels', () => {
    it('should clear models for a server', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().setDiscoveredModels(serverId, [
          { id: 'model1', name: 'Model 1', serverId, capabilities: { supportsVision: false, supportsToolCalling: false, supportsThinking: false }, lastUpdated: new Date().toISOString() },
        ]);
      });

      act(() => {
        useRemoteServerStore.getState().clearDiscoveredModels(serverId);
      });

      expect(useRemoteServerStore.getState().discoveredModels[serverId]).toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('should test connection and return success', async () => {
      (httpClient.testEndpoint as jest.Mock).mockResolvedValue({
        success: true,
        latency: 50,
      });
      (httpClient.detectServerType as jest.Mock).mockResolvedValue({ type: 'ollama' });

      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
      });

      let result;
      await act(async () => {
        result = await useRemoteServerStore.getState().testConnection(serverId);
      });

      expect(result!.success).toBe(true);
      expect(result!.latency).toBe(50);
    });

    it('should return error on connection failure', async () => {
      (httpClient.testEndpoint as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Connection refused',
      });

      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Bad Server',
          endpoint: 'http://bad:11434',
          providerType: 'openai-compatible',
        });
      });

      let result;
      await act(async () => {
        result = await useRemoteServerStore.getState().testConnection(serverId);
      });

      expect(result!.success).toBe(false);
      expect(result!.error).toContain('Connection refused');
    });
  });

  describe('testConnectionByEndpoint', () => {
    it('should test connection without adding server', async () => {
      (httpClient.testEndpoint as jest.Mock).mockResolvedValue({
        success: true,
        latency: 25,
      });

      let result;
      await act(async () => {
        result = await useRemoteServerStore.getState().testConnectionByEndpoint('http://test:11434');
      });

      expect(result!.success).toBe(true);
      expect(useRemoteServerStore.getState().servers).toHaveLength(0);
    });
  });

  describe('getServerById', () => {
    it('should return server by ID', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
      });

      const server = useRemoteServerStore.getState().getServerById(serverId);

      expect(server?.name).toBe('Test Server');
    });

    it('should return null for non-existent ID', () => {
      const server = useRemoteServerStore.getState().getServerById('non-existent');

      expect(server).toBeNull();
    });
  });

  describe('getModelById', () => {
    it('should return model by ID', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().setDiscoveredModels(serverId, [
          { id: 'model1', name: 'Model 1', serverId, capabilities: { supportsVision: false, supportsToolCalling: false, supportsThinking: false }, lastUpdated: new Date().toISOString() },
        ]);
      });

      const model = useRemoteServerStore.getState().getModelById(serverId, 'model1');

      expect(model?.name).toBe('Model 1');
    });

    it('should return null for non-existent model', () => {
      const model = useRemoteServerStore.getState().getModelById('non-existent', 'non-existent');

      expect(model).toBeNull();
    });
  });

  describe('clearAllServers', () => {
    it('should remove all servers', () => {
      act(() => {
        useRemoteServerStore.getState().addServer({
          name: 'Server 1',
          endpoint: 'http://s1:11434',
          providerType: 'openai-compatible',
        });
        useRemoteServerStore.getState().addServer({
          name: 'Server 2',
          endpoint: 'http://s2:11434',
          providerType: 'openai-compatible',
        });
      });

      act(() => {
        useRemoteServerStore.getState().clearAllServers();
      });

      expect(useRemoteServerStore.getState().servers).toHaveLength(0);
      expect(useRemoteServerStore.getState().activeServerId).toBeNull();
    });
  });

  describe('activeRemoteTextModelId', () => {
    it('should set active remote text model ID', () => {
      act(() => {
        useRemoteServerStore.getState().setActiveRemoteTextModelId('model-123');
      });

      expect(useRemoteServerStore.getState().activeRemoteTextModelId).toBe('model-123');
    });

    it('should clear active remote text model ID', () => {
      act(() => {
        useRemoteServerStore.getState().setActiveRemoteTextModelId('model-123');
      });

      expect(useRemoteServerStore.getState().activeRemoteTextModelId).toBe('model-123');

      act(() => {
        useRemoteServerStore.getState().setActiveRemoteTextModelId(null);
      });

      expect(useRemoteServerStore.getState().activeRemoteTextModelId).toBeNull();
    });
  });

  describe('activeRemoteImageModelId', () => {
    it('should set active remote image model ID', () => {
      act(() => {
        useRemoteServerStore.getState().setActiveRemoteImageModelId('vision-model-456');
      });

      expect(useRemoteServerStore.getState().activeRemoteImageModelId).toBe('vision-model-456');
    });

    it('should clear active remote image model ID', () => {
      act(() => {
        useRemoteServerStore.getState().setActiveRemoteImageModelId('vision-model-456');
      });

      expect(useRemoteServerStore.getState().activeRemoteImageModelId).toBe('vision-model-456');

      act(() => {
        useRemoteServerStore.getState().setActiveRemoteImageModelId(null);
      });

      expect(useRemoteServerStore.getState().activeRemoteImageModelId).toBeNull();
    });
  });

  describe('getActiveRemoteTextModel', () => {
    it('should return active remote text model when set', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
        useRemoteServerStore.getState().setDiscoveredModels(serverId, [
          { id: 'llama2', name: 'Llama 2', serverId, capabilities: { supportsVision: false, supportsToolCalling: true, supportsThinking: false }, lastUpdated: new Date().toISOString() },
          { id: 'mistral', name: 'Mistral', serverId, capabilities: { supportsVision: false, supportsToolCalling: true, supportsThinking: false }, lastUpdated: new Date().toISOString() },
        ]);
        useRemoteServerStore.getState().setActiveServerId(serverId);
        useRemoteServerStore.getState().setActiveRemoteTextModelId('llama2');
      });

      const model = useRemoteServerStore.getState().getActiveRemoteTextModel();

      expect(model).not.toBeNull();
      expect(model?.id).toBe('llama2');
      expect(model?.name).toBe('Llama 2');
    });

    it('should return null when no remote text model is set', () => {
      const model = useRemoteServerStore.getState().getActiveRemoteTextModel();

      expect(model).toBeNull();
    });

    it('should return null when activeRemoteTextModelId is set but activeServerId is not', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
        useRemoteServerStore.getState().setDiscoveredModels(serverId, [
          { id: 'llama2', name: 'Llama 2', serverId, capabilities: { supportsVision: false, supportsToolCalling: true, supportsThinking: false }, lastUpdated: new Date().toISOString() },
        ]);
        // Set model ID but not server ID
        useRemoteServerStore.getState().setActiveRemoteTextModelId('llama2');
      });

      const model = useRemoteServerStore.getState().getActiveRemoteTextModel();

      // Should return null because activeServerId is not set
      expect(model).toBeNull();
    });
  });

  describe('getActiveRemoteImageModel', () => {
    it('should return active remote image model when set', () => {
      let serverId = '';
      act(() => {
        serverId = useRemoteServerStore.getState().addServer({
          name: 'Test Server',
          endpoint: 'http://test:11434',
          providerType: 'openai-compatible',
        });
        useRemoteServerStore.getState().setDiscoveredModels(serverId, [
          { id: 'llava', name: 'LLaVA', serverId, capabilities: { supportsVision: true, supportsToolCalling: false, supportsThinking: false }, lastUpdated: new Date().toISOString() },
        ]);
        useRemoteServerStore.getState().setActiveServerId(serverId);
        useRemoteServerStore.getState().setActiveRemoteImageModelId('llava');
      });

      const model = useRemoteServerStore.getState().getActiveRemoteImageModel();

      expect(model).not.toBeNull();
      expect(model?.id).toBe('llava');
      expect(model?.capabilities.supportsVision).toBe(true);
    });

    it('should return null when no remote image model is set', () => {
      const model = useRemoteServerStore.getState().getActiveRemoteImageModel();

      expect(model).toBeNull();
    });
  });

  describe('clearAllServers clears remote model IDs', () => {
    it('should clear activeRemoteTextModelId and activeRemoteImageModelId', () => {
      act(() => {
        useRemoteServerStore.getState().addServer({
          name: 'Server 1',
          endpoint: 'http://s1:11434',
          providerType: 'openai-compatible',
        });
        useRemoteServerStore.getState().setActiveRemoteTextModelId('model-1');
        useRemoteServerStore.getState().setActiveRemoteImageModelId('vision-1');
      });

      expect(useRemoteServerStore.getState().activeRemoteTextModelId).toBe('model-1');
      expect(useRemoteServerStore.getState().activeRemoteImageModelId).toBe('vision-1');

      act(() => {
        useRemoteServerStore.getState().clearAllServers();
      });

      expect(useRemoteServerStore.getState().activeRemoteTextModelId).toBeNull();
      expect(useRemoteServerStore.getState().activeRemoteImageModelId).toBeNull();
    });
  });
});