import RNFS from 'react-native-fs';
import { DownloadedModel, ModelFile, BackgroundDownloadInfo, ONNXImageModel } from '../../types';
import { APP_CONFIG } from '../../constants';
import { backgroundDownloadService } from '../backgroundDownloadService';
import {
  BackgroundDownloadMetadataCallback,
  BackgroundDownloadContext,
  DownloadProgressCallback,
  DownloadCompleteCallback,
  DownloadErrorCallback,
} from './types';
import {
  MODELS_STORAGE_KEY,
  IMAGE_MODELS_STORAGE_KEY,
  saveModelsList,
  saveImageModelsList,
  loadDownloadedModels,
  loadDownloadedImageModels,
} from './storage';
import {
  performDownloadModel,
  performBackgroundDownload,
  watchBackgroundDownload,
  syncCompletedBackgroundDownloads,
  restoreInProgressDownloads,
  getOrphanedTextFiles,
  getOrphanedImageDirs,
} from './download';
import {
  deleteOrphanedFile as scanDeleteOrphanedFile,
  cleanupMMProjEntries as scanCleanupMMProjEntries,
  scanForUntrackedImageModels as scanUntrackedImage,
  scanForUntrackedTextModels as scanUntrackedText,
  importLocalModel as scanImportLocalModel,
  isMMProjFile,
} from './scan';
import { resolveStoredPath, determineCredibility } from './storage';

export type { BackgroundDownloadMetadataCallback };
export { MODELS_STORAGE_KEY, IMAGE_MODELS_STORAGE_KEY };

class ModelManager {
  private modelsDir: string;
  private imageModelsDir: string;
  private downloadJobs: Map<string, { jobId: number; cancel: () => void }> = new Map();
  private backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null = null;
  private backgroundDownloadContext: Map<number, BackgroundDownloadContext> = new Map();

  constructor() {
    this.modelsDir = `${RNFS.DocumentDirectoryPath}/${APP_CONFIG.modelStorageDir}`;
    this.imageModelsDir = `${RNFS.DocumentDirectoryPath}/image_models`;
  }

  // Private helper delegates — kept on the class so existing tests that access
  // them via (modelManager as any).method() continue to work.
  private resolveStoredPath(storedPath: string, currentBaseDir: string): string | null {
    return resolveStoredPath(storedPath, currentBaseDir);
  }

  private determineCredibility(author: string): import('../../types').ModelCredibility {
    return determineCredibility(author);
  }

  private isMMProjFile(fileName: string): boolean {
    return isMMProjFile(fileName);
  }

  async initialize(): Promise<void> {
    const exists = await RNFS.exists(this.modelsDir);
    if (!exists) await RNFS.mkdir(this.modelsDir);

    const imageModelsExists = await RNFS.exists(this.imageModelsDir);
    if (!imageModelsExists) await RNFS.mkdir(this.imageModelsDir);
  }

  async getDownloadedModels(): Promise<DownloadedModel[]> {
    try {
      return await loadDownloadedModels(this.modelsDir);
    } catch {
      return [];
    }
  }

  async downloadModel(
    modelId: string,
    file: ModelFile,
    onProgress?: DownloadProgressCallback,
  ): Promise<DownloadedModel> {
    const downloadKey = `${modelId}/${file.name}`;
    if (this.downloadJobs.has(downloadKey)) {
      throw new Error('Model is already being downloaded');
    }

    try {
      await this.initialize();
      return await performDownloadModel({ modelId, file, modelsDir: this.modelsDir, downloadJobs: this.downloadJobs, onProgress });
    } catch (error) {
      this.downloadJobs.delete(downloadKey);
      throw error;
    }
  }

