import {
  useSyncStore,
  type KnownSyncDevice,
} from '../../../pro/sync/syncStore';

const discoveredDevice = (id: string, host = '1.2.3.4') =>
  ({
    id,
    name: id,
    platform: 'macos',
    version: '1',
    host,
    port: 7,
    lastSeen: 1,
  } as const);

const knownDevice = (
  id: string,
  status: KnownSyncDevice['status'] = 'offline',
): KnownSyncDevice => ({
  id,
  name: id,
  platform: 'macos',
  version: '1',
  host: '',
  port: 7,
  pairedAt: 1,
  lastSeenAt: 2,
  status,
});

beforeEach(() => useSyncStore.getState().reset());

describe('useSyncStore', () => {
  it('replaces an available device when the same peer moves', () => {
    const state = useSyncStore.getState();
    state.upsertDiscovered(discoveredDevice('a', '1.1.1.1'));
    state.upsertDiscovered(discoveredDevice('a', '2.2.2.2'));

    const discovered = useSyncStore.getState().discovered;
    expect(discovered).toHaveLength(1);
    expect(discovered[0].host).toBe('2.2.2.2');
  });

  it('keeps known devices separate from devices available to pair', () => {
    const state = useSyncStore.getState();
    state.upsertDiscovered(discoveredDevice('a'));
    state.upsertDiscovered(discoveredDevice('b'));
    state.upsertKnownDevice(knownDevice('a', 'connected'));

    expect(
      useSyncStore.getState().knownDevices.map(device => device.id),
    ).toEqual(['a']);
    expect(useSyncStore.getState().discovered.map(device => device.id)).toEqual(
      ['b'],
    );
  });

  it('projects connection, offline, and repair states without losing identity', () => {
    const state = useSyncStore.getState();
    state.setKnownDevices([knownDevice('a')]);

    state.setKnownDeviceStatus('a', 'available', {
      ...discoveredDevice('a', '2.2.2.2'),
      port: 42,
    });
    expect(useSyncStore.getState().knownDevices[0]).toMatchObject({
      id: 'a',
      host: '2.2.2.2',
      port: 42,
      status: 'available',
    });

    state.setKnownDeviceStatus('a', 'needs_repair');
    expect(useSyncStore.getState().knownDevices[0]).toMatchObject({
      id: 'a',
      status: 'needs_repair',
    });
  });

  it('removes only the lost available device', () => {
    const state = useSyncStore.getState();
    state.upsertDiscovered(discoveredDevice('a'));
    state.upsertDiscovered(discoveredDevice('b'));
    state.removeDiscovered('a');

    expect(useSyncStore.getState().discovered.map(device => device.id)).toEqual(
      ['b'],
    );
  });

  it('clears transient engine and known-device projections on reset', () => {
    const state = useSyncStore.getState();
    state.setStatus('running');
    state.setPairingDevice('a', 'failed');
    state.upsertDiscovered(discoveredDevice('a'));
    state.upsertKnownDevice(knownDevice('b'));
    state.reset();

    const reset = useSyncStore.getState();
    expect(reset.status).toBe('idle');
    expect(reset.pairingDeviceId).toBeNull();
    expect(reset.pairingError).toBeUndefined();
    expect(reset.discovered).toEqual([]);
    expect(reset.knownDevices).toEqual([]);
  });
});
