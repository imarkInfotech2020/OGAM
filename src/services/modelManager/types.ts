import { DownloadedModel, DownloadProgress, ModelFile } from '../../types';

export type DownloadProgressCallback = (progress: DownloadProgress) => void;
export type DownloadCompleteCallback = (model: DownloadedModel) => void;
export type DownloadErrorCallback = (error: Error) => void;

// Callback for background download metadata persistence
export type BackgroundDownloadMetadataCallback = (
  downloadId: number,
  info: {
    modelId: string;
    fileName: string;
    quantization: string;
    author: string;
    totalBytes: number;
    mmProjFileName?: string;
    mmProjLocalPath?: string | null;
  } | null
) => void;

export type BackgroundDownloadContext =
  | { modelId: string; file: ModelFile; localPath: string; mmProjLocalPath: string | null; removeProgressListener: () => void }
  | { model: DownloadedModel; error: null }
  | { model: null; error: Error };
