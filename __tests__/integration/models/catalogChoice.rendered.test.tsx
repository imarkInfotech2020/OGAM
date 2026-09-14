import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

describe('Model choice on the phone', () => {
  it('opens the image picker directly from the Home model summary', async () => {
    installNativeBoundary({ fs: true, ram: { platform: 'android', totalBytes: 8 * GB, availBytes: 6 * GB } });
    const React = require('react');
    const { render, fireEvent, waitFor } = requireRTL();
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const navigation = { navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} };
    const home = render(React.createElement(HomeScreen, { navigation }));

    fireEvent.press(await waitFor(() => home.getByTestId('model-summary-image-open')));
    await waitFor(() => { expect(home.getByText('IMAGE MODEL')).toBeTruthy(); });
    expect(home.queryByText('TEXT MODEL')).toBeNull();
  });

  it('keeps size, type, RAM, and curated facts on a compact model card', () => {
    installNativeBoundary();
    const React = require('react');
    const { render } = requireRTL();
    const { ModelCard } = require('../../../src/components/ModelCard');
    const card = render(React.createElement(ModelCard, {
      model: { id: 'sample/model', name: 'Sample Model', author: 'Sample', modelType: 'text', paramCount: 7, minRamGB: 8, downloads: 1200 },
      file: { name: 'sample-q4.gguf', size: 4 * GB, quantization: 'Q4_K_M' },
      compact: true,
      recommended: { chips: ['Fast'] },
    }));
    expect(card.getByText(/Q4_K_M.*Text.*7B params.*8GB\+ RAM.*Fast/)).toBeTruthy();
  });

  it('shows the iOS text picker estimate from GGUF metadata with one approximation mark', async () => {
    installNativeBoundary({
      llama: true,
      ram: { platform: 'ios', totalBytes: 12 * GB, availBytes: 8 * GB },
      llamaModelInfo: {
        'general.architecture': 'qwen3',
        'qwen3.block_count': 36,
        'qwen3.attention.head_count': 32,
        'qwen3.attention.head_count_kv': 8,
        'qwen3.embedding_length': 4096,
        'qwen3.attention.key_length': 128,
        'qwen3.attention.value_length': 128,
        'qwen3.attention.sliding_window': 4096,
      },
    });
    const React = require('react');
    const { render, waitFor } = requireRTL();
    const { TextTab } = require('../../../src/components/ModelSelectorModal/TextTab');
    const model = createDownloadedModel({
      id: 'qwythos',
      name: 'Qwythos 9B',
      engine: 'llama',
      filePath: '/docs/models/qwythos.gguf',
      fileName: 'qwythos.gguf',
      fileSize: 5.5 * GB,
    });
    const picker = render(React.createElement(TextTab, {
      downloadedModels: [model],
      remoteModels: [],
      currentModelPath: null,
      currentRemoteModelId: null,
      isAnyLoading: false,
      onSelectModel: () => {},
      onSelectRemoteModel: () => {},
      onUnloadModel: () => {},
      onAddServer: () => {},
    }));

    await waitFor(() => {
      const hint = picker.getByText(/^~\d+\.\d GB RAM/);
      const estimate = Number(String(hint.props.children).match(/[\d.]+/)?.[0]);
      expect(estimate).toBeLessThan(7.2);
      expect(picker.queryByText(/^~~/)).toBeNull();
    });
  });
});
