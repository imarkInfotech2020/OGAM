import { installNativeBoundary, requireRTL, MB } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

jest.mock('@react-native-community/slider', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { View } = require('react-native');
    return <View {...props} />;
  },
}));

it('uses the selected GGUF header for context before loading and updates on selection', async () => {
  const boundary = installNativeBoundary({ llama: true, fs: true });
  const React = require('react');
  const { render, fireEvent, waitFor } = requireRTL();
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
    ?? require('@react-native-async-storage/async-storage');
  const { HomeScreen } = require('../../../src/screens/HomeScreen');
  const { GenerationSettingsModal } = require('../../../src/components/GenerationSettingsModal');
  const { useAppStore } = require('../../../src/stores');

  const docs = boundary.fs!.DocumentDirectoryPath;
  const models = [
    { id: 'large', name: 'Large model', fileName: 'large.gguf', max: 32768 },
    { id: 'small', name: 'Small model', fileName: 'small.gguf', max: 4096 },
  ];
  for (const model of models) boundary.fs!.seedFile(`${docs}/models/${model.fileName}`, 500 * MB);
  await AsyncStorage.setItem('@local_llm/downloaded_models', JSON.stringify(models.map(model =>
    createDownloadedModel({ id: model.id, name: model.name, engine: 'llama', filePath: `${docs}/models/${model.fileName}`, fileName: model.fileName }),
  )));
  boundary.llama!.module.loadLlamaModelInfo.mockImplementation(async (path: string) => ({
    'general.architecture': 'qwen3',
    'qwen3.context_length': path.endsWith('small.gguf') ? '4096' : '32768',
  }));

  const nav = { navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} };
  const home = render(React.createElement(HomeScreen, { navigation: nav }));
  await waitFor(() => expect(useAppStore.getState().downloadedModels).toHaveLength(2));
  fireEvent.press(home.getByTestId('browse-models-button'));
  fireEvent.press(await waitFor(() => home.getByTestId('text-model-row-large')));
  await waitFor(() => expect(useAppStore.getState().activeModelId).toBe('large'));

  const settings = render(React.createElement(GenerationSettingsModal, { visible: true, onClose: () => {} }));
  fireEvent.press(settings.getByText('TEXT GENERATION'));
  await waitFor(() => expect(settings.getByTestId('setting-contextLength-slider').props.maximumValue).toBe(32768));
  expect(useAppStore.getState().loadedTextModelId).toBeNull();
  settings.unmount();
  home.unmount();

  const nextHome = render(React.createElement(HomeScreen, { navigation: nav }));
  fireEvent.press(await waitFor(() => nextHome.getByTestId('models-summary')));
  fireEvent.press(await waitFor(() => nextHome.getByTestId('models-row-text')));
  fireEvent.press(await waitFor(() => nextHome.getByTestId('text-model-row-small')));
  const nextSettings = render(React.createElement(GenerationSettingsModal, { visible: true, onClose: () => {} }));
  fireEvent.press(nextSettings.getByText('TEXT GENERATION'));
  await waitFor(() => expect(nextSettings.getByTestId('setting-contextLength-slider').props.maximumValue).toBe(4096));
  expect(useAppStore.getState().loadedTextModelId).toBeNull();
  nextSettings.unmount();
  nextHome.unmount();
});
