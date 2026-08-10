/**
 * Where each onboarding checklist step lives.
 *
 * The checklist is a list of things worth trying, and tapping one should take you to the place you
 * would do it. That is all this is. It used to arrive with a guided tour attached, and the tour is
 * gone; the destination is not, because a checklist that goes nowhere when tapped is not a checklist.
 */
export const STEP_TAB_MAP: Readonly<Record<string, string>> = {
  downloadedModel: 'ModelsTab',
  loadedModel: 'HomeTab',
  sentMessage: 'ChatsTab',
  exploredSettings: 'SettingsTab',
  createdProject: 'ProjectsTab',
  triedImageGen: 'ModelsTab',
};
