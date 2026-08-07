import RNFS from 'react-native-fs';
import {
  DownloadedModel,
  LiteRTDownloadedModel,
  LlamaDownloadedModel,
  ModelEngine,
  ModelFile,
} from '../../types';
import { buildDownloadedModel, persistDownloadedModel } from './storage';
import { copyFileWithProgress } from './copyFile';
import { parseSizeInt } from './scan';

export interface ImportLocalModelOpts {
  sourceUri: string;
  fileName: string;
  modelsDir: string;
  sourceSize?: number | null;
  engine?: ModelEngine;
  liteRTVision?: boolean;
  onProgress?: (progress: { fraction: number; fileName: string }) => void;
  mmProjSourceUri?: string;
  mmProjFileName?: string;
  mmProjSourceSize?: number | null;
}


/**
 * Bringing a file the USER picked into the library.
 *
 * A different job from scan.ts, which adopts files already sitting in the models dir after a crash or a
 * reinstall. Split out when scan.ts crossed the size cap: one file was doing recovery, projector linking,
 * image-zip reconciliation AND local import.
 */
function resolveUri(uri: string): string {
  // Android content:// URIs are passed directly to RNFS.copyFile — no cache copy needed.
  // iOS file:// URIs need decoding (%20 → space) so RNFS can find the file on disk.
  if (uri.startsWith('content://')) {
    return uri;
  }
  return decodeURIComponent(uri);
}


export async function importLocalModel(opts: ImportLocalModelOpts): Promise<DownloadedModel> { // NOSONAR
  const { sourceUri, fileName, modelsDir, sourceSize, engine: _engine, liteRTVision, onProgress, mmProjSourceUri, mmProjFileName, mmProjSourceSize } = opts;

  const isLitert = fileName.toLowerCase().endsWith('.litertlm');
  if (!fileName.toLowerCase().endsWith('.gguf') && !isLitert) {
    throw new Error('Only .gguf and .litertlm files can be imported');
  }

  const resolvedSource = resolveUri(sourceUri);
  const resolvedMmProjSource = mmProjSourceUri ? resolveUri(mmProjSourceUri) : undefined;

  const destPath = `${modelsDir}/${fileName}`;
  const destExists = await RNFS.exists(destPath);
  if (destExists) throw new Error(`A model file named "${fileName}" already exists`);
  if (mmProjFileName && await RNFS.exists(`${modelsDir}/${mmProjFileName}`)) {
    throw new Error(`A file named "${mmProjFileName}" already exists`);
  }

  // Copy main model: progress 0→0.5 when mmproj present, 0→1 otherwise
  const mainProgressScale = mmProjFileName ? 0.5 : 1;
  await copyFileWithProgress(resolvedSource, destPath, {
    knownTotalBytes: sourceSize ?? null,
    onProgress: onProgress ? (fraction: number) => onProgress({ fraction: fraction * mainProgressScale, fileName }) : undefined,
  });

  const quantMatch = fileName.match(/[_-](Q\d+[_\w]*|f16|f32)/i);
  const quantization = quantMatch ? quantMatch[1].toUpperCase() : 'Unknown';
  const modelName = fileName.replace(/\.gguf$/i, '').replace(/\.litertlm$/i, '').replace(/[_-]Q\d+.*/i, '');
  const destStat = await RNFS.stat(destPath);
  const fileSize = parseSizeInt(destStat.size);

  const pseudoFile: ModelFile = { name: fileName, size: fileSize, quantization, downloadUrl: '' };
  const baseModel = await buildDownloadedModel({ modelId: 'local_import', file: pseudoFile, resolvedLocalPath: destPath });
  const baseFields = {
    id: `local_import/${fileName}`,
    name: modelName,
    author: 'Local Import',
    credibility: { source: 'community' as const, isOfficial: false, isVerifiedQuantizer: false },
  };

  if (isLitert) {
    const liteRTModel: LiteRTDownloadedModel = {
      ...baseModel, ...baseFields, engine: 'litert', liteRTVision: liteRTVision ?? false,
    };
    await persistDownloadedModel(liteRTModel, modelsDir);
    return liteRTModel;
  }

  const llamaModel: LlamaDownloadedModel = { ...baseModel, ...baseFields, engine: 'llama' };

  // Copy mmproj and link it to the model: progress 0.5→1
  if (mmProjFileName && resolvedMmProjSource) {
    const mmProjDestPath = `${modelsDir}/${mmProjFileName}`;
    await copyFileWithProgress(resolvedMmProjSource, mmProjDestPath, {
      knownTotalBytes: mmProjSourceSize ?? null,
      onProgress: onProgress
        ? (fraction: number) => onProgress({ fraction: 0.5 + fraction * 0.5, fileName: mmProjFileName })
        : undefined,
    });
    const mmProjStat = await RNFS.stat(mmProjDestPath);
    llamaModel.mmProjPath = mmProjDestPath;
    llamaModel.mmProjFileName = mmProjFileName;
    llamaModel.mmProjFileSize = parseSizeInt(mmProjStat.size);
    llamaModel.isVisionModel = true;
  }

  await persistDownloadedModel(llamaModel, modelsDir);
  return llamaModel;
}
