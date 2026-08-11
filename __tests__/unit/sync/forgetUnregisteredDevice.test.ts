import { forgetUnregisteredDevice } from '../../../pro/sync/forgetUnregisteredDevice';
import { pairingSecretStore } from '../../../pro/sync/pairingSecretStore';
import type { MobilePairingEntitlementAdapterOptions } from '../../../pro/sync/pairingEntitlementCredentialAdapter';

/**
 * Dropping local trust for a device the licence has nothing registered for.
 *
 * This is the escape hatch that makes a stale row removable at all. A phone that was reinstalled comes
 * back under a new identity, so its old installation can never be matched again - and without this the
 * eviction of that leftover would only ever throw, leaving a row that cannot be got rid of.
 *
 * It is small and it is a decision, which is why it is worth stating: retire the membership if there IS
 * one, and do nothing at all if the trust or the owner is missing. Doing nothing quietly is right here -
 * there is no membership to retire, so there is no failure to report either.
 */
describe('forgetting a device the licence does not know', () => {
  const forgotten: Array<[string, string]> = [];
  const owner = {
    forget: async (deviceId: string, membershipId: string) => {
      forgotten.push([deviceId, membershipId]);
    },
  };
  const optionsWith = (
    membershipOwner: () => unknown,
  ): MobilePairingEntitlementAdapterOptions =>
    ({ membershipOwner } as unknown as MobilePairingEntitlementAdapterOptions);

  beforeEach(() => {
    forgotten.length = 0;
    jest.restoreAllMocks();
  });

  it('retires the membership this device holds for it', async () => {
    jest
      .spyOn(pairingSecretStore, 'known')
      .mockReturnValue({ membershipId: 'generation-7' } as ReturnType<
        typeof pairingSecretStore.known
      >);

    await forgetUnregisteredDevice(
      optionsWith(() => owner),
      'desktop-peer',
    );

    expect(forgotten).toEqual([['desktop-peer', 'generation-7']]);
  });

  it('does nothing when this device holds no trust for it', async () => {
    jest.spyOn(pairingSecretStore, 'known').mockReturnValue(undefined);

    await forgetUnregisteredDevice(
      optionsWith(() => owner),
      'desktop-peer',
    );

    // Nothing to retire is not a failure: the licence has no installation and this device has no
    // membership, so the state being asked for is the state already in place.
    expect(forgotten).toEqual([]);
  });

  it('does nothing when Sync is not running to retire it through', async () => {
    jest
      .spyOn(pairingSecretStore, 'known')
      .mockReturnValue({ membershipId: 'generation-7' } as ReturnType<
        typeof pairingSecretStore.known
      >);

    await forgetUnregisteredDevice(
      optionsWith(() => undefined),
      'desktop-peer',
    );

    expect(forgotten).toEqual([]);
  });
});
