/**
 * Unit tests for importHelpers.ts
 *
 * Tests pure helpers (isMmProj, classifyGgufPair, getErrorMessage) directly,
 * and importGgufFiles via mocked dependencies.
 */

// ── Mocks (hoisted before imports) ─────────────────────────────────────────

const mockImportLocalModel = jest.fn();
jest.mock('../../../../src/services', () => ({
  modelManager: {
    importLocalModel: (...args: any[]) => mockImportLocalModel(...args),
    getImageModelsDirectory: jest.fn(() => '/models'),
  },
}));

jest.mock('../../../../src/components/CustomAlert', () => ({
  showAlert: jest.fn(),
  hideAlert: jest.fn(() => ({ visible: false })),
  initialAlertState: { visible: false },
}));

// ── Imports ─────────────────────────────────────────────────────────────────

import {
  isMmProj,
  classifyGgufPair,
  getErrorMessage,
  importGgufFiles,
  GgufFileRef,
} from '../../../../src/screens/ModelsScreen/importHelpers';
import { showAlert, hideAlert } from '../../../../src/components/CustomAlert';

const mockShowAlert = showAlert as jest.Mock;
const mockHideAlert = hideAlert as jest.Mock;

// ── Helpers ─────────────────────────────────────────────────────────────────

const makeFile = (name: string, size: number, uri = `file://${name}`): GgufFileRef => ({ uri, name, size });

// ── isMmProj ────────────────────────────────────────────────────────────────

describe('isMmProj', () => {
  it('returns true for filename containing "mmproj"', () => {
    expect(isMmProj('llava-mmproj-f16.gguf')).toBe(true);
  });

  it('returns true for filename containing "projector"', () => {
    expect(isMmProj('vision_projector.gguf')).toBe(true);
  });

  it('returns true for filename containing "clip" ending in .gguf', () => {
    expect(isMmProj('clip-vit-large.gguf')).toBe(true);
  });

  it('returns false for "clip" in a non-.gguf file', () => {
    expect(isMmProj('clip-model.bin')).toBe(false);
  });

  it('returns false for a normal main model filename', () => {
    expect(isMmProj('llava-v1.5-7b-Q4_K_M.gguf')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isMmProj('MMPROJ-F16.GGUF')).toBe(true);
    expect(isMmProj('Vision_Projector.GGUF')).toBe(true);
  });
});

// ── classifyGgufPair ────────────────────────────────────────────────────────

describe('classifyGgufPair', () => {
  it('identifies mmproj by filename in file1 position', () => {
    const mmproj = makeFile('llava-mmproj-f16.gguf', 100);
    const main = makeFile('llava-7b-Q4_K_M.gguf', 4000);
    const { mainFile, mmProjFile } = classifyGgufPair(mmproj, main);
    expect(mainFile.name).toBe('llava-7b-Q4_K_M.gguf');
    expect(mmProjFile.name).toBe('llava-mmproj-f16.gguf');
  });

  it('identifies mmproj by filename in file2 position', () => {
    const main = makeFile('llava-7b-Q4_K_M.gguf', 4000);
    const mmproj = makeFile('llava-mmproj-f16.gguf', 100);
    const { mainFile, mmProjFile } = classifyGgufPair(main, mmproj);
    expect(mainFile.name).toBe('llava-7b-Q4_K_M.gguf');
    expect(mmProjFile.name).toBe('llava-mmproj-f16.gguf');
  });

  it('falls back to size: larger file is main model', () => {
    const big = makeFile('unknown-a.gguf', 5000);
    const small = makeFile('unknown-b.gguf', 200);
    const { mainFile, mmProjFile } = classifyGgufPair(big, small);
    expect(mainFile.name).toBe('unknown-a.gguf');
    expect(mmProjFile.name).toBe('unknown-b.gguf');
  });

  it('falls back to size when file2 is the larger one', () => {
    const small = makeFile('unknown-a.gguf', 200);
    const big = makeFile('unknown-b.gguf', 5000);
    const { mainFile, mmProjFile } = classifyGgufPair(small, big);
    expect(mainFile.name).toBe('unknown-b.gguf');
    expect(mmProjFile.name).toBe('unknown-a.gguf');
  });

  it('defaults to file1=main when both sizes are 0 and no name hint', () => {
    const f1 = makeFile('model-a.gguf', 0);
    const f2 = makeFile('model-b.gguf', 0);
    const { mainFile, mmProjFile } = classifyGgufPair(f1, f2);
    expect(mainFile.name).toBe('model-a.gguf');
    expect(mmProjFile.name).toBe('model-b.gguf');
  });

  it('treats equal-sized files as main=file1, mmproj=file2', () => {
    const f1 = makeFile('a.gguf', 1000);
    const f2 = makeFile('b.gguf', 1000);
    const { mainFile, mmProjFile } = classifyGgufPair(f1, f2);
    expect(mainFile.name).toBe('a.gguf');
    expect(mmProjFile.name).toBe('b.gguf');
  });
});

// ── getErrorMessage ─────────────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(getErrorMessage(new Error('Something broke'))).toBe('Something broke');
  });

  it('returns "Unknown error" for non-Error values', () => {
    expect(getErrorMessage('string error')).toBe('Unknown error');
    expect(getErrorMessage(42)).toBe('Unknown error');
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
    expect(getErrorMessage({ message: 'obj' })).toBe('Unknown error');
  });
});

// ── importGgufFiles ─────────────────────────────────────────────────────────

