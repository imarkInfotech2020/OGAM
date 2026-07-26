import RNFS from 'react-native-fs';
import type { TransferredModelManifest } from '@offgrid/sync';
import type { DownloadedModel, ModelFile } from '../../types';
import {
  buildDownloadedModel,
  determineCredibility,
  persistDownloadedModel,
} from './storage';

export async function registerTransferredModelFile(
  manifest: TransferredModelManifest,
  modelsDir: string,
): Promise<DownloadedModel> {
  const file = manifest.files[0];
  if (!file || file.name.includes('/') || file.name.includes('\\') || !/\.gguf$/i.test(file.name)) {
    throw new Error('Transferred model manifest is invalid');
  }

  const filePath = `${modelsDir}/${file.name}`;
  const stat = await RNFS.stat(filePath);
  const actualSize = typeof stat.size === 'string' ? Number.parseInt(stat.size, 10) : stat.size;
  if (!stat.isFile() || actualSize !== file.sizeBytes) {
    throw new Error('Transferred model file does not match its manifest');
  }

  const quantization = file.name.match(/[_-](Q\d+[_\w]*|f16|f32)/i)?.[1]?.toUpperCase() ?? 'Unknown';
  const pseudoFile: ModelFile = {
    name: file.name,
    size: file.sizeBytes,
    quantization,
    downloadUrl: '',
  };
  const base = await buildDownloadedModel({
    modelId: manifest.id,
    file: pseudoFile,
    resolvedLocalPath: filePath,
  });
  const author = manifest.source === 'local' ? 'Local Import' : (manifest.id.split('/')[0] || 'Unknown');
  const model: DownloadedModel = {
    ...base,
    id: `${manifest.id}/${file.name}`,
    name: manifest.name,
    author,
    credibility: determineCredibility(author),
    engine: 'llama',
  };

  await persistDownloadedModel(model, modelsDir);
  return model;
}
