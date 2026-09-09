import type { PersistedModelDownload } from '@offgrid/models';
import type { MobileApplicationFixture } from '../../harness/mobileApplicationFixture';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const MODEL = {
  id: 'anythingv5_npu_min',
  name: 'AnythingV5',
  displayName: 'Anything V5 (NPU non-flagship)',
  backend: 'qnn' as const,
  variant: 'min',
  downloadUrl: 'https://models.test/AnythingV5_qnn2.28_min.zip',
  fileName: 'AnythingV5_qnn2.28_min.zip',
  size: 1_000,
  repo: 'offgrid/image-test',
};
const MODEL_ID = `image:${MODEL.id}`;
const DOWNLOAD_ID = `${MODEL_ID}/${MODEL.fileName}`;
let fixture: MobileApplicationFixture | null = null;

afterEach(async () => {
  await fixture?.dispose();
  fixture = null;
});

const persistedDownload: PersistedModelDownload = {
  manifest: {
    id: DOWNLOAD_ID,
    modelId: MODEL_ID,
    kind: 'image',
    revision: 'main',
    artifacts: [{
      id: 'primary',
      name: MODEL.fileName,
      role: 'primary',
      required: true,
      localName: MODEL.fileName,
      url: MODEL.downloadUrl,
      sizeBytes: MODEL.size,
    }],
  },
  phase: 'downloading',
  artifacts: [{
    artifactId: 'primary',
    phase: 'downloading',
    transferId: 'image-transfer',
    bytesDownloaded: 400,
    totalBytes: MODEL.size,
  }],
  createdAt: 1,
  updatedAt: 2,
  attempt: 1,
};

describe('Image Models download projection', () => {
  it('shows canonical image download progress on the matching model card', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true });
    boundary.download!.seedActive({
      downloadId: 'image-transfer',
      modelId: MODEL_ID,
      fileName: MODEL.fileName,
      modelType: 'image',
      status: 'running',
      bytesDownloaded: 400,
      totalBytes: MODEL.size,
    });
    const { seedMobileDownloadJournal, startMobileApplicationFixture } =
      require('../../harness/mobileApplicationFixture') as typeof import('../../harness/mobileApplicationFixture');
    await seedMobileDownloadJournal([persistedDownload]);
    fixture = await startMobileApplicationFixture();
    await fixture.refreshModels();

    const React = require('react');
    const { render, waitFor } = requireRTL();
    const { ImageModelsTab } = require('../../../src/screens/ModelsScreen/ImageModelsTab');
    const { initialAlertState } = require('../../../src/components/CustomAlert');
    const noOp = () => undefined;
    const ui = render(React.createElement(ImageModelsTab, {
      imageSearchQuery: '', setImageSearchQuery: noOp,
      hfModelsLoading: false, hfModelsError: null,
      filteredHFModels: [MODEL], availableHFModels: [MODEL],
      backendFilter: 'all', setBackendFilter: noOp,
      styleFilter: 'all', setStyleFilter: noOp,
      sdVersionFilter: 'all', setSdVersionFilter: noOp,
      imageFilterExpanded: null, setImageFilterExpanded: noOp,
      imageFiltersVisible: false, setImageFiltersVisible: noOp,
      hasActiveImageFilters: false,
      showRecommendedOnly: false, setShowRecommendedOnly: noOp,
      showRecHint: false, setShowRecHint: noOp,
      imageRec: null, ramGB: 8, imageRecommendation: 'Image models available',
      handleDownloadImageModel: noOp, handleCancelImageDownload: noOp,
      loadHFModels: noOp, clearImageFilters: noOp,
      setUserChangedBackendFilter: noOp,
      isRecommendedModel: () => false,
      setAlertState: noOp,
      alertState: initialAlertState,
    }));

    await waitFor(() => expect(ui.getByText('40%')).toBeTruthy());
    expect(ui.getByText('400 B / 1000 B')).toBeTruthy();
    expect(ui.getByTestId('image-model-card-0-pause')).toBeTruthy();
  });
});
