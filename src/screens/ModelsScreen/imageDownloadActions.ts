/**
 * Standalone async image download handlers — no hooks.
 * Each function accepts an explicit `deps` object instead of closing over hook state.
 */
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { showAlert, hideAlert, AlertState } from '../../components/CustomAlert';
import { modelManager, hardwareService, backgroundDownloadService } from '../../services';
import { resolveCoreMLModelDir, downloadCoreMLTokenizerFiles } from '../../utils/coreMLModelUtils';
import { ONNXImageModel } from '../../types';
import { ImageModelDescriptor } from './types';

export interface ImageDownloadDeps {
  addImageModelDownloading: (id: string) => void;
  removeImageModelDownloading: (id: string) => void;
  updateModelProgress: (id: string, n: number) => void;
  clearModelProgress: (id: string) => void;
  addDownloadedImageModel: (m: ONNXImageModel) => void;
  activeImageModelId: string | null;
  setActiveImageModelId: (id: string) => void;
  setImageModelDownloadId: (modelId: string, downloadId: number | null) => void;
  setBackgroundDownload: (downloadId: number, data: any) => void;
  setAlertState: (s: AlertState) => void;
}

export async function downloadHuggingFaceModel(
  modelInfo: ImageModelDescriptor,
  deps: ImageDownloadDeps,
): Promise<void> {
  if (!modelInfo.huggingFaceRepo || !modelInfo.huggingFaceFiles) {
    deps.setAlertState(showAlert('Error', 'Invalid HuggingFace model configuration'));
    return;
  }
  deps.addImageModelDownloading(modelInfo.id);
  deps.updateModelProgress(modelInfo.id, 0);
  try {
    const imageModelsDir = modelManager.getImageModelsDirectory();
    const modelDir = `${imageModelsDir}/${modelInfo.id}`;
    if (!(await RNFS.exists(imageModelsDir))) await RNFS.mkdir(imageModelsDir);
    if (!(await RNFS.exists(modelDir))) await RNFS.mkdir(modelDir);

    const files = modelInfo.huggingFaceFiles;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    let downloadedSize = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileUrl = `https://huggingface.co/${modelInfo.huggingFaceRepo}/resolve/main/${file.path}`;
      const filePath = `${modelDir}/${file.path}`;
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (!(await RNFS.exists(fileDir))) await RNFS.mkdir(fileDir);

      // Use a flattened temp filename to avoid path issues in the Downloads dir.
      const tempFileName = `${modelInfo.id}_${file.path.replace(/\//g, '_')}`;
      const capturedDownloadedSize = downloadedSize;
      await backgroundDownloadService.downloadFileTo({
        params: {
          url: fileUrl,
          fileName: tempFileName,
          modelId: `image:${modelInfo.id}`,
          totalBytes: file.size,
        },
        destPath: filePath,
        onProgress: (bytesDownloaded) => {
          deps.updateModelProgress(
            modelInfo.id,
            ((capturedDownloadedSize + bytesDownloaded) / totalSize) * 0.95,
          );
        },
      });
      downloadedSize += file.size;
      deps.updateModelProgress(modelInfo.id, (downloadedSize / totalSize) * 0.95);
    }
    const imageModel: ONNXImageModel = {
      id: modelInfo.id, name: modelInfo.name, description: modelInfo.description,
      modelPath: modelDir, downloadedAt: new Date().toISOString(),
      size: modelInfo.size, style: modelInfo.style, backend: modelInfo.backend,
    };
    await modelManager.addDownloadedImageModel(imageModel);
    deps.addDownloadedImageModel(imageModel);
    if (!deps.activeImageModelId) deps.setActiveImageModelId(imageModel.id);
    // Remove AFTER model is registered so card doesn't disappear before appearing as downloaded.
    deps.removeImageModelDownloading(modelInfo.id);
    deps.clearModelProgress(modelInfo.id);
    deps.setAlertState(showAlert('Success', `${modelInfo.name} downloaded successfully!`));
  } catch (error: any) {
    deps.setAlertState(showAlert('Download Failed', error?.message || 'Unknown error'));
    try {
      const dir = `${modelManager.getImageModelsDirectory()}/${modelInfo.id}`;
      if (await RNFS.exists(dir)) await RNFS.unlink(dir);
    } catch { /* ignore cleanup errors */ }
    deps.removeImageModelDownloading(modelInfo.id);
    deps.clearModelProgress(modelInfo.id);
  }
}

