# Download System — V2 Architecture

## Purpose of this document

This is the implementation contract for the download system rewrite. An agent implementing this should treat it as authoritative. If something in the existing code conflicts with this document, the document wins — do not work around it, fix the code to match.

---

## Why previous refactors failed

### download-refactor-attempt
Created a new `downloadStore` but never removed `downloadProgress` and `activeBackgroundDownloads` from `appStore`. Both persisted. Two sources of truth survived side by side.

The `DownloadOrchestrator` made it worse — when it received a progress event and couldn't find a record in `downloadStore`, it fell back to reading `useAppStore.getState().activeBackgroundDownloads`. Old system kept as fallback. Whenever the two disagreed, bugs appeared.

### download-refactor-3
DB went from 1 table to 2 tables. More schema complexity, not less. Replaced events with polling-only — entire `jobs` object replaced every 1000ms, every component re-renders every tick. Still kept `retrying` and `waiting_for_network` statuses.

### The pattern
Both attempts added new code without fully deleting the old code. The refactor never reached the point where old code was gone.

### The one rule for this attempt
**Do not write new code that reads from the old store.** The moment new code falls back to `appStore.activeBackgroundDownloads` or `downloadProgress`, there are two sources of truth and the refactor is already failing. No fallbacks. No bridges. No "temporary" reads from old fields.

The delete step is not optional cleanup. It seals the refactor.

---

## Non-negotiables

1. DownloadManagerScreen and ModelsScreen always show identical data — no drift, ever
2. A download never disappears from UI unless the user explicitly cancels it — failed downloads stay visible as failed
3. Text and image model downloads have identical cancel / error / status behavior
4. Vision models always show **combined** gguf + mmproj progress — never two separate bars, user never sees mmproj as a separate item
5. Every gguf quant gets its own mmproj copy on disk — deleting one model cannot affect another's vision
6. After app kill and reopen, user sees current download progress immediately

**V1 scope — deferred:**
- mmproj repair button: deferred. If mmproj fails in V1, fail the entire vision download. User retries the whole thing. Do not build partial-repair in V1.
- mmproj-only retry: not in V1.

---

## Authority model

```
Android SQLite (Room)     = durable truth. Survives process kill. WorkManager reads/writes this.
Zustand downloadStore     = in-memory UI projection. Rebuilt from SQLite on every cold start.
Screens                   = read-only from Zustand. Never read from native modules directly.
```

Rules:
- Screens never call native modules directly for download state
- Zustand never writes to SQLite — only native does
- If Zustand and SQLite disagree, SQLite wins and Zustand is rebuilt
- AsyncStorage is not part of the download system at all after this refactor

---

## JS Status enum — exhaustive, no additions without explicit decision

```typescript
type DownloadStatus =
  | 'pending'      // queued, not yet running
  | 'running'      // bytes flowing
  | 'processing'   // JS-only: download complete, post-processing in progress (image unzip/move)
  | 'completed'    // fully ready to use
  | 'failed'       // terminal error, stays visible in UI
  | 'cancelled'    // user cancelled, removed from UI
```

`processing` is **JS-only ephemeral** — it is never written to SQLite, never derived from native events. It exists only in the Zustand store during the window between a download-complete event and the model being registered. Native only knows QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED.

`retrying` and `waiting_for_network` do not exist in this system. WorkManager retries silently (maxAttempts=2). If it ultimately fails, a single FAILED event arrives. No intermediate retry status in JS.

---

## SQLite Schema — downloads table, v3

One table. 16 columns. No joins needed.

