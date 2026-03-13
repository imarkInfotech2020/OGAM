import { useCallback, useEffect } from 'react';
import { useSpotlightTour } from 'react-native-spotlight-tour';
import { STEP_TAB_MAP, STEP_INDEX_MAP, CHAT_INPUT_STEP_INDEX, MODEL_SETTINGS_STEP_INDEX, PROJECT_EDIT_STEP_INDEX, DOWNLOAD_FILE_STEP_INDEX, MODEL_PICKER_STEP_INDEX, IMAGE_LOAD_STEP_INDEX, IMAGE_DOWNLOAD_STEP_INDEX, IMAGE_NEW_CHAT_STEP_INDEX, IMAGE_DRAW_STEP_INDEX } from '../../../components/onboarding/spotlightConfig';
import { setPendingSpotlight } from '../../../components/onboarding/spotlightState';
import { useAppStore } from '../../../stores/appStore';
import type { HomeScreenNavigationProp } from './useHomeScreen';

interface SpotlightProps {
  navigation: HomeScreenNavigationProp;
  closeSheet: () => void;
  activeImageModelId: string | null;
  downloadedImageModelsCount: number;
}

export function useHomeScreenSpotlight({ navigation, closeSheet, activeImageModelId, downloadedImageModelsCount }: SpotlightProps) {
  const { goTo } = useSpotlightTour();
  const onboardingChecklist = useAppStore(s => s.onboardingChecklist);
  const shownSpotlights = useAppStore(s => s.shownSpotlights);
  const markSpotlightShown = useAppStore(s => s.markSpotlightShown);

  const handleStepPress = useCallback((stepId: string) => {
    closeSheet();

    // Image gen flow is state-aware: skip steps the user has already completed.
    if (stepId === 'triedImageGen') {
      if (activeImageModelId) {
        // Model already loaded → go straight to "start a new chat"
        // Queue step 15 so ChatScreen picks it up when "New Chat" is tapped
        setPendingSpotlight(IMAGE_DRAW_STEP_INDEX);
        navigation.navigate('ChatsTab' as any);
        setTimeout(() => goTo(IMAGE_NEW_CHAT_STEP_INDEX), 800);
      } else if (downloadedImageModelsCount > 0) {
        // Model downloaded but not loaded → spotlight "load your image model" on HomeScreen
        markSpotlightShown('imageLoad');
        setTimeout(() => goTo(IMAGE_LOAD_STEP_INDEX), 600);
      } else {
        // No image model yet → navigate to ModelsTab and spotlight Image Models tab
        setPendingSpotlight(IMAGE_DOWNLOAD_STEP_INDEX);
        navigation.navigate('ModelsTab' as any);
        const idx = STEP_INDEX_MAP[stepId];
        if (idx !== undefined) setTimeout(() => goTo(idx), 800);
      }
      return;
    }

    const tab = STEP_TAB_MAP[stepId];
    const stepIndex = STEP_INDEX_MAP[stepId];

    // For multi-step flows, queue the continuation step.
    const pendingMap: Record<string, number> = {
      downloadedModel: DOWNLOAD_FILE_STEP_INDEX, loadedModel: MODEL_PICKER_STEP_INDEX,
      sentMessage: CHAT_INPUT_STEP_INDEX, exploredSettings: MODEL_SETTINGS_STEP_INDEX,
      createdProject: PROJECT_EDIT_STEP_INDEX,
    };
    if (pendingMap[stepId] !== undefined) setPendingSpotlight(pendingMap[stepId]);

    // Navigate to the correct tab
    if (tab && tab !== 'HomeTab') {
      navigation.navigate(tab as any);
    }

    // Delay spotlight to allow sheet close + navigation transition to complete.
    // Cross-tab navigations need more time for the target screen to mount and
    // measure AttachStep layout; 800ms covers sheet-close + tab-switch animation.
    if (stepIndex !== undefined) {
      const delay = tab && tab !== 'HomeTab' ? 800 : 600;
      setTimeout(() => goTo(stepIndex), delay);
    }
  }, [closeSheet, navigation, goTo, activeImageModelId, downloadedImageModelsCount, markSpotlightShown]);

  // Reactive: image model downloaded but not loaded → spotlight ImageModelCard (step 13)
  useEffect(() => {
    if (
      downloadedImageModelsCount > 0 &&
      !activeImageModelId &&
      !shownSpotlights.imageLoad &&
      !onboardingChecklist.triedImageGen
    ) {
      markSpotlightShown('imageLoad');
      setTimeout(() => goTo(IMAGE_LOAD_STEP_INDEX), 800);
    }
  }, [downloadedImageModelsCount, activeImageModelId, shownSpotlights, onboardingChecklist.triedImageGen, markSpotlightShown, goTo]);

  return { handleStepPress };
}
