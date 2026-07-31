/**
 * The model-selection answers every stub of `activeModelService` has to give.
 *
 * The service owns two questions the whole app asks on render: which text model is selected
 * (`resolveSelectedTextModel`) and which id should be loaded (`selectedTextModelId`). A suite that
 * stubs the service and omits them takes down every test in the file with "is not a function".
 *
 * Defined once so the next method added to that seam is added HERE, not hunted through twenty
 * files. Resolved from the real store, so a stub answers what the app would answer rather than a
 * constant that quietly disagrees with the fixtures the test just set up.
 *
 * (These suites mock our own service, which the testing doctrine rules out. This keeps them honest
 * until they move to the integration harness; it is not an endorsement of the pattern.)
 */
export function activeModelSelectionStub(): {
  resolveSelectedTextModel: () => unknown;
  selectedTextModelId: () => string | null;
} {
  // The store the SUITE is using, mocked or real - not requireActual. A suite that mocks the store
  // and then sets up an active model must see that model here, or the stub contradicts its own
  // fixtures. Defensive because a partial store mock may not expose getState at all.
  const store = (): {
    downloadedModels: Array<{ id: string }>;
    activeModelId: string | null;
    lastTextModelId: string | null;
  } => {
    try {
      const state = require('../../src/stores').useAppStore?.getState?.();
      return {
        downloadedModels: state?.downloadedModels ?? [],
        activeModelId: state?.activeModelId ?? null,
        lastTextModelId: state?.lastTextModelId ?? null,
      };
    } catch {
      return { downloadedModels: [], activeModelId: null, lastTextModelId: null };
    }
  };

  return {
    resolveSelectedTextModel: () => {
      const state = store();
      return (
        state.downloadedModels.find(model => model.id === state.activeModelId) ??
        null
      );
    },
    selectedTextModelId: () => {
      const state = store();
      return state.activeModelId ?? state.lastTextModelId ?? null;
    },
  };
}