```sql
-- Existing columns (unchanged)
id                 TEXT     PRIMARY KEY   -- UUID, WorkManager download ID
url                TEXT     NOT NULL      -- source URL — also used to reconstruct download on retry
destination        TEXT     NOT NULL      -- absolute local path for this file
totalBytes         INTEGER  NOT NULL      -- this file's size only
downloadedBytes    INTEGER  NOT NULL
status             TEXT     NOT NULL      -- QUEUED|RUNNING|COMPLETED|FAILED|CANCELLED
createdAt          INTEGER  NOT NULL      -- unix ms — used to resolve duplicate rows on hydration
error              TEXT

-- New columns (migration v2 → v3)
modelId            TEXT                  -- HF repo ID e.g. "bartowski/Llama-3.2-11B-GGUF"
modelType          TEXT  NOT NULL DEFAULT 'text'  -- 'text' | 'image'
modelKey           TEXT                  -- stable UI key (see ModelKey section)
quantization       TEXT                  -- "Q4_K_M" — for UI display
combinedTotalBytes INTEGER NOT NULL DEFAULT 0     -- gguf + mmproj total for progress bar
mmProjDownloadId   TEXT                  -- id of the paired mmproj row (null = not vision)
metadataJson       TEXT                  -- JSON blob for type-specific restore data (see below)
```

**Dropped from earlier drafts:**
- `displayName` — derive from `fileName` in JS
- `mmProjFileName` — deferred with repair
- `mmProjDestination` — look up mmproj row's own `destination` field

### metadataJson — what goes in it

For image models (needed to register model after app kill):
```json
{
  "imageModelName": "Stable Diffusion v1.5",
  "imageModelDescription": "General purpose image generation",
  "imageModelSize": 4265318400,
  "imageModelStyle": "general",
  "imageModelBackend": "mnn",
  "imageModelRepo": "stabilityai/stable-diffusion-v1-5",
  "imageDownloadType": "zip"
}
```

For text models: `null`.

### Migration v2 → v3

```kotlin
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(database: SupportSQLiteDatabase) {
        database.execSQL("ALTER TABLE downloads ADD COLUMN modelId TEXT")
        database.execSQL("ALTER TABLE downloads ADD COLUMN modelType TEXT NOT NULL DEFAULT 'text'")
        database.execSQL("ALTER TABLE downloads ADD COLUMN modelKey TEXT")
        database.execSQL("ALTER TABLE downloads ADD COLUMN quantization TEXT")
        database.execSQL("ALTER TABLE downloads ADD COLUMN combinedTotalBytes INTEGER NOT NULL DEFAULT 0")
        database.execSQL("ALTER TABLE downloads ADD COLUMN mmProjDownloadId TEXT")
        database.execSQL("ALTER TABLE downloads ADD COLUMN metadataJson TEXT")
    }
}
```

### How vision model rows look

Two rows in the same table. Parent points to child via `mmProjDownloadId`:

```
id="UUID-A"  modelKey="repo/Llama-Q4_K_M.gguf"  mmProjDownloadId="UUID-B"  combinedTotalBytes=4824000000
id="UUID-B"  modelKey=NULL                         mmProjDownloadId=NULL
```

Row UUID-B (mmproj sidecar) has no `modelKey`. It is never shown in the UI. JS identifies it as a sidecar because its `id` appears as `mmProjDownloadId` in a parent row.

---

## ModelKey — the most important concept

`downloadId` changes every time a download is retried. If the store is keyed by `downloadId`, retrying makes the old UI entry disappear and a new one appear — violates the "never disappears" rule and causes UI flicker.

The store is keyed by a **stable identifier** that represents the user-visible download item and survives retries.

```typescript
type ModelKey = string
// Text:  "bartowski/Llama-3.2-11B-GGUF/Llama-3.2-11B-Q4_K_M.gguf"
// Image: "image:stable-diffusion-v1-5"
```

**Single utility — always use this, never construct inline:**
```typescript
export const makeModelKey = (modelId: string, fileName: string): ModelKey =>
  `${modelId}/${fileName}`

export const makeImageModelKey = (imageModelId: string): ModelKey =>
  `image:${imageModelId}`
```

Every place that constructs a ModelKey must import and call these functions. No inline string construction anywhere. One inconsistency = silent lookup failure.

The store keeps two maps:
```typescript
downloads: Record<ModelKey, DownloadEntry>    // UI reads this
downloadIdIndex: Record<string, ModelKey>     // routes native events → correct entry
```

On retry:
1. Entry at `modelKey` stays in store — UI shows same card, no flicker
2. Old `downloadId` removed from `downloadIdIndex`
3. New `downloadId` added to `downloadIdIndex` pointing to same `modelKey`
4. Entry resets `downloadId`, `status: 'pending'`, `bytesDownloaded: 0`, `progress: 0`

