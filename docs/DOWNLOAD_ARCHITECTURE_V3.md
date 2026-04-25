# Download Architecture

> Reflects the current state of the codebase on branch `final-download-refactor`.

---

## Source of Truth

There is one JS-side source of truth for in-progress downloads: **`useDownloadStore`** (`src/stores/downloadStore.ts`).

| Data | Where it lives |
|---|---|
| Active / in-flight downloads | `useDownloadStore` (Zustand) |
| Completed text models | `useAppStore.downloadedModels` |
| Completed image models | `useAppStore.downloadedImageModels` |
| Persistent native state (survives process kill) | Android Room DB via `WorkerDownload` / `DownloadDao` |

On app launch, `hydrateDownloadStore()` (`src/services/downloadHydration.ts`) reads the native Room DB and repopulates `useDownloadStore`. Once hydrated, the JS store is the live source of truth; the native DB is the persistence layer.

---

## Native DB Schema

Table: `downloads` (Room, Android)

```
id                  TEXT  PRIMARY KEY   -- UUID, one row per download attempt
url                 TEXT
fileName            TEXT
modelId             TEXT
destination         TEXT               -- absolute path of target file
totalBytes          INTEGER
downloadedBytes     INTEGER
status              TEXT               -- enum: QUEUED | RUNNING | RETRYING | WAITING_FOR_NETWORK | COMPLETED | FAILED | CANCELLED
createdAt           INTEGER            -- epoch ms
error               TEXT?
expectedSha256      TEXT?
modelType           TEXT  DEFAULT 'text'
modelKey            TEXT?              -- JS logical key, see below
quantization        TEXT?
combinedTotalBytes  INTEGER DEFAULT 0  -- main + mmproj total, for combined progress
mmProjDownloadId    TEXT?              -- id of the sidecar mmproj row, if any
metadataJson        TEXT?              -- JSON blob for display metadata (imageModelName, etc.)
```

Source: `android/app/src/main/java/ai/offgridmobile/download/DownloadEntity.kt`

---

## Model Key

A `ModelKey` is a plain string that uniquely identifies one logical model/file in the JS store.

```ts
// src/utils/modelKey.ts
makeModelKey(modelId, fileName)  =>  "{modelId}/{fileName}"
// e.g. "bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf"

makeImageModelKey(imageModelId)  =>  "image:{imageModelId}"
// e.g. "image:qualcomm/Stable-Diffusion-v1.5"
```

The store is keyed by `ModelKey`:

```ts
downloads: Record<ModelKey, DownloadEntry>
```

A secondary index allows O(1) lookup from a native `downloadId` (UUID) to a `ModelKey`:

```ts
downloadIdIndex: Record<string, ModelKey>
// maps both main downloadId and mmProjDownloadId -> modelKey
```

---

## JS Store Shape (`DownloadEntry`)

```ts
// src/stores/downloadStore.ts
interface DownloadEntry {
  modelKey: ModelKey           // stable logical key
  downloadId: string           // UUID of current native worker
  modelId: string
  fileName: string
  quantization: string
  modelType: 'text' | 'image'
  status: DownloadStatus
  bytesDownloaded: number
  totalBytes: number
  combinedTotalBytes: number   // main + mmproj, used for combined progress bar
  progress: number             // 0–1
  mmProjDownloadId?: string    // UUID of mmproj worker, if any
  mmProjBytesDownloaded?: number
  mmProjStatus?: DownloadStatus
  errorMessage?: string
  createdAt: number
  lastProgressAt: number       // used for stuck detection
  metadataJson?: string        // display metadata (image model name, backend, etc.)
}
```

---

## Status Lifecycle

```
                    ┌─────────┐
           start    │ pending │
           ──────►  └────┬────┘
                         │ worker picks up
                         ▼
                    ┌─────────┐
                    │ running │ ◄──────────────────────────────┐
                    └────┬────┘                                │
          ┌──────────────┼─────────────────┐                  │
          │              │                 │                   │
          ▼              ▼                 ▼                   │
   ┌──────────┐  ┌───────────────┐  ┌──────────┐             │
   │ retrying │  │waiting_for    │  │  failed  │             │
   └────┬─────┘  │   _network    │  └──────────┘             │
        │        └───────┬───────┘                           │
        └────────────────┘                                   │
                         │ recovered                         │
                         └───────────────────────────────────┘
                                                             │
                                                             │ bytes finish
                                                             ▼
                                                      ┌────────────┐
                                                      │ processing │  (image only)
                                                      └─────┬──────┘
                                                            │
                                                            ▼
                                                      ┌───────────┐
                                                      │ completed │ ──► removed from store
                                                      └───────────┘         ▲
                                                                             │ (text: removed by
                                                                             │  watchDownload on
                                                                             │  file move + register)
```

`ACTIVE_STATUSES = ['pending', 'running', 'retrying', 'waiting_for_network', 'processing']`

Only `cancelled` is removed from UI without explicit user action. `failed` stays visible until the user cancels or retries.

---

## Text Model Download Flow

### Start

1. User taps download in `TextModelsTab` → `useTextModels.handleDownload`
2. Duplicate guard: if `downloadIdIndex` already has an active entry for this `modelKey`, return early.
3. `modelManager.downloadModelBackground(modelId, file)`:
   - Calls native `startDownload()` → inserts `QUEUED` row in Room DB, enqueues WorkManager task.
   - Calls `useDownloadStore.add(entry)` to populate the JS store immediately.
   - If the model has an `mmProjFile`, enqueues a second native download and sets `mmProjDownloadId` via `setMmProjDownloadId`.
4. Returns `{ downloadId }`.
5. `modelManager.watchDownload(downloadId, onComplete, onError)` registers the finalization callbacks.

### Runtime events

