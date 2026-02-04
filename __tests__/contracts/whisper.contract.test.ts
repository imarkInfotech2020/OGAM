/**
 * Contract Tests: whisper.rn Native Module (Speech-to-Text)
 *
 * These tests verify that the whisper.rn native module interface
 * matches our TypeScript expectations for speech transcription.
 */

import { initWhisper, releaseAllWhisper, AudioSessionIos } from 'whisper.rn';

// Define expected interfaces
interface WhisperContextOptions {
  filePath: string;
  coreMLModelAsset?: { filename: string; assets: any[] };
}

interface TranscribeOptions {
  language?: string;
  maxLen?: number;
  onProgress?: (progress: number) => void;
}

interface TranscribeRealtimeOptions {
  language?: string;
  maxLen?: number;
  realtimeAudioSec?: number;
  realtimeAudioSliceSec?: number;
  audioSessionOnStartIos?: any;
  audioSessionOnStopIos?: any;
}

interface TranscribeResult {
  result: string;
}

interface RealtimeTranscribeEvent {
  isCapturing: boolean;
  data?: { result: string };
  processTime?: number;
  recordingTime?: number;
}

interface WhisperContext {
  transcribe(
    filePath: string | number,
    options?: TranscribeOptions
  ): { stop: () => void; promise: Promise<TranscribeResult> };

  transcribeRealtime(
    options?: TranscribeRealtimeOptions
  ): Promise<{
    stop: () => void;
    subscribe: (callback: (event: RealtimeTranscribeEvent) => void) => void;
  }>;

  release(): Promise<void>;
}

// Mock the module
jest.mock('whisper.rn', () => ({
  initWhisper: jest.fn(),
  releaseAllWhisper: jest.fn(),
  AudioSessionIos: {
    Category: {
      PlayAndRecord: 'AVAudioSessionCategoryPlayAndRecord',
      Playback: 'AVAudioSessionCategoryPlayback',
      Record: 'AVAudioSessionCategoryRecord',
    },
    CategoryOption: {
      MixWithOthers: 'AVAudioSessionCategoryOptionMixWithOthers',
      AllowBluetooth: 'AVAudioSessionCategoryOptionAllowBluetooth',
    },
    Mode: {
      Default: 'AVAudioSessionModeDefault',
      VoiceChat: 'AVAudioSessionModeVoiceChat',
    },
    setCategory: jest.fn(),
    setMode: jest.fn(),
    setActive: jest.fn(),
  },
}));

const mockInitWhisper = initWhisper as jest.MockedFunction<typeof initWhisper>;
const mockReleaseAllWhisper = releaseAllWhisper as jest.MockedFunction<typeof releaseAllWhisper>;

