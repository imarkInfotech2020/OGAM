import {
  errorCodes,
  isErrorWithCode,
  pickDirectory,
} from '@react-native-documents/picker';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { AmbientDirectoryAccessCopy } from '@offgrid/sync';

/**
 * The grant Android uses for its Downloads folder, where there is no folder grant to hold.
 *
 * Android 11 stopped letting the file picker grant the Download directory at all - it answers "For
 * your safety, share another folder" - so on Android the folder is read through MediaStore with a
 * media permission instead. The shared directory source only ever treats a grant as an opaque string,
 * so this sentinel travels through it unchanged and no rule in the engine has to know the difference.
 */
const MEDIA_STORE_DOWNLOADS_GRANT = 'mediastore:downloads';

export interface NativeDirectoryCandidate {
  sourceId: string;
  name: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  modifiedAt: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface NativeStagedDirectoryFile {
  filePath: string;
  name: string;
}

interface SyncDirectorySourceNativeModule {
  enumerate(grant: string): Promise<NativeDirectoryCandidate[]>;
  stage(
    grant: string,
    sourceId: string,
    destinationName: string,
  ): Promise<NativeStagedDirectoryFile>;
}

interface DownloadsAccessState {
  media: boolean;
  allFiles: boolean;
  canRequestAllFiles: boolean;
}

interface SyncDownloadsNativeModule {
  hasPermission(): Promise<boolean>;
  accessState(): Promise<DownloadsAccessState>;
  requestAllFilesAccess(): Promise<boolean>;
  enumerate(): Promise<NativeDirectoryCandidate[]>;
  stage(
    sourceId: string,
    destinationName: string,
  ): Promise<NativeStagedDirectoryFile>;
}

/**
 * The access this device holds, remembered because the words on screen are chosen while rendering and
 * cannot wait for the native call. Refreshed when the user acts and when the app comes back.
 */
let downloadsAccess: DownloadsAccessState | undefined;

function nativeModule(): SyncDirectorySourceNativeModule {
  const boundary = NativeModules.SyncDirectorySourceModule as
    | SyncDirectorySourceNativeModule
    | undefined;
  if (!boundary) {
    throw new Error('Folder sharing is unavailable on this device.');
  }
  return boundary;
}

function downloadsModule(): SyncDownloadsNativeModule | undefined {
  return NativeModules.SyncDownloadsModule as
    | SyncDownloadsNativeModule
    | undefined;
}

/** Whether this grant is read through MediaStore rather than a folder the user picked. */
function isMediaStoreGrant(grant: string): boolean {
  return grant === MEDIA_STORE_DOWNLOADS_GRANT;
}

async function authorizeMediaStoreDownloads(): Promise<string | undefined> {
  const boundary = downloadsModule();
  if (!boundary) return undefined;
  if (await boundary.hasPermission()) return MEDIA_STORE_DOWNLOADS_GRANT;
  const permissions =
    Number(Platform.Version) >= 33
      ? [
          'android.permission.READ_MEDIA_IMAGES',
          'android.permission.READ_MEDIA_VIDEO',
        ]
      : ['android.permission.READ_EXTERNAL_STORAGE'];
  const results = await PermissionsAndroid.requestMultiple(
    permissions as Parameters<typeof PermissionsAndroid.requestMultiple>[0],
  );
  // Either one is enough to see something: photos granted but not video should still share pictures.
  const anyGranted = Object.values(results).some(
    result => result === PermissionsAndroid.RESULTS.GRANTED,
  );
  return anyGranted ? MEDIA_STORE_DOWNLOADS_GRANT : undefined;
}

/**
 * What the Downloads card should say on this device, given the access it actually holds.
 *
 * Android is the only host where the folder cannot be picked, so it is the only host that returns
 * anything here: everywhere else the shared source keeps its folder-grant wording. The point is that
 * the button never promises a picker that will not appear, and never claims to share a whole folder
 * when the system is only showing us the pictures in it.
 */
function downloadsAccessCopy(): AmbientDirectoryAccessCopy | undefined {
  if (Platform.OS !== 'android' || !downloadsModule()) return undefined;
  const access = downloadsAccess;
  if (access?.allFiles) {
    return {
      configureLabel: 'Start watching',
      description:
        'New files saved to your Downloads folder go to your paired devices while the app is open.',
    };
  }
  return {
    configureLabel: access?.media ? 'Start watching' : 'Allow media access',
    description:
      'New pictures and video saved to your Downloads folder go to your paired devices while the app is open. Android does not let apps pick this folder, so Off Grid AI asks for media access instead.',
    limitation:
      'Android only shows apps the pictures and video in Downloads. Sharing PDFs and other downloads needs all files access.',
    ...(access?.canRequestAllFiles !== false
      ? { upgrade: { label: 'Allow all files' } }
      : {}),
  };
}

async function refreshDownloadsAccess(): Promise<void> {
  const boundary = downloadsModule();
  if (!boundary?.accessState) return;
  try {
    downloadsAccess = await boundary.accessState();
  } catch {
    // An unreadable access state is not a failure of the folder: the copy simply stays as it was.
  }
}

export const nativeDirectorySourceBoundary = {
  available(): boolean {
    return (
      NativeModules.SyncDirectorySourceModule !== undefined ||
      downloadsModule() !== undefined
    );
  },

  access: downloadsAccessCopy,

  /** Refresh what access this device holds, so the card describes the present, not the last tap. */
  refreshAccess: refreshDownloadsAccess,

  /** Ask for all-files access, the only way Android will show a downloaded PDF to another app. */
  async upgrade(): Promise<void> {
    const boundary = downloadsModule();
    if (!boundary?.requestAllFilesAccess) return;
    await boundary.requestAllFilesAccess();
    await refreshDownloadsAccess();
  },

  async authorize(): Promise<string | undefined> {
    // Android: a media permission instead of a folder, because the folder cannot be granted.
    if (Platform.OS === 'android' && downloadsModule()) {
      const grant = await authorizeMediaStoreDownloads();
      await refreshDownloadsAccess();
      return grant;
    }
    try {
      const result = await pickDirectory({ requestLongTermAccess: true });
      if (Platform.OS === 'ios') {
        if (result.bookmarkStatus !== 'success') {
          throw new Error(result.bookmarkError);
        }
        return result.bookmark;
      }
      return result.uri;
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return undefined;
      }
      throw error;
    }
  },

  enumerate(grant: string): Promise<NativeDirectoryCandidate[]> {
    const downloads = downloadsModule();
    if (isMediaStoreGrant(grant) && downloads) return downloads.enumerate();
    return nativeModule().enumerate(grant);
  },

  stage(
    grant: string,
    sourceId: string,
    destinationName: string,
  ): Promise<NativeStagedDirectoryFile> {
    const downloads = downloadsModule();
    if (isMediaStoreGrant(grant) && downloads) {
      return downloads.stage(sourceId, destinationName);
    }
    return nativeModule().stage(grant, sourceId, destinationName);
  },
};
