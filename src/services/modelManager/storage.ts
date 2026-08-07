import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DownloadedModel, LlamaDownloadedModel, LiteRTDownloadedModel, ModelFile, ModelCredibility, ONNXImageModel } from '../../types';
import { LMSTUDIO_AUTHORS, OFFICIAL_MODEL_AUTHORS, VERIFIED_QUANTIZERS } from '../../constants';
import { getCuratedLiteRTEntry } from '../curatedLiteRTRegistry';
import logger from '../../utils/logger';
import { collapseDuplicateFileRows, collapseDuplicateImageRows } from './collapseDuplicateFileRows';
import { reconcilePrimaryPaths, resolveStoredPath } from './reconcileStoredPaths';

// Re-exported because this module was the published home of these helpers before they were extracted
// into the one place both registries share.
export { resolveStoredPath };

const MODELS_STORAGE_KEY = '@local_llm/downloaded_models';
const IMAGE_MODELS_STORAGE_KEY = '@local_llm/downloaded_image_models';

export function determineCredibility(author: string): ModelCredibility {
  if (LMSTUDIO_AUTHORS.includes(author)) {
    return {
      source: 'lmstudio',
      isOfficial: false,
      isVerifiedQuantizer: true,
      verifiedBy: 'LM Studio',
    };
  }

  if (OFFICIAL_MODEL_AUTHORS[author]) {
    return {
      source: 'official',
      isOfficial: true,
      isVerifiedQuantizer: false,
      verifiedBy: OFFICIAL_MODEL_AUTHORS[author],
    };
  }

  if (VERIFIED_QUANTIZERS[author]) {
    return {
      source: 'verified-quantizer',
      isOfficial: false,
      isVerifiedQuantizer: true,
      verifiedBy: VERIFIED_QUANTIZERS[author],
    };
  }

  return {
    source: 'community',
    isOfficial: false,
    isVerifiedQuantizer: false,
  };
}

export async function saveModelsList(models: DownloadedModel[]): Promise<void> {
  await AsyncStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models));
}

export async function saveImageModelsList(models: ONNXImageModel[]): Promise<void> {
  await AsyncStorage.setItem(IMAGE_MODELS_STORAGE_KEY, JSON.stringify(models));
}

async function tryResolveMmProjPath(
  model: DownloadedModel,
  modelsDir: string,
): Promise<boolean> {
  if (model.engine !== 'llama' || !model.mmProjPath) return false;
  const mmExists = await RNFS.exists(model.mmProjPath);
  if (mmExists) return false;
  const resolvedMm = resolveStoredPath(model.mmProjPath, modelsDir);
  if (!resolvedMm || resolvedMm === model.mmProjPath) return false;
  const mmResolvedExists = await RNFS.exists(resolvedMm);
  if (mmResolvedExists) {
    model.mmProjPath = resolvedMm;
    return true;
  }
  return false;
}

async function validateAndResolveModels(
  models: DownloadedModel[],
  modelsDir: string,
): Promise<{ validModels: DownloadedModel[]; pathsUpdated: boolean }> {
  const { verdicts, pathsUpdated: primaryUpdated } = await reconcilePrimaryPaths(models, modelsDir, {
    getPath: model => model.filePath,
    setPath: (model, path) => {
      model.filePath = path;
    },
  });

  // Only a model whose primary file is actually present can have its projector resolved - a missing
  // model has nothing to see with either.
  const withProjector = models.filter((_, i) => verdicts[i].exists);
  const mmProjResults = await Promise.all(
    withProjector.map(model => tryResolveMmProjPath(model, modelsDir)),
  );

  const pathsUpdated = primaryUpdated || mmProjResults.some(Boolean);
  return { validModels: models.filter((_, i) => verdicts[i].keep), pathsUpdated };
}

