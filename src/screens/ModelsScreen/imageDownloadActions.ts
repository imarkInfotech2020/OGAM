/**
 * Standalone async image download handlers - no hooks.
 * All download state flows through useDownloadStore via the stable
 * image:<id> modelKey. The store is the single source of truth.
 */
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { showAlert, hideAlert, AlertState } from '../../components/CustomAlert';
import { modelManager, hardwareService, backgroundDownloadService } from '../../services';
import { resolveCoreMLModelDir, downloadCoreMLTokenizerFiles } from '../../utils/coreMLModelUtils';
import { getUserFacingDownloadMessage } from '../../utils/downloadErrors';
import { ONNXImageModel } from '../../types';
import { useDownloadStore, isActiveStatus } from '../../stores/downloadStore';
import { makeImageModelKey } from '../../utils/modelKey';
import { ImageModelDescriptor } from './types';

export interface ImageDownloadDeps {
  addDownloadedImageModel: (m: ONNXImageModel) => void;
  activeImageModelId: string | null;
  setActiveImageModelId: (id: string) => void;
  setAlertState: (s: AlertState) => void;
  /** When false, skip auto-load so the onboarding spotlight can guide the user to load manually. */
  triedImageGen: boolean;
}

interface ImageMetadata {
  imageDownloadType: 'zip' | 'multifile';
  imageModelName: string;
  imageModelDescription: string;
  imageModelSize: number;
  imageModelStyle?: string;
  imageModelBackend?: 'mnn' | 'qnn' | 'coreml';
  imageModelRepo?: string;
  imageModelAttentionVariant?: string;
}

type MultifileRuntime = {
  cancelled: boolean;
  currentDownloadId?: string;
};

const activeMultifileDownloads = new Map<string, MultifileRuntime>();
const USER_CANCELLED_ERROR = 'user_cancelled';

/** Build a synthetic downloadId for multi-file flows that don't go through WorkManager. */
function makeMultifileId(modelId: string): string {
  return `image-multi:${modelId}`;
}

function startMultifileRuntime(modelId: string): MultifileRuntime {
  const runtime: MultifileRuntime = { cancelled: false };
  activeMultifileDownloads.set(modelId, runtime);
  return runtime;
}

function clearMultifileRuntime(modelId: string) {
  activeMultifileDownloads.delete(modelId);
}

function isCancelledError(error: unknown): boolean {
  return error instanceof Error && error.message === USER_CANCELLED_ERROR;
}

function assertNotCancelled(modelId: string, runtime: MultifileRuntime) {
  const stillVisible = !!useDownloadStore.getState().downloads[makeImageModelKey(modelId)];
  if (runtime.cancelled || !stillVisible) {
    runtime.cancelled = true;
    throw new Error(USER_CANCELLED_ERROR);
  }
}

function wireCurrentDownloadPromise(downloadIdPromise: Promise<string> | undefined, runtime: MultifileRuntime) {
  if (!downloadIdPromise) return;
  downloadIdPromise.then((downloadId) => {
    runtime.currentDownloadId = downloadId;
    if (runtime.cancelled) {
      backgroundDownloadService.cancelDownload(downloadId).catch(() => {});
    }
  }).catch(() => {});
}

export async function cancelSyntheticImageDownload(modelId: string): Promise<void> {
  const runtime = activeMultifileDownloads.get(modelId);
  if (!runtime) return;
  runtime.cancelled = true;
  if (runtime.currentDownloadId) {
    await backgroundDownloadService.cancelDownload(runtime.currentDownloadId).catch(() => {});
  }
}

/** Remove the entry from the store. Use after register-and-notify or on error. */
function removeStoreEntry(modelId: string) {
  useDownloadStore.getState().remove(makeImageModelKey(modelId));
}

/** Register a downloaded image model, activate if first, then cleanup + alert. */
export async function registerAndNotify(
  deps: ImageDownloadDeps,
  opts: { imageModel: ONNXImageModel; modelName: string },
) {
  const { imageModel, modelName } = opts;
  await modelManager.addDownloadedImageModel(imageModel);
  deps.addDownloadedImageModel(imageModel);
  // Auto-load the first image model unless the onboarding spotlight flow is
  // still active - Step 13 needs activeImageModelId to be null so the
  // "Load your image model" spotlight can fire on HomeScreen.
  if (!deps.activeImageModelId && deps.triedImageGen) deps.setActiveImageModelId(imageModel.id);
  removeStoreEntry(imageModel.id);
  deps.setAlertState(showAlert('Success', `${modelName} downloaded successfully!`));
}

