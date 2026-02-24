import { useAppStore } from '../../../src/stores/appStore';
import { resetStores, getAppState } from '../../utils/testHelpers';

describe('appStore – hasSeenCacheTypeNudge', () => {
  beforeEach(() => {
    resetStores();
  });

  it('defaults to false', () => {
    expect(getAppState().hasSeenCacheTypeNudge).toBe(false);
  });

  it('setHasSeenCacheTypeNudge(true) updates state', () => {
    useAppStore.getState().setHasSeenCacheTypeNudge(true);
    expect(getAppState().hasSeenCacheTypeNudge).toBe(true);
  });

  it('can be reset back to false', () => {
    useAppStore.getState().setHasSeenCacheTypeNudge(true);
    useAppStore.getState().setHasSeenCacheTypeNudge(false);
    expect(getAppState().hasSeenCacheTypeNudge).toBe(false);
  });
});