describe('whisper.rn Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initWhisper', () => {
    it('should accept valid initialization options', async () => {
      const mockContext: Partial<WhisperContext> = {
        transcribe: jest.fn(),
        transcribeRealtime: jest.fn(),
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const options: WhisperContextOptions = {
        filePath: '/path/to/whisper-model.bin',
      };

      await initWhisper(options);

      expect(mockInitWhisper).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: expect.any(String),
        })
      );
    });

    it('should accept CoreML model asset option', async () => {
      const mockContext: Partial<WhisperContext> = {
        transcribe: jest.fn(),
        transcribeRealtime: jest.fn(),
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const options: WhisperContextOptions = {
        filePath: '/path/to/whisper-model.bin',
        coreMLModelAsset: {
          filename: 'whisper-encoder.mlmodelc',
          assets: [],
        },
      };

      await initWhisper(options);

      expect(mockInitWhisper).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: expect.any(String),
          coreMLModelAsset: expect.objectContaining({
            filename: expect.any(String),
          }),
        })
      );
    });

    it('should return context with expected methods', async () => {
      const mockContext: Partial<WhisperContext> = {
        transcribe: jest.fn(),
        transcribeRealtime: jest.fn(),
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });

      expect(context).toHaveProperty('transcribe');
      expect(context).toHaveProperty('transcribeRealtime');
      expect(context).toHaveProperty('release');
      expect(typeof context.transcribe).toBe('function');
      expect(typeof context.transcribeRealtime).toBe('function');
      expect(typeof context.release).toBe('function');
    });
  });

  describe('WhisperContext.transcribe', () => {
    it('should accept file path and return stoppable promise', async () => {
      const mockTranscribeResult = { result: 'Hello world' };
      const mockStop = jest.fn();
      const mockTranscribe = jest.fn().mockReturnValue({
        stop: mockStop,
        promise: Promise.resolve(mockTranscribeResult),
      });

      const mockContext: Partial<WhisperContext> = {
        transcribe: mockTranscribe,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      const { stop, promise } = context.transcribe('/path/to/audio.wav');

      expect(typeof stop).toBe('function');
      expect(promise).toBeInstanceOf(Promise);

      const result = await promise;
      expect(result).toHaveProperty('result');
      expect(typeof result.result).toBe('string');
    });

    it('should accept transcribe options', async () => {
      const mockTranscribe = jest.fn().mockReturnValue({
        stop: jest.fn(),
        promise: Promise.resolve({ result: 'Test' }),
      });

      const mockContext: Partial<WhisperContext> = {
        transcribe: mockTranscribe,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });

      const options: TranscribeOptions = {
        language: 'en',
        maxLen: 100,
        onProgress: jest.fn(),
      };

      context.transcribe('/path/to/audio.wav', options);

      expect(mockTranscribe).toHaveBeenCalledWith(
        '/path/to/audio.wav',
        expect.objectContaining({
          language: 'en',
          maxLen: 100,
          onProgress: expect.any(Function),
        })
      );
    });

    it('should call progress callback during transcription', async () => {
      const progressCallback = jest.fn();
      const mockTranscribe = jest.fn().mockImplementation((path, options) => {
        // Simulate progress callbacks
        if (options?.onProgress) {
          options.onProgress(0.25);
          options.onProgress(0.5);
          options.onProgress(0.75);
          options.onProgress(1.0);
        }
        return {
          stop: jest.fn(),
          promise: Promise.resolve({ result: 'Transcribed text' }),
        };
      });

      const mockContext: Partial<WhisperContext> = {
        transcribe: mockTranscribe,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      context.transcribe('/path/to/audio.wav', { onProgress: progressCallback });

      expect(progressCallback).toHaveBeenCalledWith(0.25);
      expect(progressCallback).toHaveBeenCalledWith(1.0);
      expect(progressCallback).toHaveBeenCalledTimes(4);
    });

    it('should accept file descriptor number', async () => {
      const mockTranscribe = jest.fn().mockReturnValue({
        stop: jest.fn(),
        promise: Promise.resolve({ result: 'Test' }),
      });

      const mockContext: Partial<WhisperContext> = {
        transcribe: mockTranscribe,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      context.transcribe(42); // File descriptor

      expect(mockTranscribe).toHaveBeenCalledWith(42);
    });
  });

  describe('WhisperContext.transcribeRealtime', () => {
    it('should return subscribable stream', async () => {
      const mockStop = jest.fn();
      const mockSubscribe = jest.fn();
      const mockTranscribeRealtime = jest.fn().mockResolvedValue({
        stop: mockStop,
        subscribe: mockSubscribe,
      });

      const mockContext: Partial<WhisperContext> = {
        transcribeRealtime: mockTranscribeRealtime,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      const stream = await context.transcribeRealtime();

      expect(stream).toHaveProperty('stop');
      expect(stream).toHaveProperty('subscribe');
      expect(typeof stream.stop).toBe('function');
      expect(typeof stream.subscribe).toBe('function');
    });

    it('should accept realtime options', async () => {
      const mockTranscribeRealtime = jest.fn().mockResolvedValue({
        stop: jest.fn(),
        subscribe: jest.fn(),
      });

      const mockContext: Partial<WhisperContext> = {
        transcribeRealtime: mockTranscribeRealtime,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });

      const options: TranscribeRealtimeOptions = {
        language: 'en',
        maxLen: 50,
        realtimeAudioSec: 30,
        realtimeAudioSliceSec: 3,
      };

      await context.transcribeRealtime(options);

      expect(mockTranscribeRealtime).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'en',
          realtimeAudioSec: 30,
          realtimeAudioSliceSec: 3,
        })
      );
    });

    it('should emit events with expected shape', async () => {
      const subscribeCallback = jest.fn();
      const mockSubscribe = jest.fn().mockImplementation((callback) => {
        // Simulate realtime events
        callback({
          isCapturing: true,
          data: { result: 'Hello' },
          processTime: 150,
          recordingTime: 3000,
        });
        callback({
          isCapturing: true,
          data: { result: 'Hello world' },
          processTime: 200,
          recordingTime: 6000,
        });
        callback({
          isCapturing: false,
        });
      });

      const mockTranscribeRealtime = jest.fn().mockResolvedValue({
        stop: jest.fn(),
        subscribe: mockSubscribe,
      });

      const mockContext: Partial<WhisperContext> = {
        transcribeRealtime: mockTranscribeRealtime,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      const stream = await context.transcribeRealtime();
      stream.subscribe(subscribeCallback);

      expect(subscribeCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          isCapturing: true,
          data: expect.objectContaining({ result: expect.any(String) }),
        })
      );

      expect(subscribeCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          isCapturing: false,
        })
      );
    });

    it('should be stoppable', async () => {
      const mockStop = jest.fn();
      const mockTranscribeRealtime = jest.fn().mockResolvedValue({
        stop: mockStop,
        subscribe: jest.fn(),
      });

      const mockContext: Partial<WhisperContext> = {
        transcribeRealtime: mockTranscribeRealtime,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      const stream = await context.transcribeRealtime();
      stream.stop();

      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('WhisperContext.release', () => {
    it('should be callable for cleanup', async () => {
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      const mockContext: Partial<WhisperContext> = {
        transcribe: jest.fn(),
        transcribeRealtime: jest.fn(),
        release: mockRelease,
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      await context.release();

      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('releaseAllWhisper', () => {
    it('should release all contexts', async () => {
      mockReleaseAllWhisper.mockResolvedValue(undefined);

      await releaseAllWhisper();

      expect(mockReleaseAllWhisper).toHaveBeenCalled();
    });
  });

  describe('AudioSessionIos', () => {
    it('should have expected category constants', () => {
      expect(AudioSessionIos.Category).toHaveProperty('PlayAndRecord');
      expect(AudioSessionIos.Category).toHaveProperty('Playback');
      expect(AudioSessionIos.Category).toHaveProperty('Record');
    });

    it('should have expected category option constants', () => {
      expect(AudioSessionIos.CategoryOption).toHaveProperty('MixWithOthers');
      expect(AudioSessionIos.CategoryOption).toHaveProperty('AllowBluetooth');
    });

    it('should have expected mode constants', () => {
      expect(AudioSessionIos.Mode).toHaveProperty('Default');
      expect(AudioSessionIos.Mode).toHaveProperty('VoiceChat');
    });

    it('should have setCategory method', async () => {
      (AudioSessionIos.setCategory as jest.Mock).mockResolvedValue(undefined);

      await AudioSessionIos.setCategory(
        AudioSessionIos.Category.PlayAndRecord,
        [AudioSessionIos.CategoryOption.MixWithOthers]
      );

      expect(AudioSessionIos.setCategory).toHaveBeenCalled();
    });

    it('should have setMode method', async () => {
      (AudioSessionIos.setMode as jest.Mock).mockResolvedValue(undefined);

      await AudioSessionIos.setMode(AudioSessionIos.Mode.VoiceChat);

      expect(AudioSessionIos.setMode).toHaveBeenCalled();
    });

    it('should have setActive method', async () => {
      (AudioSessionIos.setActive as jest.Mock).mockResolvedValue(undefined);

      await AudioSessionIos.setActive(true);

      expect(AudioSessionIos.setActive).toHaveBeenCalledWith(true);
    });
  });

  describe('Error handling', () => {
    it('should reject on invalid model path', async () => {
      mockInitWhisper.mockRejectedValue(new Error('Failed to load model: file not found'));

      await expect(initWhisper({ filePath: '/invalid/path.bin' }))
        .rejects.toThrow('Failed to load model');
    });

    it('should reject on transcription failure', async () => {
      const mockTranscribe = jest.fn().mockReturnValue({
        stop: jest.fn(),
        promise: Promise.reject(new Error('Transcription failed')),
      });

      const mockContext: Partial<WhisperContext> = {
        transcribe: mockTranscribe,
        release: jest.fn(),
      };
      mockInitWhisper.mockResolvedValue(mockContext as WhisperContext);

      const context = await initWhisper({ filePath: '/path/to/model.bin' });
      const { promise } = context.transcribe('/path/to/audio.wav');

      await expect(promise).rejects.toThrow('Transcription failed');
    });

    it('should handle audio session errors', async () => {
      (AudioSessionIos.setCategory as jest.Mock).mockRejectedValue(
        new Error('Failed to set audio session category')
      );

      await expect(AudioSessionIos.setCategory('InvalidCategory'))
        .rejects.toThrow('Failed to set audio session');
    });
  });
});
