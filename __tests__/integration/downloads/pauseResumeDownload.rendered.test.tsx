import { installNativeBoundary, requireRTL, MB } from '../../harness/nativeBoundary';

describe('Model download pause and resume', () => {
  it('keeps partial bytes and resumes the same text transfer from Download Manager', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true });
    const React = require('react');
    const { render, waitFor, fireEvent } = requireRTL();
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');

    registerCoreDownloadProviders();
    boundary.download!.seedActive({
      downloadId: 'dl-pause', modelId: 'author/model', fileName: 'model.gguf',
      modelType: 'text', status: 'running', bytesDownloaded: 64 * MB, totalBytes: 256 * MB,
    });
    await hydrateDownloadStore();

    const screen = render(React.createElement(DownloadManagerScreen, {}));
    const pause = await waitFor(() => screen.getByLabelText('Pause model.gguf'));
    expect(screen.queryByText('Pause')).toBeNull();
    fireEvent.press(pause);
    await waitFor(() => { expect(screen.getByLabelText('Resume model.gguf')).toBeTruthy(); });
    expect(screen.queryByText('Resume')).toBeNull();
    expect(boundary.download!.active()[0].bytesDownloaded).toBe(64 * MB);
    expect(boundary.download!.active()[0].status).toBe('paused');

    fireEvent.press(screen.getByLabelText('Resume model.gguf'));
    await waitFor(() => { expect(screen.getByLabelText('Pause model.gguf')).toBeTruthy(); });
    expect(boundary.download!.active()[0].downloadId).toBe('dl-pause');
    expect(boundary.download!.active()[0].bytesDownloaded).toBe(64 * MB);
    expect(boundary.download!.active()[0].status).toBe('running');
  });
  it('keeps partial image bytes when the user pauses and resumes a native image transfer', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true });
    const React = require('react');
    const { render, waitFor, fireEvent } = requireRTL();
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');

    registerCoreDownloadProviders();
    boundary.download!.seedActive({
      downloadId: 'dl-image-pause', modelId: 'image:sample', fileName: 'sample.zip',
      modelType: 'image', status: 'running', bytesDownloaded: 32 * MB, totalBytes: 128 * MB,
    });
    await hydrateDownloadStore();

    const screen = render(React.createElement(DownloadManagerScreen, {}));
    fireEvent.press(await waitFor(() => screen.getByLabelText('Pause sample.zip')));
    await waitFor(() => { expect(screen.getByLabelText('Resume sample.zip')).toBeTruthy(); });
    expect(boundary.download!.active()[0]).toMatchObject({
      downloadId: 'dl-image-pause', bytesDownloaded: 32 * MB, status: 'paused',
    });

    fireEvent.press(screen.getByLabelText('Resume sample.zip'));
    await waitFor(() => { expect(screen.getByLabelText('Pause sample.zip')).toBeTruthy(); });
    expect(boundary.download!.active()[0]).toMatchObject({
      downloadId: 'dl-image-pause', bytesDownloaded: 32 * MB, status: 'running',
    });
  });
  it('keeps partial speech-model bytes when the user pauses and resumes', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true });
    const React = require('react');
    const { render, waitFor, fireEvent } = requireRTL();
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');

    registerCoreDownloadProviders();
    boundary.download!.seedActive({
      downloadId: 'dl-speech-pause', modelId: 'base.en', fileName: 'base.en.bin',
      modelType: 'stt', status: 'running', bytesDownloaded: 16 * MB, totalBytes: 64 * MB,
    });
    await hydrateDownloadStore();

    const screen = render(React.createElement(DownloadManagerScreen, {}));
    fireEvent.press(await waitFor(() => screen.getByLabelText('Pause base.en.bin')));
    await waitFor(() => { expect(screen.getByLabelText('Resume base.en.bin')).toBeTruthy(); });
    expect(boundary.download!.active()[0]).toMatchObject({
      downloadId: 'dl-speech-pause', bytesDownloaded: 16 * MB, status: 'paused',
    });
    fireEvent.press(screen.getByLabelText('Resume base.en.bin'));
    await waitFor(() => { expect(screen.getByLabelText('Pause base.en.bin')).toBeTruthy(); });
    expect(boundary.download!.active()[0]).toMatchObject({
      downloadId: 'dl-speech-pause', bytesDownloaded: 16 * MB, status: 'running',
    });
  });
  it('pauses the current file in a multi-file image download and resumes its native transfer', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true });
    const React = require('react');
    const { render, waitFor, fireEvent } = requireRTL();
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { downloadHuggingFaceModel } = require('../../../src/services/imageDownloadActions');
    const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');

    registerCoreDownloadProviders();
    const download = downloadHuggingFaceModel({
      id: 'sample-multi', name: 'Sample Multi', description: 'Image model',
      downloadUrl: '', size: 128 * MB, style: 'default', backend: 'mnn',
      huggingFaceRepo: 'sample/model', huggingFaceFiles: [{ path: 'weights.bin', size: 128 * MB }],
    }, {
      addDownloadedImageModel: () => {}, activeImageModelId: null,
      setActiveImageModelId: () => {}, setAlertState: () => {}, triedImageGen: true,
    });
    const screen = render(React.createElement(DownloadManagerScreen, {}));
    await waitFor(() => { expect(boundary.download!.active()).toHaveLength(1); });
    const transfer = boundary.download!.active()[0];
    boundary.download!.seedActive({ ...transfer, bytesDownloaded: 32 * MB });

    fireEvent.press(await waitFor(() => screen.getByLabelText('Pause Sample Multi')));
    await waitFor(() => { expect(screen.getByLabelText('Resume Sample Multi')).toBeTruthy(); });
    expect(boundary.download!.active()[0]).toMatchObject({
      downloadId: transfer.downloadId, bytesDownloaded: 32 * MB, status: 'paused',
    });
    fireEvent.press(screen.getByLabelText('Resume Sample Multi'));
    await waitFor(() => { expect(screen.getByLabelText('Pause Sample Multi')).toBeTruthy(); });
    expect(boundary.download!.active()[0]).toMatchObject({
      downloadId: transfer.downloadId, bytesDownloaded: 32 * MB, status: 'running',
    });
    download.catch(() => {});
  });
});