/** Add (or refuse-add) an image entry to the store. Returns true if a new entry was created. */
function addImageEntry(opts: {
  modelId: string;
  downloadId: string;
  fileName: string;
  totalBytes: number;
  metadata: ImageMetadata;
}): boolean {
  const { modelId, downloadId, fileName, totalBytes, metadata } = opts;
  const modelKey = makeImageModelKey(modelId);
  const existing = useDownloadStore.getState().downloads[modelKey];
  if (existing && isActiveStatus(existing.status)) return false;
  if (existing) {
    // Failed/etc. entry from a prior attempt - reuse logical record.
    useDownloadStore.getState().retryEntry(modelKey, downloadId);
    return true;
  }
  useDownloadStore.getState().add({
    modelKey,
    downloadId,
    modelId: `image:${modelId}`,
    fileName,
    quantization: '',
    modelType: 'image',
    status: 'pending',
    bytesDownloaded: 0,
    totalBytes,
    combinedTotalBytes: totalBytes,
    progress: 0,
    createdAt: Date.now(),
    metadataJson: JSON.stringify(metadata),
  });
  return true;
}

/** Wire complete + error listeners for a zip-style download. */
function wireZipListeners(
  ctx: { downloadId: string; modelId: string; deps: ImageDownloadDeps },
  onCompleteWork: () => Promise<void>,
) {
  const { downloadId, modelId, deps } = ctx;
  const unsubComplete = backgroundDownloadService.onComplete(downloadId, async () => {
    unsubComplete(); unsubError();
    try { await onCompleteWork(); } catch (e: any) {
      deps.setAlertState(showAlert('Download Failed', getUserFacingDownloadMessage(e?.message || 'Failed to process model')));
      useDownloadStore.getState().setStatus(downloadId, 'failed', { message: e?.message || 'Failed to process model' });
    }
  });
  const unsubError = backgroundDownloadService.onError(downloadId, (ev) => {
    unsubComplete(); unsubError();
    deps.setAlertState(showAlert('Download Failed', getUserFacingDownloadMessage(ev.reason)));
    // useDownloads at app root has already routed this to setStatus('failed').
    // Keep the entry visible so the user can retry/remove. No removeStoreEntry here.
    void modelId;
  });
}