export async function downloadCoreMLMultiFile(
  modelInfo: ImageModelDescriptor,
  deps: ImageDownloadDeps,
): Promise<void> {
  if (!backgroundDownloadService.isAvailable()) {
    deps.setAlertState(showAlert('Not Available', 'Background downloads not available'));
    return;
  }
  if (!modelInfo.coremlFiles || modelInfo.coremlFiles.length === 0) return;

  deps.addImageModelDownloading(modelInfo.id);
  deps.updateModelProgress(modelInfo.id, 0);
  try {
    const imageModelsDir = modelManager.getImageModelsDirectory();
    const modelDir = `${imageModelsDir}/${modelInfo.id}`;
    const downloadInfo = await backgroundDownloadService.startMultiFileDownload({
      files: modelInfo.coremlFiles.map(f => ({ url: f.downloadUrl, relativePath: f.relativePath, size: f.size })),
      fileName: modelInfo.id, modelId: `image:${modelInfo.id}`, destinationDir: modelDir, totalBytes: modelInfo.size,
    });
    deps.setImageModelDownloadId(modelInfo.id, downloadInfo.downloadId);
    deps.setBackgroundDownload(downloadInfo.downloadId, {
      modelId: `image:${modelInfo.id}`, fileName: modelInfo.id, quantization: 'Core ML', author: 'Image Generation', totalBytes: modelInfo.size,
    });
    const unsubProgress = backgroundDownloadService.onProgress(downloadInfo.downloadId, (ev) => {
      deps.updateModelProgress(modelInfo.id, ev.totalBytes > 0 ? (ev.bytesDownloaded / ev.totalBytes) * 0.95 : 0);
    });
    const unsubComplete = backgroundDownloadService.onComplete(downloadInfo.downloadId, async () => {
      unsubProgress(); unsubComplete(); unsubError();
      try {
        if (modelInfo.backend === 'coreml' && modelInfo.repo) await downloadCoreMLTokenizerFiles(modelDir, modelInfo.repo);
        const imageModel: ONNXImageModel = {
          id: modelInfo.id, name: modelInfo.name, description: modelInfo.description,
          modelPath: modelDir, downloadedAt: new Date().toISOString(),
          size: modelInfo.size, style: modelInfo.style, backend: modelInfo.backend,
        };
        await modelManager.addDownloadedImageModel(imageModel);
        deps.addDownloadedImageModel(imageModel);
        if (!deps.activeImageModelId) deps.setActiveImageModelId(imageModel.id);
        // Remove AFTER model is registered so card doesn't disappear during processing.
        deps.removeImageModelDownloading(modelInfo.id);
        deps.clearModelProgress(modelInfo.id);
        deps.setBackgroundDownload(downloadInfo.downloadId, null);
        deps.setAlertState(showAlert('Success', `${modelInfo.name} downloaded successfully!`));
      } catch (e: any) {
        deps.setAlertState(showAlert('Registration Failed', e?.message || 'Failed to register model'));
        deps.removeImageModelDownloading(modelInfo.id);
        deps.clearModelProgress(modelInfo.id);
        deps.setBackgroundDownload(downloadInfo.downloadId, null);
      }
    });
    const unsubError = backgroundDownloadService.onError(downloadInfo.downloadId, (ev) => {
      unsubProgress(); unsubComplete(); unsubError();
      deps.setAlertState(showAlert('Download Failed', ev.reason || 'Unknown error'));
      deps.removeImageModelDownloading(modelInfo.id);
      deps.clearModelProgress(modelInfo.id);
      deps.setBackgroundDownload(downloadInfo.downloadId, null);
    });
    backgroundDownloadService.startProgressPolling();
  } catch (error: any) {
    deps.setAlertState(showAlert('Download Failed', error?.message || 'Unknown error'));
    deps.removeImageModelDownloading(modelInfo.id);
    deps.clearModelProgress(modelInfo.id);
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

  deps.addImageModelDownloading(modelInfo.id);
  deps.updateModelProgress(modelInfo.id, 0);
  try {
    const fileName = `${modelInfo.id}.zip`;
    const downloadInfo = await backgroundDownloadService.startDownload({
      url: modelInfo.downloadUrl!, fileName, modelId: `image:${modelInfo.id}`,
      title: `Downloading ${modelInfo.name}`, description: 'Image generation model', totalBytes: modelInfo.size,
    });
    deps.setImageModelDownloadId(modelInfo.id, downloadInfo.downloadId);
    deps.setBackgroundDownload(downloadInfo.downloadId, {
      modelId: `image:${modelInfo.id}`, fileName, quantization: '', author: 'Image Generation', totalBytes: modelInfo.size,
    });
    const unsubProgress = backgroundDownloadService.onProgress(downloadInfo.downloadId, (ev) => {
      deps.updateModelProgress(modelInfo.id, ev.totalBytes > 0 ? (ev.bytesDownloaded / ev.totalBytes) * 0.9 : 0);
    });
    const unsubComplete = backgroundDownloadService.onComplete(downloadInfo.downloadId, async () => {
      unsubProgress(); unsubComplete(); unsubError();
      try {
        deps.updateModelProgress(modelInfo.id, 0.9);
        const imageModelsDir = modelManager.getImageModelsDirectory();
        const zipPath = `${imageModelsDir}/${fileName}`;
        const modelDir = `${imageModelsDir}/${modelInfo.id}`;
        if (!(await RNFS.exists(imageModelsDir))) await RNFS.mkdir(imageModelsDir);
        await backgroundDownloadService.moveCompletedDownload(downloadInfo.downloadId, zipPath);
        deps.updateModelProgress(modelInfo.id, 0.92);
        if (!(await RNFS.exists(modelDir))) await RNFS.mkdir(modelDir);
        await unzip(zipPath, modelDir);
        const resolvedModelDir = modelInfo.backend === 'coreml' ? await resolveCoreMLModelDir(modelDir) : modelDir;
        deps.updateModelProgress(modelInfo.id, 0.95);
        await RNFS.unlink(zipPath).catch(() => {});
        const imageModel: ONNXImageModel = {
          id: modelInfo.id, name: modelInfo.name, description: modelInfo.description,
          modelPath: resolvedModelDir, downloadedAt: new Date().toISOString(), size: modelInfo.size, style: modelInfo.style,
        };
        await modelManager.addDownloadedImageModel(imageModel);
        deps.addDownloadedImageModel(imageModel);
        if (!deps.activeImageModelId) deps.setActiveImageModelId(imageModel.id);
        // Remove from downloading AFTER model is registered so the card never
        // disappears during the processing window (unzip / move / persist).
        deps.removeImageModelDownloading(modelInfo.id);
        deps.clearModelProgress(modelInfo.id);
        deps.setBackgroundDownload(downloadInfo.downloadId, null);
        deps.setAlertState(showAlert('Success', `${modelInfo.name} downloaded successfully!`));
      } catch (e: any) {
        deps.setAlertState(showAlert('Extraction Failed', e?.message || 'Failed to extract model'));
        deps.removeImageModelDownloading(modelInfo.id);
        deps.clearModelProgress(modelInfo.id);
        deps.setBackgroundDownload(downloadInfo.downloadId, null);
      }
    });
    const unsubError = backgroundDownloadService.onError(downloadInfo.downloadId, (ev) => {
      unsubProgress(); unsubComplete(); unsubError();
      deps.setAlertState(showAlert('Download Failed', ev.reason || 'Unknown error'));
      deps.removeImageModelDownloading(modelInfo.id);
      deps.clearModelProgress(modelInfo.id);
      deps.setBackgroundDownload(downloadInfo.downloadId, null);
    });
    backgroundDownloadService.startProgressPolling();
  } catch (error: any) {
    deps.setAlertState(showAlert('Download Failed', error?.message || 'Unknown error'));
    deps.removeImageModelDownloading(modelInfo.id);
    deps.clearModelProgress(modelInfo.id);
  }
}

export async function handleDownloadImageModel(
  modelInfo: ImageModelDescriptor,
  deps: ImageDownloadDeps,
): Promise<void> {
  if (modelInfo.backend === 'qnn' && Platform.OS === 'android') {
    const socInfo = await hardwareService.getSoCInfo();
    let warningMessage: string | null = null;
    if (!socInfo.hasNPU) {
      warningMessage = 'NPU models require a Qualcomm Snapdragon processor. ' +
        'Your device does not have a compatible NPU and this model will not work. ' +
        'Consider downloading a CPU model instead.';
    } else if (modelInfo.variant && socInfo.qnnVariant) {
      const deviceVariant = socInfo.qnnVariant;
      const modelVariant = modelInfo.variant;
      const compatible =
        modelVariant === deviceVariant || deviceVariant === '8gen2' ||
        (deviceVariant === '8gen1' && modelVariant !== '8gen2');
      if (!compatible) {
        warningMessage = `This model is built for ${modelVariant === '8gen2' ? 'flagship' : modelVariant} Snapdragon chips. ` +
          `Your device uses a ${deviceVariant === 'min' ? 'non-flagship' : deviceVariant} chip and this model will likely crash. ` +
          `Download the non-flagship variant instead.`;
      }
    }
    if (warningMessage) {
      deps.setAlertState(showAlert('Incompatible Model', warningMessage, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download Anyway', style: 'destructive', onPress: () => { deps.setAlertState(hideAlert()); proceedWithDownload(modelInfo, deps); } },
      ]));
      return;
    }
  }
  await proceedWithDownload(modelInfo, deps);
}
