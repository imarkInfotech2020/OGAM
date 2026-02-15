import { renderHook, act } from '@testing-library/react-native';
import { useWhisperTranscription } from '../../../src/hooks/useWhisperTranscription';

const mockLoadModel = jest.fn();
const mockWhisperStoreState = {
  downloadedModelId: null as string | null,
  isModelLoaded: false,
  isModelLoading: false,
  loadModel: mockLoadModel,
};

jest.mock('../../../src/services/whisperService', () => ({
  whisperService: {
    isModelLoaded: jest.fn(() => false),
    isCurrentlyTranscribing: jest.fn(() => false),
    startRealtimeTranscription: jest.fn(),
    stopTranscription: jest.fn(),
    forceReset: jest.fn(),
  },
}));

jest.mock('../../../src/stores/whisperStore', () => ({
  useWhisperStore: jest.fn(() => mockWhisperStoreState),
}));

// Get mock reference after jest.mock hoisting
const { whisperService: mockWhisperService } = require('../../../src/services/whisperService');

jest.mock('react-native', () => ({
  Vibration: {
    vibrate: jest.fn(),
  },
}));

describe('useWhisperTranscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockWhisperService.isModelLoaded.mockReturnValue(false);
    mockWhisperService.isCurrentlyTranscribing.mockReturnValue(false);
    mockWhisperStoreState.downloadedModelId = null;
    mockWhisperStoreState.isModelLoaded = false;
    mockWhisperStoreState.isModelLoading = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useWhisperTranscription());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
    expect(result.current.isModelLoaded).toBe(false);
    expect(result.current.isModelLoading).toBe(false);
    expect(result.current.partialResult).toBe('');
    expect(result.current.finalResult).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.recordingTime).toBe(0);
    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
    expect(typeof result.current.clearResult).toBe('function');
  });

  it('sets error when startRecording called with no model loaded and no downloadedModelId', async () => {
    mockWhisperService.isModelLoaded.mockReturnValue(false);
    mockWhisperStoreState.downloadedModelId = null;

    const { result } = renderHook(() => useWhisperTranscription());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe(
      'No transcription model downloaded. Go to Settings to download one.',
    );
    expect(mockWhisperService.startRealtimeTranscription).not.toHaveBeenCalled();
  });

  it('calls loadModel when startRecording called with model not loaded but downloadedModelId exists', async () => {
    mockWhisperService.isModelLoaded.mockReturnValue(false);
    mockWhisperStoreState.downloadedModelId = 'whisper-tiny';
    mockLoadModel.mockResolvedValue(undefined);
    // After loadModel, model is still not loaded from service perspective
    // so startRealtimeTranscription won't be called unless we update the mock
    mockWhisperService.isModelLoaded
      .mockReturnValueOnce(false) // auto-load check
      .mockReturnValueOnce(false) // console.log check
      .mockReturnValueOnce(false); // the guard check in startRecording

    const { result } = renderHook(() => useWhisperTranscription());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockLoadModel).toHaveBeenCalled();
  });

  it('sets error when loadModel fails during startRecording', async () => {
    mockWhisperService.isModelLoaded.mockReturnValue(false);
    mockWhisperStoreState.downloadedModelId = 'whisper-tiny';
    mockLoadModel.mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => useWhisperTranscription());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe(
      'Failed to load Whisper model. Please try again.',
    );
  });

  it('calls startRealtimeTranscription and sets isRecording on success', async () => {
    mockWhisperService.isModelLoaded.mockReturnValue(true);

    mockWhisperService.startRealtimeTranscription.mockImplementation(
      async (callback: any) => {
        callback({ isCapturing: true, text: 'partial', recordingTime: 1 });
      },
    );

    const { result } = renderHook(() => useWhisperTranscription());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockWhisperService.startRealtimeTranscription).toHaveBeenCalled();
    expect(result.current.partialResult).toBe('partial');
    expect(result.current.recordingTime).toBe(1);
  });

  it('sets error and calls forceReset when startRecording throws', async () => {
    mockWhisperService.isModelLoaded.mockReturnValue(true);
    mockWhisperService.startRealtimeTranscription.mockRejectedValue(
      new Error('Mic access denied'),
    );

    const { result } = renderHook(() => useWhisperTranscription());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('Mic access denied');
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
    expect(mockWhisperService.forceReset).toHaveBeenCalled();
  });

  it('stopRecording sets isRecording false and calls stopTranscription after delay', async () => {
    mockWhisperService.isModelLoaded.mockReturnValue(true);
    mockWhisperService.stopTranscription.mockResolvedValue(undefined);

    mockWhisperService.startRealtimeTranscription.mockImplementation(
      async (callback: any) => {
        callback({ isCapturing: true, text: 'hello', recordingTime: 2 });
      },
    );

    const { result } = renderHook(() => useWhisperTranscription());

    // Start recording first
    await act(async () => {
      await result.current.startRecording();
    });

    // Stop recording
    let stopPromise: Promise<void>;
    act(() => {
      stopPromise = result.current.stopRecording();
    });

    // isRecording should be false immediately
    expect(result.current.isRecording).toBe(false);

    // Advance past the trailing record time (2500ms)
    await act(async () => {
      jest.advanceTimersByTime(2500);
      await stopPromise;
    });

    expect(mockWhisperService.stopTranscription).toHaveBeenCalled();
  });

  it('clearResult clears finalResult, partialResult, and isTranscribing', async () => {
    mockWhisperService.isModelLoaded.mockReturnValue(true);

    mockWhisperService.startRealtimeTranscription.mockImplementation(
      async (callback: any) => {
        callback({ isCapturing: false, text: 'final text', recordingTime: 3 });
      },
    );

    const { result } = renderHook(() => useWhisperTranscription());

    await act(async () => {
      await result.current.startRecording();
    });

    // Advance timers to resolve any pending finalizeTranscription timeouts
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Now clear
    act(() => {
      result.current.clearResult();
    });

    expect(result.current.finalResult).toBe('');
    expect(result.current.partialResult).toBe('');
    expect(result.current.isTranscribing).toBe(false);
  });

  it('auto-loads model when downloadedModelId exists and model not loaded', async () => {
    mockWhisperStoreState.downloadedModelId = 'whisper-base';
    mockWhisperStoreState.isModelLoaded = false;
    mockWhisperService.isModelLoaded.mockReturnValue(false);
    mockLoadModel.mockResolvedValue(undefined);

    renderHook(() => useWhisperTranscription());

    // The useEffect runs asynchronously
    await act(async () => {
      // Let the effect run
    });

    expect(mockLoadModel).toHaveBeenCalled();
  });

  it('does not auto-load model when model is already loaded', async () => {
    mockWhisperStoreState.downloadedModelId = 'whisper-base';
    mockWhisperStoreState.isModelLoaded = true;
    mockWhisperService.isModelLoaded.mockReturnValue(true);

    renderHook(() => useWhisperTranscription());

    await act(async () => {});

    expect(mockLoadModel).not.toHaveBeenCalled();
  });

  it('returns isModelLoaded true when store or service reports loaded', () => {
    mockWhisperStoreState.isModelLoaded = false;
    mockWhisperService.isModelLoaded.mockReturnValue(true);

    const { result } = renderHook(() => useWhisperTranscription());

    expect(result.current.isModelLoaded).toBe(true);
  });
});
