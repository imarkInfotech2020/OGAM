import { hasProAccess, type ProDeviceAdmission } from '@offgrid/sync';

export interface ProAccessSlice {
  /** Cached protected Pro credential grants offline feature access. */
  hasRegisteredPro: boolean;
  setHasRegisteredPro: (value: boolean) => void;
  /** A protected credential exists, independently of current device admission. */
  hasSavedProCredential: boolean;
  setHasSavedProCredential: (value: boolean) => void;
  /** Paid features are available through a credential or Debug developer access. */
  isProActive: boolean;
  setProActive: (value: boolean) => void;
  /** The current device is admitted to the authoritative licensed-device roster. */
  isProDeviceActive: boolean;
  setProDeviceActive: (value: boolean) => void;
  /**
   * Admission as THREE states, because unknown is not the same as revoked.
   *
   * `isProDeviceActive` is a boolean that starts false, so it cannot tell "we have not heard from the
   * roster yet" apart from "this device was deactivated". Gating features on it directly would revoke
   * Pro on every cold start and for anyone offline; gating on the credential alone leaves a
   * deactivated device fully Pro, which is what it did.
   */
  proDeviceAdmission: ProDeviceAdmission;
  setProDeviceAdmission: (value: ProDeviceAdmission) => void;
  devProDisabled: boolean;
  setDevProDisabled: (value: boolean) => void;
  proBannerDismissed: boolean;
  setProBannerDismissed: (value: boolean) => void;
  desktopPromoDismissed: boolean;
  setDesktopPromoDismissed: (value: boolean) => void;
  proAhaTriggeredBy: 'image' | 'text' | null;
  setProAhaTriggeredBy: (value: 'image' | 'text' | null) => void;
}

type SetProAccessState = (state: Partial<ProAccessSlice>) => void;

export function createProAccessSlice(set: SetProAccessState): ProAccessSlice {
  return {
    hasRegisteredPro: false,
    setHasRegisteredPro: value => set({ hasRegisteredPro: value }),
    hasSavedProCredential: false,
    setHasSavedProCredential: value => set({ hasSavedProCredential: value }),
    isProActive: false,
    setProActive: value => set({ isProActive: value }),
    isProDeviceActive: false,
    // One call keeps both in step: callers report a boolean from the roster, and a reported boolean is
    // by definition known, so it resolves the tri-state too.
    setProDeviceActive: value =>
      set({
        isProDeviceActive: value,
        proDeviceAdmission: value ? 'active' : 'inactive',
      }),
    proDeviceAdmission: 'unknown',
    setProDeviceAdmission: value =>
      set({ proDeviceAdmission: value, isProDeviceActive: value === 'active' }),
    devProDisabled: false,
    setDevProDisabled: value => set({ devProDisabled: value }),
    proBannerDismissed: false,
    setProBannerDismissed: value => set({ proBannerDismissed: value }),
    desktopPromoDismissed: false,
    setDesktopPromoDismissed: value => set({ desktopPromoDismissed: value }),
    proAhaTriggeredBy: null,
    setProAhaTriggeredBy: value => set({ proAhaTriggeredBy: value }),
  };
}

/**
 * Does this install have Pro access right now?
 *
 * The RULE is hasProAccess in @offgrid/sync, shared with the desktop - two implementations of "is this
 * device still paid for" would eventually disagree about a live device. This only supplies the store's
 * facts to it: what credential exists, and what the roster last said about this device.
 */
export function selectHasProAccess(state: ProAccessSlice): boolean {
  return hasProAccess({
    hasCredential:
      state.hasSavedProCredential || state.hasRegisteredPro || state.isProActive,
    admission: state.proDeviceAdmission,
  });
}
