import type {
  ModelCommandRoute,
  ModelModality,
  ModelsOperationSnapshot,
} from '@offgrid/application';
import { useModelsProjection } from './useApplicationProjection';
import { applicationFacade } from '../services/applicationFacade';
import { mobileRouteFacts } from '../services/modelServices/mobileRoute';

/** The route the shared command owner is switching this modality to, or null. */
export function usePendingModelCommand(modality: ModelModality): ModelCommandRoute | null {
  const active = useModelsProjection().operations.active.find(operation => {
    return operation.kind === 'control'
      && operation.controlOperation === 'select'
      && (operation.controlSurface === modality
        || (operation.controlSurface === 'speech' && modality === 'voice'));
  });
  if (!active?.modelId) return null;
  const model = applicationFacade().models.lookup(active.modelId);
  const facts = model ? mobileRouteFacts(model) : null;
  return facts?.modality === modality ? facts : null;
}

function isDownloadControl(operation: ModelsOperationSnapshot): boolean {
  return operation.kind === 'control' && (
    operation.controlOperation === 'download'
    || operation.controlOperation === 'queue-download'
    || operation.controlOperation === 'pause-download'
    || operation.controlOperation === 'resume-download'
    || operation.controlOperation === 'retry-download'
  );
}

/** Shared operations are the only source for the brief command-in-flight UI state. */
export function hasPendingDownloadCommand(
  operations: readonly ModelsOperationSnapshot[],
  modelId: string,
  downloadId?: string,
): boolean {
  return operations.some(operation =>
    isDownloadControl(operation)
    && (operation.modelId === modelId || operation.modelId === downloadId),
  );
}

export function usePendingDownloadCommand(modelId: string, downloadId?: string): boolean {
  return hasPendingDownloadCommand(
    useModelsProjection().operations.active,
    modelId,
    downloadId,
  );
}
