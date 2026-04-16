import { BackgroundDownloadReasonCode, BackgroundDownloadStatus } from '../types';

export interface DownloadParams {
  url: string;
  fileName: string;
  modelId: string;
  title?: string;
  description?: string;
  totalBytes?: number;
  sha256?: string;
}

export interface MultiFileDownloadParams {
  files: { url: string; relativePath: string; size: number }[];
  fileName: string;
  modelId: string;
  destinationDir: string;
  totalBytes?: number;
}

export interface DownloadProgressEvent {
  downloadId: number;
  fileName: string;
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
  status: BackgroundDownloadStatus;
  reason?: string;
  reasonCode?: BackgroundDownloadReasonCode;
}

export interface DownloadCompleteEvent {
  downloadId: number;
  fileName: string;
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'completed';
  localUri: string;
}

export interface DownloadErrorEvent {
  downloadId: number;
  fileName: string;
  modelId: string;
  status: 'failed';
  reason: string;
  reasonCode?: BackgroundDownloadReasonCode;
}

export type DownloadProgressCallback = (event: DownloadProgressEvent) => void;
export type DownloadCompleteCallback = (event: DownloadCompleteEvent) => void;
export type DownloadErrorCallback = (event: DownloadErrorEvent) => void;
