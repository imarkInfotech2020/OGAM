import type {
  MembershipRevocationPersistence,
  MembershipRevocationTombstone,
  PairedDevice,
  PairingPersistence,
  PendingMembershipRevocation,
} from '@offgrid/sync';

function activeMatches(
  current: PairedDevice | undefined,
  expected: PairedDevice,
): boolean {
  return (
    current?.id === expected.id &&
    current.sharedSecret === expected.sharedSecret &&
    current.membershipId === expected.membershipId
  );
}

function tombstoneKey(deviceId: string, membershipId: string): string {
  return JSON.stringify([deviceId, membershipId]);
}

/**
 * Controllable encrypted-host-storage boundary for cross-host integration journeys.
 * Pairing and revocation semantics stay inside the real shared SyncEngine.
 */
export class MembershipPersistenceBoundary
  implements PairingPersistence, MembershipRevocationPersistence
{
  private active = new Map<string, PairedDevice>();
  private pending = new Map<string, PendingMembershipRevocation>();
  private tombstones = new Map<string, MembershipRevocationTombstone>();

  save(device: PairedDevice): void {
    this.active.set(device.id, { ...device });
  }

  remove(deviceId: string): void {
    this.active.delete(deviceId);
  }

  getActive(deviceId: string): PairedDevice | undefined {
    const active = this.active.get(deviceId);
    return active ? { ...active } : undefined;
  }

  dropActive(deviceId: string): void {
    this.active.delete(deviceId);
  }

  beginLocal(
    active: PairedDevice,
    pending: PendingMembershipRevocation,
  ): boolean {
    if (!activeMatches(this.active.get(active.id), active)) return false;
    this.active.delete(active.id);
    this.pending.set(active.id, {
      ...pending,
      device: { ...pending.device },
    });
    return true;
  }

  listPending(): PendingMembershipRevocation[] {
    return [...this.pending.values()].map(pending => ({
      ...pending,
      device: { ...pending.device },
    }));
  }

  getPending(deviceId: string): PendingMembershipRevocation | undefined {
    const pending = this.pending.get(deviceId);
    return pending ? { ...pending, device: { ...pending.device } } : undefined;
  }

  getTombstone(
    deviceId: string,
    membershipId: string,
  ): MembershipRevocationTombstone | undefined {
    const tombstone = this.tombstones.get(tombstoneKey(deviceId, membershipId));
    return tombstone ? { ...tombstone } : undefined;
  }

  applyRemote(
    expectedActive: PairedDevice,
    tombstone: MembershipRevocationTombstone,
  ): boolean {
    if (!activeMatches(this.active.get(expectedActive.id), expectedActive)) {
      return false;
    }
    this.active.delete(expectedActive.id);
    this.tombstones.set(
      tombstoneKey(tombstone.deviceId, tombstone.membershipId),
      { ...tombstone },
    );
    return true;
  }

  completeLocal(
    pending: PendingMembershipRevocation,
    tombstone: MembershipRevocationTombstone,
  ): boolean {
    const current = this.pending.get(pending.device.id);
    if (
      current?.membershipId !== pending.membershipId ||
      current.revocationId !== pending.revocationId
    ) {
      return false;
    }
    this.pending.delete(pending.device.id);
    this.tombstones.set(
      tombstoneKey(tombstone.deviceId, tombstone.membershipId),
      { ...tombstone },
    );
    return true;
  }

  getRevocationSecret(
    deviceId: string,
    membershipId: string,
  ): string | undefined {
    const pending = this.pending.get(deviceId);
    if (pending?.membershipId === membershipId) {
      return pending.revocationSecret;
    }
    return this.tombstones.get(tombstoneKey(deviceId, membershipId))
      ?.revocationSecret;
  }
}
