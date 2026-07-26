import { useSyncStore } from '../../../pro/sync/syncStore';

const discoveredDevice = (id: string, host = '1.2.3.4') =>
  ({ id, name: id, platform: 'macos', version: '1', host, port: 7 }) as any;
const pairedDevice = (id: string) =>
  ({
    id,
    name: id,
    platform: 'macos',
    version: '1',
    host: '',
    port: 7,
    sharedSecret: 's',
  }) as any;

beforeEach(() => useSyncStore.getState().reset());

describe('useSyncStore', () => {
  it('replaces a discovered device when the same peer moves', () => {
    const state = useSyncStore.getState();
    state.upsertDiscovered(discoveredDevice('a', '1.1.1.1'));
    state.upsertDiscovered(discoveredDevice('a', '2.2.2.2'));

    const discovered = useSyncStore.getState().discovered;
    expect(discovered).toHaveLength(1);
    expect(discovered[0].host).toBe('2.2.2.2');
  });

  it('moves a paired device out of the discovered list', () => {
    const state = useSyncStore.getState();
    state.upsertDiscovered(discoveredDevice('a'));
    state.upsertDiscovered(discoveredDevice('b'));
    state.addPaired(pairedDevice('a'));

    expect(useSyncStore.getState().paired.map((device) => device.id)).toEqual(['a']);
    expect(useSyncStore.getState().discovered.map((device) => device.id)).toEqual(['b']);
  });

  it('removes only the lost discovered device', () => {
    const state = useSyncStore.getState();
    state.upsertDiscovered(discoveredDevice('a'));
    state.upsertDiscovered(discoveredDevice('b'));
    state.removeDiscovered('a');

    expect(useSyncStore.getState().discovered.map((device) => device.id)).toEqual(['b']);
  });

  it('clears transient engine and pairing state on reset', () => {
    const state = useSyncStore.getState();
    state.setStatus('running');
    state.setPairingDevice('a', 'failed');
    state.upsertDiscovered(discoveredDevice('a'));
    state.addPaired(pairedDevice('b'));
    state.reset();

    const reset = useSyncStore.getState();
    expect(reset.status).toBe('idle');
    expect(reset.pairingDeviceId).toBeNull();
    expect(reset.pairingError).toBeUndefined();
    expect(reset.discovered).toEqual([]);
    expect(reset.paired).toEqual([]);
  });
});
