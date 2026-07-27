import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Op } from '@offgrid/sync';
import { StateOpStore } from '../../../pro/sync/stateOpStore';
import { SyncPreferencesStore } from '../../../pro/sync/syncPreferences';

const OP: Op = {
  opId: 'phone-op-1',
  entity: 'project',
  entityId: 'project-1',
  kind: 'put',
  fields: { name: 'Field Notes' },
  lamport: 1,
  deviceId: 'phone-1',
  ts: 1,
};

describe('mobile state sync persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('persists each accepted operation once across relaunch', async () => {
    const store = new StateOpStore();
    await store.load();
    store.append(OP);
    store.append(OP);
    await store.flush();

    await expect(new StateOpStore().load()).resolves.toEqual([OP]);
  });

  it('starts with no operations when the persisted payload is corrupt', async () => {
    await AsyncStorage.setItem('offgrid-sync-state-ops-v1', '{broken');

    await expect(new StateOpStore().load()).resolves.toEqual([]);
  });

  it('blocks sharing immediately and restores the persisted choice if saving fails', async () => {
    const preferences = new SyncPreferencesStore();
    await preferences.load();
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    const saving = preferences.set('projects', false);
    expect(preferences.enabled('project')).toBe(false);
    await expect(saving).rejects.toThrow('storage unavailable');
    expect(preferences.enabled('project')).toBe(true);
  });
});
