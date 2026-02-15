/**
 * BackgroundDownloadService Unit Tests
 *
 * Tests for Android background download management via NativeModules.
 * Priority: P0 (Critical) - Download reliability.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// We need to test the class directly since the singleton auto-constructs.
// Mock Platform and NativeModules before importing.

// Store original Platform.OS for restoration
const originalOS = Platform.OS;

// Create the mock native module
const mockDownloadManagerModule = {
  startDownload: jest.fn(),
  cancelDownload: jest.fn(),
  getActiveDownloads: jest.fn(),
  getDownloadProgress: jest.fn(),
  moveCompletedDownload: jest.fn(),
  startProgressPolling: jest.fn(),
  stopProgressPolling: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

// We need to test the BackgroundDownloadService class directly
// because the exported singleton constructs immediately.
// Extract the class from the module.

describe('BackgroundDownloadService', () => {
  let BackgroundDownloadServiceClass: any;
  let service: any;

  // Captured event handlers from NativeEventEmitter.addListener
  let eventHandlers: Record<string, (event: any) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    eventHandlers = {};

    // Set up NativeModules
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;

    // Mock NativeEventEmitter to capture event listeners
    jest.spyOn(NativeEventEmitter.prototype, 'addListener').mockImplementation(
      (eventType: string, handler: any) => {
        eventHandlers[eventType] = handler;
        return { remove: jest.fn() } as any;
      }
    );

    // Reset Platform.OS to android for most tests
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });

    // Re-require the module to get a fresh class
    jest.isolateModules(() => {
      const mod = require('../../../src/services/backgroundDownloadService');
      // The module exports a singleton; we access its constructor to create fresh instances
      BackgroundDownloadServiceClass = (mod.backgroundDownloadService as any).constructor;
    });

    service = new BackgroundDownloadServiceClass();
  });

  afterEach(() => {
    // Restore original Platform.OS
    Object.defineProperty(Platform, 'OS', { get: () => originalOS });
  });

  // ========================================================================
  // isAvailable
  // ========================================================================
  describe('isAvailable', () => {
    it('returns true on Android with native module present', () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android' });
      expect(service.isAvailable()).toBe(true);
    });

    it('returns true on iOS when native module is present', () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
      expect(service.isAvailable()).toBe(true);
    });

    it('returns false when native module is null', () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      // Create fresh instance without module
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        const freshService = new (mod.backgroundDownloadService as any).constructor();
        expect(freshService.isAvailable()).toBe(false);
      });

      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // startDownload
  // ========================================================================
  describe('startDownload', () => {
    it('calls native module with correct params', async () => {
      mockDownloadManagerModule.startDownload.mockResolvedValue({
        downloadId: 42,
        fileName: 'model.gguf',
        modelId: 'test/model',
      });

      const result = await service.startDownload({
        url: 'https://example.com/model.gguf',
        fileName: 'model.gguf',
        modelId: 'test/model',
        title: 'Downloading model',
        description: 'In progress...',
        totalBytes: 4000000000,
      });

      expect(mockDownloadManagerModule.startDownload).toHaveBeenCalledWith({
        url: 'https://example.com/model.gguf',
        fileName: 'model.gguf',
        modelId: 'test/model',
        title: 'Downloading model',
        description: 'In progress...',
        totalBytes: 4000000000,
      });
      expect(result.downloadId).toBe(42);
      expect(result.status).toBe('pending');
    });

    it('returns pending status', async () => {
      mockDownloadManagerModule.startDownload.mockResolvedValue({
        downloadId: 1,
        fileName: 'model.gguf',
        modelId: 'test/model',
      });

      const result = await service.startDownload({
        url: 'https://example.com/model.gguf',
        fileName: 'model.gguf',
        modelId: 'test/model',
      });

      expect(result.status).toBe('pending');
      expect(result.bytesDownloaded).toBe(0);
    });

    it('uses default title and description when not provided', async () => {
      mockDownloadManagerModule.startDownload.mockResolvedValue({
        downloadId: 1,
        fileName: 'model.gguf',
        modelId: 'test/model',
      });

      await service.startDownload({
        url: 'https://example.com/model.gguf',
        fileName: 'model.gguf',
        modelId: 'test/model',
      });

      const callArgs = mockDownloadManagerModule.startDownload.mock.calls[0][0];
      expect(callArgs.title).toBe('Downloading model.gguf');
      expect(callArgs.description).toBe('Model download in progress...');
    });

    it('throws when not available', async () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      await expect(
        unavailableService.startDownload({
          url: 'https://example.com/model.gguf',
          fileName: 'model.gguf',
          modelId: 'test/model',
        })
      ).rejects.toThrow('Background downloads not available');
      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // cancelDownload
  // ========================================================================
  describe('cancelDownload', () => {
    it('delegates to native module', async () => {
      mockDownloadManagerModule.cancelDownload.mockResolvedValue(undefined);

      await service.cancelDownload(42);

      expect(mockDownloadManagerModule.cancelDownload).toHaveBeenCalledWith(42);
    });

    it('throws when not available', async () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      await expect(unavailableService.cancelDownload(42)).rejects.toThrow('not available');
      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // getActiveDownloads
  // ========================================================================
  describe('getActiveDownloads', () => {
    it('returns empty array when not available', async () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      const result = await unavailableService.getActiveDownloads();
      expect(result).toEqual([]);
      NativeModules.DownloadManagerModule = savedModule;
    });

    it('maps native response to BackgroundDownloadInfo', async () => {
      mockDownloadManagerModule.getActiveDownloads.mockResolvedValue([
        {
          downloadId: 1,
          fileName: 'model.gguf',
          modelId: 'test/model',
          status: 'running',
          bytesDownloaded: 1000,
          totalBytes: 5000,
          startedAt: 12345,
        },
      ]);

      const result = await service.getActiveDownloads();

      expect(result).toHaveLength(1);
      expect(result[0].downloadId).toBe(1);
      expect(result[0].status).toBe('running');
      expect(result[0].bytesDownloaded).toBe(1000);
    });
  });

  // ========================================================================
  // moveCompletedDownload
  // ========================================================================
  describe('moveCompletedDownload', () => {
    it('delegates to native module', async () => {
      mockDownloadManagerModule.moveCompletedDownload.mockResolvedValue('/final/path/model.gguf');

      const result = await service.moveCompletedDownload(42, '/final/path/model.gguf');

      expect(mockDownloadManagerModule.moveCompletedDownload).toHaveBeenCalledWith(42, '/final/path/model.gguf');
      expect(result).toBe('/final/path/model.gguf');
    });

    it('throws when not available', async () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      await expect(
        unavailableService.moveCompletedDownload(42, '/path')
      ).rejects.toThrow('not available');
      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // listener registration
  // ========================================================================
  describe('listener registration', () => {
    it('onProgress registers and returns unsubscribe function', () => {
      const callback = jest.fn();
      const unsub = service.onProgress(42, callback);

      expect(typeof unsub).toBe('function');
      // Verify callback was stored
      expect(service.progressListeners.has('progress_42')).toBe(true);

      // Unsubscribe
      unsub();
      expect(service.progressListeners.has('progress_42')).toBe(false);
    });

    it('onComplete registers and returns unsubscribe function', () => {
      const callback = jest.fn();
      const unsub = service.onComplete(42, callback);

      expect(service.completeListeners.has('complete_42')).toBe(true);
      unsub();
      expect(service.completeListeners.has('complete_42')).toBe(false);
    });

    it('onError registers and returns unsubscribe function', () => {
      const callback = jest.fn();
      const unsub = service.onError(42, callback);

      expect(service.errorListeners.has('error_42')).toBe(true);
      unsub();
      expect(service.errorListeners.has('error_42')).toBe(false);
    });

    it('onAnyProgress registers global listener', () => {
      const callback = jest.fn();
      service.onAnyProgress(callback);

      expect(service.progressListeners.has('progress_all')).toBe(true);
    });

    it('onAnyComplete registers global listener', () => {
      const callback = jest.fn();
      service.onAnyComplete(callback);

      expect(service.completeListeners.has('complete_all')).toBe(true);
    });

    it('onAnyError registers global listener', () => {
      const callback = jest.fn();
      service.onAnyError(callback);

      expect(service.errorListeners.has('error_all')).toBe(true);
    });
  });

  // ========================================================================
  // event dispatching
  // ========================================================================
  describe('event dispatching', () => {
    it('dispatches progress to specific and global listeners', () => {
      const specificCb = jest.fn();
      const globalCb = jest.fn();
      service.onProgress(42, specificCb);
      service.onAnyProgress(globalCb);

      const event = { downloadId: 42, bytesDownloaded: 1000, totalBytes: 5000, status: 'running', fileName: 'model.gguf', modelId: 'test' };

      // Simulate event from NativeEventEmitter
      if (eventHandlers.DownloadProgress) {
        eventHandlers.DownloadProgress(event);
      }

      expect(specificCb).toHaveBeenCalledWith(event);
      expect(globalCb).toHaveBeenCalledWith(event);
    });

    it('dispatches complete to specific and global listeners', () => {
      const specificCb = jest.fn();
      const globalCb = jest.fn();
      service.onComplete(42, specificCb);
      service.onAnyComplete(globalCb);

      const event = { downloadId: 42, fileName: 'model.gguf', modelId: 'test', bytesDownloaded: 5000, totalBytes: 5000, status: 'completed', localUri: '/path/model.gguf' };

      if (eventHandlers.DownloadComplete) {
        eventHandlers.DownloadComplete(event);
      }

      expect(specificCb).toHaveBeenCalledWith(event);
      expect(globalCb).toHaveBeenCalledWith(event);
    });

    it('dispatches error to specific and global listeners', () => {
      const specificCb = jest.fn();
      const globalCb = jest.fn();
      service.onError(42, specificCb);
      service.onAnyError(globalCb);

      const event = { downloadId: 42, fileName: 'model.gguf', modelId: 'test', status: 'failed', reason: 'Network error' };

      if (eventHandlers.DownloadError) {
        eventHandlers.DownloadError(event);
      }

      expect(specificCb).toHaveBeenCalledWith(event);
      expect(globalCb).toHaveBeenCalledWith(event);
    });

    it('does not throw when no listener registered for downloadId', () => {
      // No listeners registered for download 99
      const event = { downloadId: 99, bytesDownloaded: 1000, totalBytes: 5000, status: 'running', fileName: 'model.gguf', modelId: 'test' };

      expect(() => {
        if (eventHandlers.DownloadProgress) {
          eventHandlers.DownloadProgress(event);
        }
      }).not.toThrow();
    });
  });

  // ========================================================================
  // polling
  // ========================================================================
  describe('polling', () => {
    it('startProgressPolling calls native module', () => {
      service.startProgressPolling();

      expect(mockDownloadManagerModule.startProgressPolling).toHaveBeenCalled();
      expect(service.isPolling).toBe(true);
    });

    it('startProgressPolling is idempotent', () => {
      service.startProgressPolling();
      service.startProgressPolling();

      expect(mockDownloadManagerModule.startProgressPolling).toHaveBeenCalledTimes(1);
    });

    it('stopProgressPolling stops polling', () => {
      service.startProgressPolling();
      service.stopProgressPolling();

      expect(mockDownloadManagerModule.stopProgressPolling).toHaveBeenCalled();
      expect(service.isPolling).toBe(false);
    });

    it('does nothing when not available', () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      unavailableService.startProgressPolling();
      expect(mockDownloadManagerModule.startProgressPolling).not.toHaveBeenCalled();
      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // cleanup
  // ========================================================================
  describe('cleanup', () => {
    it('stops polling and clears all listeners', () => {
      // Register some listeners
      service.onProgress(1, jest.fn());
      service.onComplete(1, jest.fn());
      service.onError(1, jest.fn());
      service.startProgressPolling();

      service.cleanup();

      expect(service.progressListeners.size).toBe(0);
      expect(service.completeListeners.size).toBe(0);
      expect(service.errorListeners.size).toBe(0);
      expect(service.isPolling).toBe(false);
    });
  });

  // ========================================================================
  // startMultiFileDownload
  // ========================================================================
  describe('startMultiFileDownload', () => {
    it('calls native module with correct params', async () => {
      (mockDownloadManagerModule as any).startMultiFileDownload = jest.fn().mockResolvedValue({
        downloadId: 55,
        fileName: 'sd-model.zip',
        modelId: 'image:sd-model',
      });

      const result = await service.startMultiFileDownload({
        files: [
          { url: 'https://example.com/unet.onnx', relativePath: 'unet/model.onnx', size: 1000 },
          { url: 'https://example.com/vae.onnx', relativePath: 'vae/model.onnx', size: 500 },
        ],
        fileName: 'sd-model.zip',
        modelId: 'image:sd-model',
        destinationDir: '/models/image/sd-model',
        totalBytes: 1500,
      });

      expect((mockDownloadManagerModule as any).startMultiFileDownload).toHaveBeenCalledWith({
        files: [
          { url: 'https://example.com/unet.onnx', relativePath: 'unet/model.onnx', size: 1000 },
          { url: 'https://example.com/vae.onnx', relativePath: 'vae/model.onnx', size: 500 },
        ],
        fileName: 'sd-model.zip',
        modelId: 'image:sd-model',
        destinationDir: '/models/image/sd-model',
        totalBytes: 1500,
      });
      expect(result.downloadId).toBe(55);
      expect(result.status).toBe('pending');
      expect(result.bytesDownloaded).toBe(0);
      expect(result.totalBytes).toBe(1500);
    });

    it('uses 0 for totalBytes when not provided', async () => {
      (mockDownloadManagerModule as any).startMultiFileDownload = jest.fn().mockResolvedValue({
        downloadId: 56,
        fileName: 'sd-model.zip',
        modelId: 'image:sd-model',
      });

      const result = await service.startMultiFileDownload({
        files: [{ url: 'https://example.com/model.onnx', relativePath: 'model.onnx', size: 100 }],
        fileName: 'sd-model.zip',
        modelId: 'image:sd-model',
        destinationDir: '/models/image/sd-model',
      });

      const callArgs = (mockDownloadManagerModule as any).startMultiFileDownload.mock.calls[0][0];
      expect(callArgs.totalBytes).toBe(0);
      expect(result.totalBytes).toBe(0);
    });

    it('throws when not available', async () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      await expect(
        unavailableService.startMultiFileDownload({
          files: [],
          fileName: 'test.zip',
          modelId: 'test',
          destinationDir: '/test',
        })
      ).rejects.toThrow('Background downloads not available');
      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // getDownloadProgress
  // ========================================================================
  describe('getDownloadProgress', () => {
    it('returns progress from native module', async () => {
      mockDownloadManagerModule.getDownloadProgress.mockResolvedValue({
        bytesDownloaded: 2500,
        totalBytes: 5000,
        status: 'running',
        localUri: '',
        reason: '',
      });

      const result = await service.getDownloadProgress(42);

      expect(mockDownloadManagerModule.getDownloadProgress).toHaveBeenCalledWith(42);
      expect(result.bytesDownloaded).toBe(2500);
      expect(result.totalBytes).toBe(5000);
      expect(result.status).toBe('running');
      // Empty strings should be converted to undefined
      expect(result.localUri).toBeUndefined();
      expect(result.reason).toBeUndefined();
    });

    it('returns localUri and reason when present', async () => {
      mockDownloadManagerModule.getDownloadProgress.mockResolvedValue({
        bytesDownloaded: 5000,
        totalBytes: 5000,
        status: 'completed',
        localUri: '/data/downloads/model.gguf',
        reason: '',
      });

      const result = await service.getDownloadProgress(42);
      expect(result.localUri).toBe('/data/downloads/model.gguf');
      expect(result.reason).toBeUndefined();
    });

    it('returns reason when download failed', async () => {
      mockDownloadManagerModule.getDownloadProgress.mockResolvedValue({
        bytesDownloaded: 0,
        totalBytes: 5000,
        status: 'failed',
        localUri: '',
        reason: 'Network error',
      });

      const result = await service.getDownloadProgress(42);
      expect(result.localUri).toBeUndefined();
      expect(result.reason).toBe('Network error');
    });

    it('throws when not available', async () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      await expect(unavailableService.getDownloadProgress(42)).rejects.toThrow('not available');
      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // Additional polling branches
  // ========================================================================
  describe('polling edge cases', () => {
    it('stopProgressPolling does nothing when not already polling', () => {
      // service.isPolling is false by default
      service.stopProgressPolling();

      expect(mockDownloadManagerModule.stopProgressPolling).not.toHaveBeenCalled();
    });

    it('stopProgressPolling does nothing when not available', () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      unavailableService.stopProgressPolling();
      expect(mockDownloadManagerModule.stopProgressPolling).not.toHaveBeenCalled();
      NativeModules.DownloadManagerModule = savedModule;
    });
  });

  // ========================================================================
  // Event dispatch edge cases
  // ========================================================================
  describe('event dispatch edge cases', () => {
    it('dispatches progress only to global when no specific listener', () => {
      const globalCb = jest.fn();
      service.onAnyProgress(globalCb);

      const event = { downloadId: 99, bytesDownloaded: 500, totalBytes: 1000, status: 'running', fileName: 'model.gguf', modelId: 'test' };
      if (eventHandlers.DownloadProgress) {
        eventHandlers.DownloadProgress(event);
      }

      expect(globalCb).toHaveBeenCalledWith(event);
    });

    it('dispatches progress only to specific when no global listener', () => {
      const specificCb = jest.fn();
      service.onProgress(42, specificCb);

      const event = { downloadId: 42, bytesDownloaded: 500, totalBytes: 1000, status: 'running', fileName: 'model.gguf', modelId: 'test' };
      if (eventHandlers.DownloadProgress) {
        eventHandlers.DownloadProgress(event);
      }

      expect(specificCb).toHaveBeenCalledWith(event);
    });

    it('dispatches complete only to global when no specific listener', () => {
      const globalCb = jest.fn();
      service.onAnyComplete(globalCb);

      const event = { downloadId: 99, fileName: 'model.gguf', modelId: 'test', bytesDownloaded: 5000, totalBytes: 5000, status: 'completed', localUri: '/path' };
      if (eventHandlers.DownloadComplete) {
        eventHandlers.DownloadComplete(event);
      }

      expect(globalCb).toHaveBeenCalledWith(event);
    });

    it('dispatches complete only to specific when no global listener', () => {
      const specificCb = jest.fn();
      service.onComplete(42, specificCb);

      const event = { downloadId: 42, fileName: 'model.gguf', modelId: 'test', bytesDownloaded: 5000, totalBytes: 5000, status: 'completed', localUri: '/path' };
      if (eventHandlers.DownloadComplete) {
        eventHandlers.DownloadComplete(event);
      }

      expect(specificCb).toHaveBeenCalledWith(event);
    });

    it('dispatches error only to global when no specific listener', () => {
      const globalCb = jest.fn();
      service.onAnyError(globalCb);

      const event = { downloadId: 99, fileName: 'model.gguf', modelId: 'test', status: 'failed', reason: 'Error' };
      if (eventHandlers.DownloadError) {
        eventHandlers.DownloadError(event);
      }

      expect(globalCb).toHaveBeenCalledWith(event);
    });

    it('dispatches error only to specific when no global listener', () => {
      const specificCb = jest.fn();
      service.onError(42, specificCb);

      const event = { downloadId: 42, fileName: 'model.gguf', modelId: 'test', status: 'failed', reason: 'Error' };
      if (eventHandlers.DownloadError) {
        eventHandlers.DownloadError(event);
      }

      expect(specificCb).toHaveBeenCalledWith(event);
    });

    it('handles complete event with no listeners at all', () => {
      const event = { downloadId: 99, fileName: 'model.gguf', modelId: 'test', bytesDownloaded: 5000, totalBytes: 5000, status: 'completed', localUri: '/path' };
      expect(() => {
        if (eventHandlers.DownloadComplete) {
          eventHandlers.DownloadComplete(event);
        }
      }).not.toThrow();
    });

    it('handles error event with no listeners at all', () => {
      const event = { downloadId: 99, fileName: 'model.gguf', modelId: 'test', status: 'failed', reason: 'Error' };
      expect(() => {
        if (eventHandlers.DownloadError) {
          eventHandlers.DownloadError(event);
        }
      }).not.toThrow();
    });
  });

  // ========================================================================
  // startDownload default value branches
  // ========================================================================
  describe('startDownload default values', () => {
    it('uses 0 for totalBytes when not provided', async () => {
      mockDownloadManagerModule.startDownload.mockResolvedValue({
        downloadId: 1,
        fileName: 'model.gguf',
        modelId: 'test/model',
      });

      const result = await service.startDownload({
        url: 'https://example.com/model.gguf',
        fileName: 'model.gguf',
        modelId: 'test/model',
      });

      const callArgs = mockDownloadManagerModule.startDownload.mock.calls[0][0];
      expect(callArgs.totalBytes).toBe(0);
      expect(result.totalBytes).toBe(0);
    });
  });

  // ========================================================================
  // Unsubscribe functions for global listeners
  // ========================================================================
  describe('global listener unsubscribe', () => {
    it('onAnyProgress returns working unsubscribe', () => {
      const callback = jest.fn();
      const unsub = service.onAnyProgress(callback);
      expect(service.progressListeners.has('progress_all')).toBe(true);
      unsub();
      expect(service.progressListeners.has('progress_all')).toBe(false);
    });

    it('onAnyComplete returns working unsubscribe', () => {
      const callback = jest.fn();
      const unsub = service.onAnyComplete(callback);
      expect(service.completeListeners.has('complete_all')).toBe(true);
      unsub();
      expect(service.completeListeners.has('complete_all')).toBe(false);
    });

    it('onAnyError returns working unsubscribe', () => {
      const callback = jest.fn();
      const unsub = service.onAnyError(callback);
      expect(service.errorListeners.has('error_all')).toBe(true);
      unsub();
      expect(service.errorListeners.has('error_all')).toBe(false);
    });
  });

  // ========================================================================
  // Constructor branch: not available
  // ========================================================================
  describe('constructor when not available', () => {
    it('does not set up event emitter or listeners when module is null', () => {
      const savedModule = NativeModules.DownloadManagerModule;
      NativeModules.DownloadManagerModule = null;

      const addListenerSpy = jest.spyOn(NativeEventEmitter.prototype, 'addListener');
      addListenerSpy.mockClear();

      let unavailableService: any;
      jest.isolateModules(() => {
        const mod = require('../../../src/services/backgroundDownloadService');
        unavailableService = new (mod.backgroundDownloadService as any).constructor();
      });

      expect(unavailableService.eventEmitter).toBeNull();
      // addListener should not have been called during construction
      expect(addListenerSpy).not.toHaveBeenCalled();

      NativeModules.DownloadManagerModule = savedModule;
    });
  });
});