---

## Retry semantics — native creates a new row

When the user retries a failed download, WorkManager creates a **new row** with a new UUID. It cannot update or replace an existing row. This means the DB can have two rows for the same logical download: the old failed row and the new running row.

**Hydration rule:** if two rows share the same `modelKey`, take the one with the latest `createdAt` and ignore the other. This is enforced in hydration code, not by a DB constraint.

The old failed row remains in SQLite but is never shown in the UI. It will be cleaned up on next full cleanup pass (separate maintenance task, not part of this refactor).

---

## Hydration points

Hydration rebuilds Zustand from SQLite. It happens at:
1. **App cold start** — before any screen mounts
2. **App foreground/resume** — when app comes back from background (in case downloads changed while backgrounded)

Not at:
- Screen mount (screens are read-only from Zustand)
- On every event (events update the store incrementally)
- On a timer (no polling)

```typescript
export async function hydrateDownloadStore(): Promise<void> {
  if (!backgroundDownloadService.isAvailable()) return

  const rows = await backgroundDownloadService.getActiveDownloads()

  // Build set of known mmproj sidecar IDs
  const mmProjIds = new Set(
    rows.filter(r => r.mmProjDownloadId != null).map(r => r.mmProjDownloadId as string)
  )

  // Parent rows only — sidecars are never shown in UI
  const parentRows = rows.filter(r =>
    !mmProjIds.has(r.id) &&
    !isMmProjFileName(r.fileName) &&  // fallback for pre-v3 rows with null mmProjDownloadId
    r.status !== 'cancelled'
  )

  // Hydration rule: if multiple rows share modelKey, latest createdAt wins
  const latestByKey = new Map<ModelKey, typeof parentRows[0]>()
  for (const row of parentRows) {
    const key = row.modelKey ?? makeModelKey(row.modelId ?? '', row.fileName)
    const existing = latestByKey.get(key)
    if (!existing || row.createdAt > existing.createdAt) latestByKey.set(key, row)
  }

  const entries: DownloadEntry[] = []
  for (const [modelKey, row] of latestByKey) {
    const mmProjRow = row.mmProjDownloadId
      ? rows.find(r => r.id === row.mmProjDownloadId)
      : undefined

    entries.push({
      modelKey,
      downloadId: row.id,
      modelId: row.modelId ?? '',
      fileName: row.fileName,
      quantization: row.quantization ?? 'Unknown',
      modelType: (row.modelType as ModelType) ?? 'text',
      status: mapNativeStatus(row.status),
      bytesDownloaded: row.bytesDownloaded,
      totalBytes: row.totalBytes,
      combinedTotalBytes: row.combinedTotalBytes || row.totalBytes,
      progress: computeProgress(row, mmProjRow),
      mmProjDownloadId: row.mmProjDownloadId ?? undefined,
      mmProjBytesDownloaded: mmProjRow?.bytesDownloaded,
      mmProjStatus: mmProjRow ? mapNativeStatus(mmProjRow.status) : undefined,
      errorMessage: row.error ?? undefined,
      createdAt: row.createdAt,
    })
  }

  useDownloadStore.getState().setAll(entries)
}
```

---

## Native layer changes

### WorkerDownload — what to remove

Remove entirely:
- `DownloadRetrying` event emission
- `waiting_for_network` status
- All network connectivity branching for retry status

Keep:
- `maxAttempts = 2` — one silent mid-stream retry, no JS state change
- `Result.retry()` only for stream interruption (server dropped mid-transfer)
- `Result.failure()` for everything else: network lost, 4xx, disk full, hash mismatch

### getActiveDownloads — must return new columns

```kotlin
mapOf(
  "id" to download.id,
  "url" to download.url,
  "fileName" to download.fileName,
  "modelId" to download.modelId,
  "modelKey" to download.modelKey,   // null for pre-v3 rows — JS handles fallback
  "modelType" to download.modelType,
  "status" to download.status.name.lowercase(),
  "bytesDownloaded" to download.downloadedBytes,
  "totalBytes" to download.totalBytes,
  "combinedTotalBytes" to download.combinedTotalBytes,
  "mmProjDownloadId" to download.mmProjDownloadId,
  "quantization" to download.quantization,
  "metadataJson" to download.metadataJson,
  "error" to download.error,
  "createdAt" to download.createdAt,
)
```

