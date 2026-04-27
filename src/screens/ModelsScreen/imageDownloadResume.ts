import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { modelManager, backgroundDownloadService } from '../../services';
import { resolveCoreMLModelDir } from '../../utils/coreMLModelUtils';
import { ONNXImageModel } from '../../types';
import { useDownloadStore, DownloadEntry } from '../../stores/downloadStore';
import { ImageDownloadDeps } from './imageDownloadActions';
import { registerAndNotify } from './imageDownloadActions';
import logger from '../../utils/logger';

type ResumeCtx = { entry: DownloadEntry; modelId: string; metadata: Record<string, any>; deps: ImageDownloadDeps };

async function resumeZipDownload(ctx: ResumeCtx): Promise<void> {
  const { entry, modelId, metadata, deps } = ctx;
  const imageModelsDir = modelManager.getImageModelsDirectory();
  const modelDir = `${imageModelsDir}/${modelId}`;
  const zipPath = `${imageModelsDir}/${entry.fileName}`;
  const isCoreml = metadata.imageModelBackend === 'coreml';

  const buildModel = async (dir: string): Promise<ONNXImageModel> => {
    const resolvedDir = isCoreml ? await resolveCoreMLModelDir(dir) : dir;
    return {
      id: modelId, name: metadata.imageModelName, description: metadata.imageModelDescription,
      modelPath: resolvedDir, downloadedAt: new Date().toISOString(),
      size: metadata.imageModelSize, style: metadata.imageModelStyle,
      backend: metadata.imageModelBackend, attentionVariant: metadata.imageModelAttentionVariant,
    };
  };

  if (await RNFS.exists(modelDir)) {
    logger.log(`[ImageDownload] resumeImageDownload zip - model dir exists, registering ${modelId}`);
    await registerAndNotify(deps, { imageModel: await buildModel(modelDir), modelName: metadata.imageModelName });
    return;
  }

  if (await RNFS.exists(zipPath)) {
    if (!(await RNFS.exists(modelDir))) await RNFS.mkdir(modelDir);
    await unzip(zipPath, modelDir);
    await RNFS.unlink(zipPath).catch(() => {});
    logger.log(`[ImageDownload] resumeImageDownload zip - zip found, unzipping ${modelId}`);
    await registerAndNotify(deps, { imageModel: await buildModel(modelDir), modelName: metadata.imageModelName });
    return;
  }

  if (!(await RNFS.exists(imageModelsDir))) await RNFS.mkdir(imageModelsDir);
  await backgroundDownloadService.moveCompletedDownload(entry.downloadId, zipPath);
  if (!(await RNFS.exists(modelDir))) await RNFS.mkdir(modelDir);
  await unzip(zipPath, modelDir);
  await RNFS.unlink(zipPath).catch(() => {});
  logger.log(`[ImageDownload] resumeImageDownload zip - moved from WorkManager, unzipping ${modelId}`);
  await registerAndNotify(deps, { imageModel: await buildModel(modelDir), modelName: metadata.imageModelName });
}

async function resumeMultifileDownload(ctx: ResumeCtx): Promise<void> {
  const { entry, modelId, metadata, deps } = ctx;
  const modelDir = `${modelManager.getImageModelsDirectory()}/${modelId}`;
  if (!(await RNFS.exists(modelDir))) {
    logger.warn(`[ImageDownload] resumeImageDownload multifile - model dir missing, marking failed ${modelId}`);
    useDownloadStore.getState().setStatus(entry.downloadId, 'failed', { message: 'Download files missing. Please retry.' });
    return;
  }
  const imageModel: ONNXImageModel = {
    id: modelId, name: metadata.imageModelName, description: metadata.imageModelDescription,
    modelPath: modelDir, downloadedAt: new Date().toISOString(),
    size: metadata.imageModelSize, style: metadata.imageModelStyle,
    backend: metadata.imageModelBackend,
  };
  logger.log(`[ImageDownload] resumeImageDownload multifile - registering ${modelId}`);
  await registerAndNotify(deps, { imageModel, modelName: metadata.imageModelName });
}

export async function resumeImageDownload(entry: DownloadEntry, deps: ImageDownloadDeps): Promise<void> {
  const modelId = entry.modelId.replace('image:', '');
  logger.log(`[ImageDownload] resumeImageDownload modelId=${modelId} downloadId=${entry.downloadId}`);

  let metadata: Record<string, any> | null = null;
  try { metadata = entry.metadataJson ? JSON.parse(entry.metadataJson) : null; } catch { /* ignore */ }

  if (!metadata?.imageDownloadType) {
    logger.warn(`[ImageDownload] resumeImageDownload no metadata for ${modelId} - marking failed`);
    useDownloadStore.getState().setStatus(entry.downloadId, 'failed', { message: 'Could not resume: missing download metadata' });
    return;
  }

  try {
    if (metadata.imageDownloadType === 'zip') {
      await resumeZipDownload({ entry, modelId, metadata, deps });
    } else if (metadata.imageDownloadType === 'multifile') {
      await resumeMultifileDownload({ entry, modelId, metadata, deps });
    }
  } catch (error: any) {
    logger.error(`[ImageDownload] resumeImageDownload failed for ${modelId}`, error?.message);
    useDownloadStore.getState().setStatus(entry.downloadId, 'failed', { message: error?.message || 'Could not resume download after restart' });
  }
}
