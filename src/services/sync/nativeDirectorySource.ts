import {
  errorCodes,
  isErrorWithCode,
  pickDirectory,
} from '@react-native-documents/picker';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/**
 * The grant Android uses for its Downloads folder, where there is no folder grant to hold.
 *
 * Android 11 stopped letting the file picker grant the Download directory at all - it answers "For
 * your safety, share another folder" - so on Android the folder is read through MediaStore with a
 * media permission instead. The shared directory source only ever treats a grant as an opaque string,
 * so this sentinel travels through it unchanged and no rule in the engine has to know the difference.
 */
export const MEDIA_STORE_DOWNLOADS_GRANT = 'mediastore:downloads';

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

interface SyncDownloadsNativeModule {
  hasPermission(): Promise<boolean>;
  enumerate(): Promise<NativeDirectoryCandidate[]>;
  stage(
    sourceId: string,
    destinationName: string,
  ): Promise<NativeStagedDirectoryFile>;
}

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

export const nativeDirectorySourceBoundary = {
  available(): boolean {
    return (
      NativeModules.SyncDirectorySourceModule !== undefined ||
      downloadsModule() !== undefined
    );
  },

  async authorize(): Promise<string | undefined> {
    // Android: a media permission instead of a folder, because the folder cannot be granted.
    if (Platform.OS === 'android' && downloadsModule()) {
      return authorizeMediaStoreDownloads();
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
