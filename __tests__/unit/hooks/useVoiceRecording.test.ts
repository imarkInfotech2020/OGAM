/**
 * useVoiceRecording Hook Unit Tests
 *
 * Tests for the voice recording hook that wraps voiceService.
 */

import { renderHook, act } from '@testing-library/react-native';

jest.mock('../../../src/services/voiceService', () => ({
  voiceService: {
    requestPermissions: jest.fn(),
    initialize: jest.fn(),
    setCallbacks: jest.fn(),
    startListening: jest.fn(),
    stopListening: jest.fn(),
    cancelListening: jest.fn(),
    destroy: jest.fn(),
  },
}));

// Get mock reference after jest.mock hoisting
const { voiceService: mockVoiceService } = require('../../../src/services/voiceService');

import { useVoiceRecording } from '../../../src/hooks/useVoiceRecording';

describe('useVoiceRecording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoiceService.requestPermissions.mockResolvedValue(true);
    mockVoiceService.initialize.mockResolvedValue(true);
    mockVoiceService.startListening.mockResolvedValue(undefined);
    mockVoiceService.stopListening.mockResolvedValue(undefined);
    mockVoiceService.cancelListening.mockResolvedValue(undefined);
    mockVoiceService.destroy.mockResolvedValue(undefined);
  });

  // ========================================================================
  // Initial state
  // ========================================================================
  it('returns correct initial state', () => {
    const { result } = renderHook(() => useVoiceRecording());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isAvailable).toBe(false);
    expect(result.current.partialResult).toBe('');
    expect(result.current.finalResult).toBe('');
    expect(result.current.error).toBeNull();
    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
    expect(typeof result.current.cancelRecording).toBe('function');
    expect(typeof result.current.clearResult).toBe('function');
  });

  // ========================================================================
  // Initialization
  // ========================================================================
  describe('initialization', () => {
    it('requests permissions and initializes voice service on mount', async () => {
      renderHook(() => useVoiceRecording());

      await act(async () => {});

      expect(mockVoiceService.requestPermissions).toHaveBeenCalledTimes(1);
      expect(mockVoiceService.initialize).toHaveBeenCalledTimes(1);
    });

    it('sets isAvailable to true when permissions granted and initialized', async () => {
      const { result } = renderHook(() => useVoiceRecording());

      await act(async () => {});

      expect(result.current.isAvailable).toBe(true);
    });

    it('sets isAvailable to false and error when permissions denied', async () => {
      mockVoiceService.requestPermissions.mockResolvedValue(false);

      const { result } = renderHook(() => useVoiceRecording());

      await act(async () => {});

      expect(result.current.isAvailable).toBe(false);
      expect(result.current.error).toBe('Microphone permission denied');
    });

    it('sets error when initialization fails after permissions granted', async () => {
      mockVoiceService.initialize.mockResolvedValue(false);

      const { result } = renderHook(() => useVoiceRecording());

      await act(async () => {});

      expect(result.current.isAvailable).toBe(false);
      expect(result.current.error).toBe(
        'Voice recognition not available on this device. Check if Google app is installed.',
      );
    });

    it('sets up callbacks on mount', async () => {
      renderHook(() => useVoiceRecording());

      await act(async () => {});

      expect(mockVoiceService.setCallbacks).toHaveBeenCalledWith({
        onStart: expect.any(Function),
        onEnd: expect.any(Function),
        onResults: expect.any(Function),
        onPartialResults: expect.any(Function),
        onError: expect.any(Function),
      });
    });

    it('destroys voice service on unmount', async () => {
      const { unmount } = renderHook(() => useVoiceRecording());

      await act(async () => {});

      unmount();

      expect(mockVoiceService.destroy).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // Callbacks
  // ========================================================================
  describe('callbacks', () => {
    const getCallbacks = () => {
      return mockVoiceService.setCallbacks.mock.calls[0][0];
    };

    it('onStart sets isRecording to true and clears error', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = getCallbacks();

      act(() => {
        callbacks.onStart();
      });

      expect(result.current.isRecording).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('onEnd sets isRecording to false', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = getCallbacks();

      act(() => {
        callbacks.onStart();
      });
      act(() => {
        callbacks.onEnd();
      });

      expect(result.current.isRecording).toBe(false);
    });

    it('onResults sets finalResult and clears partialResult', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = getCallbacks();

      act(() => {
        callbacks.onResults(['hello world', 'hello']);
      });

      expect(result.current.finalResult).toBe('hello world');
      expect(result.current.partialResult).toBe('');
    });

    it('onResults ignores empty results array', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = getCallbacks();

      act(() => {
        callbacks.onResults([]);
      });

      expect(result.current.finalResult).toBe('');
    });

    it('onPartialResults sets partialResult', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = getCallbacks();

      act(() => {
        callbacks.onPartialResults(['hel']);
      });

      expect(result.current.partialResult).toBe('hel');
    });

    it('onPartialResults ignores empty array', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = getCallbacks();

      act(() => {
        callbacks.onPartialResults([]);
      });

      expect(result.current.partialResult).toBe('');
    });

    it('onError sets error and isRecording to false', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = getCallbacks();

      act(() => {
        callbacks.onStart();
      });

      act(() => {
        callbacks.onError('Network timeout');
      });

      expect(result.current.error).toBe('Network timeout');
      expect(result.current.isRecording).toBe(false);
    });
  });

  // ========================================================================
  // startRecording
  // ========================================================================
  describe('startRecording', () => {
    it('calls voiceService.startListening', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      await act(async () => {
        await result.current.startRecording();
      });

      expect(mockVoiceService.startListening).toHaveBeenCalledTimes(1);
    });

    it('clears error, partialResult, and finalResult before starting', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      // Set some state via callbacks first
      const callbacks = mockVoiceService.setCallbacks.mock.calls[0][0];
      act(() => {
        callbacks.onError('previous error');
      });

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.error).toBeNull();
    });

    it('sets error when startListening throws', async () => {
      mockVoiceService.startListening.mockRejectedValue(new Error('Mic busy'));

      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.error).toBe('Failed to start recording');
      expect(result.current.isRecording).toBe(false);
    });
  });

  // ========================================================================
  // stopRecording
  // ========================================================================
  describe('stopRecording', () => {
    it('calls voiceService.stopListening', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      await act(async () => {
        await result.current.stopRecording();
      });

      expect(mockVoiceService.stopListening).toHaveBeenCalledTimes(1);
    });

    it('sets error when stopListening throws', async () => {
      mockVoiceService.stopListening.mockRejectedValue(new Error('Stop failed'));

      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      await act(async () => {
        await result.current.stopRecording();
      });

      expect(result.current.error).toBe('Failed to stop recording');
    });
  });

  // ========================================================================
  // cancelRecording
  // ========================================================================
  describe('cancelRecording', () => {
    it('calls voiceService.cancelListening and clears state', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      // Set some state via callbacks
      const callbacks = mockVoiceService.setCallbacks.mock.calls[0][0];
      act(() => {
        callbacks.onStart();
        callbacks.onPartialResults(['partial']);
      });

      await act(async () => {
        await result.current.cancelRecording();
      });

      expect(mockVoiceService.cancelListening).toHaveBeenCalledTimes(1);
      expect(result.current.isRecording).toBe(false);
      expect(result.current.partialResult).toBe('');
      expect(result.current.finalResult).toBe('');
    });

    it('ignores results after cancel (isCancelled ref)', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = mockVoiceService.setCallbacks.mock.calls[0][0];

      await act(async () => {
        await result.current.cancelRecording();
      });

      // Results arriving after cancel should be ignored
      act(() => {
        callbacks.onResults(['late result']);
      });

      expect(result.current.finalResult).toBe('');
    });

    it('sets error when cancelListening throws', async () => {
      mockVoiceService.cancelListening.mockRejectedValue(new Error('Cancel failed'));

      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      await act(async () => {
        await result.current.cancelRecording();
      });

      expect(result.current.error).toBe('Failed to cancel recording');
    });
  });

  // ========================================================================
  // clearResult
  // ========================================================================
  describe('clearResult', () => {
    it('clears finalResult and partialResult', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = mockVoiceService.setCallbacks.mock.calls[0][0];
      act(() => {
        callbacks.onResults(['some result']);
        callbacks.onPartialResults(['partial']);
      });

      act(() => {
        result.current.clearResult();
      });

      expect(result.current.finalResult).toBe('');
      expect(result.current.partialResult).toBe('');
    });
  });

  // ========================================================================
  // isCancelled ref reset on startRecording
  // ========================================================================
  describe('isCancelled ref lifecycle', () => {
    it('resets isCancelled on startRecording so new results are accepted', async () => {
      const { result } = renderHook(() => useVoiceRecording());
      await act(async () => {});

      const callbacks = mockVoiceService.setCallbacks.mock.calls[0][0];

      // Cancel first
      await act(async () => {
        await result.current.cancelRecording();
      });

      // Start new recording - resets isCancelled
      await act(async () => {
        await result.current.startRecording();
      });

      // Results should now be accepted
      act(() => {
        callbacks.onResults(['new result']);
      });

      expect(result.current.finalResult).toBe('new result');
    });
  });
});
