import React from 'react';
import { useAppStore } from '../../stores';
import { SegmentedRow, BOOL_OPTIONS } from './segmentedRow';

/**
 * Voice-input settings.
 *
 * Separate from textGenAdvancedSections because this is about LISTENING, not text generation - the
 * two surfaces that show it (in-chat settings and Model Settings) both sit under Transcription.
 */

/**
 * Whether a spoken turn ends itself when the room goes quiet.
 *
 * Voice mode only. Chat dictation is someone typing with their voice - they pause to think
 * mid-sentence and expect the recorder to wait, so it is never auto-stopped.
 */
export const VoiceActivityDetectionToggle: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const on = settings.autoStopOnSilence !== false;
  return (
    <SegmentedRow<'off' | 'on'>
      label="Stop on silence"
      description="In voice mode, end the turn when you stop speaking instead of tapping stop"
      options={BOOL_OPTIONS}
      current={on ? 'on' : 'off'}
      onSelect={(id) => updateSettings({ autoStopOnSilence: id === 'on' })}
      testIdFor={(id) => `vad-auto-stop-${id}-button`}
    />
  );
};
