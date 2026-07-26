/**
 * Sync UI store: the device-list state the SyncScreen renders. Pure zustand — asserts the state
 * transitions the syncService drives (discovery dedup, paired-moves-out-of-discovered, reset).
 */
import { useSyncStore } from '../../../src/stores/syncStore';

const disc = (id: string, host = '1.2.3.4') => ({ id, name: id, platform: 'macos', version: '1', host, port: 7 } as any);
const paired = (id: string) => ({ id, name: id, platform: 'macos', version: '1', host: '', port: 7, sharedSecret: 's' } as any);

beforeEach(() => useSyncStore.getState().reset());

describe('useSyncStore', () => {
  it('upsertDiscovered de-dupes by id (a moved peer replaces, never duplicates)', () => {
    const s = useSyncStore.getState();
    s.upsertDiscovered(disc('a', '1.1.1.1'));
    s.upsertDiscovered(disc('a', '2.2.2.2')); // same id, new host
    const d = useSyncStore.getState().discovered;
    expect(d).toHaveLength(1);
    expect(d[0].host).toBe('2.2.2.2');
  });

  it('addPaired moves the device out of discovered and into paired', () => {
    const s = useSyncStore.getState();
    s.upsertDiscovered(disc('a'));
    s.upsertDiscovered(disc('b'));
    s.addPaired(paired('a'));
    const st = useSyncStore.getState();
    expect(st.paired.map((p) => p.id)).toEqual(['a']);
    expect(st.discovered.map((d) => d.id)).toEqual(['b']); // 'a' left the discovered list
  });

  it('removeDiscovered drops only the matching device', () => {
    const s = useSyncStore.getState();
    s.upsertDiscovered(disc('a'));
    s.upsertDiscovered(disc('b'));
    s.removeDiscovered('a');
    expect(useSyncStore.getState().discovered.map((d) => d.id)).toEqual(['b']);
  });

  it('reset clears status/error/lists (pairingCode + thisDevice are session state, untouched here)', () => {
    const s = useSyncStore.getState();
    s.setStatus('running');
    s.upsertDiscovered(disc('a'));
    s.addPaired(paired('b'));
    s.reset();
    const st = useSyncStore.getState();
    expect(st.status).toBe('idle');
    expect(st.discovered).toEqual([]);
    expect(st.paired).toEqual([]);
  });
});
