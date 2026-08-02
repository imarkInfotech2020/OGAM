import { useEffect, useState } from 'react';
import { useAppStore } from '../stores';
import {
  getProLicenseInfo,
  PRO_TIER_META,
  type ProLicenseInfo,
} from '../services/proLicenseService';

/**
 * Label for the Settings "Off Grid AI PRO" row: the upsell line when not Pro, or
 * the subscription status (a renewing tier shows its date; a one-time tier shows
 * "<Tier> · active") when Pro.
 */
export function useProStatusLabel(): {
  proStatusLabel: string;
} {
  const hasSavedProCredential = useAppStore(s => s.hasSavedProCredential);
  const isProActive = useAppStore(s => s.isProActive);
  const isProDeviceActive = useAppStore(s => s.isProDeviceActive);
  const [info, setInfo] = useState<ProLicenseInfo | null>(null);
  useEffect(() => {
    if (hasSavedProCredential)
      getProLicenseInfo()
        .then(setInfo)
        .catch(() => {});
    else setInfo(null);
  }, [hasSavedProCredential]);

  // Drive off the tier's `renews` flag (single source), not a concrete-tier check.
  const meta = info?.tier ? PRO_TIER_META[info.tier] : null;
  const isDevelopmentAccess = __DEV__ && isProActive && !hasSavedProCredential;
  const proStatusLabel = isDevelopmentAccess
    ? 'Development access'
    : !hasSavedProCredential
    ? 'Unlock premium features'
    : !isProDeviceActive
    ? 'Credential saved - device not active'
    : info?.isPro && meta?.renews && info.expiry
    ? `Active until ${new Date(info.expiry).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`
    : info?.isPro && meta
    ? `${meta.label} · active`
    : info
    ? 'Development · active'
    : 'Pro · active';

  return { proStatusLabel };
}