`useDownloads` hook (`src/hooks/useDownloads.ts`) is mounted at app root. It subscribes to three global native events:

| Event | Handler |
|---|---|
| `onAnyProgress` | `updateProgress` or `updateMmProjProgress`; also routes `retrying` / `waiting_for_network` status transitions |
| `onAnyComplete` | For text: calls `updateProgress` (final bytes), leaves finalization to `watchDownload` |
| `onAnyError` | `setStatus(downloadId, 'failed', { message, code })` |

All events are routed via `downloadIdIndex[event.downloadId]` — if the id is not in the index the event is silently dropped. This is the stale-event guard.

### Completion / finalization

`watchDownload` callbacks run when the native worker finishes:

1. Moves the downloaded file to its final path.
2. If mmproj present: moves it too. If that move fails, model is registered as text-only (`isVisionModel: false`).
3. Calls `onComplete(DownloadedModel)` → `addDownloadedModel(dm)` + `useDownloadStore.remove(modelKey)`.

Entry is removed from `useDownloadStore` only after the file is on disk and registered. The model then appears in `downloadedModels` (completed UI).

### Retry

1. `backgroundDownloadService.cancelDownload(oldDownloadId)` (fire and forget).
2. `modelManager.downloadModelBackground(...)` — starts new native worker, returns new `downloadId`.
3. `useDownloadStore.retryEntry(modelKey, newDownloadId)` — rotates the index, resets status to `pending`, clears error and mmproj fields. The same logical UI entry is preserved.

---

## Image Model Download Flow

Image downloads also use `useDownloadStore` for state, but the finalization path differs from text.

### Start

1. User taps download in `ImageModelsTab` → `useImageModels.handleDownloadImageModel` → `imageDownloadActions.handleDownloadImageModel`.
2. Depending on model type:
   - **Zip (MNN/QNN):** single native `startDownload()` → store entry added, WorkManager task enqueued.
   - **CoreML / HF multi-file:** synthetic `downloadId` prefixed `image-multi:…`; files downloaded sequentially via `downloadFileTo()`.
3. Store entry added for all variants (zip gets a real UUID; multi-file gets the synthetic id).

### Runtime events

Same `useDownloads` global hook handles zip downloads. On complete:

- If `entry.modelType === 'image'`, calls `setProcessing(downloadId)` (status → `processing`).
- Finalization (unzip / file move) happens in `imageDownloadActions`, then `addDownloadedImageModel` + `remove(modelKey)`.

Multi-file downloads update progress via callbacks into the store, not through native events.

### Key difference from text

For text, `watchDownload` drives finalization. For image, `imageDownloadActions` drives it directly. The store entry is removed at the end of both paths.

---

## Hydration (app restart / foreground resume)

`hydrateDownloadStore()` is called from the app entry point:

1. `backgroundDownloadService.getActiveDownloads()` — fetches all non-cancelled, non-completed rows from Room DB.
2. Identifies mmproj rows (any row whose `id` matches another row's `mmProjDownloadId`), excludes them from parent set.
3. For each parent row, picks the latest attempt by `createdAt` (handles orphaned rows from prior retry).
4. Maps native `DownloadStatus` → JS `DownloadStatus` via `mapNativeStatus`.
5. Calls `useDownloadStore.hydrate(entries)` — merges with any existing JS state, keeping whichever progress value is higher (avoids overwriting in-flight listeners that are ahead of the DB snapshot).

After hydration, `watchDownload` is re-attached for any text entry that was in-progress, so finalization callbacks are re-registered.

---

## Hooks Summary

| Hook | Where mounted | What it does |
|---|---|---|
| `useDownloads` (`src/hooks/useDownloads.ts`) | App root | Global native event listener: routes progress/complete/error to store |
| `useDownloadManager` (`src/screens/DownloadManagerScreen/useDownloadManager.ts`) | DownloadManagerScreen | Reads store, builds `activeItems` + `completedItems`, handles remove/delete/repair |
| `useTextModels` (`src/screens/ModelsScreen/useTextModels.ts`) | ModelsScreen (text tab) | Search, filter, handleDownload, handleCancelDownload, handleDeleteModel |
| `useImageModels` (`src/screens/ModelsScreen/useImageModels.ts`) | ModelsScreen (image tab) | Image model list, handleDownloadImageModel, handleCancelImageDownload |

---

## Duplicate-Start Protection

`useDownloadStore.add()` refuses to insert if an entry already exists for the `modelKey` (regardless of status). Combined with the `isActiveStatus` check in `handleDownload`, this prevents:

- Rapid double-taps starting two workers.
- A fresh start silently replacing a visible `failed` entry (user must explicitly cancel or retry first).

---

## mmproj (Vision Sidecar)

Vision models download two files: the main GGUF and an mmproj file.

- Both get their own native rows and `downloadId`s.
- The mmproj `downloadId` is stored in `entry.mmProjDownloadId` and indexed in `downloadIdIndex`.
- `setStatus` detects mmproj events via `entry.mmProjDownloadId === downloadId` and updates `mmProjStatus` only — mmproj failure never fails the main entry.
- If mmproj fails: model is registered as `isVisionModel: false`. A "Repair Vision" affordance is shown. State persists across restarts (stored in `downloadedModels`).
- Progress bar combines both: `(bytesDownloaded + mmProjBytesDownloaded) / combinedTotalBytes`.

---

## Stuck Detection

`STUCK_THRESHOLD_MS = 30_000` (30 seconds).

`isStalled(item)` in `useDownloadManager` returns `true` if:
- status is `pending` or `running`, AND
- `Date.now() - entry.lastProgressAt > 30_000`

`lastProgressAt` is updated on every `updateProgress` call. The DownloadManagerScreen ticks a `stallTick` counter every second to force re-evaluation without depending on store events.
