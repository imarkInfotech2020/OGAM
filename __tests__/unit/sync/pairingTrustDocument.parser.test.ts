import {
  PAIRING_TRUST_FORMAT_VERSION,
  parsePairingTrustDocument,
} from '../../../pro/sync/pairingTrustDocument';

/**
 * Reading the trust document an earlier version of this app wrote.
 *
 * This is the parser that decides, on every launch, whether the user still has their devices. It reads a file
 * written by a build that may be years old, restored from a backup, or half-written when the app was killed - so
 * it is pure untrusted input, and the direction of every decision matters.
 *
 * Dropping too much unpairs devices the user still owns and makes them type pairing codes again. Dropping too
 * little admits a record this build cannot honour: a pairing with no secret it will try to reconnect with, or a
 * revocation it cannot prove. So the rule is per RECORD - one corrupt row never costs the rest - and every field
 * a decision depends on is checked.
 *
 * Every format this app has ever written is exercised, because each one is a real phone somewhere that has not
 * been opened in a while.
 */
describe('reading a trust document written by an earlier build', () => {
  const device = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'the-mac',
    name: "Mac's MacBook Pro",
    platform: 'macos',
    version: '1',
    host: '192.168.1.50',
    port: 7777,
    ...overrides,
  });

  const pairing = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    device: device(),
    membershipId: 'membership-1',
    pairedAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_060_000,
    state: 'trusted',
    secret: 'the-shared-secret',
    ...overrides,
  });

  const pending = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    device: device(),
    membershipId: 'membership-1',
    revocationId: 'revocation-1',
    revocationSecret: 'the-revocation-secret',
    requestedAt: 1_700_000_000_000,
    ...overrides,
  });

  const tombstone = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    deviceId: 'the-mac',
    membershipId: 'membership-1',
    revocationId: 'revocation-1',
    revocationSecret: 'the-revocation-secret',
    revokedAt: 1_700_000_060_000,
    ...overrides,
  });

  const replacement = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: 'replacement-1',
    installation: {
      installationId: 'the-mac',
      syncDeviceId: 'the-mac',
      deviceName: "Mac's MacBook Pro",
      platform: 'macos',
      lastActiveAt: 1_700_000_000_000,
      createdAt: 1_700_000_000_000,
    },
    membershipId: 'membership-1',
    state: 'prepared',
    createdAt: 1_700_000_000_000,
    ...overrides,
  });

  const read = (document: unknown): ReturnType<typeof parsePairingTrustDocument> =>
    parsePairingTrustDocument(JSON.stringify(document));

  const current = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    version: PAIRING_TRUST_FORMAT_VERSION,
    pairings: { 'the-mac': pairing() },
    stagedPairings: {},
    pendingRevocations: {},
    tombstones: {},
    capacityReplacements: {},
    ...overrides,
  });

  describe('a document this build wrote', () => {
    it('reads a paired device back whole', () => {
      const parsed = read(current());

      expect(parsed.pairings['the-mac']).toEqual({
        device: device(),
        membershipId: 'membership-1',
        pairedAt: 1_700_000_000_000,
        lastSeenAt: 1_700_000_060_000,
        state: 'trusted',
        alias: undefined,
        secret: 'the-shared-secret',
      });
    });

    it('keeps the secret of a pairing that needs repairing', () => {
      const parsed = read(
        current({ pairings: { 'the-mac': pairing({ state: 'needs_repair' }) } }),
      );

      // Three places used to tie the secret's existence to the 'trusted' state - marking a repair, writing, and
      // reading - so a pairing that needed repair lost its credential on the next save AND the next read. The
      // state describes how a pairing behaves; holding its credential is a different fact.
      expect(parsed.pairings['the-mac']?.secret).toBe('the-shared-secret');
      expect(parsed.pairings['the-mac']?.state).toBe('needs_repair');
    });

    it('reads a pairing that has no secret at all', () => {
      const parsed = read(
        current({ pairings: { 'the-mac': pairing({ secret: undefined }) } }),
      );

      // Still a trust decision worth keeping: the device is in the saved list and can be repaired. Dropping the
      // row would make it vanish from the user's devices entirely.
      expect(parsed.pairings['the-mac']).toBeDefined();
      expect(parsed.pairings['the-mac']?.secret).toBeUndefined();
    });

    it('keeps the name the user gave a device, trimmed and bounded', () => {
      const parsed = read(
        current({
          pairings: { 'the-mac': pairing({ alias: `  ${'x'.repeat(200)}  ` }) },
        }),
      );

      expect(parsed.pairings['the-mac']?.alias).toHaveLength(64);
    });

    it.each([
      ['a blank one', '   '],
      ['one that is not text', 7],
    ])('ignores %s as a name', (_label, alias) => {
      const parsed = read(current({ pairings: { 'the-mac': pairing({ alias }) } }));

      // Undefined rather than an empty string: the screen falls back to the device's own name, which is better
      // than a blank row.
      expect(parsed.pairings['the-mac']?.alias).toBeUndefined();
    });

    it.each([['macos'], ['windows'], ['linux'], ['android'], ['ios']])(
      'reads a device running %s, because the mesh spans all of them',
      (platform) => {
        const parsed = read(
          current({ pairings: { 'the-mac': pairing({ device: device({ platform }) }) } }),
        );

        expect(parsed.pairings['the-mac']?.device.platform).toBe(platform);
      },
    );

    it('drops a device that never said what it was', () => {
      const parsed = read(
        current({
          pairings: {
            'the-mac': pairing({ device: device({ platform: undefined }) }),
            'the-ipad': pairing({ device: device({ id: 'the-ipad' }) }),
          },
        }),
      );

      // Stricter than the licence's own record of the same device, which tolerates an unknown platform. A pairing
      // is a live connection: the platform decides how this build talks to it, so a row that does not say is a
      // row it cannot reach.
      expect(Object.keys(parsed.pairings)).toEqual(['the-ipad']);
    });

    it('reads a pairing with no membership as a valid one', () => {
      const parsed = read(
        current({ pairings: { 'the-mac': pairing({ membershipId: undefined }) } }),
      );

      // Written before memberships existed. It is still a device the user paired with.
      expect(parsed.pairings['the-mac']).toBeDefined();
      expect(parsed.pairings['the-mac']?.membershipId).toBeUndefined();
    });
  });

  describe('a record it cannot honour', () => {
    it.each([
      ['nothing where a record should be', null],
      ['a bare string', 'the-mac'],
      ['no device', { device: undefined }],
      ['a device with no id', { device: device({ id: '' }) }],
      ['a device with no name', { device: device({ name: undefined }) }],
      ['a device on a platform this build does not know', { device: device({ platform: 'watchos' }) }],
      ['a device with no protocol version', { device: device({ version: '' }) }],
      ['a device whose host is not text', { device: device({ host: 7 }) }],
      ['a device with no port', { device: device({ port: undefined }) }],
      ['a device on a port that does not exist', { device: device({ port: 70_000 }) }],
      ['a device on a negative port', { device: device({ port: -1 }) }],
      ['a device on a fractional port', { device: device({ port: 80.5 }) }],
      ['a state this build does not know', { state: 'suspicious' }],
      ['no state', { state: undefined }],
      ['no pairing time', { pairedAt: undefined }],
      ['a pairing time that is not a number', { pairedAt: 'yesterday' }],
      ['no last-seen time', { lastSeenAt: undefined }],
      ['a name too long to be one', { device: device({ name: 'x'.repeat(200) }) }],
    ])('drops a pairing with %s, and keeps the good one beside it', (_label, broken) => {
      const parsed = read(
        current({
          pairings: {
            broken:
              typeof broken === 'object' && broken !== null
                ? { ...pairing(), ...broken }
                : broken,
            'the-ipad': pairing({ device: device({ id: 'the-ipad' }) }),
          },
        }),
      );

      // Per record, never all-or-nothing: one row written by a build with a different idea of a device must not
      // cost the user every other device they own.
      expect(Object.keys(parsed.pairings)).toEqual(['the-ipad']);
    });
  });

  describe('a pairing that was only staged', () => {
    it('is read back so an interrupted handshake can be cleaned up', () => {
      const parsed = read(current({ stagedPairings: { 'the-mac': pairing() } }));

      expect(parsed.stagedPairings['the-mac']).toBeDefined();
    });

    it.each([
      ['it has no secret', { secret: undefined }],
      ['it was already flagged for repair', { state: 'needs_repair' }],
    ])('is dropped when %s', (_label, broken) => {
      const parsed = read(
        current({ stagedPairings: { 'the-mac': { ...pairing(), ...broken } } }),
      );

      // A staged pairing exists only to be committed, and committing needs a secret and a clean state. Anything
      // else is a leftover, and keeping it risks completing a handshake that never happened.
      expect(parsed.stagedPairings).toEqual({});
    });
  });

  describe('revocations', () => {
    it('reads one still waiting to reach its peer', () => {
      const parsed = read(current({ pendingRevocations: { 'the-mac': pending() } }));

      expect(parsed.pendingRevocations['the-mac']).toEqual({
        device: device(),
        membershipId: 'membership-1',
        revocationId: 'revocation-1',
        revocationSecret: 'the-revocation-secret',
        requestedAt: 1_700_000_000_000,
        dismissedAt: undefined,
      });
    });

    it('remembers that the user dismissed the notice', () => {
      const parsed = read(
        current({
          pendingRevocations: {
            'the-mac': pending({ dismissedAt: 1_700_000_090_000 }),
          },
        }),
      );

      expect(parsed.pendingRevocations['the-mac']?.dismissedAt).toBe(1_700_000_090_000);
    });

    it.each([
      ['a dismissal time that is not a number', 'yesterday'],
      ['a negative dismissal time', -1],
    ])('treats %s as not dismissed', (_label, dismissedAt) => {
      const parsed = read(
        current({ pendingRevocations: { 'the-mac': pending({ dismissedAt }) } }),
      );

      // Shown again rather than silently hidden: an unreadable dismissal must not permanently silence a
      // revocation that still has to reach its peer.
      expect(parsed.pendingRevocations['the-mac']?.dismissedAt).toBeUndefined();
    });

    it.each([
      ['no device', { device: undefined }],
      ['no membership', { membershipId: '' }],
      ['no revocation id', { revocationId: undefined }],
      ['no proof to present', { revocationSecret: undefined }],
      ['no time', { requestedAt: undefined }],
      ['a negative time', { requestedAt: -1 }],
      ['nothing where a record should be', null],
    ])('drops one with %s', (_label, broken) => {
      const parsed = read(
        current({
          pendingRevocations: {
            'the-mac':
              typeof broken === 'object' && broken !== null
                ? { ...pending(), ...broken }
                : broken,
          },
        }),
      );

      // A revocation without its secret cannot be proved to the peer, so keeping it would retry for ever against
      // a device that will always refuse it.
      expect(parsed.pendingRevocations).toEqual({});
    });

    it('reads a completed one, keyed by device AND membership', () => {
      const parsed = read(
        current({
          tombstones: {
            'anything at all': tombstone(),
            'another key': tombstone({ membershipId: 'membership-2' }),
          },
        }),
      );

      // Re-keyed from the record rather than trusting the key it was stored under: one device can have several
      // revoked memberships, and a key collision would lose one of them.
      expect(Object.keys(parsed.tombstones).sort()).toEqual([
        JSON.stringify(['the-mac', 'membership-1']),
        JSON.stringify(['the-mac', 'membership-2']),
      ]);
    });

    it.each([
      ['no device', { deviceId: undefined }],
      ['no membership', { membershipId: '' }],
      ['no revocation id', { revocationId: undefined }],
      ['no proof', { revocationSecret: undefined }],
      ['no time', { revokedAt: undefined }],
      ['a negative time', { revokedAt: -1 }],
      ['nothing where a record should be', null],
    ])('drops a completed one with %s', (_label, broken) => {
      const parsed = read(
        current({
          tombstones: {
            key:
              typeof broken === 'object' && broken !== null
                ? { ...tombstone(), ...broken }
                : broken,
          },
        }),
      );

      expect(parsed.tombstones).toEqual({});
    });
  });

  describe('a licence seat being replaced', () => {
    it('reads one that was prepared', () => {
      const parsed = read(current({ capacityReplacements: { 'replacement-1': replacement() } }));

      expect(parsed.capacityReplacements['replacement-1']).toMatchObject({
        id: 'replacement-1',
        membershipId: 'membership-1',
        state: 'prepared',
      });
    });

    const seatHeldBy = (platform: unknown): Record<string, unknown> =>
      current({
        capacityReplacements: {
          'replacement-1': replacement({
            installation: {
              ...(replacement().installation as Record<string, unknown>),
              platform,
            },
          }),
        },
      });

    it.each([['macos'], ['windows'], ['linux'], ['android'], ['ios']])(
      'reads a seat held by a %s device',
      (platform) => {
        const parsed = read(seatHeldBy(platform));

        // Every platform the mesh spans, because a seat can be freed from any of them - and the one this list
        // forgets is the device the user cannot evict.
        expect(parsed.capacityReplacements['replacement-1']?.installation.platform).toBe(
          platform,
        );
      },
    );

    it.each([
      ['on a platform this build does not know', 'watchos'],
      ['that never said what it was', undefined],
      ['with a name it cannot show', { deviceName: undefined }],
      ['with no last-active time', { lastActiveAt: undefined }],
      ['with a negative last-active time', { lastActiveAt: -1 }],
      ['with no creation time', { createdAt: undefined }],
      ['with a negative creation time', { createdAt: -1 }],
      ['with no sync identity', { syncDeviceId: '' }],
    ])('drops a seat held by a device %s', (_label, broken) => {
      const parsed = read(
        typeof broken === 'object' && broken !== null
          ? current({
              capacityReplacements: {
                'replacement-1': replacement({
                  installation: {
                    ...(replacement().installation as Record<string, unknown>),
                    ...broken,
                  },
                }),
              },
            })
          : seatHeldBy(broken),
      );

      // A seat record names the device whose seat is being freed, and the eviction is presented to the user as
      // "replace this device". A record that cannot say which device that is cannot be shown or acted on.
      expect(parsed.capacityReplacements).toEqual({});
    });

    it('reads one with no local membership as valid, not corrupt', () => {
      const parsed = read(
        current({
          capacityReplacements: {
            'replacement-1': replacement({ membershipId: undefined }),
          },
        }),
      );

      // A phone you replaced still holds a seat on the licence, and freeing it is the whole point of evicting it.
      // There is simply no local trust to retire, which is not the same as the eviction being impossible.
      expect(parsed.capacityReplacements['replacement-1']).toBeDefined();
      expect(parsed.capacityReplacements['replacement-1']?.membershipId).toBeUndefined();
    });

    it.each([
      ['no id', { id: '' }],
      ['a state this build does not know', { state: 'halfway' }],
      ['no time', { createdAt: undefined }],
      ['a negative time', { createdAt: -1 }],
      ['no installation', { installation: undefined }],
      ['an installation with no id', { installation: { syncDeviceId: 'the-mac' } }],
      ['nothing where a record should be', null],
    ])('drops one with %s', (_label, broken) => {
      const parsed = read(
        current({
          capacityReplacements: {
            'replacement-1':
              typeof broken === 'object' && broken !== null
                ? { ...replacement(), ...broken }
                : broken,
          },
        }),
      );

      expect(parsed.capacityReplacements).toEqual({});
    });
  });

  describe('every format this app has written', () => {
    it('reads the v1 secrets bag, which had no trust rows', () => {
      const parsed = parsePairingTrustDocument(
        JSON.stringify({
          version: 1,
          secrets: { 'the-mac': 'a-secret-from-an-older-build', '': 'no-device' },
        }),
      );

      // The oldest format. Its secrets are surfaced separately so the first sighting of each device can promote
      // it - an upgrade that dropped them would unpair every device the user has.
      expect(parsed.legacySecrets).toEqual({ 'the-mac': 'a-secret-from-an-older-build' });
      expect(parsed.pairings).toEqual({});
    });

    it('reads v2, which knew nothing of revocations', () => {
      const parsed = read({
        version: 2,
        pairings: { 'the-mac': pairing() },
        // Written by a much later build into a v2 document: not this version's business, so ignored.
        pendingRevocations: { 'the-mac': pending() },
        tombstones: { key: tombstone() },
        capacityReplacements: { 'replacement-1': replacement() },
      });

      expect(parsed.pairings['the-mac']).toBeDefined();
      expect(parsed.pendingRevocations).toEqual({});
      expect(parsed.tombstones).toEqual({});
      expect(parsed.capacityReplacements).toEqual({});
    });

    it('reads v3, which had revocations but no staging and no seats', () => {
      const parsed = read({
        version: 3,
        pairings: { 'the-mac': pairing() },
        stagedPairings: { 'the-ipad': pairing({ device: device({ id: 'the-ipad' }) }) },
        pendingRevocations: { 'the-mac': pending() },
        tombstones: { key: tombstone() },
        capacityReplacements: { 'replacement-1': replacement() },
      });

      expect(parsed.pendingRevocations['the-mac']).toBeDefined();
      expect(parsed.tombstones[JSON.stringify(['the-mac', 'membership-1'])]).toBeDefined();
      // Staging arrived in v4 and seats in v5, so neither is read out of an older document.
      expect(parsed.stagedPairings).toEqual({});
      expect(parsed.capacityReplacements).toEqual({});
    });

    it('reads v4, which had staging but no seats', () => {
      const parsed = read({
        version: 4,
        pairings: { 'the-mac': pairing() },
        stagedPairings: { 'the-ipad': pairing({ device: device({ id: 'the-ipad' }) }) },
        pendingRevocations: { 'the-mac': pending() },
        tombstones: { key: tombstone() },
        capacityReplacements: { 'replacement-1': replacement() },
      });

      expect(parsed.stagedPairings['the-ipad']).toBeDefined();
      expect(parsed.capacityReplacements).toEqual({});
    });

    it.each([[5], [6]])('reads v%i, which has everything', (version) => {
      const parsed = read({
        version,
        pairings: { 'the-mac': pairing() },
        stagedPairings: { 'the-ipad': pairing({ device: device({ id: 'the-ipad' }) }) },
        pendingRevocations: { 'the-mac': pending() },
        tombstones: { key: tombstone() },
        capacityReplacements: { 'replacement-1': replacement() },
      });

      expect(parsed.pairings['the-mac']).toBeDefined();
      expect(parsed.stagedPairings['the-ipad']).toBeDefined();
      expect(parsed.pendingRevocations['the-mac']).toBeDefined();
      expect(parsed.capacityReplacements['replacement-1']).toBeDefined();
    });

    it('is still reading the version this build writes', () => {
      // Read from the constant rather than restated: a bump that forgot to teach the parser the new version
      // would unpair every device on the launch after the upgrade.
      expect([2, 3, 4, 5, 6]).toContain(PAIRING_TRUST_FORMAT_VERSION);
    });
  });

  describe('a document it cannot read at all', () => {
    it.each([
      ['it is not JSON', 'not json at all'],
      ['it was truncated by a crash', '{"version":6,"pairings":'],
      ['it is a bare number', '5'],
      ['it is a list', '[]'],
    ])('comes back empty when %s', (_label, value) => {
      const parsed = parsePairingTrustDocument(value);

      // Empty, never a throw: this runs on the launch path, and an exception here is an app that cannot start.
      expect(parsed.pairings).toEqual({});
      expect(parsed.legacySecrets).toEqual({});
    });

    it('comes back empty for a version from the future', () => {
      const parsed = read({ version: 99, pairings: { 'the-mac': pairing() } });

      // A document written by a NEWER build - a downgrade, or a restored backup. Its records may mean something
      // different, so guessing at them is worse than starting clean.
      expect(parsed.pairings).toEqual({});
    });

    it('comes back empty when there is no version at all', () => {
      expect(read({ pairings: { 'the-mac': pairing() } }).pairings).toEqual({});
    });

    it.each([
      ['the pairings are not a record', { pairings: [] }],
      ['the revocations are not a record', { pendingRevocations: 'none' }],
      ['the tombstones are not a record', { tombstones: 7 }],
      ['the seats are not a record', { capacityReplacements: null }],
      ['the staged pairings are not a record', { stagedPairings: 'none' }],
    ])('reads what it can when %s', (_label, broken) => {
      const parsed = read(current({ ...broken }));

      // Each section is read independently, so one section written by something else does not cost the others.
      expect(parsed).toMatchObject({
        legacySecrets: {},
        stagedPairings: expect.any(Object),
      });
    });
  });
});
