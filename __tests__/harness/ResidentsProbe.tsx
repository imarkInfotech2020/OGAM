/**
 * ResidentsProbe — a TEST-ONLY UI surface for the model residency set.
 *
 * The resident set (`modelResidencyManager.getResidents()` — what is actually in RAM) has no prod UI
 * surface: the user perceives it only indirectly (memory pressure, a wrong "Not Enough Memory" card).
 * Residency-invariant reds (T022/T023/T025/T026/T030) need to ASSERT ON THE UI what is resident, so this
 * renders the real residency projection as a queryable `testID="probe-residents"` string.
 *
 * It lives in the harness (NOT src) so it adds ZERO production surface — the test renders it ALONGSIDE the
 * real screen under test. It reads the REAL singleton `modelResidencyManager` (the same instance the
 * screens/services mutate, because the test requires this after installNativeBoundary()'s resetModules),
 * and subscribes to the reactive stores that change WHENEVER residency changes (a load flips
 * whisper.isModelLoaded / appStore.activeModelId / activeImageModelId; an eject clears them) so the
 * rendered text re-renders in step with the residency map, which is itself a plain (non-reactive) Map.
 *
 * Output: a comma-separated, sorted list of resident TYPES (e.g. "text,whisper"), or "(none)". Assert with
 * getByTestId('probe-residents').props.children.
 */
import React from 'react';
import { Text } from 'react-native';
// Required AFTER installNativeBoundary() → resolves the same fresh module graph the screens use.
import { modelResidencyManager } from '../../src/services/modelResidency';
import { useWhisperStore } from '../../src/stores/whisperStore';
import { useAppStore } from '../../src/stores/appStore';

export const ResidentsProbe: React.FC = () => {
  // Subscribe to the reactive fields that move in lockstep with a residency change, so this component
  // re-renders when the (non-reactive) residents Map mutates. These are ticks, not the asserted value.
  useWhisperStore((s) => s.isModelLoaded);
  useWhisperStore((s) => s.downloadedModelId);
  useAppStore((s) => s.activeModelId);
  useAppStore((s) => s.activeImageModelId);

  const types = modelResidencyManager
    .getResidents()
    .map((r) => r.type)
    .sort()
    .join(',');

  return <Text testID="probe-residents">{types || '(none)'}</Text>;
};
