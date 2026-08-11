import RNFS from 'react-native-fs';
import {
  ogamModelTransferBlocker,
  type TransferredModelManifest,
} from '@offgrid/sync';
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
  const blocker = ogamModelTransferBlocker(manifest);
  if (blocker || (manifest.kind !== 'text' && manifest.kind !== 'vision')) {
    throw new Error('Transferred model manifest is invalid');
  }

  const primary =
    manifest.files.find(file => file.role === 'primary') ??
    manifest.files.find(file => file.role !== 'projector');
  const projector = manifest.files.find(file => file.role === 'projector');
  if (!primary) {
    throw new Error('Transferred model manifest is invalid');
  }

  for (const file of manifest.files) {
    const filePath = `${modelsDir}/${file.name}`;
    const stat = await RNFS.stat(filePath);
    const actualSize =
      typeof stat.size === 'string'
        ? Number.parseInt(stat.size, 10)
        : stat.size;
    if (!stat.isFile() || actualSize !== file.sizeBytes) {
      throw new Error('Transferred model file does not match its manifest');
    }
  }

  const primaryPath = `${modelsDir}/${primary.name}`;
  const projectorPath = projector
    ? `${modelsDir}/${projector.name}`
    : undefined;
  const quantization =
    primary.name.match(/[_-](Q\d+[_\w]*|f16|f32)/i)?.[1]?.toUpperCase() ??
    'Unknown';
  const pseudoFile: ModelFile = {
    name: primary.name,
    size: primary.sizeBytes,
    quantization,
    downloadUrl: '',
    ...(projector
      ? {
          mmProjFile: {
            name: projector.name,
            size: projector.sizeBytes,
            downloadUrl: '',
          },
        }
      : {}),
  };
  const base = await buildDownloadedModel({
    modelId: manifest.id,
    file: pseudoFile,
    resolvedLocalPath: primaryPath,
    mmProjPath: projectorPath,
  });
  const author =
    manifest.source === 'local'
      ? 'Local Import'
      : manifest.id.split('/')[0] || 'Unknown';
  const model: DownloadedModel = {
    ...base,
    id: `${manifest.id}/${primary.name}`,
    name: manifest.name,
    author,
    credibility: determineCredibility(author),
    engine: 'llama',
  };

  await persistDownloadedModel(model, modelsDir);
  return model;
}
