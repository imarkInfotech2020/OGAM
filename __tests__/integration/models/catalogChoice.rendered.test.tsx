import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';

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
});