### startDownload — must accept and persist new fields

```kotlin
val modelKey = params.getString("modelKey")
val modelId = params.getString("modelId")
val modelType = params.getString("modelType") ?: "text"
val quantization = params.getString("quantization")
val combinedTotalBytes = params.getDouble("combinedTotalBytes").toLong()
val mmProjDownloadId = params.getString("mmProjDownloadId")
val metadataJson = params.getString("metadataJson")
```

`modelKey` must be stored in the DB row on creation. This is what makes hydration reliable.

---

## Zustand store

```typescript
// src/stores/downloadStore.ts — NOT wrapped in persist()

interface DownloadStoreState {
  downloads: Record<ModelKey, DownloadEntry>
  downloadIdIndex: Record<string, ModelKey>

  setAll: (entries: DownloadEntry[]) => void
  add: (entry: DownloadEntry) => void
  setMmProjDownloadId: (modelKey: ModelKey, mmProjDownloadId: string) => void  // called after mmproj starts
  updateProgress: (downloadId: string, bytes: number, total: number) => void
  updateMmProjProgress: (mmProjDownloadId: string, bytes: number) => void
  setStatus: (downloadId: string, status: DownloadStatus, error?: { message: string; code?: string }) => void
  setProcessing: (downloadId: string) => void   // JS-only, after download complete event
  setCompleted: (downloadId: string) => void
  setMmProjCompleted: (mmProjDownloadId: string, bytes: number) => void
  retryEntry: (modelKey: ModelKey, newDownloadId: string) => void
  remove: (modelKey: ModelKey) => void
}
```

**`setMmProjDownloadId` is critical.** When a vision model download starts, the gguf starts first and `add()` is called immediately. The mmproj starts after, in parallel. Its `downloadId` only becomes known after the second `startDownload` resolves. This action updates the index so mmproj events are routed correctly:

```typescript
setMmProjDownloadId: (modelKey, mmProjDownloadId) => set(state => {
  const entry = state.downloads[modelKey]
  if (!entry) return state
  return {
    downloads: { ...state.downloads, [modelKey]: { ...entry, mmProjDownloadId } },
    downloadIdIndex: { ...state.downloadIdIndex, [mmProjDownloadId]: modelKey },
  }
}),
```

**Race condition guard:** `add()` must be called the instant `startDownload` resolves — zero other async work between those two lines. Events can fire immediately after native starts the download. If the entry is not in the index, events are silently dropped.

---

## useDownloads() hook

Single hook. Both screens import this. Nothing else manages download state.

