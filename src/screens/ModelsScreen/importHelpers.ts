import { modelManager } from '../../services';
import { showAlert, hideAlert, AlertState } from '../../components/CustomAlert';
import { DownloadedModel } from '../../types';

export type GgufFileRef = { uri: string; name: string; size: number };

export type GgufImportDeps = {
  setAlertState: (s: AlertState) => void;
  setImportProgress: (p: { fraction: number; fileName: string } | null) => void;
  addDownloadedModel: (model: DownloadedModel) => void;
};

export function isMmProj(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('mmproj') ||
    lower.includes('projector') ||
    (lower.includes('clip') && lower.endsWith('.gguf'))
  );
}

export function classifyGgufPair(
  file1: GgufFileRef,
  file2: GgufFileRef,
): { mainFile: GgufFileRef; mmProjFile: GgufFileRef } {
  if (isMmProj(file1.name)) return { mainFile: file2, mmProjFile: file1 };
  if (isMmProj(file2.name)) return { mainFile: file1, mmProjFile: file2 };
  if (file1.size > 0 && file2.size > 0) {
    return file1.size >= file2.size
      ? { mainFile: file1, mmProjFile: file2 }
      : { mainFile: file2, mmProjFile: file1 };
  }
  return { mainFile: file1, mmProjFile: file2 };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export async function importGgufFiles(
  files: Array<{ uri: string; name: string | null; size: number | null }>,
  deps: GgufImportDeps,
): Promise<void> {
  const { setAlertState, setImportProgress, addDownloadedModel } = deps;

  if (files.length === 1) {
    const model = await modelManager.importLocalModel({
      sourceUri: files[0].uri,
      fileName: files[0].name ?? 'unknown',
      onProgress: p => setImportProgress(p),
    });
    addDownloadedModel(model);
    setAlertState(showAlert('Success', `${model.name} imported successfully!`));
    return;
  }

  const file1: GgufFileRef = { uri: files[0].uri, name: files[0].name ?? '', size: files[0].size ?? 0 };
  const file2: GgufFileRef = { uri: files[1].uri, name: files[1].name ?? '', size: files[1].size ?? 0 };
  const { mainFile, mmProjFile } = classifyGgufPair(file1, file2);

  const confirmed = await new Promise<boolean>(resolve => {
    setAlertState(
      showAlert(
        'Import Vision Model?',
        `Main model:  ${mainFile.name}\nProjector:    ${mmProjFile.name}\n\nIf these look wrong, cancel and rename your files.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => { setAlertState(hideAlert()); resolve(false); } },
          { text: 'Import', onPress: () => { setAlertState(hideAlert()); resolve(true); } },
        ],
      ),
    );
  });

  if (!confirmed) return;

  const model = await modelManager.importLocalModel({
    sourceUri: mainFile.uri,
    fileName: mainFile.name,
    onProgress: p => setImportProgress(p),
    mmProjSourceUri: mmProjFile.uri,
    mmProjFileName: mmProjFile.name,
  });
  addDownloadedModel(model);
  setAlertState(showAlert('Success', `${model.name} imported with vision projector!`));
}
