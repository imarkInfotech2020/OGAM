import { useCallback } from 'react';
import { STEP_TAB_MAP } from '../../../components/onboarding/checklistNavigation';
import type { HomeScreenNavigationProp } from './useHomeScreen';

interface ChecklistNavigationProps {
  navigation: HomeScreenNavigationProp;
  closeSheet: () => void;
}

/**
 * Tapping a checklist step closes the sheet and goes where that step happens.
 *
 * This replaced a hook that also drove a guided tour: it queued a "pending spotlight", navigated,
 * then fired a timed goTo, and several screens had to consume that pending value on mount. All of
 * that is gone with the tour. What is left is the part the user actually wanted - the checklist
 * takes you to the right place.
 */
export function useOnboardingChecklistNavigation({
  navigation,
  closeSheet,
}: ChecklistNavigationProps): { handleStepPress: (stepId: string) => void } {
  const handleStepPress = useCallback(
    (stepId: string) => {
      closeSheet();
      const tab = STEP_TAB_MAP[stepId];
      if (tab && tab !== 'HomeTab') navigation.navigate(tab as never);
    },
    [closeSheet, navigation],
  );

  return { handleStepPress };
}
