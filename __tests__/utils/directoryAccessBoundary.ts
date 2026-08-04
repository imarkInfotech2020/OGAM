/**
 * The platform pieces a shared folder depends on: the native modules, the OS version, the permission
 * dialog, and the system folder picker.
 *
 * All four are things only a device has, and all four are what the Downloads-folder story is ABOUT - Android
 * refuses to grant that folder to a picker at all, so the code has to read it through MediaStore behind a
 * media permission instead. Standing these in lets the two roads (a folder the user picked, and a permission
 * the user granted) both be driven from a test.
 */

export interface DirectoryCandidate {
  sourceId: string;
  name: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  modifiedAt: number;
}

export interface DownloadsAccessState {
  media: boolean;
  allFiles: boolean;
  canRequestAllFiles: boolean;
}

export class DirectorySourceFake {
  readonly enumerated: string[] = [];
  readonly staged: Array<[string, string, string]> = [];
  candidates: DirectoryCandidate[] = [];

  async enumerate(grant: string): Promise<DirectoryCandidate[]> {
    this.enumerated.push(grant);
    return this.candidates;
  }

  async stage(grant: string, sourceId: string, destinationName: string) {
    this.staged.push([grant, sourceId, destinationName]);
    return {
      filePath: `/docs/staged/${destinationName}`,
      name: destinationName,
    };
  }
}

export class DownloadsFake {
  granted = false;
  state: DownloadsAccessState = {
    media: false,
    allFiles: false,
    canRequestAllFiles: true,
  };
  accessStateFailure: Error | undefined;
  allFilesOutcome = true;
  readonly calls: string[] = [];
  candidates: DirectoryCandidate[] = [];
  readonly staged: Array<[string, string]> = [];

  async hasPermission(): Promise<boolean> {
    this.calls.push('hasPermission');
    return this.granted;
  }

  async accessState(): Promise<DownloadsAccessState> {
    this.calls.push('accessState');
    if (this.accessStateFailure) throw this.accessStateFailure;
    return this.state;
  }

  async requestAllFilesAccess(): Promise<boolean> {
    this.calls.push('requestAllFilesAccess');
    this.state = { ...this.state, allFiles: this.allFilesOutcome };
    return this.allFilesOutcome;
  }

  async enumerate(): Promise<DirectoryCandidate[]> {
    this.calls.push('enumerate');
    return this.candidates;
  }

  async stage(sourceId: string, destinationName: string) {
    this.staged.push([sourceId, destinationName]);
    return {
      filePath: `/docs/staged/${destinationName}`,
      name: destinationName,
    };
  }
}

export const OPERATION_CANCELED = 'OPERATION_CANCELED';

const GRANTED = 'granted';

interface BoundaryState {
  nativeModules: {
    SyncDirectorySourceModule?: DirectorySourceFake;
    SyncDownloadsModule?: DownloadsFake;
  };
  platform: { OS: string; Version: string | number };
  permissions: { outcomes: Record<string, string>; requested: string[][] };
  pickerState: { result: unknown; failure: unknown; calls: unknown[] };
}

/**
 * One device, however many times this file is evaluated.
 *
 * The code under test remembers the access it holds in module state, so a test that wants a device which has
 * never asked has to load it fresh - and a fresh module registry re-evaluates this file too, along with the
 * `react-native` mock that reads from it. Hanging the device off the global keeps the reloaded module looking
 * at the same one the test is configuring.
 */
const state: BoundaryState = ((
  globalThis as { __offgridDirectoryBoundary?: BoundaryState }
).__offgridDirectoryBoundary ??= {
  nativeModules: {},
  platform: { OS: 'android', Version: 33 },
  permissions: { outcomes: {}, requested: [] },
  pickerState: { result: undefined, failure: undefined, calls: [] },
});

export const nativeModules = state.nativeModules;

/** Mutable: the OS and its version decide which permissions are even askable. */
export const platform = state.platform;

export const permissionsAndroid = {
  RESULTS: {
    GRANTED,
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  /** What the system dialog will answer, keyed by permission. */
  outcomes: state.permissions.outcomes,
  requested: state.permissions.requested,
  async requestMultiple(
    permissions: string[],
  ): Promise<Record<string, string>> {
    state.permissions.requested.push(permissions);
    return Object.fromEntries(
      permissions.map(permission => [
        permission,
        state.permissions.outcomes[permission] ?? 'denied',
      ]),
    );
  },
};

/** The system folder picker: it either returns a grant, or throws the way the real one does. */
export const picker = {
  errorCodes: { OPERATION_CANCELED },
  isErrorWithCode: (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error,
  calls: state.pickerState.calls,
  answers(result: unknown): void {
    state.pickerState.result = result;
  },
  fails(failure: unknown): void {
    state.pickerState.failure = failure;
  },
  async pickDirectory(options: unknown): Promise<unknown> {
    state.pickerState.calls.push(options);
    if (state.pickerState.failure) throw state.pickerState.failure;
    return state.pickerState.result;
  },
};

export function resetDirectoryAccessBoundary(): void {
  delete state.nativeModules.SyncDirectorySourceModule;
  delete state.nativeModules.SyncDownloadsModule;
  state.platform.OS = 'android';
  state.platform.Version = 33;
  for (const key of Object.keys(state.permissions.outcomes)) {
    delete state.permissions.outcomes[key];
  }
  state.permissions.requested.length = 0;
  state.pickerState.result = undefined;
  state.pickerState.failure = undefined;
  state.pickerState.calls.length = 0;
}

/** What the system dialog will answer for these permissions. */
export function grantPermissions(...permissions: string[]): void {
  for (const permission of permissions) {
    state.permissions.outcomes[permission] = GRANTED;
  }
}

export function denyPermissions(
  outcomes: Record<string, 'denied' | 'never_ask_again'>,
): void {
  Object.assign(state.permissions.outcomes, outcomes);
}