describe('importGgufFiles', () => {
  const mockSetAlertState = jest.fn();
  const mockSetImportProgress = jest.fn();
  const mockAddDownloadedModel = jest.fn();

  const deps = {
    setAlertState: mockSetAlertState,
    setImportProgress: mockSetImportProgress,
    addDownloadedModel: mockAddDownloadedModel,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowAlert.mockReturnValue({ visible: true });
    mockHideAlert.mockReturnValue({ visible: false });
  });

  // ── single GGUF ────────────────────────────────────────────────────────

  it('single GGUF: calls importLocalModel with correct opts and shows success', async () => {
    const fakeModel = { id: 'm1', name: 'MyModel' };
    mockImportLocalModel.mockResolvedValueOnce(fakeModel);

    await importGgufFiles(
      [{ uri: 'file://my-model.gguf', name: 'my-model.gguf', size: 4000 }],
      deps,
    );

    expect(mockImportLocalModel).toHaveBeenCalledWith({
      sourceUri: 'file://my-model.gguf',
      fileName: 'my-model.gguf',
      onProgress: expect.any(Function),
    });
    expect(mockAddDownloadedModel).toHaveBeenCalledWith(fakeModel);
    expect(mockSetAlertState).toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
    expect(mockShowAlert).toHaveBeenCalledWith('Success', 'MyModel imported successfully!');
  });

  it('single GGUF: null name falls back to "unknown"', async () => {
    mockImportLocalModel.mockResolvedValueOnce({ id: 'x', name: 'X' });
    await importGgufFiles([{ uri: 'file://x.gguf', name: null, size: 0 }], deps);
    expect(mockImportLocalModel).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'unknown' }));
  });

  // ── two GGUFs — user confirms ──────────────────────────────────────────

  it('two GGUFs: shows confirmation dialog and on confirm imports with mmproj args', async () => {
    const fakeModel = { id: 'm2', name: 'VisionModel' };
    mockImportLocalModel.mockResolvedValueOnce(fakeModel);

    // Capture buttons from showAlert and immediately press "Import"
    mockShowAlert.mockImplementationOnce((_title: string, _msg: string, buttons: any[]) => {
      buttons?.find((b: any) => b.text === 'Import')?.onPress();
      return { visible: true };
    });

    const file1 = { uri: 'file://llava-7b-Q4.gguf', name: 'llava-7b-Q4.gguf', size: 4200 };
    const file2 = { uri: 'file://llava-mmproj-f16.gguf', name: 'llava-mmproj-f16.gguf', size: 300 };

    await importGgufFiles([file1, file2], deps);

    // Confirmation dialog shown first
    expect(mockShowAlert).toHaveBeenCalledWith(
      'Import Vision Model?',
      expect.stringContaining('llava-7b-Q4.gguf'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Import' }),
      ]),
    );

    // importLocalModel called with mmproj fields
    expect(mockImportLocalModel).toHaveBeenCalledWith({
      sourceUri: file1.uri,
      fileName: file1.name,
      onProgress: expect.any(Function),
      mmProjSourceUri: file2.uri,
      mmProjFileName: file2.name,
    });

    expect(mockAddDownloadedModel).toHaveBeenCalledWith(fakeModel);
    expect(mockShowAlert).toHaveBeenCalledWith('Success', 'VisionModel imported with vision projector!');
  });

  it('two GGUFs: classifies correctly — mmproj name in file1 position swaps to projector', async () => {
    mockImportLocalModel.mockResolvedValueOnce({ id: 'v', name: 'VisionModel' });

    // file1 has mmproj in name → should become the projector, file2 is main
    const mmproj = { uri: 'file://mmproj-f16.gguf', name: 'mmproj-f16.gguf', size: 200 };
    const main = { uri: 'file://model-Q4.gguf', name: 'model-Q4.gguf', size: 4000 };

    mockShowAlert.mockImplementationOnce((_: string, __: string, buttons: any[]) => {
      buttons?.find((b: any) => b.text === 'Import')?.onPress();
      return { visible: true };
    });

    await importGgufFiles([mmproj, main], deps);

    expect(mockImportLocalModel).toHaveBeenCalledWith(expect.objectContaining({
      sourceUri: main.uri,       // main model is file2
      mmProjSourceUri: mmproj.uri, // projector is file1
    }));
  });

  // ── two GGUFs — user cancels ───────────────────────────────────────────

  it('two GGUFs: on cancel, does NOT call importLocalModel', async () => {
    mockShowAlert.mockImplementationOnce((_title: string, _msg: string, buttons: any[]) => {
      buttons?.find((b: any) => b.text === 'Cancel')?.onPress();
      return { visible: true };
    });

    const file1 = { uri: 'file://llava-7b-Q4.gguf', name: 'llava-7b-Q4.gguf', size: 4200 };
    const file2 = { uri: 'file://llava-mmproj-f16.gguf', name: 'llava-mmproj-f16.gguf', size: 300 };

    await importGgufFiles([file1, file2], deps);

    expect(mockImportLocalModel).not.toHaveBeenCalled();
    expect(mockAddDownloadedModel).not.toHaveBeenCalled();
  });

  // ── onProgress wiring ──────────────────────────────────────────────────

  it('single GGUF: onProgress callback forwards progress to setImportProgress', async () => {
    mockImportLocalModel.mockImplementationOnce(async ({ onProgress }: any) => {
      onProgress({ fraction: 0.5, fileName: 'my-model.gguf' });
      return { id: 'x', name: 'X' };
    });

    await importGgufFiles(
      [{ uri: 'file://my-model.gguf', name: 'my-model.gguf', size: 100 }],
      deps,
    );

    expect(mockSetImportProgress).toHaveBeenCalledWith({ fraction: 0.5, fileName: 'my-model.gguf' });
  });
});