/** HuggingFace multi-file download. Each file goes through downloadFileTo sequentially. */
export async function downloadHuggingFaceModel(
  modelInfo: ImageModelDescriptor,
  deps: ImageDownloadDeps,
): Promise<void> {
  if (!modelInfo.huggingFaceRepo || !modelInfo.huggingFaceFiles) {
    deps.setAlertState(showAlert('Error', 'Invalid HuggingFace model configuration'));
    return;
  }
  const syntheticId = makeMultifileId(modelInfo.id);
  const created = addImageEntry({
    modelId: modelInfo.id,
    downloadId: syntheticId,
    fileName: modelInfo.id,
    totalBytes: modelInfo.size,
    metadata: {
      imageDownloadType: 'multifile',
      imageModelName: modelInfo.name,
      imageModelDescription: modelInfo.description,
      imageModelSize: modelInfo.size,
      imageModelStyle: modelInfo.style,
      imageModelBackend: modelInfo.backend,
      imageModelRepo: modelInfo.huggingFaceRepo,
    },
  });
  if (!created) return;
  const runtime = startMultifileRuntime(modelInfo.id);
  try {
    const imageModelsDir = modelManager.getImageModelsDirectory();
    const modelDir = `${imageModelsDir}/${modelInfo.id}`;
    if (!(await RNFS.exists(imageModelsDir))) await RNFS.mkdir(imageModelsDir);
    if (!(await RNFS.exists(modelDir))) await RNFS.mkdir(modelDir);

    const files = modelInfo.huggingFaceFiles;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    let downloadedSize = 0;
    for (const file of files) {
      assertNotCancelled(modelInfo.id, runtime);
      const fileUrl = `https://huggingface.co/${modelInfo.huggingFaceRepo}/resolve/main/${file.path}`;
      const filePath = `${modelDir}/${file.path}`;
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (!(await RNFS.exists(fileDir))) await RNFS.mkdir(fileDir);

      const tempFileName = `${modelInfo.id}_${file.path.replaceAll('/', '_')}`;
      const capturedDownloadedSize = downloadedSize;
      const { downloadIdPromise, promise } = backgroundDownloadService.downloadFileTo({
        params: { url: fileUrl, fileName: tempFileName, modelId: `image:${modelInfo.id}`, totalBytes: file.size },
        destPath: filePath,
        onProgress: (bytesDownloaded) => {
          if (runtime.cancelled) return;
          const totalDownloaded = capturedDownloadedSize + bytesDownloaded;
          useDownloadStore.getState().updateProgress(syntheticId, totalDownloaded, totalSize);
        },
      });
      wireCurrentDownloadPromise(downloadIdPromise, runtime);
      await promise;
      runtime.currentDownloadId = undefined;
      downloadedSize += file.size;
      useDownloadStore.getState().updateProgress(syntheticId, downloadedSize, totalSize);
    }
    assertNotCancelled(modelInfo.id, runtime);
    useDownloadStore.getState().setProcessing(syntheticId);
    assertNotCancelled(modelInfo.id, runtime);
    const imageModel: ONNXImageModel = {
      id: modelInfo.id, name: modelInfo.name, description: modelInfo.description,
      modelPath: modelDir, downloadedAt: new Date().toISOString(),
      size: modelInfo.size, style: modelInfo.style, backend: modelInfo.backend,
    };
    await registerAndNotify(deps, { imageModel, modelName: modelInfo.name });
  } catch (error: any) {
    if (isCancelledError(error)) {
      try {
        const dir = `${modelManager.getImageModelsDirectory()}/${modelInfo.id}`;
        if (await RNFS.exists(dir)) await RNFS.unlink(dir);
      } catch { /* ignore cleanup errors */ }
      return;
    }
    deps.setAlertState(showAlert('Download Failed', getUserFacingDownloadMessage(error?.message)));
    useDownloadStore.getState().setStatus(syntheticId, 'failed', {
      message: error?.message || 'Multi-file download failed',
    });
    try {
      const dir = `${modelManager.getImageModelsDirectory()}/${modelInfo.id}`;
      if (await RNFS.exists(dir)) await RNFS.unlink(dir);
    } catch { /* ignore cleanup errors */ }
  } finally {
    clearMultifileRuntime(modelInfo.id);
  }
}

