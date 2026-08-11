/**
 * The platform pieces a shared folder depends on: the native modules, the OS version, the permission
 * dialog, and the system folder picker.
 *
 * All four are things only a device has, and all four are what the Downloads-folder story is ABOUT - Android
 * refuses to grant that folder to a picker at all, so the code has to read it through MediaStore behind a
 * media permission instead. Standing these in lets the two roads (a folder the user picked, and a permission
 * the user granted) both be driven from a test.
 */

import { resetReactNativeBoundary } from './reactNativeBoundary';

export {
  denyPermissions,
  grantPermissions,
  nativeModules,
  permissionsAndroid,
  platform,
} from './reactNativeBoundary';

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

interface PickerState {
  result: unknown;
  failure: unknown;
  calls: unknown[];
}

/** Pinned like the device is, for the same reason: a reloaded module re-evaluates this file. */
const pickerState: PickerState = ((
  globalThis as { __offgridPickerBoundary?: PickerState }
).__offgridPickerBoundary ??= {
  result: undefined,
  failure: undefined,
  calls: [],
});

/** The system folder picker: it either returns a grant, or throws the way the real one does. */
export const picker = {
  errorCodes: { OPERATION_CANCELED },
  isErrorWithCode: (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error,
  calls: pickerState.calls,
  answers(result: unknown): void {
    pickerState.result = result;
  },
  fails(failure: unknown): void {
    pickerState.failure = failure;
  },
  async pickDirectory(options: unknown): Promise<unknown> {
    pickerState.calls.push(options);
    if (pickerState.failure) throw pickerState.failure;
    return pickerState.result;
  },
};

export function resetDirectoryAccessBoundary(): void {
  resetReactNativeBoundary();
  pickerState.result = undefined;
  pickerState.failure = undefined;
  pickerState.calls.length = 0;
}
