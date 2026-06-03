import RNFS from 'react-native-fs';

type CopyProgressOpts = { knownTotalBytes: number | null; onProgress?: (fraction: number) => void };

function parseSizeInt(size: string | number): number {
  return typeof size === 'string' ? Number.parseInt(size, 10) : size;
}

export async function copyFileWithProgress(
  source: string,
  dest: string,
  { knownTotalBytes, onProgress }: CopyProgressOpts,
): Promise<void> {
  let totalBytes = knownTotalBytes ?? 0;
  if (totalBytes === 0) {
    try {
      const sourceStat = await RNFS.stat(source);
      totalBytes = parseSizeInt(sourceStat.size);
    } catch {
      // stat failed — progress will be indeterminate (stuck at 0%), non-fatal
    }
  }

  let polling = true;

  const pollInterval = setInterval(async () => {
    if (!polling) return;
    try {
      const exists = await RNFS.exists(dest);
      if (exists && totalBytes > 0) {
        const stat = await RNFS.stat(dest);
        const written = parseSizeInt(stat.size);
        const pct = Math.min(written / totalBytes, 0.99);
        onProgress?.(pct);
      }
    } catch {
      // poll errors are non-fatal
    }
  }, 500);

  try {
    await RNFS.copyFile(source, dest);
    polling = false;
    clearInterval(pollInterval);
    onProgress?.(1);
  } catch (error) {
    polling = false;
    clearInterval(pollInterval);
    await RNFS.unlink(dest).catch(() => {});
    throw error;
  }
}
