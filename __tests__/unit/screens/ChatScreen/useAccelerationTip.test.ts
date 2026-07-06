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

const kQuant = { id: 'unsloth/Qwen3-4B-Instruct-Q4_K_M', name: 'Qwen3 4B', engine: 'llama', quantization: 'Q4_K_M' } as any;
const q4_0 = { id: 'unsloth/Qwen3-4B-Instruct-Q4_0', name: 'Qwen3 4B Q4_0', engine: 'llama', quantization: 'Q4_0' } as any;

const setup = (over: Partial<Parameters<typeof useAccelerationTip>[0]> = {}) =>
  renderHook(() => useAccelerationTip({
    activeModel: kQuant, isRemote: false, inferenceBackend: INFERENCE_BACKENDS.CPU,
    downloadedModels: [kQuant], onActivateModel: jest.fn(), ...over,
  }));

describe('useAccelerationTip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enable: active model is already accelerable → flip the backend to HTP', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue({ hasNpu: true, hasGpu: false });
    const { result } = setup({ activeModel: q4_0, downloadedModels: [q4_0] });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.action).toBe('enable');
    act(() => result.current.onPrimary());
    expect(mockUpdateSettings).toHaveBeenCalledWith({ inferenceBackend: INFERENCE_BACKENDS.HTP });
  });

  it('switch: K-quant active + accelerable downloaded → enable backend AND activate it', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue({ hasNpu: true, hasGpu: false });
    const onActivateModel = jest.fn();
    const { result } = setup({ activeModel: kQuant, downloadedModels: [kQuant, q4_0], onActivateModel });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.action).toBe('switch');
    expect(result.current.targetModelName).toBe('Qwen3 4B Q4_0');
    act(() => result.current.onPrimary());
    expect(mockUpdateSettings).toHaveBeenCalledWith({ inferenceBackend: INFERENCE_BACKENDS.HTP });
    expect(onActivateModel).toHaveBeenCalledWith(q4_0);
  });

  it('download: K-quant active + none accelerable → open Models tab with prefilled search', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue({ hasNpu: true, hasGpu: false });
    const { result } = setup({ activeModel: kQuant, downloadedModels: [kQuant] });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.action).toBe('download');
    act(() => result.current.onPrimary());
    expect(mockNavigate).toHaveBeenCalledWith('Main', {
      screen: 'ModelsTab',
      params: { initialTab: 'text', initialSearchQuery: 'Qwen3-4B-Instruct Q4_0' },
    });
  });

  it('enable on OpenCL when only a GPU is present', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue({ hasNpu: false, hasGpu: true });
    const { result } = setup({ activeModel: q4_0, downloadedModels: [q4_0] });
    await waitFor(() => expect(result.current.visible).toBe(true));
    act(() => result.current.onPrimary());
    expect(mockUpdateSettings).toHaveBeenCalledWith({ inferenceBackend: INFERENCE_BACKENDS.OPENCL });
  });

  it('stays hidden when the device cannot accelerate', async () => {
    jest.spyOn(hardwareService, 'getAccelerationCapability').mockResolvedValue({ hasNpu: false, hasGpu: false });
    const { result } = setup();
    await act(async () => { await Promise.resolve(); });
    expect(result.current.visible).toBe(false);
  });
});
