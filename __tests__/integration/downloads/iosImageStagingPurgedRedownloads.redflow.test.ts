/**
 * RED-FLOW (integration) — iOS image-model download stuck "failed" after the staged bytes are purged.
 *
 * DEVICE GROUND TRUTH: on a production build, SDXL (Core ML) completed (2.8/2.8 GB) then showed
 * "…coreml_apple_…xl-base-ios couldn't be opened because there is no such file", and Retry did
 * nothing. Root cause (native, fixed separately): the completed file was staged in
 * NSTemporaryDirectory(), which iOS purges across relaunch — so finalize (moveCompletedDownload →
 * unzip) ran against a file the OS had deleted.
 *
 * This test guards the JS half: when the completed bytes are unrecoverable (native
 * moveCompletedDownload rejects "no such file" AND no valid zip/extracted dir survives on disk),
 * the retry-finalize path must RE-DOWNLOAD from scratch instead of dead-ending on the same error
 * every tap. Before the fix, resumeZipDownload rethrew and the row stuck at 'failed' with no fresh
 * download issued. Integration boundary: only the native download module + filesystem are faked;
 * the real resume/finalize/proceedWithDownload/store all run.
 *
 * Falsifier: revert the reDownloadFromMetadata fallback in imageDownloadResume → the entry stays
 * 'failed' and no new native download row appears → RED.
 */
import { installNativeBoundary } from '../../harness/nativeBoundary';

describe('iOS image staging purged — retry re-downloads instead of dead-ending (red-flow)', () => {
  it('re-issues a fresh download when the completed bytes are gone at finalize', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true });
    const { useDownloadStore, isActiveStatus } = require('../../../src/stores/downloadStore');
    const { useAppStore } = require('../../../src/stores');
    const { makeImageModelKey } = require('../../../src/utils/modelKey');
    const { resumeImageDownload } = require('../../../src/screens/ModelsScreen/imageDownloadResume');

    const modelId = 'coreml_apple_coreml-stable-diffusion-xl-base-ios';
    const fileName = `${modelId}.zip`;
    const modelKey = makeImageModelKey(modelId);
    const total = 2.8 * 1024 * 1024 * 1024;

    // A completed CoreML zip download that failed finalize: bytes fully present, marked 'failed'.
    // metadata carries a real download URL (the zip download type) so a re-download is possible.
    useDownloadStore.getState().add({
      modelKey,
      downloadId: 'dl-sdxl',
      modelId: `image:${modelId}`,
      fileName,
      quantization: '',
      modelType: 'image',
      status: 'failed',
      bytesDownloaded: total,
      totalBytes: total,
      combinedTotalBytes: total,
      progress: 1,
      createdAt: 1,
      metadataJson: JSON.stringify({
        imageDownloadType: 'zip',
        imageModelName: 'SDXL (iOS)',
        imageModelDescription: '4-bit quantized, 768x768, ANE-optimized',
        imageModelSize: total,
        imageModelStyle: 'realistic',
        imageModelBackend: 'coreml',
        imageModelAttentionVariant: 'split_einsum',
        imageModelRepo: 'apple/coreml-stable-diffusion-xl-base-ios',
        imageModelDownloadUrl: 'https://huggingface.co/apple/coreml-stable-diffusion-xl-base-ios/resolve/main/split_einsum/compiled.zip',
      }),
    });

    // BOUNDARY (the device fact this reproduces): the completed file was staged in NSTemporaryDirectory
    // and iOS purged it, so the native move of the staged source now fails "no such file". Nothing
    // valid survives on disk (no zip at zipPath, no extracted model dir) — this is the unrecoverable case.
    boundary.download!.module.moveCompletedDownload.mockRejectedValue(
      new Error(`The file "download_dl-sdxl_${fileName}" couldn't be opened because there is no such file.`),
    );

    const entry = useDownloadStore.getState().downloads[modelKey];
    const appState = useAppStore.getState();
    const deps = {
      addDownloadedImageModel: appState.addDownloadedImageModel,
      activeImageModelId: appState.activeImageModelId,
      setActiveImageModelId: appState.setActiveImageModelId,
      setAlertState: () => {},
      triedImageGen: false,
    };

    // Precondition: no native download in flight, and the row is a dead 'failed' (the screenshot state).
    expect(boundary.download!.active().length).toBe(0);
    expect(useDownloadStore.getState().downloads[modelKey].status).toBe('failed');

    // ACT: the retry-finalize path the Download Manager runs for an all-bytes-present image download.
    await resumeImageDownload(entry, deps);

    // The user's recovery: a FRESH download is now in flight (real native row) and the row is
    // active again — not stuck 'failed'. RED before the fix: no new row, status stays 'failed'.
    const rows = boundary.download!.active();
    expect(rows.some(r => r.modelId === `image:${modelId}` || r.fileName === fileName)).toBe(true);
    expect(isActiveStatus(useDownloadStore.getState().downloads[modelKey].status)).toBe(true);
    expect(useDownloadStore.getState().downloads[modelKey].status).not.toBe('failed');
  });
});
