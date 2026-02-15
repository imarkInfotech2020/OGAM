/**
 * VoiceSettingsScreen Tests
 *
 * Tests for the voice settings screen including:
 * - Title display
 * - Description text about Whisper
 * - Download options when no model
 * - Back button navigation
 * - Downloaded model state (name, status badge, remove button)
 * - Download progress display
 * - Model download trigger
 * - Remove model confirmation alert
 * - Error display and clear
 * - Privacy card display
 *
 * Priority: P1 (High)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../src/hooks/useFocusTrigger', () => ({
  useFocusTrigger: () => 0,
}));

jest.mock('../../../src/components', () => ({
  Card: ({ children, style }: any) => {
    const { View } = require('react-native');
    return <View style={style}>{children}</View>;
  },
  Button: ({ title, onPress, disabled, style }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} style={style}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

const mockShowAlert = jest.fn((title: string, message: string, buttons?: any[]) => ({
  visible: true,
  title,
  message,
  buttons: buttons || [],
}));

jest.mock('../../../src/components/CustomAlert', () => ({
  CustomAlert: ({ visible, title, message, buttons, onClose }: any) => {
    if (!visible) return null;
    const { View, Text, TouchableOpacity } = require('react-native');
    return (
      <View testID="custom-alert">
        <Text testID="alert-title">{title}</Text>
        <Text testID="alert-message">{message}</Text>
        {buttons && buttons.map((btn: any, i: number) => (
          <TouchableOpacity key={i} testID={`alert-btn-${i}`} onPress={btn.onPress}>
            <Text>{btn.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  },
  showAlert: (...args: any[]) => mockShowAlert(...args),
  hideAlert: jest.fn(() => ({ visible: false, title: '', message: '', buttons: [] })),
  initialAlertState: { visible: false, title: '', message: '', buttons: [] },
}));

jest.mock('../../../src/components/Button', () => ({
  Button: ({ title, onPress, disabled, style }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} style={style}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

const mockDownloadModel = jest.fn();
const mockDeleteModel = jest.fn();
const mockClearError = jest.fn();

let mockWhisperStoreValues: any = {
  downloadedModelId: null,
  isDownloading: false,
  downloadProgress: 0,
  downloadModel: mockDownloadModel,
  deleteModel: mockDeleteModel,
  error: null,
  clearError: mockClearError,
};

jest.mock('../../../src/stores', () => ({
  useWhisperStore: jest.fn(() => mockWhisperStoreValues),
}));

jest.mock('../../../src/services', () => ({
  WHISPER_MODELS: [
    { id: 'tiny', name: 'Whisper Tiny', size: '75', description: 'Fastest, lower accuracy' },
    { id: 'base', name: 'Whisper Base', size: '141', description: 'Good accuracy' },
    { id: 'small', name: 'Whisper Small', size: '461', description: 'Better accuracy' },
    { id: 'medium', name: 'Whisper Medium', size: '1500', description: 'Best accuracy' },
  ],
}));

import { VoiceSettingsScreen } from '../../../src/screens/VoiceSettingsScreen';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: mockGoBack,
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useRoute: () => ({ params: {} }),
  };
});

describe('VoiceSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhisperStoreValues = {
      downloadedModelId: null,
      isDownloading: false,
      downloadProgress: 0,
      downloadModel: mockDownloadModel,
      deleteModel: mockDeleteModel,
      error: null,
      clearError: mockClearError,
    };
  });

  // ============================================================================
  // Basic Rendering
  // ============================================================================
  describe('basic rendering', () => {
    it('renders "Voice Transcription" title', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Voice Transcription')).toBeTruthy();
    });

    it('shows description text about Whisper', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(
        getByText(/Download a Whisper model to enable on-device voice input/),
      ).toBeTruthy();
    });

    it('shows privacy card', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Privacy First')).toBeTruthy();
      expect(
        getByText(/Voice transcription happens entirely on your device/),
      ).toBeTruthy();
    });

    it('back button calls goBack', () => {
      const { UNSAFE_getAllByType } = render(<VoiceSettingsScreen />);
      const { TouchableOpacity } = require('react-native');
      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // The first TouchableOpacity is the back button
      fireEvent.press(touchables[0]);
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // No Model Downloaded - Download Options
  // ============================================================================
  describe('download options (no model)', () => {
    it('shows download options when no model is downloaded', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Whisper Tiny')).toBeTruthy();
      expect(getByText('Whisper Base')).toBeTruthy();
      expect(getByText('Whisper Small')).toBeTruthy();
    });

    it('shows only first 3 models (slice(0, 3))', () => {
      const { queryByText } = render(<VoiceSettingsScreen />);
      // 4th model (medium) should NOT be shown due to .slice(0, 3)
      expect(queryByText('Whisper Medium')).toBeNull();
    });

    it('shows "Select a model to download" label', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Select a model to download:')).toBeTruthy();
    });

    it('shows model size for each option', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('75 MB')).toBeTruthy();
      expect(getByText('141 MB')).toBeTruthy();
      expect(getByText('461 MB')).toBeTruthy();
    });

    it('shows model description for each option', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Fastest, lower accuracy')).toBeTruthy();
      expect(getByText('Good accuracy')).toBeTruthy();
      expect(getByText('Better accuracy')).toBeTruthy();
    });

    it('calls downloadModel when a model option is pressed', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      fireEvent.press(getByText('Whisper Base'));
      expect(mockDownloadModel).toHaveBeenCalledWith('base');
    });

    it('calls downloadModel with correct id for tiny model', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      fireEvent.press(getByText('Whisper Tiny'));
      expect(mockDownloadModel).toHaveBeenCalledWith('tiny');
    });
  });

  // ============================================================================
  // Downloaded Model State
  // ============================================================================
  describe('downloaded model state', () => {
    beforeEach(() => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        downloadedModelId: 'base',
      };
    });

    it('shows downloaded model name', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Whisper Base')).toBeTruthy();
    });

    it('shows "Downloaded" status badge', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Downloaded')).toBeTruthy();
    });

    it('shows "Remove Model" button', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Remove Model')).toBeTruthy();
    });

    it('does not show download options when model is downloaded', () => {
      const { queryByText } = render(<VoiceSettingsScreen />);
      expect(queryByText('Select a model to download:')).toBeNull();
    });

    it('shows model id as fallback when model not found in WHISPER_MODELS', () => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        downloadedModelId: 'unknown-model',
      };
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('unknown-model')).toBeTruthy();
    });

    it('pressing Remove Model shows confirmation alert', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      fireEvent.press(getByText('Remove Model'));
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Remove Whisper Model',
        'This will disable voice input until you download a model again.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Remove', style: 'destructive' }),
        ]),
      );
    });
  });

  // ============================================================================
  // Download Progress State
  // ============================================================================
  describe('download progress', () => {
    beforeEach(() => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        isDownloading: true,
        downloadProgress: 0.45,
      };
    });

    it('shows downloading state with percentage', () => {
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Downloading... 45%')).toBeTruthy();
    });

    it('does not show download options during download', () => {
      const { queryByText } = render(<VoiceSettingsScreen />);
      expect(queryByText('Select a model to download:')).toBeNull();
    });

    it('shows 0% at start of download', () => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        isDownloading: true,
        downloadProgress: 0,
      };
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Downloading... 0%')).toBeTruthy();
    });

    it('shows 100% near end of download', () => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        isDownloading: true,
        downloadProgress: 1,
      };
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Downloading... 100%')).toBeTruthy();
    });

    it('rounds progress percentage', () => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        isDownloading: true,
        downloadProgress: 0.678,
      };
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Downloading... 68%')).toBeTruthy();
    });
  });

  // ============================================================================
  // Error State
  // ============================================================================
  describe('error state', () => {
    it('shows error message when whisperError is set', () => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        error: 'Download failed: network error',
      };
      const { getByText } = render(<VoiceSettingsScreen />);
      expect(getByText('Download failed: network error')).toBeTruthy();
    });

    it('calls clearError when error is tapped', () => {
      mockWhisperStoreValues = {
        ...mockWhisperStoreValues,
        error: 'Download failed',
      };
      const { getByText } = render(<VoiceSettingsScreen />);
      fireEvent.press(getByText('Download failed'));
      expect(mockClearError).toHaveBeenCalled();
    });

    it('does not show error when error is null', () => {
      const { queryByText } = render(<VoiceSettingsScreen />);
      expect(queryByText('Download failed')).toBeNull();
    });
  });
});