```typescript
// src/hooks/useDownloads.ts

export function useDownloads() {
  useEffect(() => {
    if (!backgroundDownloadService.isAvailable()) return

    const unsubProgress = backgroundDownloadService.onAnyProgress((event) => {
      const { downloadIdIndex, downloads } = useDownloadStore.getState()
      const modelKey = downloadIdIndex[event.downloadId]
      if (!modelKey) return
      const entry = downloads[modelKey]
      if (!entry) return

      if (entry.downloadId === event.downloadId) {
        useDownloadStore.getState().updateProgress(event.downloadId, event.bytesDownloaded, event.totalBytes)
      } else if (entry.mmProjDownloadId === event.downloadId) {
        useDownloadStore.getState().updateMmProjProgress(event.downloadId, event.bytesDownloaded)
      }
    })

    const unsubComplete = backgroundDownloadService.onAnyComplete((event) => {
      const { downloadIdIndex, downloads } = useDownloadStore.getState()
      const modelKey = downloadIdIndex[event.downloadId]
      if (!modelKey) return
      const entry = downloads[modelKey]
      if (!entry) return

      const isMmProj = entry.mmProjDownloadId === event.downloadId

      if (isMmProj) {
        useDownloadStore.getState().setMmProjCompleted(event.downloadId, event.bytesDownloaded)
        // If gguf already finished, now both are done
        if (entry.status === 'completed') {
          useDownloadStore.getState().setCompleted(entry.downloadId)
        }
        return
      }

      // gguf complete
      if (entry.mmProjDownloadId && entry.mmProjStatus !== 'completed') {
        // Waiting on mmproj — don't mark complete yet
        useDownloadStore.getState().updateProgress(event.downloadId, event.bytesDownloaded, event.totalBytes)
        return
      }

      if (entry.modelType === 'image') {
        // Signal JS to begin processing (unzip/move/register)
        // The image completion handler calls setCompleted() when done
        useDownloadStore.getState().setProcessing(event.downloadId)
        return
      }

      useDownloadStore.getState().setCompleted(event.downloadId)
    })

    const unsubError = backgroundDownloadService.onAnyError((event) => {
      const { downloadIdIndex, downloads } = useDownloadStore.getState()
      const modelKey = downloadIdIndex[event.downloadId]
      if (!modelKey) return
      const entry = downloads[modelKey]
      if (!entry) return

      // In V1: if mmproj fails, fail the whole download
      useDownloadStore.getState().setStatus(event.downloadId, 'failed', {
        message: toUserMessage(event.reason, event.reasonCode),
        code: event.reasonCode,
      })
    })

    return () => { unsubProgress(); unsubComplete(); unsubError() }
  }, [])

  const cancel = async (modelKey: ModelKey) => {
    const entry = useDownloadStore.getState().downloads[modelKey]
    if (!entry) return
    useDownloadStore.getState().remove(modelKey)
    await backgroundDownloadService.cancelDownload(entry.downloadId).catch(() => {})
    if (entry.mmProjDownloadId) {
      await backgroundDownloadService.cancelDownload(entry.mmProjDownloadId).catch(() => {})
    }
  }

  const retry = async (modelKey: ModelKey, startDownload: () => Promise<string>) => {
    const entry = useDownloadStore.getState().downloads[modelKey]
    if (!entry) return
    await backgroundDownloadService.cancelDownload(entry.downloadId).catch(() => {})
    const newDownloadId = await startDownload()  // caller starts the native download, returns new id
    useDownloadStore.getState().retryEntry(modelKey, newDownloadId)
  }

  const downloads = useDownloadStore(state => state.downloads)

  return {
    downloads,
    active: Object.values(downloads).filter(d =>
      d.status === 'pending' || d.status === 'running' || d.status === 'processing'
    ),
    failed: Object.values(downloads).filter(d => d.status === 'failed'),
    completed: Object.values(downloads).filter(d => d.status === 'completed'),
    cancel,
    retry,
  }
}
```

---

## Image model processing flow

Image downloads complete in two phases. The hook handles phase 1 (download). The image action code handles phase 2 (install).

```typescript
// In image download action code — after useDownloads().cancel/retry triggers:

// When download-complete event arrives, hook calls setProcessing(downloadId)
// Image action code must be listening for this status change and then:

async function handleImageProcessing(modelKey: ModelKey, downloadId: string) {
  const store = useDownloadStore.getState()
  store.setProcessing(downloadId)
  try {
    const entry = store.downloads[modelKey]
    const metadata = JSON.parse(entry.metadataJson ?? '{}')
    await unzip(zipPath, destDir)
    await modelManager.addDownloadedImageModel({
      id: metadata.imageModelRepo,
      name: metadata.imageModelName,
      backend: metadata.imageModelBackend,
      // ...
    })
    useDownloadStore.getState().setCompleted(downloadId)
  } catch (e) {
    useDownloadStore.getState().setStatus(downloadId, 'failed', { message: 'Failed to install model' })
  }
}
```

The `modelKey` is how the image handler finds its entry. It is passed through from the original download start, not looked up by modelId.

---

## mmproj — V1 behaviour

**V1: if mmproj fails, fail the whole download.** User sees "Download failed" and retries the entire thing. No repair button in V1.

