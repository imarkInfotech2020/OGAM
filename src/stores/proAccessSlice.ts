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
    setProDeviceActive: value => set({ isProDeviceActive: value }),
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
