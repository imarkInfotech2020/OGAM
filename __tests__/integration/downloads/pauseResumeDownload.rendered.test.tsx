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
    fireEvent.press(pause);
    await waitFor(() => { expect(screen.getByLabelText('Resume model.gguf')).toBeTruthy(); });
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
});
