/**
 * Low-level download helper functions extracted from modelManagerDownload
 * to keep each file within the max-lines limit.
 */
import RNFS from 'react-native-fs';

export async function getOrphanedTextFiles(
  modelsDir: string,
  modelsGetter: () => Promise<import('../../types').DownloadedModel[]>,
): Promise<Array<{ name: string; path: string; size: number }>> {
  const orphaned: Array<{ name: string; path: string; size: number }> = [];
  const modelsDirExists = await RNFS.exists(modelsDir);
  if (!modelsDirExists) return orphaned;

  const files = await RNFS.readDir(modelsDir);
  const models = await modelsGetter();

  const trackedPaths = new Set<string>();
  for (const model of models) {
    trackedPaths.add(model.filePath);
    if (model.mmProjPath) trackedPaths.add(model.mmProjPath);
  }

  for (const file of files) {
    if (file.isFile() && !trackedPaths.has(file.path)) {
      orphaned.push({
        name: file.name,
        path: file.path,
        size: typeof file.size === 'string' ? parseInt(file.size, 10) : file.size,
      });
    }
  }

  return orphaned;
}

export async function getOrphanedImageDirs(
  imageModelsDir: string,
  imageModelsGetter: () => Promise<import('../../types').ONNXImageModel[]>,
): Promise<Array<{ name: string; path: string; size: number }>> {
  const orphaned: Array<{ name: string; path: string; size: number }> = [];
  const imageDirExists = await RNFS.exists(imageModelsDir);
  if (!imageDirExists) return orphaned;

  const items = await RNFS.readDir(imageModelsDir);
  const imageModels = await imageModelsGetter();
  const trackedImagePaths = imageModels.map(m => m.modelPath);

  for (const item of items) {
    // An item is tracked if its path matches a stored modelPath exactly OR if
    // a stored modelPath is nested inside this directory (CoreML models store a
    // compiled subdirectory as modelPath while the parent dir also contains
    // tokenizer files — the parent should not be flagged as an orphan).
    const isTracked = trackedImagePaths.some(
      p => p === item.path || p.startsWith(`${item.path}/`),
    );
    if (isTracked) continue;

    let totalSize = 0;
    if (item.isDirectory()) {
      try {
        const dirFiles = await RNFS.readDir(item.path);
        for (const f of dirFiles) {
          if (f.isFile()) {
            totalSize += typeof f.size === 'string' ? parseInt(f.size, 10) : f.size;
          }
        }
      } catch {
        // Can't read directory, use 0
      }
    } else {
      totalSize = typeof item.size === 'string' ? parseInt(item.size, 10) : item.size;
    }

    orphaned.push({ name: item.name, path: item.path, size: totalSize });
  }

  return orphaned;
}
