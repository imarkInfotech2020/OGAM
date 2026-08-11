import type { Op } from '@offgrid/sync';
import { remapOpLogIdentity } from '../../../pro/sync/opLogIdentityMigration';

/**
 * Re-attributing a device's own history to the identity the licence knows it by.
 *
 * Builds before the canonical identity stamped ops with a random per-install id, so a device's own
 * history belonged to an identity that appears in no installation roster and no pairing membership. This
 * rewrites those rows so the log agrees with the roster.
 *
 * The rules that keep it safe to run are what is pinned here: a peer's ops are never touched, running it
 * twice changes nothing, and the dedup key and lamport values are left alone so a peer that already holds
 * these ops still recognises them. Getting any of those wrong does not fail loudly - it silently
 * re-attributes somebody else's history, or breaks convergence with a device that is not in the room.
 */
describe('re-attributing an op log to the canonical identity', () => {
  const op = (overrides: Partial<Op> = {}): Op =>
    ({
      opId: 'op-1',
      deviceId: 'legacy-install',
      entity: 'message',
      entityId: 'message-1',
      kind: 'put',
      lamport: 7,
      fields: { content: 'hello' },
      ...overrides,
    } as Op);

  it('re-attributes the ops this device authored', () => {
    const { ops, remapped } = remapOpLogIdentity(
      [op(), op({ opId: 'op-2' })],
      'legacy-install',
      'canonical-install',
    );

    expect(remapped).toBe(2);
    expect(ops.map(({ deviceId }) => deviceId)).toEqual([
      'canonical-install',
      'canonical-install',
    ]);
  });

  it('leaves the dedup key and the clock exactly as they were', () => {
    const { ops } = remapOpLogIdentity([op()], 'legacy-install', 'canonical');

    // Convergence rests on these two. A peer that already holds this op recognises it by opId and orders
    // it by lamport, so changing either would make the same op arrive as a new one.
    expect(ops[0].opId).toBe('op-1');
    expect(ops[0].lamport).toBe(7);
    expect(ops[0].fields).toEqual({ content: 'hello' });
  });

  it('does not touch a peer’s ops', () => {
    const peerOp = op({ opId: 'peer-op', deviceId: 'the-mac' });

    const { ops, remapped } = remapOpLogIdentity(
      [peerOp, op()],
      'legacy-install',
      'canonical',
    );

    expect(remapped).toBe(1);
    // Identity preserved, not merely equal: a peer's history belongs to the peer.
    expect(ops[0]).toBe(peerOp);
  });

  it('re-attributes provenance without claiming authorship', () => {
    const shared = op({
      opId: 'shared-file',
      deviceId: 'the-mac',
      provenance: {
        originDeviceId: 'legacy-install',
        originDeviceName: 'This phone',
      },
    } as Partial<Op>);

    const { ops, remapped } = remapOpLogIdentity(
      [shared],
      'legacy-install',
      'canonical',
    );

    expect(remapped).toBe(1);
    // The Mac still wrote the op; what changed is who the content came FROM. Rewriting deviceId here
    // would credit this phone with an op it never authored.
    expect(ops[0].deviceId).toBe('the-mac');
    expect(ops[0].provenance?.originDeviceId).toBe('canonical');
    expect(ops[0].provenance?.originDeviceName).toBe('This phone');
  });

  it('changes nothing on a second run', () => {
    const once = remapOpLogIdentity([op()], 'legacy-install', 'canonical');
    const twice = remapOpLogIdentity(once.ops, 'legacy-install', 'canonical');

    // Migrations run at startup, so they run again on every launch. A second pass that still counted
    // rows would keep rewriting a log that was already correct.
    expect(twice.remapped).toBe(0);
    expect(twice.ops).toEqual(once.ops);
  });

  it('does nothing when there is no rename to make', () => {
    for (const [legacy, canonical] of [
      ['same', 'same'],
      ['', 'canonical'],
      ['legacy', ''],
    ]) {
      const { ops, remapped } = remapOpLogIdentity([op()], legacy, canonical);
      expect(remapped).toBe(0);
      expect(ops).toHaveLength(1);
    }
  });

  it('hands back a new list rather than the one it was given', () => {
    const original = [op()];

    const { ops } = remapOpLogIdentity(original, 'same', 'same');

    // Even on the do-nothing path: the caller persists what comes back, and sharing the array would let
    // a later write reach into the log it was reading from.
    expect(ops).not.toBe(original);
    expect(ops).toEqual(original);
  });
});
