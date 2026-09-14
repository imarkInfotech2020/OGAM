import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AutoSetupScreen } from '../../../src/screens/AutoSetupScreen';
import type { AutoSetupCatalogBoundaries } from '../../../src/services/autoSetupCatalog';
import { createAutoSetupSession } from '../../../src/services/autoSetupService';

const MB = 1024 * 1024;

const catalog: AutoSetupCatalogBoundaries = {
  totalMemoryGB: () => 12,
  fetchTextFiles: async models =>
    Object.fromEntries(
      models.map(model => [
        model.id,
        [
          {
            name: 'model.gguf',
            size: 400 * MB,
            quantization: 'Q4_K_M',
            downloadUrl: 'https://models.test/model.gguf',
          },
        ],
      ]),
    ),
  imageRecommendation: async () => ({
    recommendedBackend: 'qnn',
    compatibleBackends: ['qnn'],
    qnnVariant: '8gen2',
    bannerText: 'NPU models available',
  }),
  imageModels: async () => [
    {
      id: 'absolutereality_cpu',
      name: 'Absolute Reality (GPU)',
      description: 'Absolute Reality',
      size: 50 * MB,
      downloadUrl: 'https://models.test/absolute-reality-gpu.zip',
      style: 'photorealistic',
      backend: 'mnn',
    },
    {
      id: 'naianime_npu_8gen2',
      name: 'NAI Anime (NPU 8gen2)',
      description: 'NAI Anime',
      size: 100 * MB,
      downloadUrl: 'https://models.test/nai-anime.zip',
      style: 'anime',
      backend: 'qnn',
      variant: '8gen2',
    },
    {
      id: 'absolutereality_npu_8gen2',
      name: 'Absolute Reality (NPU 8gen2)',
      description: 'Absolute Reality',
      size: 200 * MB,
      downloadUrl: 'https://models.test/absolute-reality.zip',
      style: 'photorealistic',
      backend: 'qnn',
      variant: '8gen2',
    },
  ],
};

test('Auto Setup shows Absolute Reality when the device catalog would choose NAI Anime', async () => {
  const navigation = { push() {}, replace() {} } as never;
  const ui = render(
    <AutoSetupScreen
      navigation={navigation}
      sessionFactory={() => createAutoSetupSession({ catalog })}
    />,
  );

  await waitFor(() =>
    expect(ui.getByTestId('auto-setup-plan-lean')).toBeTruthy(),
  );
  for (const tier of ['lean', 'balanced', 'extreme']) {
    fireEvent.press(ui.getByTestId(`auto-setup-plan-${tier}`));
    expect(ui.getByText('Absolute Reality (NPU 8gen2)')).toBeTruthy();
    expect(ui.queryByText('Absolute Reality (GPU)')).toBeNull();
    expect(ui.queryByText('NAI Anime (NPU 8gen2)')).toBeNull();
  }
});

test('Auto Setup offers the GPU model when the device recommends GPU', async () => {
  const navigation = { push() {}, replace() {} } as never;
  const ui = render(
    <AutoSetupScreen
      navigation={navigation}
      sessionFactory={() =>
        createAutoSetupSession({
          catalog: {
            ...catalog,
            imageRecommendation: async () => ({
              recommendedBackend: 'mnn',
              compatibleBackends: ['mnn'],
              bannerText: 'GPU models available',
            }),
          },
        })
      }
    />,
  );

  await waitFor(() =>
    expect(ui.getByTestId('auto-setup-plan-balanced')).toBeTruthy(),
  );
  fireEvent.press(ui.getByTestId('auto-setup-plan-balanced'));
  expect(ui.getByText('Absolute Reality (GPU)')).toBeTruthy();
  expect(ui.queryByText('Absolute Reality (NPU 8gen2)')).toBeNull();
});