/** CoreML multi-file download (one file per blob in coremlFiles). */
export async function downloadCoreMLMultiFile(
  modelInfo: ImageModelDescriptor,
  deps: ImageDownloadDeps,
): Promise<void> {
  if (!modelInfo.coremlFiles || modelInfo.coremlFiles.length === 0) return;

  const syntheticId = makeMultifileId(modelInfo.id);
  const created = addImageEntry({
    modelId: modelInfo.id,
    downloadId: syntheticId,
    fileName: modelInfo.id,
    totalBytes: modelInfo.size,
    metadata: {
      imageDownloadType: 'multifile',
      imageModelName: modelInfo.name,
      imageModelDescription: modelInfo.description,
      imageModelSize: modelInfo.size,
      imageModelStyle: modelInfo.style,
      imageModelBackend: modelInfo.backend,
      imageModelRepo: modelInfo.repo,
      imageModelAttentionVariant: modelInfo.attentionVariant,
    },
  });
  if (!created) return;
  const runtime = startMultifileRuntime(modelInfo.id);

  try {
    const imageModelsDir = modelManager.getImageModelsDirectory();
    const modelDir = `${imageModelsDir}/${modelInfo.id}`;
    if (!(await RNFS.exists(imageModelsDir))) await RNFS.mkdir(imageModelsDir);
    if (!(await RNFS.exists(modelDir))) await RNFS.mkdir(modelDir);

    const files = modelInfo.coremlFiles;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    let downloadedSize = 0;
    for (const file of files) {
      assertNotCancelled(modelInfo.id, runtime);
      const filePath = `${modelDir}/${file.relativePath}`;
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (!(await RNFS.exists(fileDir))) await RNFS.mkdir(fileDir);
      const tempFileName = `${modelInfo.id}_${file.relativePath.replaceAll('/', '_')}`;
      const capturedDownloadedSize = downloadedSize;
      const { downloadIdPromise, promise } = backgroundDownloadService.downloadFileTo({
        params: { url: file.downloadUrl, fileName: tempFileName, modelId: `image:${modelInfo.id}`, totalBytes: file.size },
        destPath: filePath,
        onProgress: (bytesDownloaded) => {
          if (runtime.cancelled) return;
          const totalDownloaded = capturedDownloadedSize + bytesDownloaded;
          useDownloadStore.getState().updateProgress(syntheticId, totalDownloaded, totalSize);
        },
      });
      wireCurrentDownloadPromise(downloadIdPromise, runtime);
      await promise;
      runtime.currentDownloadId = undefined;
      downloadedSize += file.size;
      useDownloadStore.getState().updateProgress(syntheticId, downloadedSize, totalSize);
    }
    assertNotCancelled(modelInfo.id, runtime);
    useDownloadStore.getState().setProcessing(syntheticId);
    assertNotCancelled(modelInfo.id, runtime);
    const resolvedModelDir = await resolveCoreMLModelDir(modelDir);
    const imageModel: ONNXImageModel = {
      id: modelInfo.id, name: modelInfo.name, description: modelInfo.description,
      modelPath: resolvedModelDir, downloadedAt: new Date().toISOString(),
      size: modelInfo.size, style: modelInfo.style, backend: modelInfo.backend,
      attentionVariant: modelInfo.attentionVariant,
    };
    await registerAndNotify(deps, { imageModel, modelName: modelInfo.name });
    if (modelInfo.repo) downloadCoreMLTokenizerFiles(resolvedModelDir, modelInfo.repo).catch(() => {});
  } catch (error: any) {
    if (isCancelledError(error)) {
      try {
        const dir = `${modelManager.getImageModelsDirectory()}/${modelInfo.id}`;
        if (await RNFS.exists(dir)) await RNFS.unlink(dir);
      } catch { /* ignore cleanup errors */ }
      return;
    }
    deps.setAlertState(showAlert('Download Failed', getUserFacingDownloadMessage(error?.message)));
    useDownloadStore.getState().setStatus(syntheticId, 'failed', {
      message: error?.message || 'CoreML download failed',
    });
    try {
      const dir = `${modelManager.getImageModelsDirectory()}/${modelInfo.id}`;
      if (await RNFS.exists(dir)) await RNFS.unlink(dir);
    } catch { /* ignore cleanup errors */ }
  } finally {
    clearMultifileRuntime(modelInfo.id);
  }
}

