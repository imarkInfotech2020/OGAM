/**
 * VoiceService Unit Tests
 *
 * Tests for the Voice recognition service wrapper around @react-native-voice/voice.
 * Priority: P1 - Voice input support.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { voiceService } from '../../../src/services/voiceService';
import type { VoiceEventCallbacks } from '../../../src/services/voiceService';

// Get the Voice mock and augment missing methods
const Voice = require('@react-native-voice/voice');

// Add methods that the jest.setup.ts mock is missing
if (!Voice.cancel) {
  Voice.cancel = jest.fn(() => Promise.resolve());
}
if (!Voice.isRecognizing) {
  Voice.isRecognizing = jest.fn(() => Promise.resolve(false));
}
if (!Voice.getSpeechRecognitionServices) {
  Voice.getSpeechRecognitionServices = jest.fn(() => Promise.resolve([]));
}
if (!Voice.onSpeechPartialResults) {
  Voice.onSpeechPartialResults = null;
}

describe('VoiceService', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton state
    (voiceService as any).isInitialized = false;
    (voiceService as any).callbacks = {};

    // Reset Voice event handlers
    Voice.onSpeechStart = null;
    Voice.onSpeechEnd = null;
    Voice.onSpeechResults = null;
    Voice.onSpeechPartialResults = null;
    Voice.onSpeechError = null;

    // Reset default mock implementations
    Voice.isAvailable.mockResolvedValue(true);
    Voice.start.mockResolvedValue(undefined);
    Voice.stop.mockResolvedValue(undefined);
    Voice.cancel.mockResolvedValue(undefined);
    Voice.destroy.mockResolvedValue(undefined);
    Voice.isRecognizing.mockResolvedValue(false);
    Voice.getSpeechRecognitionServices.mockResolvedValue([]);

    // Restore platform
    Platform.OS = originalPlatformOS;
  });

  afterAll(() => {
    Platform.OS = originalPlatformOS;
  });

  // ========================================================================
  // initialize
  // ========================================================================
  describe('initialize', () => {
    it('checks availability and sets up event listeners on success', async () => {
      const result = await voiceService.initialize();

      expect(result).toBe(true);
      expect(Voice.isAvailable).toHaveBeenCalledTimes(1);
      expect((voiceService as any).isInitialized).toBe(true);

      // Event listeners should be assigned
      expect(Voice.onSpeechStart).toBeInstanceOf(Function);
      expect(Voice.onSpeechEnd).toBeInstanceOf(Function);
      expect(Voice.onSpeechResults).toBeInstanceOf(Function);
      expect(Voice.onSpeechPartialResults).toBeInstanceOf(Function);
      expect(Voice.onSpeechError).toBeInstanceOf(Function);
    });

    it('returns true immediately if already initialized', async () => {
      // First initialization
      await voiceService.initialize();
      expect(Voice.isAvailable).toHaveBeenCalledTimes(1);

      // Second call should skip availability check
      const result = await voiceService.initialize();
      expect(result).toBe(true);
      expect(Voice.isAvailable).toHaveBeenCalledTimes(1); // not called again
    });

    it('returns false when voice is not available and tries getSpeechRecognitionServices', async () => {
      Voice.isAvailable.mockResolvedValue(false);

      const result = await voiceService.initialize();

      expect(result).toBe(false);
      expect(Voice.isAvailable).toHaveBeenCalled();
      expect(Voice.getSpeechRecognitionServices).toHaveBeenCalled();
      expect((voiceService as any).isInitialized).toBe(false);
    });

    it('returns false when voice is not available even if getSpeechRecognitionServices fails', async () => {
      Voice.isAvailable.mockResolvedValue(false);
      Voice.getSpeechRecognitionServices.mockRejectedValue(
        new Error('No services'),
      );

      const result = await voiceService.initialize();

      expect(result).toBe(false);
      expect((voiceService as any).isInitialized).toBe(false);
    });

    it('returns false when isAvailable throws an error', async () => {
      Voice.isAvailable.mockRejectedValue(new Error('Device error'));

      const result = await voiceService.initialize();

      expect(result).toBe(false);
      expect((voiceService as any).isInitialized).toBe(false);
    });
  });

  // ========================================================================
  // requestPermissions
  // ========================================================================
  describe('requestPermissions', () => {
    it('requests RECORD_AUDIO permission on Android and returns true when granted', async () => {
      Platform.OS = 'android';
      const requestSpy = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

      const result = await voiceService.requestPermissions();

      expect(result).toBe(true);
      expect(requestSpy).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        expect.objectContaining({
          title: 'Microphone Permission',
          buttonPositive: 'OK',
        }),
      );
    });

    it('returns false on Android when permission is denied', async () => {
      Platform.OS = 'android';
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

      const result = await voiceService.requestPermissions();

      expect(result).toBe(false);
    });

    it('returns false on Android when permission request throws', async () => {
      Platform.OS = 'android';
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockRejectedValue(new Error('Permission error'));

      const result = await voiceService.requestPermissions();

      expect(result).toBe(false);
    });

    it('returns true on iOS without requesting permissions', async () => {
      Platform.OS = 'ios';
      const requestSpy = jest.spyOn(PermissionsAndroid, 'request');

      const result = await voiceService.requestPermissions();

      expect(result).toBe(true);
      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // setCallbacks
  // ========================================================================
  describe('setCallbacks', () => {
    it('stores the provided callbacks', () => {
      const callbacks: VoiceEventCallbacks = {
        onStart: jest.fn(),
        onEnd: jest.fn(),
        onResults: jest.fn(),
        onPartialResults: jest.fn(),
        onError: jest.fn(),
      };

      voiceService.setCallbacks(callbacks);

      expect((voiceService as any).callbacks).toBe(callbacks);
    });

    it('replaces previous callbacks', () => {
      const firstCallbacks: VoiceEventCallbacks = { onStart: jest.fn() };
      const secondCallbacks: VoiceEventCallbacks = { onEnd: jest.fn() };

      voiceService.setCallbacks(firstCallbacks);
      voiceService.setCallbacks(secondCallbacks);

      expect((voiceService as any).callbacks).toBe(secondCallbacks);
    });
  });

  // ========================================================================
  // startListening
  // ========================================================================
  describe('startListening', () => {
    it('calls initialize then Voice.start with en-US', async () => {
      await voiceService.startListening();

      expect(Voice.isAvailable).toHaveBeenCalled(); // from initialize
      expect(Voice.start).toHaveBeenCalledWith('en-US');
    });

    it('throws when Voice.start fails', async () => {
      const error = new Error('Start failed');
      Voice.start.mockRejectedValue(error);

      await expect(voiceService.startListening()).rejects.toThrow(
        'Start failed',
      );
    });

    it('still calls Voice.start even when initialize returns false', async () => {
      Voice.isAvailable.mockResolvedValue(false);

      // initialize returns false but startListening does not gate on the result
      await voiceService.startListening();

      expect(Voice.isAvailable).toHaveBeenCalled();
      expect(Voice.start).toHaveBeenCalledWith('en-US');
    });
  });

  // ========================================================================
  // stopListening
  // ========================================================================
  describe('stopListening', () => {
    it('calls Voice.stop', async () => {
      await voiceService.stopListening();

      expect(Voice.stop).toHaveBeenCalledTimes(1);
    });

    it('throws when Voice.stop fails', async () => {
      const error = new Error('Stop failed');
      Voice.stop.mockRejectedValue(error);

      await expect(voiceService.stopListening()).rejects.toThrow(
        'Stop failed',
      );
    });
  });

  // ========================================================================
  // cancelListening
  // ========================================================================
  describe('cancelListening', () => {
    it('calls Voice.cancel', async () => {
      await voiceService.cancelListening();

      expect(Voice.cancel).toHaveBeenCalledTimes(1);
    });

    it('throws when Voice.cancel fails', async () => {
      const error = new Error('Cancel failed');
      Voice.cancel.mockRejectedValue(error);

      await expect(voiceService.cancelListening()).rejects.toThrow(
        'Cancel failed',
      );
    });
  });

  // ========================================================================
  // destroy
  // ========================================================================
  describe('destroy', () => {
    it('calls Voice.destroy and resets isInitialized', async () => {
      // First initialize
      await voiceService.initialize();
      expect((voiceService as any).isInitialized).toBe(true);

      // Then destroy
      await voiceService.destroy();

      expect(Voice.destroy).toHaveBeenCalledTimes(1);
      expect((voiceService as any).isInitialized).toBe(false);
    });

    it('does not throw when Voice.destroy fails', async () => {
      Voice.destroy.mockRejectedValue(new Error('Destroy failed'));

      // Should not throw - error is caught internally
      await expect(voiceService.destroy()).resolves.toBeUndefined();
    });
  });

  // ========================================================================
  // isRecognizing
  // ========================================================================
  describe('isRecognizing', () => {
    it('returns true when Voice.isRecognizing resolves to true', async () => {
      Voice.isRecognizing.mockResolvedValue(true);

      const result = await voiceService.isRecognizing();

      expect(result).toBe(true);
    });

    it('returns false when Voice.isRecognizing resolves to false', async () => {
      Voice.isRecognizing.mockResolvedValue(false);

      const result = await voiceService.isRecognizing();

      expect(result).toBe(false);
    });

    it('returns false when Voice.isRecognizing throws an error', async () => {
      Voice.isRecognizing.mockRejectedValue(new Error('Recognition error'));

      const result = await voiceService.isRecognizing();

      expect(result).toBe(false);
    });

    it('coerces truthy values to boolean via Boolean()', async () => {
      Voice.isRecognizing.mockResolvedValue(1);

      const result = await voiceService.isRecognizing();

      expect(result).toBe(true);
    });
  });

  // ========================================================================
  // Event handlers
  // ========================================================================
  describe('event handlers', () => {
    let callbacks: Required<VoiceEventCallbacks>;

    beforeEach(async () => {
      callbacks = {
        onStart: jest.fn(),
        onEnd: jest.fn(),
        onResults: jest.fn(),
        onPartialResults: jest.fn(),
        onError: jest.fn(),
      };

      voiceService.setCallbacks(callbacks);
      await voiceService.initialize();
    });

    it('invokes onStart callback when handleSpeechStart fires', () => {
      expect(Voice.onSpeechStart).toBeInstanceOf(Function);
      Voice.onSpeechStart({});

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
    });

    it('invokes onEnd callback when handleSpeechEnd fires', () => {
      expect(Voice.onSpeechEnd).toBeInstanceOf(Function);
      Voice.onSpeechEnd({});

      expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    });

    it('invokes onResults callback with results array when handleSpeechResults fires', () => {
      expect(Voice.onSpeechResults).toBeInstanceOf(Function);
      Voice.onSpeechResults({ value: ['hello world', 'hello'] });

      expect(callbacks.onResults).toHaveBeenCalledWith([
        'hello world',
        'hello',
      ]);
    });

    it('does not invoke onResults when event has no value', () => {
      Voice.onSpeechResults({});

      expect(callbacks.onResults).not.toHaveBeenCalled();
    });

    it('invokes onPartialResults callback with partial results array', () => {
      expect(Voice.onSpeechPartialResults).toBeInstanceOf(Function);
      Voice.onSpeechPartialResults({ value: ['hel'] });

      expect(callbacks.onPartialResults).toHaveBeenCalledWith(['hel']);
    });

    it('does not invoke onPartialResults when event has no value', () => {
      Voice.onSpeechPartialResults({});

      expect(callbacks.onPartialResults).not.toHaveBeenCalled();
    });

    it('invokes onError callback with error message from event', () => {
      expect(Voice.onSpeechError).toBeInstanceOf(Function);
      Voice.onSpeechError({ error: { message: 'Network timeout' } });

      expect(callbacks.onError).toHaveBeenCalledWith('Network timeout');
    });

    it('invokes onError with fallback message when error has no message', () => {
      Voice.onSpeechError({ error: {} });

      expect(callbacks.onError).toHaveBeenCalledWith(
        'Unknown error occurred',
      );
    });

    it('invokes onError with fallback message when error is undefined', () => {
      Voice.onSpeechError({});

      expect(callbacks.onError).toHaveBeenCalledWith(
        'Unknown error occurred',
      );
    });

    it('does not throw when no callbacks are set', async () => {
      // Reset callbacks to empty
      voiceService.setCallbacks({});

      // None of these should throw
      expect(() => Voice.onSpeechStart({})).not.toThrow();
      expect(() => Voice.onSpeechEnd({})).not.toThrow();
      expect(() => Voice.onSpeechResults({ value: ['test'] })).not.toThrow();
      expect(() =>
        Voice.onSpeechPartialResults({ value: ['test'] }),
      ).not.toThrow();
      expect(() =>
        Voice.onSpeechError({ error: { message: 'err' } }),
      ).not.toThrow();
    });
  });
});
