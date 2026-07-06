import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAccelerationTip } from '../../../../src/screens/ChatScreen/useAccelerationTip';
import { hardwareService } from '../../../../src/services/hardware';
import { useAppStore } from '../../../../src/stores';
import { INFERENCE_BACKENDS } from '../../../../src/types';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockUpdateSettings = jest.fn();
jest.spyOn(useAppStore, 'getState').mockReturnValue({ updateSettings: mockUpdateSettings } as any);

// Both quants of a repo share the display name (derived from the repo id) — that's how
// same-base matching works. E2B is a DIFFERENT model (different name) than E4B.
const NAME = 'gemma-4-E4B-it-GGUF';
const kQuant = { id: 'g/E4B-Q4_K_M', name: NAME, engine: 'llama', quantization: 'Q4_K_M' } as any;
const q4_0 = { id: 'g/E4B-Q4_0', name: NAME, engine: 'llama', quantization: 'Q4_0' } as any;
const otherModelQ4_0 = { id: 'g/E2B-Q4_0', name: 'gemma-4-E2B-it-GGUF', engine: 'llama', quantization: 'Q4_0' } as any;
const llamaQ4_0 = { id: 'l/Llama3-Q4_0', name: 'Llama-3-8B-Instruct-GGUF', engine: 'llama', quantization: 'Q4_0' } as any;

const GPU = { hasNpu: false, hasGpu: true };
const NPU_ONLY = { hasNpu: true, hasGpu: false };

const setup = (over: Partial<Parameters<typeof useAccelerationTip>[0]> = {}) =>
  renderHook(() => useAccelerationTip({
    activeModel: kQuant, isRemote: false, inferenceBackend: INFERENCE_BACKENDS.CPU,
    downloadedModels: [kQuant], onActivateModel: jest.fn(), ...over,
  }));

describe('useAccelerationTip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enable (GPU device): accelerable model on CPU → turn on OpenCL', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue(GPU);
    const { result } = setup({ activeModel: q4_0, downloadedModels: [q4_0] });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.action).toBe('enable');
    expect(result.current.backend).toBe('gpu');
    act(() => result.current.onPrimary());
    expect(mockUpdateSettings).toHaveBeenCalledWith({ inferenceBackend: INFERENCE_BACKENDS.OPENCL });
  });

  it('switch: K-quant active + SAME-model accelerable build → enable GPU AND activate it', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue(GPU);
    const onActivateModel = jest.fn();
    // otherModelQ4_0 (E2B) must be ignored — only the same-base E4B Q4_0 qualifies.
    const { result } = setup({ activeModel: kQuant, downloadedModels: [kQuant, otherModelQ4_0, q4_0], onActivateModel });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.action).toBe('switch');
    act(() => result.current.onPrimary());
    expect(mockUpdateSettings).toHaveBeenCalledWith({ inferenceBackend: INFERENCE_BACKENDS.OPENCL });
    expect(onActivateModel).toHaveBeenCalledWith(q4_0);
  });

  it('download: K-quant active + only a DIFFERENT model is accelerable → prefilled search, no cross-switch', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue(GPU);
    const { result } = setup({ activeModel: kQuant, downloadedModels: [kQuant, otherModelQ4_0] });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.action).toBe('download');
    act(() => result.current.onPrimary());
    expect(mockNavigate).toHaveBeenCalledWith('Main', {
      screen: 'ModelsTab',
      params: { initialTab: 'text', initialSearchQuery: expect.stringContaining('Q4_0') },
    });
  });

  it('NPU (Beta) recommended only for a Llama model on an NPU-only device', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue(NPU_ONLY);
    const { result } = setup({ activeModel: llamaQ4_0, downloadedModels: [llamaQ4_0] });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.backend).toBe('npu');
    act(() => result.current.onPrimary());
    expect(mockUpdateSettings).toHaveBeenCalledWith({ inferenceBackend: INFERENCE_BACKENDS.HTP });
  });

  it('NEVER recommends NPU for Gemma on an NPU-only device (hidden)', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue(NPU_ONLY);
    const { result } = setup({ activeModel: q4_0, downloadedModels: [q4_0] });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.visible).toBe(false);
  });

  it('fallback: accelerator selected but the K-quant runs on CPU → switch to same-model Q4_0', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue(GPU);
    const onActivateModel = jest.fn();
    const { result } = setup({
      activeModel: kQuant, inferenceBackend: INFERENCE_BACKENDS.OPENCL,
      downloadedModels: [kQuant, q4_0], onActivateModel,
    });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.action).toBe('switch');
    expect(result.current.fellBack).toBe(true);
    act(() => result.current.onPrimary());
    expect(onActivateModel).toHaveBeenCalledWith(q4_0);
  });

  it('hidden when genuinely accelerated (GPU + an accelerable model)', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue(GPU);
    const { result } = setup({ activeModel: q4_0, inferenceBackend: INFERENCE_BACKENDS.OPENCL, downloadedModels: [q4_0] });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.visible).toBe(false);
  });

  it('stays hidden when the device cannot accelerate', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue({ hasNpu: false, hasGpu: false });
    const { result } = setup();
    await act(async () => { await Promise.resolve(); });
    expect(result.current.visible).toBe(false);
  });
});
