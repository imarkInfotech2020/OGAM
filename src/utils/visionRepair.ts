import { ModelFile } from '../types';

interface VisionRepairCandidate {
  isVisionModel?: boolean;
  mmProjPath?: string;
  name?: string;
  fileName?: string;
}

function looksLikeVisionByName(model: VisionRepairCandidate): boolean {
  const name = (model.name ?? '').toLowerCase();
  const file = (model.fileName ?? '').toLowerCase();
  return name.includes('vl') || name.includes('vision') || name.includes('smolvlm') ||
    file.includes('vl') || file.includes('vision');
}

/**
 * Returns true if the model is a vision model and is missing its mmproj file,
 * meaning vision capability needs to be repaired.
 *
 * `isVisionModel` flips to false the moment mmProjPath disappears (storage.ts
 * sets `isVisionModel: !!mmProjPath`), so it is unreliable as the sole signal
 * for "this needs repair". Fall back to a name heuristic so the repair button
 * stays visible on broken vision models like SmolVLM/VL/etc.
 */
export function needsVisionRepair(
  model: VisionRepairCandidate | null | undefined,
  catalogFile?: ModelFile,
): boolean {
  if (!model) return false;
  if (model.mmProjPath) return false;
  const isVision = !!model.isVisionModel || looksLikeVisionByName(model);
  if (!isVision) return false;
  if (catalogFile !== undefined && !catalogFile.mmProjFile) return false;
  return true;
}
