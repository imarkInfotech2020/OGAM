import type {
  PersonalMeshActivationResult,
  PersonalMeshReconciliationReason,
} from '@offgrid/sync';

export const PRO_PAY_PAGE_URL = 'https://offgridmobileai.co/pay';

export type ProTier = 'lifetime' | 'yearly';

export const PRO_TIER_META: Record<
  ProTier,
  { label: string; renews: boolean }
> = {
  lifetime: { label: 'Lifetime', renews: false },
  yearly: { label: 'Yearly', renews: true },
};

export interface ProLicenseInfo {
  isPro: boolean;
  credentialSaved?: boolean;
  tier: ProTier | null;
  expiry: string | null;
  verifiedAt: number;
}

export interface ProEntitlementProvider {
  readActive(): Promise<boolean>;
  getInfo(): Promise<ProLicenseInfo>;
  revalidate(reason: PersonalMeshReconciliationReason): Promise<void>;
  activate(rawCredential: string): Promise<PersonalMeshActivationResult>;
  clearForTesting(): Promise<void>;
}

const UNAVAILABLE_PROVIDER: ProEntitlementProvider = {
  readActive: async () => false,
  getInfo: async () => ({
    isPro: false,
    credentialSaved: false,
    tier: null,
    expiry: null,
    verifiedAt: 0,
  }),
  revalidate: async () => undefined,
  activate: async () => ({ ok: false, reason: 'registration_failed' }),
  clearForTesting: async () => undefined,
};

let provider: ProEntitlementProvider = UNAVAILABLE_PROVIDER;

export function registerProEntitlementProvider(
  nextProvider: ProEntitlementProvider,
): void {
  provider = nextProvider;
}

export function getProLicenseInfo(): Promise<ProLicenseInfo> {
  return provider.getInfo();
}

export function revalidateProEntitlement(
  reason: PersonalMeshReconciliationReason,
): Promise<void> {
  return provider.revalidate(reason);
}

export function activateProByKey(
  rawCredential: string,
): Promise<PersonalMeshActivationResult> {
  return provider.activate(rawCredential);
}

export function clearProForTesting(): Promise<void> {
  return provider.clearForTesting();
}
