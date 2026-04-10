import { Platform } from 'react-native';
import { keepLocalCopy } from '@react-native-documents/picker';

function decodePickedUri(uri: string): string {
  try {
    return decodeURIComponent(uri).replace(/^file:\/\//, '');
  } catch {
    return uri;
  }
}

/**
 * Resolves a document picker URI to a local file path safe for native modules.
 *
 * iOS  — mode:'import' already gives a file:// URI, just decode it.
 * Android — mode:'open' gives a content:// URI; keepLocalCopy() copies the
 *            file to the app's documents directory and returns a real path.
 *            Throws if the copy fails so the caller can show a user-facing
 *            error instead of passing a dead URI to the native PDF extractor.
 */
export const resolvePickedFileUri = async (uri: string, fileName: string): Promise<string> => {
  if (Platform.OS === 'android') {
    const copyResult = await keepLocalCopy({
      files: [{ uri, fileName }],
      destination: 'documentDirectory',
    });
    if (copyResult[0]?.status === 'success' && copyResult[0].localUri) {
      return decodePickedUri(copyResult[0].localUri);
    }
    throw new Error('Failed to create a local copy of the document');
  }
  return decodePickedUri(uri);
};
