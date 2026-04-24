import { DownloadedModel, DownloadProgress, ModelFile } from '../../types';

export type DownloadProgressCallback = (progress: DownloadProgress) => void;
export type DownloadCompleteCallback = (model: DownloadedModel) => void;
export type DownloadErrorCallback = (error: Error) => void;

export type BackgroundDownloadMetadataCallback = (
  downloadId: string,
  info: {
    modelId: string;
    fileName: string;
    quantization: string;
    author: string;
    totalBytes: number;
    mainFileSize?: number;
    mmProjFileName?: string;
    mmProjFileSize?: number;
    mmProjLocalPath?: string | null;
    mmProjDownloadId?: string;
  } | null
) => void;

export type BackgroundDownloadContext =
  | {
      modelId: string;
      file: ModelFile;
      localPath: string;
      mmProjLocalPath: string | null;
      removeProgressListener: () => void;
      mmProjDownloadId?: string;
      mmProjCompleted: boolean;
      mainCompleted: boolean;
      mainCompleteHandled?: boolean;
      mmProjCompleteHandled?: boolean;
      isFinalizing?: boolean;
      removeMmProjProgressListener?: () => void;
    }
  | { model: DownloadedModel; error: null }
  | { model: null; error: Error };
