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
  hasRegisteredPro: boolean;
  proStatusLabel: string;
} {
  const hasRegisteredPro = useAppStore(s => s.hasRegisteredPro);
  const isProActive = useAppStore(s => s.isProActive);
  const [info, setInfo] = useState<ProLicenseInfo | null>(null);
  useEffect(() => {
    if (isProActive)
      getProLicenseInfo()
        .then(setInfo)
        .catch(() => {});
    else setInfo(null);
  }, [isProActive]);

  // Drive off the tier's `renews` flag (single source), not a concrete-tier check.
  const meta = info?.tier ? PRO_TIER_META[info.tier] : null;
  const proStatusLabel = !isProActive
    ? 'Unlock premium features'
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

  return { hasRegisteredPro, proStatusLabel };
}
