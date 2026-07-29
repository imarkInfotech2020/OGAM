/**
 * Low-level Keygen REST client.
 *
 * Wraps the validate-key, machine activate/deactivate, and list-machines
 * endpoints. The license KEY is the credential (policies are unprotected with a
 * MIXED authentication strategy), so machine actions authenticate with
 * `Authorization: License <key>` and validate-key needs no auth at all.
 *
 * Transport failures throw KeygenNetworkError so the service layer can fall back
 * to the cached license (offline grace) instead of locking the user out.
 */
import { KEYGEN_API_BASE, KEYGEN_PRODUCT_ID } from '../config/keygen';
import logger from '../utils/logger';

const JSON_API = 'application/vnd.api+json';

type ValidationCode =
  | 'VALID'
  | 'NO_MACHINE'
  | 'NO_MACHINES'
  | 'TOO_MANY_MACHINES'
  | 'FINGERPRINT_SCOPE_MISMATCH'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'BANNED'
  | 'OVERDUE'
  | 'NOT_FOUND'
  | 'UNKNOWN';

interface KeygenLicense {
  id: string;
  expiry: string | null; // ISO timestamp, or null for a perpetual (lifetime) key
  metadata: Record<string, unknown>;
  name: string | null;
}

export interface ValidateResult {
  valid: boolean;
  code: ValidationCode;
  license: KeygenLicense | null;
}

export interface KeygenMachine {
  id: string;
  fingerprint: string;
  platform: string | null;
  name: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  /** Factual Keygen activity. Registration time is deliberately not substituted. */
  lastActiveAt: string | null;
  /** Legacy presentation/replacement field. Prefer lastActiveAt for mesh policy. */
  lastSeen: string | null;
}

export interface KeygenMachineMetadata {
  platform: string;
  syncDeviceId?: string;
  membershipId?: string;
  deviceName?: string;
  /** Factual authenticated pairing activity persisted with the provider registration. */
  lastActiveAt?: string;
}

export interface KeygenMachineRegistration {
  fingerprint: string;
  platform: string;
  metadata?: KeygenMachineMetadata;
}

export interface ActivateMachineResult {
  ok: boolean;
  limitReached: boolean;
  machine?: KeygenMachine;
}

/** Raised on a network/transport failure (offline), never on a 4xx from Keygen. */
export class KeygenNetworkError extends Error {}

function safeResourceId(value: string, label: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error(`Invalid Keygen ${label}.`);
  }
  return id;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sanitizedProviderError(value: unknown): string {
  return JSON.stringify(value)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 1000);
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${KEYGEN_API_BASE}${path}`, init);
  } catch (e) {
    throw new KeygenNetworkError(e instanceof Error ? e.message : String(e));
  }
}

function toLicense(data: unknown): KeygenLicense | null {
  const resource = objectValue(data);
  const id = stringValue(resource?.id);
  if (!resource || !id) return null;
  const attributes = objectValue(resource.attributes) ?? {};
  return {
    id,
    expiry: stringValue(attributes.expiry) ?? null,
    metadata: objectValue(attributes.metadata) ?? {},
    name: stringValue(attributes.name) ?? null,
  };
}

/** Validate a key, scoped to this product + device fingerprint. No auth needed. */
export async function validateKey(
  key: string,
  fingerprint: string,
): Promise<ValidateResult> {
  const res = await request('/licenses/actions/validate-key', {
    method: 'POST',
    headers: { 'Content-Type': JSON_API, Accept: JSON_API },
    body: JSON.stringify({
      meta: { key, scope: { product: KEYGEN_PRODUCT_ID, fingerprint } },
    }),
  });
  const body = objectValue(await res.json().catch(() => ({}))) ?? {};
  const meta = objectValue(body.meta) ?? {};
  return {
    valid: meta.valid === true,
    code: (stringValue(meta.code) ?? 'UNKNOWN') as ValidationCode,
    license: toLicense(body.data),
  };
}

/** Register this device as a machine on the license. Enforces the device cap. */
export async function activateMachine(
  key: string,
  licenseId: string,
  device: KeygenMachineRegistration,
): Promise<ActivateMachineResult> {
  const admittedLicenseId = safeResourceId(licenseId, 'license ID');
  const { fingerprint, platform } = device;
  const metadata = device.metadata ?? { platform };
  const res = await request('/machines', {
    method: 'POST',
    headers: {
      'Content-Type': JSON_API,
      Accept: JSON_API,
      Authorization: `License ${key}`,
    },
    body: JSON.stringify({
      data: {
        type: 'machines',
        attributes: { fingerprint, platform, metadata },
        relationships: {
          license: { data: { type: 'licenses', id: admittedLicenseId } },
        },
      },
    }),
  });
  const body = objectValue(await res.json().catch(() => ({}))) ?? {};
  if (res.status === 201) {
    return {
      ok: true,
      limitReached: false,
      machine: toMachine(body.data),
    };
  }
  const errors = Array.isArray(body.errors) ? body.errors : [];
  // Keygen returns 422 with a MACHINE_LIMIT_EXCEEDED code when over the cap.
  const limitReached =
    res.status === 422 &&
    errors.some(error => {
      const entry = objectValue(error);
      return (
        String(entry?.code ?? '').includes('LIMIT') ||
        String(entry?.detail ?? '')
          .toLowerCase()
          .includes('machine limit')
      );
    });
  if (!limitReached) {
    logger.error(
      `[Keygen] activate failed (${res.status}): ${sanitizedProviderError(
        errors,
      )}`,
    );
  }
  return { ok: false, limitReached };
}

function toMachine(machine: unknown): KeygenMachine | undefined {
  const resource = objectValue(machine);
  const id = stringValue(resource?.id);
  if (!resource || !id) return undefined;
  const attributes = objectValue(resource.attributes) ?? {};
  const createdAt = stringValue(attributes.created) ?? null;
  const updatedAt = stringValue(attributes.updated) ?? null;
  const lastActiveAt = stringValue(attributes.lastHeartbeat) ?? null;
  return {
    id,
    fingerprint: stringValue(attributes.fingerprint) ?? '',
    platform: stringValue(attributes.platform) ?? null,
    name: stringValue(attributes.name) ?? null,
    metadata: objectValue(attributes.metadata) ?? {},
    createdAt,
    updatedAt,
    lastActiveAt,
    // Keep the old UI/API behavior until every caller consumes factual activity.
    lastSeen: lastActiveAt ?? createdAt,
  };
}

/** List the machines currently activated on a license. */
export async function listMachines(
  key: string,
  licenseId: string,
): Promise<KeygenMachine[]> {
  const admittedLicenseId = safeResourceId(licenseId, 'license ID');
  const res = await request(`/licenses/${admittedLicenseId}/machines`, {
    method: 'GET',
    headers: { Accept: JSON_API, Authorization: `License ${key}` },
  });
  const body = objectValue(await res.json().catch(() => ({}))) ?? {};
  if (!res.ok) {
    throw new Error(
      `Keygen machine listing failed (${res.status}): ${sanitizedProviderError(
        body.errors ?? [],
      )}`,
    );
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return data
    .map(toMachine)
    .filter((machine): machine is KeygenMachine => machine !== undefined);
}

/** Free a device slot. */
export async function deactivateMachine(
  key: string,
  machineId: string,
): Promise<boolean> {
  const admittedMachineId = safeResourceId(machineId, 'machine ID');
  const res = await request(`/machines/${admittedMachineId}`, {
    method: 'DELETE',
    headers: { Accept: JSON_API, Authorization: `License ${key}` },
  });
  return res.status === 204 || res.ok;
}
