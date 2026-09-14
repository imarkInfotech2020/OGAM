import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';

describe('image model selection loading state', () => {
  it('shows theme green dots while the selected image model loads', async () => {
    const boundary = installNativeBoundary({
      fs: true,
      ram: { platform: 'ios', totalBytes: 12 * GB, availBytes: 8 * GB },
    });
    const React = require('react');
    const { StyleSheet } = require('react-native');
    const rtl = requireRTL();
    const { createONNXImageModel } = require('../../utils/factories');
    const { useAppStore } = require('../../../src/stores');
    const { ModelSelectorModal } = require('../../../src/components/ModelSelectorModal');
    const model = createONNXImageModel({
      id: 'theme-image',
      name: 'Theme Image',
      modelPath: '/models/theme-image',
      backend: 'coreml',
      size: 64 * 1024 * 1024,
    });
    boundary.fs!.seedFile('/models/theme-image/model.mlmodelc', 64 * 1024 * 1024);
    useAppStore.getState().addDownloadedImageModel(model);

    let finishLoad: (() => void) | undefined;
    let firstLoad = true;
    const loadModel = async () => {
      if (!firstLoad) return true;
      firstLoad = false;
      return new Promise<boolean>(resolve => {
        finishLoad = () => resolve(true);
      });
    };
    Object.defineProperty(boundary.diffusion.module, 'loadModel', { value: loadModel });
    const view = rtl.render(React.createElement(ModelSelectorModal, {
      visible: true,
      initialTab: 'image',
      onClose: () => {},
      onSelectModel: () => {},
      onUnloadModel: () => {},
      isLoading: false,
    }));

    rtl.fireEvent.press(await rtl.waitFor(() => view.getByTestId('image-model-row-theme-image')));
    const loader = await rtl.waitFor(() => view.getByTestId('model-row-loading'));
    expect(loader.children).toHaveLength(3);
    for (const dot of loader.children) {
      if (typeof dot === 'string') throw new Error('A loading dot did not render');
      const style = StyleSheet.flatten(dot.props.style);
      expect(['#34D399', '#059669']).toContain(style.backgroundColor);
    }

    await rtl.waitFor(() => expect(finishLoad).toBeDefined());
    await rtl.act(async () => { finishLoad?.(); });
    await rtl.waitFor(() => expect(view.queryByTestId('model-row-loading')).toBeNull());
    view.unmount();
  });
});
