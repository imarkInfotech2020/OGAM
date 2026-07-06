import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { hardwareService } from '../../services/hardware';
import { useAppStore } from '../../stores';
import { RootStackParamList } from '../../navigation/types';
import { DownloadedModel, InferenceBackend } from '../../types';
import {
  AccelerationAction,
  AccelerationCapability,
  acceleratedBackendFor,
  acceleratedSearchQuery,
  findAccelerableModel,
  planAcceleration,
} from '../../utils/acceleration';

const EMPTY_CAPABILITY: AccelerationCapability = { hasNpu: false, hasGpu: false };

export interface AccelerationTip {
  /** Show the chat nudge (any non-hidden action). */
  visible: boolean;
  /** What the primary button does: enable the backend, switch model, or download one. */
  action: AccelerationAction;
  /** True when the device has an NPU (Qualcomm HTP) — labels the copy/button. */
  hasNpu: boolean;
  /** For `switch`: the name of the accelerable model already downloaded. */
  targetModelName?: string;
  /** Run the primary action for the current mode. */
  onPrimary: () => void;
}

/**
 * Owns the "you can go faster on the GPU/NPU" chat tip. The View renders the mode and
 * dispatches one intent — it holds no capability probing, no settings mutation, and no
 * navigation/model-load logic. Capability comes from the single hardwareService source;
 * the enable/switch/download decision is the pure `planAcceleration` helper, keyed on
 * whether the ACTIVE model is an accelerable quant (a K-quant would silently run on CPU
 * even with the NPU on) and whether an accelerable model is already downloaded.
 */
export function useAccelerationTip(params: {
  activeModel: DownloadedModel | undefined;
  isRemote: boolean;
  inferenceBackend: string | undefined;
  downloadedModels: DownloadedModel[];
  onActivateModel: (model: DownloadedModel) => void;
}): AccelerationTip {
  const { activeModel, isRemote, inferenceBackend, downloadedModels, onActivateModel } = params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [capability, setCapability] = useState<AccelerationCapability>(EMPTY_CAPABILITY);

  useEffect(() => {
    let alive = true;
    hardwareService.getAccelerationCapability().then(c => { if (alive) setCapability(c); }).catch(() => { });
    return () => { alive = false; };
  }, []);

  const target = useMemo(
    () => findAccelerableModel(downloadedModels, activeModel?.id),
    [downloadedModels, activeModel?.id],
  );

  const plan = planAcceleration({
    engine: activeModel?.engine,
    isRemote,
    inferenceBackend: inferenceBackend as InferenceBackend | undefined,
    capability,
    activeQuant: activeModel?.quantization,
    downloadedAccelerable: target ? { id: target.id, name: target.name } : null,
  });

  const onPrimary = useCallback(() => {
    const backend = acceleratedBackendFor(capability);
    if (plan.action === 'enable') {
      // Flip the backend; the existing "settings changed — reload" banner takes over.
      useAppStore.getState().updateSettings({ inferenceBackend: backend });
      return;
    }
    if (plan.action === 'switch' && target) {
      // Enable the accelerator first so the switched (accelerable) model loads on it,
      // then activate it through the same path the model selector uses (memory gate +
      // Load Anyway included).
      useAppStore.getState().updateSettings({ inferenceBackend: backend });
      onActivateModel(target);
      return;
    }
    if (plan.action === 'download') {
      navigation.navigate('Main', {
        screen: 'ModelsTab',
        params: { initialTab: 'text', initialSearchQuery: acceleratedSearchQuery(activeModel?.id) },
      } as never);
    }
  }, [plan.action, capability, target, onActivateModel, navigation, activeModel?.id]);

  return {
    visible: plan.action !== 'hidden',
    action: plan.action,
    hasNpu: capability.hasNpu,
    targetModelName: plan.targetModelName,
    onPrimary,
  };
}
