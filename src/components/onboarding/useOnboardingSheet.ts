import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useOnboardingSteps } from '../checklist';

export function useOnboardingSheet() {
  const { steps, completedCount, totalCount } = useOnboardingSteps();
  const allComplete = completedCount === totalCount && totalCount > 0;
  const [sheetVisible, setSheetVisible] = useState(false);

  const openSheet = () => setSheetVisible(true);
  const closeSheet = () => setSheetVisible(false);
  const dismissChecklist = useAppStore(s => s.dismissChecklist);
  const checklistDismissed = useAppStore(s => s.checklistDismissed);

  // Auto-dismiss checklist 3s after all steps are complete
  useEffect(() => {
    if (allComplete) {
      const timer = setTimeout(dismissChecklist, 3000);
      return () => clearTimeout(timer);
    }
  }, [allComplete, dismissChecklist]);

  // Blinking dot visible until all steps complete or user explicitly dismisses
  const showIcon = !allComplete && !checklistDismissed && !sheetVisible;

  return { sheetVisible, openSheet, closeSheet, showIcon, allComplete, steps, completedCount, totalCount };
}