export async function proceedWithDownload(
  modelInfo: ImageModelDescriptor,
  deps: ImageDownloadDeps,
): Promise<void> {
  if (modelInfo.huggingFaceRepo && modelInfo.huggingFaceFiles) {
    await downloadHuggingFaceModel(modelInfo, deps);
    return;
  }
  if (modelInfo.coremlFiles && modelInfo.coremlFiles.length > 0) {
    await downloadCoreMLMultiFile(modelInfo, deps);
    return;
  }

  // Zip flow: native WorkManager handles the download. useDownloads at app
  // root routes progress/error events to the store automatically. We only
  // wire the completion to run the zip-extract finalization.
  const fileName = `${modelInfo.id}.zip`;
  const metadata: ImageMetadata = {
    imageDownloadType: 'zip',
    imageModelName: modelInfo.name,
    imageModelDescription: modelInfo.description,
    imageModelSize: modelInfo.size,
    imageModelStyle: modelInfo.style,
    imageModelBackend: modelInfo.backend,
    imageModelAttentionVariant: modelInfo.attentionVariant,
  };
  const existing = useDownloadStore.getState().downloads[makeImageModelKey(modelInfo.id)];
  if (existing && isActiveStatus(existing.status)) return;
  try {
    const downloadInfo = await backgroundDownloadService.startDownload({
      url: modelInfo.downloadUrl, fileName, modelId: `image:${modelInfo.id}`,
      modelKey: makeImageModelKey(modelInfo.id),
      modelType: 'image',
      totalBytes: modelInfo.size,
      metadataJson: JSON.stringify(metadata),
    });
    const created = addImageEntry({
      modelId: modelInfo.id,
      downloadId: downloadInfo.downloadId,
      fileName,
      totalBytes: modelInfo.size,
      metadata,
    });
    if (!created) {
      // Existing active entry blocked the start. Cancel the just-started
      // native download to avoid orphan rows.
      backgroundDownloadService.cancelDownload(downloadInfo.downloadId).catch(() => {});
      return;
    }
    wireZipListeners({ downloadId: downloadInfo.downloadId, modelId: modelInfo.id, deps }, async () => {
      const imageModelsDir = modelManager.getImageModelsDirectory();
      const zipPath = `${imageModelsDir}/${fileName}`;
      const modelDir = `${imageModelsDir}/${modelInfo.id}`;
      try {
        useDownloadStore.getState().setProcessing(downloadInfo.downloadId);
        if (!(await RNFS.exists(imageModelsDir))) await RNFS.mkdir(imageModelsDir);
        await backgroundDownloadService.moveCompletedDownload(downloadInfo.downloadId, zipPath);
        if (!(await RNFS.exists(modelDir))) await RNFS.mkdir(modelDir);
        await unzip(zipPath, modelDir);
        const resolvedModelDir = modelInfo.backend === 'coreml' ? await resolveCoreMLModelDir(modelDir) : modelDir;
        await RNFS.unlink(zipPath).catch(() => {});
        const imageModel: ONNXImageModel = {
          id: modelInfo.id, name: modelInfo.name, description: modelInfo.description,
          modelPath: resolvedModelDir, downloadedAt: new Date().toISOString(), size: modelInfo.size, style: modelInfo.style,
          backend: modelInfo.backend, attentionVariant: modelInfo.attentionVariant,
        };
        await registerAndNotify(deps, { imageModel, modelName: modelInfo.name });
      } catch (e) {
        await RNFS.unlink(zipPath).catch(() => {});
        await RNFS.unlink(modelDir).catch(() => {});
        throw e;
      }
    });
    backgroundDownloadService.startProgressPolling();
  } catch (error: any) {
    deps.setAlertState(showAlert('Download Failed', getUserFacingDownloadMessage(error?.message)));
  }
}

function getQnnWarningMessage(
  modelInfo: ImageModelDescriptor,
  socInfo: { hasNPU: boolean; qnnVariant?: string },
): string | null {
  if (!socInfo.hasNPU) {
    return 'NPU models require a Qualcomm Snapdragon processor. ' +
      'Your device does not have a compatible NPU and this model will not work. ' +
      'Consider downloading a CPU model instead.';
  }
  if (!modelInfo.variant || !socInfo.qnnVariant) return null;

  const deviceVariant = socInfo.qnnVariant;
  const modelVariant = modelInfo.variant;
  const compatible =
    modelVariant === deviceVariant || deviceVariant === '8gen2' ||
    (deviceVariant === '8gen1' && modelVariant !== '8gen2');
  if (compatible) return null;

  return `This model is built for ${modelVariant === '8gen2' ? 'flagship' : modelVariant} Snapdragon chips. ` +
    `Your device uses a ${deviceVariant === 'min' ? 'non-flagship' : deviceVariant} chip and this model will likely crash. ` +
    `Download the non-flagship variant instead.`;
}

function showQnnWarningAlert(
  opts: { warningMessage: string; hasNPU: boolean; modelInfo: ImageModelDescriptor },
  deps: ImageDownloadDeps,
): void {
  const { warningMessage, hasNPU, modelInfo } = opts;
  if (hasNPU) {
    deps.setAlertState(showAlert('Incompatible Model', warningMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Download Anyway', style: 'destructive', onPress: () => { deps.setAlertState(hideAlert()); proceedWithDownload(modelInfo, deps); } },
    ]));
  } else {
    deps.setAlertState(showAlert('Incompatible Model', warningMessage, [
      { text: 'OK', style: 'cancel' },
    ]));
  }
}

export async function handleDownloadImageModel(
  modelInfo: ImageModelDescriptor,
  deps: ImageDownloadDeps,
): Promise<void> {
  if (modelInfo.backend === 'qnn' && Platform.OS === 'android') {
    const socInfo = await hardwareService.getSoCInfo();
    const warningMessage = getQnnWarningMessage(modelInfo, socInfo);
    if (warningMessage) {
      showQnnWarningAlert({ warningMessage, hasNPU: socInfo.hasNPU, modelInfo }, deps);
      return;
    }
  }
  await proceedWithDownload(modelInfo, deps);
}