**mmproj local filename — unique per gguf:**
```typescript
// In modelManager/download.ts
function mmProjLocalName(ggufFileName: string): string {
  return ggufFileName.replace(/\.gguf$/i, '') + '-mmproj.gguf'
}
// "Llama-3.2-11B-Q4_K_M.gguf" → "Llama-3.2-11B-Q4_K_M-mmproj.gguf"
// "Llama-3.2-11B-Q8_0.gguf"   → "Llama-3.2-11B-Q8_0-mmproj.gguf"
```

Each quant gets its own copy. Deleting Q4 model only deletes Q4's mmproj. Q8 is untouched.

**mmproj file selection priority:**
```typescript
function selectMmProj(candidates: MmProjCandidate[]): MmProjCandidate {
  if (candidates.length === 1) return candidates[0]
  const f16 = candidates.find(f => /f16|fp16/i.test(f.name) && !/bf16/i.test(f.name))
  if (f16) return f16
  const q8 = candidates.find(f => /q8_0/i.test(f.name))
  if (q8) return q8
  const bf16 = candidates.find(f => /bf16/i.test(f.name))
  if (bf16) return bf16
  return candidates[0]
}
```

F16 → Q8_0 → BF16 → first available. Never below Q8_0.

---

## Error messages

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  network_lost:         'Connection lost. Check your network and try again.',
  network_timeout:      'Connection timed out. Try again on a stable network.',
  server_unavailable:   'Server is unavailable. Try again later.',
  download_interrupted: 'Download was interrupted. Please retry.',
  disk_full:            'Not enough storage. Free up space and retry.',
  file_corrupted:       'Downloaded file was corrupted. Please retry.',
  empty_response:       'Server returned an empty response. Try again later.',
  user_cancelled:       'Download was cancelled.',
  http_401:             'Access denied. Authentication required.',
  http_403:             'Access denied. You may not have permission to download this file.',
  http_404:             'File not found. It may have been moved or removed.',
  http_416:             'Download resume failed. Will restart from the beginning.',
  client_error:         'A client error occurred. Please retry.',
  unknown_error:        'Download failed. Try again on a stable connection.',
}