export async function loadDownloadedModels(modelsDir: string): Promise<DownloadedModel[]> {
  const stored = await AsyncStorage.getItem(MODELS_STORAGE_KEY);
  if (!stored) return [];

  let models: DownloadedModel[];
  try {
    // Backfill engine: 'llama' for records written before the discriminated union.
    // LiteRT records always had engine: 'litert' set explicitly, so this is safe.
    // For LiteRT, consult the curated registry by fileName — this rescues
    // already-downloaded curated models whose row was written before liteRTVision
    // was being set correctly. Locally-imported .litertlm files aren't in the
    // registry and keep whatever flag they were saved with.
    models = (JSON.parse(stored) as any[]).map((m): DownloadedModel => {
      if (m.engine === 'litert') {
        const curated = getCuratedLiteRTEntry(m.fileName);
        const liteRTVision = curated?.liteRTVision ?? m.liteRTVision ?? false;
        const liteRTAudio = curated?.liteRTAudio ?? m.liteRTAudio ?? false;
        return { ...m, liteRTVision, liteRTAudio } as LiteRTDownloadedModel;
      }
      return { ...m, engine: 'llama' as const } as LlamaDownloadedModel;
    });
  } catch (error) {
    // Corrupt AsyncStorage should not prevent the app from loading other state.
    logger.error('[ModelManagerStorage] Failed to parse downloaded models JSON', {
      storageKey: MODELS_STORAGE_KEY,
      length: stored.length,
      preview: stored.slice(0, 100),
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const { validModels, pathsUpdated } = await validateAndResolveModels(models, modelsDir);
  const { models: deduped, collapsed } = collapseDuplicateFileRows(validModels);

  if (validModels.length !== models.length || pathsUpdated || collapsed > 0) {
    await saveModelsList(deduped);
  }

  return deduped;
}

export async function loadDownloadedImageModels(imageModelsDir: string): Promise<ONNXImageModel[]> {
  const stored = await AsyncStorage.getItem(IMAGE_MODELS_STORAGE_KEY);
  if (!stored) return [];

  let models: ONNXImageModel[];
  try {
    models = JSON.parse(stored) as ONNXImageModel[];
  } catch (error) {
    // Corrupt AsyncStorage should not prevent the app from loading other state.
    logger.error('[ModelManagerStorage] Failed to parse downloaded image models JSON', {
      storageKey: IMAGE_MODELS_STORAGE_KEY,
      length: stored.length,
      preview: stored.slice(0, 100),
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const { verdicts, pathsUpdated } = await reconcilePrimaryPaths(models, imageModelsDir, {
    getPath: model => model.modelPath,
    setPath: (model, path) => {
      model.modelPath = path;
    },
  });

  const validModels = models.filter((_, i) => verdicts[i].keep);
  // Repairs a registry that already grew duplicates under the old `Date.now()` ids, exactly as the
  // text registry does one function above.
  const { models: deduped, collapsed } = collapseDuplicateImageRows(validModels);

  if (validModels.length !== models.length || pathsUpdated || collapsed > 0) {
    await saveImageModelsList(deduped);
  }

  return deduped;
}

export interface BuildModelOpts {
  modelId: string;
  file: ModelFile;
  resolvedLocalPath: string;
  mmProjPath?: string;
  /** Kept even when mmProjPath is absent (download failed) so needsVisionRepair can detect the gap */
  expectedMmProjFileName?: string;
}

export async function buildDownloadedModel(opts: BuildModelOpts): Promise<DownloadedModel> {
  const { modelId, file, resolvedLocalPath, mmProjPath, expectedMmProjFileName } = opts;
  const stat = await RNFS.stat(resolvedLocalPath);
  const author = modelId.split('/')[0] || 'Unknown';
  const isLiteRT = file.name.toLowerCase().endsWith('.litertlm');
  const mmProjFile = file.mmProjFile;
  let mmProjFileSize = mmProjPath ? mmProjFile?.size : undefined;
  if (mmProjPath) {
    try {
      const mmStat = await RNFS.stat(mmProjPath);
      mmProjFileSize = typeof mmStat.size === 'string' ? Number.parseInt(mmStat.size, 10) : mmStat.size;
    } catch {
      // Keep fallback size from metadata.
    }
  }

  // mmProjFileName is written even when mmProjPath is absent (e.g. sidecar download failed).
  // This sentinel lets needsVisionRepair detect the gap without any name-based heuristic:
  //   model.mmProjFileName is set  →  model was supposed to have vision
  //   model.mmProjPath is absent   →  file is missing, show "Repair Vision"
  const mmProjFileName = mmProjPath
    ? (mmProjFile?.name ?? mmProjPath.split('/').pop())
    : (expectedMmProjFileName ?? mmProjFile?.name);

  // Registry wins for curated LiteRT artifacts: display name and capability bits
  // come from a single source of truth keyed by fileName. Falls back to the
  // file's metadata for locally-imported .litertlm files, then to modelId basename
  // for everything else.
  const curatedLiteRT = isLiteRT ? getCuratedLiteRTEntry(file.name) : undefined;
  const derivedName = curatedLiteRT?.displayName
    ?? (isLiteRT ? file.name.replace(/\.litertlm$/i, '') : (modelId.split('/').pop() || modelId));

  const commonFields = {
    id: `${modelId}/${file.name}`,
    name: derivedName,
    author,
    filePath: resolvedLocalPath,
    fileName: file.name,
    fileSize: typeof stat.size === 'string' ? Number.parseInt(stat.size, 10) : stat.size,
    quantization: file.quantization,
    downloadedAt: new Date().toISOString(),
    credibility: determineCredibility(author),
  };

  if (isLiteRT) {
    const liteRTVision = curatedLiteRT?.liteRTVision ?? file.liteRTVision ?? false;
    const liteRTAudio = curatedLiteRT?.liteRTAudio ?? file.liteRTAudio ?? false;
    const liteRTModel: LiteRTDownloadedModel = {
      ...commonFields,
      engine: 'litert',
      liteRTVision,
      liteRTAudio,
    };
    return liteRTModel;
  }

  const llamaModel: LlamaDownloadedModel = {
    ...commonFields,
    engine: 'llama',
    isVisionModel: !!mmProjPath,
    mmProjPath,
    mmProjFileName,
    mmProjFileSize,
  };
  return llamaModel;
}

export async function persistDownloadedModel(
  model: DownloadedModel,
  modelsDir: string,
): Promise<void> {
  const models = await loadDownloadedModels(modelsDir);
  const existingIndex = models.findIndex(m => m.id === model.id);
  if (existingIndex >= 0) {
    models[existingIndex] = model;
  } else {
    models.push(model);
  }
  await saveModelsList(models);
}
