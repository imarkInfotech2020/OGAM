/**
 * Model download abstraction — the single uniform contract for downloading ANY
 * model type (text / image / stt / tts).
 *
 * Today each type downloads its own way (text+image-zip via the robust native
 * backgroundDownloadService; image multi-file via an in-process loop; STT via
 * downloadFileTo/RNFS; TTS via executorch's own fetcher) and the Download Manager
 * branches per type to list/cancel/delete them. That per-type wiring is why each
 * type breaks differently and downloads "get stuck for days".
 *
 * This is the seam: every domain exposes a `DownloadProvider`; the UI talks ONLY
 * to `ModelDownloadService`, which presents one list and one set of controls and
 * dispatches to the right provider by `modelType`. Adding a model type = register
 * a provider; the UI never changes.
 *
 * See docs/design/MODEL_DOWNLOAD_SERVICE.md.
 */

export type ModelDownloadType = 'text' | 'image' | 'stt' | 'tts';

export type ModelDownloadStatus =
  | 'queued'        // accepted, not yet transferring
  | 'downloading'   // bytes moving
  | 'paused'        // interrupted (e.g. waiting for network / app was killed) — resumable
  | 'completed'     // on disk + registered in its domain store
  | 'error';        // failed; retryable

/** One uniform view of a model's download, independent of type or backend. */
export interface ModelDownload {
  /** Stable unique key for this download (provider-scoped, e.g. `${modelType}:${modelId}`). */
  id: string;
  modelType: ModelDownloadType;
  /** Human label shown in the UI. */
  name: string;
  /** Total expected bytes (0 if a provider genuinely can't report it, e.g. Kokoro). */
  sizeBytes: number;
  bytesDownloaded: number;
  /** 0..1. Providers that only know a fraction (Kokoro) set bytes from progress*size. */
  progress: number;
  status: ModelDownloadStatus;
  /** Final on-disk path once completed (when the provider can give one). */
  filePath?: string;
  /** Human-readable failure reason when status === 'error'. */
  error?: string;
}

/**
 * Each model domain implements ONE provider. It knows how to enumerate, control,
 * and observe its own downloads — but exposes them through the uniform shape so
 * the service (and the UI) never branch on the concrete type. A provider may be
 * backed by the native background service, a store, or an external fetcher; that
 * detail stays inside the provider.
 */
export interface DownloadProvider {
  readonly modelType: ModelDownloadType;

  /** Current downloads for this type — both in-progress and completed. */
  list(): Promise<ModelDownload[]>;

  /** Cancel an in-progress download (and clean up partial files). */
  cancel(id: string): Promise<void>;

  /** Retry a failed/stuck download. */
  retry(id: string): Promise<void>;

  /** Delete a completed (or partially-downloaded) model from disk + its store. */
  remove(id: string): Promise<void>;

  /**
   * Subscribe to "something changed" for this type so the service can re-list.
   * Return an unsubscribe fn. A provider with no reactive source (e.g. an external
   * fetcher) may return a no-op and rely on the service's polling fallback.
   */
  subscribe(onChange: () => void): () => void;
}
