import { ModelFile } from '../types';

interface VisionRepairCandidate {
  isVisionModel?: boolean;
  mmProjPath?: string;
}

/**
 * Returns true if the model has been downloaded but is missing its mmproj file,
 * meaning vision capability needs to be repaired.
 *
 * Use this everywhere an eye/repair button visibility is decided.
 */
export function needsVisionRepair(
  model: VisionRepairCandidate | null | undefined,
  catalogFile?: ModelFile,
): boolean {
  if (!model) return false;
  // If a catalog file is provided, use it to confirm an mmproj is available to download
  if (catalogFile !== undefined && !catalogFile.mmProjFile) return false;
  return !model.mmProjPath;
}
