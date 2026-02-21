/**
 * Low-level download helper functions extracted from modelManagerDownload
 * to keep each file within the max-lines limit.
 */
import RNFS from 'react-native-fs';
import { DownloadProgress, ModelFile } from '../../types';
import { DownloadProgressCallback } from './types';

type DownloadJob = { jobId: number; cancel: () => void };

export interface MainFileDownloadOpts {
  downloadKey: string;
  downloadUrl: string;
  localPath: string;
  modelId: string;
  file: ModelFile;
  totalSize: number;
  downloadJobs: Map<string, DownloadJob>;
  onProgress: DownloadProgressCallback | undefined;
  initialMmProjBytes: number;
}

export async function downloadMainFile(opts: MainFileDownloadOpts): Promise<void> {
  const { downloadKey, downloadUrl, localPath, modelId, file, totalSize, downloadJobs, onProgress, initialMmProjBytes } = opts;

  const downloadResult = RNFS.downloadFile({
    fromUrl: downloadUrl,
    toFile: localPath,
    background: true,
    discretionary: true,
    cacheable: false,
    progressInterval: 500,
    progressDivider: 1,
    begin: () => {},
    progress: (res) => {
      const progress: DownloadProgress = {
        modelId,
        fileName: file.name,
        bytesDownloaded: res.bytesWritten + initialMmProjBytes,
        totalBytes: totalSize,
        progress: (res.bytesWritten + initialMmProjBytes) / totalSize,
      };
      onProgress?.(progress);
    },
  });

  downloadJobs.set(downloadKey, {
    jobId: downloadResult.jobId,
    cancel: () => RNFS.stopDownload(downloadResult.jobId),
  });

  const result = await downloadResult.promise;
  downloadJobs.delete(downloadKey);

  if (result.statusCode !== 200) {
    await RNFS.unlink(localPath).catch(() => {});
    throw new Error(`Main model download failed with status ${result.statusCode}`);
  }
}

export interface MmProjFileDownloadOpts {
  mmProjDownloadKey: string;
  mmProjFile: NonNullable<ModelFile['mmProjFile']>;
  mmProjLocalPath: string;
  modelId: string;
  totalSize: number;
  mainBytes: number;
  downloadJobs: Map<string, DownloadJob>;
  onProgress: DownloadProgressCallback | undefined;
}

export async function downloadMmProjFile(opts: MmProjFileDownloadOpts): Promise<void> {
  const { mmProjDownloadKey, mmProjFile, mmProjLocalPath, modelId, totalSize, mainBytes, downloadJobs, onProgress } = opts;

  const mmProjDownloadResult = RNFS.downloadFile({
    fromUrl: mmProjFile.downloadUrl,
    toFile: mmProjLocalPath,
    background: true,
    discretionary: true,
    cacheable: false,
    progressInterval: 500,
    progressDivider: 1,
    begin: () => {},
    progress: (res) => {
      const progress: DownloadProgress = {
        modelId,
        fileName: mmProjFile.name,
        bytesDownloaded: mainBytes + res.bytesWritten,
        totalBytes: totalSize,
        progress: (mainBytes + res.bytesWritten) / totalSize,
      };
      onProgress?.(progress);
    },
  });

  downloadJobs.set(mmProjDownloadKey, {
    jobId: mmProjDownloadResult.jobId,
    cancel: () => RNFS.stopDownload(mmProjDownloadResult.jobId),
  });

  const mmProjResult = await mmProjDownloadResult.promise;
  downloadJobs.delete(mmProjDownloadKey);

  if (mmProjResult.statusCode !== 200) {
    await RNFS.unlink(mmProjLocalPath).catch(() => {});
  }
}

export interface MmProjBackgroundOpts {
  file: ModelFile;
  mmProjLocalPath: string;
  modelId: string;
  combinedTotalBytes: number;
  onProgress: DownloadProgressCallback | undefined;
}

export async function downloadMmProjBackground(opts: MmProjBackgroundOpts): Promise<number> {
  const { file, mmProjLocalPath, modelId, combinedTotalBytes, onProgress } = opts;
  if (!file.mmProjFile || !mmProjLocalPath) return 0;

  const mmProjSize = file.mmProjFile.size;
  let mmProjDownloaded = 0;

  const mmProjDownloadResult = RNFS.downloadFile({
    fromUrl: file.mmProjFile.downloadUrl,
    toFile: mmProjLocalPath,
    background: true,
    discretionary: true,
    cacheable: false,
    progressInterval: 500,
    progress: (res) => {
      mmProjDownloaded = res.bytesWritten;
      const progress: DownloadProgress = {
        modelId,
        fileName: `${file.mmProjFile!.name} (vision)`,
        bytesDownloaded: mmProjDownloaded,
        totalBytes: combinedTotalBytes,
        progress: mmProjDownloaded / combinedTotalBytes,
      };
      onProgress?.(progress);
    },
  });
  const mmProjResult = await mmProjDownloadResult.promise;
  if (mmProjResult.statusCode !== 200) {
    await RNFS.unlink(mmProjLocalPath).catch(() => {});
    throw new Error(`mmproj download failed with status ${mmProjResult.statusCode}`);
  }
  return mmProjSize;
}

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
      p => p === item.path || p.startsWith(item.path + '/'),
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
