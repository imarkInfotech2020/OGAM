import { PersonalMeshEntitlementError } from '@offgrid/sync';
import { CapacityReplacementState } from '../../../pro/sync/capacityReplacementState';

/**
 * The two-phase record an eviction is carried on.
 *
 * An eviction has to be resumable: the licence seat is released before the other device's trust can be,
 * so the transaction outlives the moment and has to survive a restart. That makes three things worth
 * pinning - a transaction with no local membership is legitimate, committing twice is not a second
 * commit, and a transaction that was never opened cannot be committed at all.
 *
 * Tested directly because none of it is reachable by a gesture: it is the bookkeeping under the eviction,
 * and the journeys above it exercise the happy path without being able to state these rules.
 */
describe('the capacity replacement transaction', () => {
  const installation = {
    installationId: 'machine-1',
    syncDeviceId: 'desktop-peer',
    deviceName: 'Off Grid AI Desktop',
    platform: 'macos' as const,
    lastActiveAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
  };

  it('opens a transaction with no local membership to retire', () => {
    const state = new CapacityReplacementState();
    const id = state.prepare(installation);

    const opened = state.get(id);
    expect(opened?.state).toBe('prepared');
    expect(opened?.membershipId).toBeUndefined();
    // Evicting a device this phone never paired with is exactly this shape: the licence holds the
    // installation, this device holds no trust for it. Refusing to open the transaction is what used to
    // make such a seat impossible to release.
  });

  it('remembers the membership when there is one to retire', () => {
    const state = new CapacityReplacementState();
    const id = state.prepare(installation, 'generation-7');

    expect(state.get(id)?.membershipId).toBe('generation-7');
  });

  it('treats a second commit as already done rather than a new one', () => {
    const state = new CapacityReplacementState();
    const id = state.prepare(installation);

    expect(state.commit(id)).toBe(true);
    // Recovery after a restart walks every committed transaction, so a commit that arrives twice is
    // ordinary. Answering "changed" a second time would persist the document again for nothing.
    expect(state.commit(id)).toBe(false);
    expect(state.get(id)?.state).toBe('committed');
  });

  it('refuses to commit a transaction that was never opened', () => {
    const state = new CapacityReplacementState();

    expect(() => state.commit('never-prepared')).toThrow(
      PersonalMeshEntitlementError,
    );
  });

  it('restores transactions from a stored document, so an eviction survives a restart', () => {
    const state = new CapacityReplacementState();
    const id = state.prepare(installation);
    state.commit(id);
    const saved = state.snapshot();

    const reloaded = new CapacityReplacementState();
    reloaded.load(saved);

    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.get(id)?.state).toBe('committed');
    expect(reloaded.get(id)?.installation.syncDeviceId).toBe('desktop-peer');
  });
});
