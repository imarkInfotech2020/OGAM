import {
  PAIRING_TRUST_FORMAT_VERSION,
  parsePairingTrustDocument,
} from '../../../pro/sync/pairingTrustDocument';

/**
 * An eviction with nothing local to retire survives a restart.
 *
 * The trust document is the only thing that outlives the process, so a record it cannot read is a record
 * that vanishes - and an eviction transaction that vanishes mid-flight leaves a licence seat gone with
 * nothing left to finish releasing it.
 *
 * Evicting a device this phone never paired with is exactly that shape: the registry holds the
 * installation, this device holds no trust for it, so the transaction has an empty local side. The parser
 * used to require a membership id and dropped any record without one, which is what made such an eviction
 * impossible to resume. A missing membership is a valid record; a missing installation is not.
 *
 * This is a parser, so it is tested directly: there is no gesture that reaches a corrupt line of JSON.
 */
describe('the pairing trust document', () => {
  const installation = {
    installationId: 'machine-1',
    syncDeviceId: 'desktop-peer',
    deviceName: 'Off Grid AI Desktop',
    platform: 'macos' as const,
    lastActiveAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
  };

  const documentWith = (replacement: unknown): string =>
    JSON.stringify({
      version: PAIRING_TRUST_FORMAT_VERSION,
      pairings: {},
      stagedPairings: {},
      pendingRevocations: {},
      tombstones: {},
      capacityReplacements: { 'transaction-1': replacement },
    });

  it('keeps an eviction that has no local membership to retire', () => {
    const parsed = parsePairingTrustDocument(
      documentWith({
        id: 'transaction-1',
        installation,
        state: 'committed',
        createdAt: 1_700_000_000_000,
      }),
    );

    const restored = parsed.capacityReplacements['transaction-1'];
    expect(restored).toBeDefined();
    expect(restored?.installation.syncDeviceId).toBe('desktop-peer');
    expect(restored?.state).toBe('committed');
    expect(restored?.membershipId).toBeUndefined();
  });

  it('keeps the membership when there is one, so the trust can still be retired', () => {
    const parsed = parsePairingTrustDocument(
      documentWith({
        id: 'transaction-1',
        installation,
        membershipId: 'generation-7',
        state: 'prepared',
        createdAt: 1_700_000_000_000,
      }),
    );

    expect(parsed.capacityReplacements['transaction-1']?.membershipId).toBe(
      'generation-7',
    );
  });

  it('drops an eviction with no installation, because there is no seat to identify', () => {
    const parsed = parsePairingTrustDocument(
      documentWith({
        id: 'transaction-1',
        membershipId: 'generation-7',
        state: 'committed',
        createdAt: 1_700_000_000_000,
      }),
    );

    expect(parsed.capacityReplacements['transaction-1']).toBeUndefined();
  });
});