  async cancelDownload(modelId: string, fileName: string): Promise<void> {
    const downloadKey = `${modelId}/${fileName}`;
    const job = this.downloadJobs.get(downloadKey);

    if (job) {
      job.cancel();
      this.downloadJobs.delete(downloadKey);
      await RNFS.unlink(`${this.modelsDir}/${fileName}`).catch(() => {});
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    const models = await this.getDownloadedModels();
    const model = models.find(m => m.id === modelId);

    if (!model) throw new Error('Model not found');

    if (!model.filePath.startsWith(this.modelsDir)) {
      throw new Error('Invalid model path: outside app directory');
    }
    if (model.mmProjPath && !model.mmProjPath.startsWith(this.modelsDir)) {
      throw new Error('Invalid mmproj path: outside app directory');
    }

    await RNFS.unlink(model.filePath);
    if (model.mmProjPath) await RNFS.unlink(model.mmProjPath).catch(() => {});

    await saveModelsList(models.filter(m => m.id !== modelId));
  }

  async getModelPath(modelId: string): Promise<string | null> {
    const models = await this.getDownloadedModels();
    return models.find(m => m.id === modelId)?.filePath || null;
  }

  async getStorageUsed(): Promise<number> {
    const models = await this.getDownloadedModels();
    return models.reduce((total, model) => total + model.fileSize + (model.mmProjFileSize || 0), 0);
  }

  async getAvailableStorage(): Promise<number> {
    const freeSpace = await RNFS.getFSInfo();
    return freeSpace.freeSpace;
  }

  async getOrphanedFiles(): Promise<Array<{ name: string; path: string; size: number }>> {
    await this.initialize();
    try {
      const textOrphans = await getOrphanedTextFiles(this.modelsDir, () => this.getDownloadedModels());
      const imageOrphans = await getOrphanedImageDirs(this.imageModelsDir, () => this.getDownloadedImageModels());
      return [...textOrphans, ...imageOrphans];
    } catch {
      return [];
    }
  }

  async deleteOrphanedFile(filePath: string): Promise<void> {
    await scanDeleteOrphanedFile(filePath);
  }

  isDownloading(modelId: string, fileName: string): boolean {
    return this.downloadJobs.has(`${modelId}/${fileName}`);
  }

  setBackgroundDownloadMetadataCallback(callback: BackgroundDownloadMetadataCallback): void {
    this.backgroundDownloadMetadataCallback = callback;
  }

  isBackgroundDownloadSupported(): boolean {
    return backgroundDownloadService.isAvailable();
  }

  async downloadModelBackground(
    modelId: string,
    file: ModelFile,
    onProgress?: DownloadProgressCallback,
  ): Promise<BackgroundDownloadInfo> {
    if (!this.isBackgroundDownloadSupported()) {
      throw new Error('Background downloads not supported on this platform');
    }

    await this.initialize();

    return performBackgroundDownload({
      modelId,
      file,
      modelsDir: this.modelsDir,
      backgroundDownloadContext: this.backgroundDownloadContext,
      backgroundDownloadMetadataCallback: this.backgroundDownloadMetadataCallback,
      onProgress,
    });
  }

  watchDownload(
    downloadId: number,
    onComplete?: DownloadCompleteCallback,
    onError?: DownloadErrorCallback,
  ): void {
    watchBackgroundDownload({
      downloadId,
      modelsDir: this.modelsDir,
      backgroundDownloadContext: this.backgroundDownloadContext,
      backgroundDownloadMetadataCallback: this.backgroundDownloadMetadataCallback,
      onComplete,
      onError,
    });
  }

  async cancelBackgroundDownload(downloadId: number): Promise<void> {
    if (!this.isBackgroundDownloadSupported()) {
      throw new Error('Background downloads not supported on this platform');
    }

    await backgroundDownloadService.cancelDownload(downloadId);
    this.backgroundDownloadMetadataCallback?.(downloadId, null);
  }

  async syncBackgroundDownloads(
    persistedDownloads: Record<number, {
      modelId: string;
      fileName: string;
      quantization: string;
      author: string;
      totalBytes: number;
    }>,
    clearDownloadCallback: (downloadId: number) => void,
  ): Promise<DownloadedModel[]> {
    if (!this.isBackgroundDownloadSupported()) return [];
    await this.initialize();
    return syncCompletedBackgroundDownloads({ persistedDownloads, modelsDir: this.modelsDir, clearDownloadCallback });
  }

  async restoreInProgressDownloads(
    persistedDownloads: Record<number, {
      modelId: string;
      fileName: string;
      quantization: string;
      author: string;
      totalBytes: number;
      mmProjFileName?: string;
      mmProjLocalPath?: string | null;
    }>,
    onProgress?: DownloadProgressCallback,
  ): Promise<void> {
    if (!this.isBackgroundDownloadSupported()) return;
    await this.initialize();
    return restoreInProgressDownloads({
      persistedDownloads,
      modelsDir: this.modelsDir,
      backgroundDownloadContext: this.backgroundDownloadContext,
      backgroundDownloadMetadataCallback: this.backgroundDownloadMetadataCallback,
      onProgress,
    });
  }

  async getActiveBackgroundDownloads(): Promise<BackgroundDownloadInfo[]> {
    if (!this.isBackgroundDownloadSupported()) return [];
    return backgroundDownloadService.getActiveDownloads();
  }

  startBackgroundDownloadPolling(): void {
    if (this.isBackgroundDownloadSupported()) backgroundDownloadService.startProgressPolling();
  }

  stopBackgroundDownloadPolling(): void {
    if (this.isBackgroundDownloadSupported()) backgroundDownloadService.stopProgressPolling();
  }

  async saveModelWithMmproj(modelId: string, mmProjPath: string): Promise<void> {
    const mmProjFileName = mmProjPath.split('/').pop() || mmProjPath;
    const stat = await RNFS.stat(mmProjPath);
    const mmProjFileSize = typeof stat.size === 'string' ? parseInt(stat.size, 10) : stat.size;

    const models = await this.getDownloadedModels();
    const updated = models.map(m =>
      m.id === modelId ? { ...m, mmProjPath, mmProjFileName, mmProjFileSize, isVisionModel: true } : m
    );
    await saveModelsList(updated);
  }

  async cleanupMMProjEntries(): Promise<number> {
    return scanCleanupMMProjEntries(this.modelsDir);
  }

  async importLocalModel(
    sourceUri: string,
    fileName: string,
    onProgress?: (progress: { fraction: number; fileName: string }) => void,
  ): Promise<DownloadedModel> {
    await this.initialize();
    return scanImportLocalModel({ sourceUri, fileName, modelsDir: this.modelsDir, onProgress });
  }

  async getDownloadedImageModels(): Promise<ONNXImageModel[]> {
    try {
      return await loadDownloadedImageModels(this.imageModelsDir);
    } catch {
      return [];
    }
  }

  async addDownloadedImageModel(model: ONNXImageModel): Promise<void> {
    const models = await this.getDownloadedImageModels();
    const idx = models.findIndex(m => m.id === model.id);
    if (idx >= 0) models[idx] = model;
    else models.push(model);
    await saveImageModelsList(models);
  }

  async deleteImageModel(modelId: string): Promise<void> {
    const models = await this.getDownloadedImageModels();
    const model = models.find(m => m.id === modelId);

    if (!model) throw new Error('Image model not found');

    // Always remove the top-level directory for this model under imageModelsDir.
    // For CoreML models, model.modelPath points to a compiled subdirectory;
    // deleting only that subdir leaves the parent with tokenizer files on disk.
    const topLevelDir = `${this.imageModelsDir}/${modelId}`;
    if (!topLevelDir.startsWith(this.imageModelsDir + '/')) {
      throw new Error('Invalid image model path: outside app directory');
    }

    if (await RNFS.exists(topLevelDir)) await RNFS.unlink(topLevelDir);
    await saveImageModelsList(models.filter(m => m.id !== modelId));
  }

  async getImageModelPath(modelId: string): Promise<string | null> {
    const models = await this.getDownloadedImageModels();
    return models.find(m => m.id === modelId)?.modelPath || null;
  }

  async getImageModelsStorageUsed(): Promise<number> {
    const models = await this.getDownloadedImageModels();
    return models.reduce((total, model) => total + model.size, 0);
  }

  getImageModelsDirectory(): string {
    return this.imageModelsDir;
  }

  async scanForUntrackedImageModels(): Promise<ONNXImageModel[]> {
    await this.initialize();
    return scanUntrackedImage({
      imageModelsDir: this.imageModelsDir,
      getImageModels: () => this.getDownloadedImageModels(),
      addImageModel: (model) => this.addDownloadedImageModel(model),
    });
  }

  async scanForUntrackedTextModels(): Promise<DownloadedModel[]> {
    await this.initialize();
    return scanUntrackedText(this.modelsDir, () => this.getDownloadedModels());
  }

  async refreshModelLists(): Promise<{ textModels: DownloadedModel[]; imageModels: ONNXImageModel[] }> {
    await this.scanForUntrackedTextModels();
    await this.scanForUntrackedImageModels();
    return {
      textModels: await this.getDownloadedModels(),
      imageModels: await this.getDownloadedImageModels(),
    };
  }
}

export const modelManager = new ModelManager();
export type { ModelManager };
