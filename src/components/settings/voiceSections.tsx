import React from 'react';
import { useAppStore } from '../../stores';
import { VOICE_TURN_LABELS, type VoiceTurnMode } from '@offgrid/speech';
import { SegmentedRow } from './segmentedRow';

/**
 * Voice-input settings.
 *
 * Separate from textGenAdvancedSections because this is about LISTENING, not text generation - the
 * two surfaces that show it (in-chat settings and Model Settings) both sit under Transcription.
 */

/**
 * How a spoken turn begins and ends.
 *
 * Three states, not a toggle, and labelled by what HAPPENS rather than by the technique: "VAD" means
 * nothing to the person choosing it.
 *
 * Voice mode only. Chat dictation is someone typing with their voice - they pause to think
 * mid-sentence and expect the recorder to wait - so it always behaves as 'tap'.
 */
// Names and descriptions come from @offgrid/speech, which owns them: desktop renders the same three
// modes, and two settings screens describing one mode differently is the drift this prevents.
const VOICE_TURN_ORDER: VoiceTurnMode[] = ['tap', 'silence', 'handsfree'];
const VOICE_TURN_OPTIONS = VOICE_TURN_ORDER.map(id => ({
  id,
  label: VOICE_TURN_LABELS[id].label,
}));

export const VoiceActivityDetectionToggle: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const current = settings.voiceTurnMode ?? 'silence';
  return (
    <SegmentedRow<VoiceTurnMode>
      label="Voice turns"
      description={VOICE_TURN_LABELS[current].description}
      options={VOICE_TURN_OPTIONS}
      current={current}
      onSelect={(id) => updateSettings({ voiceTurnMode: id })}
      testIdFor={(id) => `voice-turn-${id}-button`}
    />
  );
};
