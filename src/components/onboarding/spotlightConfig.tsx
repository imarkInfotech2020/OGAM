import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { TourStep } from 'react-native-spotlight-tour';
import { useTheme } from '../../theme';
import { TYPOGRAPHY, SPACING, FONTS } from '../../constants';

interface TooltipProps {
  title: string;
  description: string;
  stop: () => void;
}

const Tooltip: React.FC<TooltipProps> = ({ title, description, stop }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.tooltip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.tooltipTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.tooltipDescription, { color: colors.textSecondary }]}>{description}</Text>
      <TouchableOpacity style={[styles.tooltipButton, { backgroundColor: colors.primary }]} onPress={stop}>
        <Text style={[styles.tooltipButtonText, { color: colors.background }]}>Got it</Text>
        <Icon name="check" size={12} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
};

// Maps checklist step IDs to spotlight tour step indices
export const STEP_INDEX_MAP: Record<string, number> = {
  downloadedModel: 0,
  loadedModel: 1,
  sentMessage: 2,    // first step: "New" button on ChatsListScreen
  triedImageGen: 4,
  exploredSettings: 5,
  createdProject: 7,
};

// The ChatInput spotlight is step 3 (continuation of sentMessage flow)
export const CHAT_INPUT_STEP_INDEX = 3;

// ModelSettingsScreen accordion spotlight (continuation of exploredSettings flow)
export const MODEL_SETTINGS_STEP_INDEX = 6;

// ProjectEditScreen name input spotlight (continuation of createdProject flow)
export const PROJECT_EDIT_STEP_INDEX = 8;

// Model file card spotlight (continuation of downloadedModel flow)
export const DOWNLOAD_FILE_STEP_INDEX = 9;

// Download Manager icon spotlight (continuation of downloadedModel flow)
export const DOWNLOAD_MANAGER_STEP_INDEX = 10;

export const STEP_TAB_MAP: Record<string, string> = {
  downloadedModel: 'ModelsTab',
  loadedModel: 'HomeTab',
  sentMessage: 'ChatsTab',
  exploredSettings: 'SettingsTab',
  createdProject: 'ProjectsTab',
  triedImageGen: 'ModelsTab',
};

export function createSpotlightSteps(): TourStep[] {
  return [
    // 0: First recommended model card on ModelsScreen — downloadedModel (part 1)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Download a model"
          description="Tap this recommended model to see downloadable files"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 1: TextModelCard on HomeScreen — loadedModel
    {
      render: ({ stop }) => (
        <Tooltip
          title="Load a model"
          description="Tap here to select and load a text model for chatting."
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 2: "New" button on ChatsListScreen — sentMessage (part 1)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Start a new chat"
          description="Tap the New button to create a conversation."
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 3: ChatInput on ChatScreen — sentMessage (part 2)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Send a message"
          description="Type your message here and tap the send button."
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 4: Image Models tab on ModelsScreen — triedImageGen
    {
      render: ({ stop }) => (
        <Tooltip
          title="Try image generation"
          description="Switch to Image Models, download a model, then generate images from any chat"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 5: Nav section on SettingsScreen — exploredSettings (part 1)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Explore settings"
          description="Tap Model Settings to explore system prompts, generation parameters, and more"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 6: ModelSettingsScreen accordion — exploredSettings (part 2)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Model settings"
          description="Explore model settings: system prompt, generation params, and performance tuning"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 7: "New" button on ProjectsScreen — createdProject (part 1)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Create a project"
          description="Tap New to create a project that groups related chats"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 8: ProjectEditScreen name input — createdProject (part 2)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Name your project"
          description="Give your project a name to get started"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 9: First file card in model detail — downloadedModel (part 2)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Download this file"
          description="Tap the download icon to start downloading this model"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
    // 10: Download Manager icon in ModelsScreen header — downloadedModel (part 3)
    {
      render: ({ stop }) => (
        <Tooltip
          title="Download Manager"
          description="Track your download progress here"
          stop={stop}
        />
      ),
      onBackdropPress: 'stop',
      shape: { type: 'rectangle', padding: 8 },
    },
  ];
}

const styles = StyleSheet.create({
  tooltip: {
    borderRadius: 8,
    borderWidth: 1,
    padding: SPACING.md,
    maxWidth: 260,
  },
  tooltipTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontFamily: FONTS.mono,
    marginBottom: SPACING.xs,
  },
  tooltipDescription: {
    ...TYPOGRAPHY.meta,
    fontFamily: FONTS.mono,
    lineHeight: 16,
    marginBottom: SPACING.md,
  },
  tooltipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: 6,
  },
  tooltipButtonText: {
    ...TYPOGRAPHY.meta,
    fontFamily: FONTS.mono,
    fontWeight: '400',
  },
});
