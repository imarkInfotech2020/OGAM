import {
  errorCodes,
  isErrorWithCode,
  pickDirectory,
} from '@react-native-documents/picker';
import { NativeModules, Platform } from 'react-native';

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

function nativeModule(): SyncDirectorySourceNativeModule {
  const boundary = NativeModules.SyncDirectorySourceModule as
    | SyncDirectorySourceNativeModule
    | undefined;
  if (!boundary) {
    throw new Error('Folder sharing is unavailable on this device.');
  }
  return boundary;
}

export const nativeDirectorySourceBoundary = {
  available(): boolean {
    return NativeModules.SyncDirectorySourceModule !== undefined;
  },

  async authorize(): Promise<string | undefined> {
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
    return nativeModule().enumerate(grant);
  },

  stage(
    grant: string,
    sourceId: string,
    destinationName: string,
  ): Promise<NativeStagedDirectoryFile> {
    return nativeModule().stage(grant, sourceId, destinationName);
  },
};