export function toUserMessage(reason?: string, code?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (reason) return reason
  return ERROR_MESSAGES.unknown_error
}
```

---

## What to remove from appStore

Remove from `partialize` (stop persisting):
- `activeBackgroundDownloads`
- `imageModelDownloading`
- `imageModelDownloadIds`
- `downloadProgress`

Remove from `AppState` interface and implementation entirely:
- `downloadProgress` + `setDownloadProgress`
- `activeBackgroundDownloads` + `setBackgroundDownload` + `clearBackgroundDownloads`
- `imageModelDownloading` + `addImageModelDownloading` + `removeImageModelDownloading` + `clearImageModelDownloading`
- `imageModelDownloadIds` + `setImageModelDownloadId`

**Before removing any field: audit every file that reads it and migrate that read to `useDownloadStore` first.** TypeScript will catch remaining usages after removal.

---

## Files to delete

```
src/services/modelManager/restore.ts                         entire file
src/screens/DownloadManagerScreen/useDownloadManager.ts      entire file
```

Gut significantly:
```
src/stores/appStore.ts                              remove download fields listed above
src/services/backgroundDownloadService.ts           remove DownloadRetrying listener
src/services/modelManager/index.ts                  remove BackgroundDownloadContext map and restore calls
src/services/modelManager/types.ts                  remove BackgroundDownloadContext type
src/screens/ModelsScreen/useTextModels.ts           remove all download state management
src/screens/ModelsScreen/useImageModels.ts          remove download state, use useDownloads()
src/screens/ModelsScreen/imageDownloadActions.ts    simplify, align to new store shape
```

---

## Do not rules — hard constraints

- **Do not** let either screen keep its own local `activeDownloads` state. Both screens read only from Zustand.
- **Do not** let JS read partly from store and partly from native module helpers for the same concern.
- **Do not** allow any fallback read from old `appStore` download fields, even temporarily or "just during transition."
- **Do not** expose mmproj as a separate UI row. Users see one combined card per model.
- **Do not** add new statuses to `DownloadStatus` without updating this document and every switch/filter that touches status.
- **Do not** construct a `ModelKey` inline as a string. Always use `makeModelKey()` or `makeImageModelKey()`.
- **Do not** call `hydrateDownloadStore()` from a screen. Hydration is called from the app lifecycle layer only.

---

## Implementation sequence

### Step 1 — Android native
Goal: `getActiveDownloads()` returns full row including `modelKey`. Worker no longer emits retry states.

1. Add `MIGRATION_2_3` — add 7 columns
2. Update `DownloadEntity` with new fields
3. Update `DownloadDao` — insert and progress update methods
4. Simplify `WorkerDownload`:
   - Delete `DownloadRetrying` emission
   - Delete `retryStatus`, `waiting_for_network`, network connectivity branching
   - `maxAttempts = 2`
   - `Result.retry()` only for mid-stream interruption, `Result.failure()` for everything else
5. Update `DownloadManagerModule`:
   - `startDownload` accepts and persists new fields
   - `getActiveDownloads` returns all new columns
6. Batch all Kotlin in one commit to avoid multiple Gradle runs

Verify: `getActiveDownloads()` returns `modelKey`, `mmProjDownloadId`, `modelType`. App builds.

### Step 2 — JS store and hydration
Goal: New store exists, hydrates correctly on cold start.

1. Write `src/stores/downloadStore.ts` — full implementation, not persisted
2. Write `makeModelKey` and `makeImageModelKey` utilities — single file, imported everywhere
3. Write `src/services/downloadHydration.ts` — `hydrateDownloadStore()`
4. Call `hydrateDownloadStore()` in app initialization, replacing `syncCompletedBackgroundDownloads`
5. Remove `retrying` and `waiting_for_network` from `BackgroundDownloadStatus` type
6. Rewrite `src/utils/downloadErrors.ts` with `toUserMessage()`
7. Unit test the store: `retryEntry` keeps same `modelKey`, mmproj event routing, duplicate row resolution

Verify: App starts with active download → store has correct entries keyed by `modelKey`.

### Step 3 — useDownloads() hook
Goal: Single hook handles all event subscriptions and actions.

1. Write `src/hooks/useDownloads.ts`
2. Update `startDownload` JS call to pass `modelKey`, `quantization`, `modelType`, `metadataJson`
3. Update mmproj download start to call `store.setMmProjDownloadId(modelKey, mmProjId)` immediately after mmproj `startDownload` resolves
4. Update mmproj local filename to `{ggufFileName_without_ext}-mmproj.gguf`
5. Update mmproj selection to use priority order: F16 → Q8_0 → BF16 → first
6. Unit test hook: progress events, complete events, error events, retry flow

Verify: mock events route correctly, combined progress calculates correctly.

### Step 4 — screen swap
Goal: Both screens read from `useDownloads()`. Data is identical.

1. Update `DownloadManagerScreen` — replace `useDownloadManager` with `useDownloads()`
2. Update `ModelsScreen` text tab — use `useDownloads()` for progress lookup by `modelKey`
3. Update `ModelsScreen` image tab — use `useDownloads()` for progress, wire image processing flow
4. Manually test: start download → navigate between screens → numbers are always identical. Cancel from either screen → gone from both. Retry → same card updates in place.

### Step 5 — delete old code
Goal: Nothing reads from old fields. Old code gone. Clean compile.

1. Audit every reader of `appStore.imageModelDownloading`, `imageModelDownloadIds`, `downloadProgress`, `activeBackgroundDownloads` — migrate each to `useDownloadStore`
2. Remove download fields from `appStore`
3. Delete `restore.ts`
4. Delete `useDownloadManager.ts`
5. Remove `BackgroundDownloadContext` from `modelManager/types.ts` and `modelManager/index.ts`
6. Remove `DownloadRetrying` listener from `backgroundDownloadService.ts`
7. Strip download management from `useTextModels.ts`, `useImageModels.ts`, `imageDownloadActions.ts`
8. `npx tsc --noEmit` — fix all type errors
9. `npm run lint && npm test` — fix all failures

Verify: full lint + tsc + test pass. `grep -r "activeBackgroundDownloads\|downloadProgress\|imageModelDownloading" src/` returns nothing.
