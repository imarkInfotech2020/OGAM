import { NativeModules } from 'react-native';

/**
 * Keeping the Personal Mesh reachable while Off Grid is not in the foreground.
 *
 * Discovery, the TCP listener and in-flight transfers all die when the OS suspends the app, which
 * makes a "Connected" row a lie the moment the phone goes in a pocket. Android can hold a
 * dataSync foreground service for as long as the mesh is up; iOS cannot, and only grants a short
 * finite grace period.
 *
 * That difference is DECLARED DATA, never a Platform.OS branch in a caller: both Kotlin and Swift
 * satisfy this one contract and report what they can actually do, so the UI renders honest copy from
 * the capability instead of each screen guessing.
 */
export interface MeshResidencyCapabilities {
  /** True when the mesh keeps running indefinitely after the app leaves the foreground. */
  survivesBackground: boolean;
  /**
   * Seconds of background reachability the OS grants, when it is finite.
   *
   * null means unbounded (Android, while the service holds). A number means the mesh goes
   * unreachable after roughly that long (iOS background task grace).
   */
  backgroundGraceSeconds: number | null;
  /** True when the OS shows the user a persistent indicator while residency is held. */
  showsOngoingIndicator: boolean;
}

export interface MeshResidencyBoundary {
  /** Hold background reachability. Idempotent. */
  begin(): Promise<void>;
  /** Release it. Idempotent, and safe to call when residency was never begun. */
  end(): Promise<void>;
  capabilities(): MeshResidencyCapabilities;
}

interface MeshResidencyNativeModule {
  begin(): Promise<void>;
  end(): Promise<void>;
  /** Constants, so capabilities are readable synchronously during a render. */
  getConstants(): {
    survivesBackground: boolean;
    backgroundGraceSeconds: number | null;
    showsOngoingIndicator: boolean;
  };
}

function nativeModule(): MeshResidencyNativeModule | undefined {
  return NativeModules.MeshResidencyModule as
    | MeshResidencyNativeModule
    | undefined;
}

/**
 * What a build without the native module can promise: nothing.
 *
 * Reported rather than thrown so the mesh still runs in the foreground, and the UI still tells the
 * truth about backgrounding.
 */
const NO_RESIDENCY: MeshResidencyCapabilities = {
  survivesBackground: false,
  backgroundGraceSeconds: 0,
  showsOngoingIndicator: false,
};

function normalize(
  constants: ReturnType<MeshResidencyNativeModule['getConstants']> | undefined,
): MeshResidencyCapabilities {
  if (!constants) return NO_RESIDENCY;
  const grace = constants.backgroundGraceSeconds;
  return {
    survivesBackground: constants.survivesBackground === true,
    backgroundGraceSeconds:
      typeof grace === 'number' && Number.isFinite(grace) && grace >= 0
        ? grace
        : null,
    showsOngoingIndicator: constants.showsOngoingIndicator === true,
  };
}

export const nativeMeshResidencyBoundary: MeshResidencyBoundary = {
  async begin(): Promise<void> {
    await nativeModule()?.begin();
  },

  async end(): Promise<void> {
    await nativeModule()?.end();
  },

  capabilities(): MeshResidencyCapabilities {
    const module = nativeModule();
    if (!module) return NO_RESIDENCY;
    try {
      return normalize(module.getConstants());
    } catch {
      return NO_RESIDENCY;
    }
  },
};
