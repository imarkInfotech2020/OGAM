import { PersonalMeshEntitlementError } from '@offgrid/sync';
import { createPairingEntitlementReplacementAdapter } from '../../../pro/sync/pairingEntitlementReplacementAdapter';
import { pairingSecretStore } from '../../../pro/sync/pairingSecretStore';

/**
 * The local half of an eviction, in the four steps it is actually driven through.
 *
 * Worth testing directly for a reason beyond coverage: in the app today, ONE of these branches is the
 * only one that ever runs. The eviction announces its registry change before it finalises, that
 * announcement drives reconciliation, and reconciliation resumes committed evictions - so by the time the
 * caller finalises, the transaction is already gone and the no-op branch answers. The lines that do the
 * real work are unreachable in that flow.
 *
 * That makes this the only place their behaviour is stated. If the announcement is ever moved (and it
 * should be - see docs/GAPS_BACKLOG.md), these are the rules the flow has to come back to.
 */
describe('the local half of an eviction', () => {
  const installation = {
    installationId: 'machine-1',
    syncDeviceId: 'desktop-peer',
    deviceName: 'Off Grid AI Desktop',
    platform: 'macos' as const,
    lastActiveAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
  };

  const retired: Array<[string, string | undefined]> = [];
  const adapter = createPairingEntitlementReplacementAdapter(
    async (deviceId, membershipId) => {
      retired.push([deviceId, membershipId]);
    },
  );

  beforeEach(() => {
    retired.length = 0;
    jest.restoreAllMocks();
  });

  it('opens the transaction the store gives it', async () => {
    const prepare = jest
      .spyOn(pairingSecretStore, 'prepareCapacityReplacement')
      .mockResolvedValue('transaction-1');

    await expect(adapter.prepareEviction(installation)).resolves.toBe(
      'transaction-1',
    );
    expect(prepare).toHaveBeenCalledWith(installation);
  });

  it('retires the trust the transaction was carrying, then closes it', async () => {
    jest.spyOn(pairingSecretStore, 'capacityReplacement').mockReturnValue({
      id: 'transaction-1',
      installation,
      membershipId: 'generation-7',
      state: 'committed',
      createdAt: 1_700_000_000_000,
    });
    const complete = jest
      .spyOn(pairingSecretStore, 'completeCapacityReplacement')
      .mockResolvedValue(undefined);

    await adapter.finalizeEviction('transaction-1');

    expect(retired).toEqual([['desktop-peer', 'generation-7']]);
    expect(complete).toHaveBeenCalledWith('transaction-1');
  });

  it('closes an eviction that had no trust to retire', async () => {
    jest.spyOn(pairingSecretStore, 'capacityReplacement').mockReturnValue({
      id: 'transaction-1',
      installation,
      state: 'committed',
      createdAt: 1_700_000_000_000,
    });
    jest
      .spyOn(pairingSecretStore, 'completeCapacityReplacement')
      .mockResolvedValue(undefined);

    await adapter.finalizeEviction('transaction-1');

    // Evicting a device this phone never paired with: the seat is released and there is no membership to
    // withdraw. `undefined` reaches finalizeMembershipEviction, which owns the rule that it is a no-op.
    expect(retired).toEqual([['desktop-peer', undefined]]);
  });

  it('treats an already-closed transaction as done rather than broken', async () => {
    jest
      .spyOn(pairingSecretStore, 'capacityReplacement')
      .mockReturnValue(undefined);
    const complete = jest.spyOn(
      pairingSecretStore,
      'completeCapacityReplacement',
    );

    await expect(
      adapter.finalizeEviction('transaction-1'),
    ).resolves.toBeUndefined();

    // This is the branch the app actually takes. Reporting a failure here is what made a completed
    // eviction announce `replacement_failed` after it had entirely succeeded.
    expect(retired).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('still refuses to close a transaction that was never committed', async () => {
    jest.spyOn(pairingSecretStore, 'capacityReplacement').mockReturnValue({
      id: 'transaction-1',
      installation,
      membershipId: 'generation-7',
      state: 'prepared',
      createdAt: 1_700_000_000_000,
    });

    // Tolerating a MISSING transaction is not the same as tolerating an unfinished one: a prepared record
    // means the registry side never happened, and finishing anyway would retire trust for a seat that was
    // never released.
    await expect(adapter.finalizeEviction('transaction-1')).rejects.toThrow(
      PersonalMeshEntitlementError,
    );
    expect(retired).toEqual([]);
  });

  it('rolls back and commits through the store', async () => {
    const rollback = jest
      .spyOn(pairingSecretStore, 'rollbackCapacityReplacement')
      .mockResolvedValue(undefined);
    const commit = jest
      .spyOn(pairingSecretStore, 'commitCapacityReplacement')
      .mockResolvedValue(undefined);

    await adapter.rollbackEviction('transaction-1');
    await adapter.commitEviction('transaction-1');

    expect(rollback).toHaveBeenCalledWith('transaction-1');
    expect(commit).toHaveBeenCalledWith('transaction-1');
  });
});
