# Device test log — PR #510

On-device testing of PR #510 (Android dev `ai.offgridmobile.dev` + iOS "Mac's iPhone"). One line per bug.
Status: ✅ verified on device · 🔁 fixed, needs recheck on next build · 🔎 open/investigating.

## Adversarial QA sweep — broken user flows to verify after fix (🔎)

Found by a 6-agent bug-hunt (download/chat/voice/tools+mcp/thinking/projects+settings), each crossing
engine × modality × platform. Every item below is CROSS-CHECKED as still-live on current HEAD unless
marked. Tag: [type · confidence]. Fix each, then run the flow on device to confirm.

**Confirmed live on HEAD — highest value:**
- [ ] **Q1 — Image Size you set ≠ size generated** [SoC drift · HIGH]. Model Settings → Image → set size 128 (slider allows it) → generate → the image is forced to 256 (`imageGenerationService` floors to SWEET_SPOT_SIZE). The value shown is never used.
- [ ] **Q2 — MCP tool call silently dropped on small-model JSON** [functional/DRY · HIGH]. Use an MCP tool with a small model that emits unquoted keys / trailing comma / single quotes → no tool runs, model says "I couldn't find anything." (MCP parser is strict `JSON.parse`; built-in parser recovers via `fixUnquotedKeys` — two parsers drifted.)
- [ ] **Q3 — MCP tool call with stringified `arguments`** [functional/DRY · MED]. Model emits `"arguments":"{...}"` → sent to the MCP server as a raw string, server gets bad params / ignores them.
- [ ] **Q4 — On-device tool router false-positive** [functional · MED]. With several MCP tools, if the router's prose contains a tool name as a substring (or says "none" while naming one) → that tool is force-selected; the "none" branch never runs (litert/llama-iOS).
- [ ] **Q5 — Successful tool + empty final = "(No response)"** [functional · MED]. MCP tool returns real data, model's final turn is empty → user sees "_(No response)_" and the fetched data is discarded (litert can't recover).
- [ ] **Q6 — Thinking box shows "Thought process" while still thinking** [UI · MED]. On litert/remote (separate reasoning channel), the reasoning box header reads the DONE label + "T" badge while reasoning is still streaming (should be "Thinking…/…"). llama inline `<think>` is correct — divergence.
- [ ] **Q7 — Image guidance-scale drifts to 2.0** [DRY · MED]. If `imageGuidanceScale` is ever 0/stale, generation runs at 2.0 while every slider/default shows 7.5 (three fallback literals: `2`, `2.0`, `7.5` for one setting).
- [ ] **Q8 — Prompt enhancement silently skipped for a REMOTE text model** [SOLID gap · MED]. Active text model = remote/gateway + image-gen + enhancement on → enhancement is skipped (generateStandalone has only llama/litert branches, no remote path).

**Projects/new-chat — found on base, seam likely live (verify on device):**
- [ ] **Q9 — Delete a project → its chats orphaned** [SoC · MED]. Delete a project that has chats → chats survive but keep a dangling projectId; not re-filable from any project view, only via the global Chats list.
- [ ] **Q10 — Project pick on a NEW chat not saved** [SoC (state in presentation) · MED]. On a brand-new chat (before first message) pick a project → it lives only in ChatScreen local state (`pendingProjectId`); lost if the send/create path omits it.
- [ ] **Q11 — "New chat" on context-full drops the project** [functional · LOW-MED]. In a project chat, fill the context window, tap "New chat" in the alert → new chat is unassigned.
- [ ] **Q12 — Modal "Reset to Defaults" is partial** [functional · LOW]. Chat Settings sheet → Reset to Defaults resets only the 7 text params; image steps/size/guidance/threads unchanged.
- [ ] **Q13 — Duplicate Image sliders diverge** [DRY · LOW]. The modal vs Model Settings render the same Image-Size/Steps sliders with different mins/fallbacks (256 vs 128) — the root of Q1.

## Memory-budgeting adversarial recon (Android + iOS + cross-platform) — 🔎

3 recon agents attacked the CURRENT budget code (this session's `effectiveAvailableMB` reclaim-credit +
survival floor + residency). Every item cross-checked live on HEAD. **Some implicate this session's own
memory fix** — honest. The OOM/jetsam magnitude is only *truthfully* confirmable on a physical device
(the `[MEM-SM] makeRoomFor` log is ground truth); tests prove the gate ADMITS the load (necessary
condition), device proves the crash (sufficient). Do NOT blindly tighten — the same code, device-verified,
fixes the E4B false-refusal; a naive tightening re-introduces it.

- [ ] **M1 — text + image models CO-RESIDE instead of swapping** [P0 · SoC vs design doc · HIGH]. 12GB, load a text model then start image-gen → BOTH stay resident (`residents=[text:5235,image:2369] avail=640`) → near-OOM. Balanced `planEviction` has NO text↔image mutual exclusion (design doc says it should swap). This is "Part B". Aggressive mode swaps correctly → fix is the balanced branch.
- [ ] **M2 — reclaim credit defeats the dirty gate for a 2nd in-app heavy** [P0 · REGRESSION from this session's `effectiveAvailableMB` · HIGH]. With one dirty model resident, loading a second credits the physical budget (~8602MB) though only ~640MB is truly free → co-load admitted. Pre-session code (raw availMem) would have REFUSED. Root: reclaim credit models "LMK evicts BACKGROUND apps" but here the RAM is pinned by our OWN resident model. (M1 swap removes the worst case; also subtract resident dirty footprint before crediting.)
- [ ] **M3 — override survival floor checks the CREDITED ceiling, not real free RAM** [P0 · Android · HIGH]. Load-Anyway a 7900MB dirty model on 12GB with 665MB truly free → ADMITTED (`postLoadFree = effectiveAvail 8602 − 7900 = 702 ≥ 700`). The floor can't see the real OOM state; it's 100MB from admitting a guaranteed jetsam. (`index.ts:407-414`.)
- [ ] **M4 — iOS clean/GGUF loads charge NOTHING to the floor + never consult live free RAM** [iOS · HIGH code / NEEDS-DEVICE for jetsam]. Load-Anyway an 8GB GGUF on a 12GB iPhone at 1200MB free → admitted (clean → `incomingDirtyMB=0` → floor sees full availMem); and a no-override clean 9GB "fits" at 500MB free (clean branch returns physical cap, ignores availMem). Nuance: clean mmap weights DO page from file (the design's correct insight, device-verified for E4B), BUT the dirty inference working set (KV/compute) is uncharged — iOS has no swap for it. Needs device to size the working-set charge; don't over-correct.
- [ ] **M5 — iOS 1200 survival floor OVER-refuses a legit small dirty Load-Anyway** [iOS · under-commit · MED]. 12GB iPhone, 3.1GB free, Load-Anyway a 2GB dirty LiteRT model → REFUSED (needs size+1200 = 3200 free). Defeats the escape hatch for a load that's plainly safe. The flat 1200 floor is simultaneously too low (M4) and too high (M5).
- [ ] **M6 — aggressive policy over-commits a single dirty model** [both platforms · MED]. Aggressive (0.88 Android / 0.92 iOS) admits a 9GB dirty model on 12GB at 3GB free; zram/dirty pages can't back it.
- [ ] **M7 — SOLID: `dirtyMemory` decided by `model.engine === 'litert'` in the caller** [SOLID · LOW-MED]. `activeModelService/index.ts:152` branches on the concrete engine to set the eviction-relevant dirty flag; should be a capability the model/engine declares.
- [ ] **M8 — SOLID: `IMAGE_MODEL_OVERHEAD_MULTIPLIER = Platform.OS==='ios'?1.5:1.8`** [SOLID · LOW]. `types.ts:50` — a `Platform.OS` mechanism branch; should be capability-as-data (CoreML vs ONNX).
- [ ] **M9 — DRY: `SIDECAR_TYPES` + the physical-cap expression each defined twice** [DRY · LOW]. `policy.ts` vs `modelResidency/index.ts` — two owners can drift.
- [ ] **M10 — jest silently SKIPS `__tests__/integration/memory/{android,ios}/`** [INFRA · P1 · HIGH, safe fix]. `testPathIgnorePatterns` has unanchored `'/android/'` + `'/ios/'` (meant for the native build dirs) → any memory test there never runs in CI. `/pro/` was already anchored for this exact reason; anchor these to `<rootDir>/`. Confirmed by two agents independently.
- [ ] **M11 — resend after image-gen REFUSED (stale pre-eviction budget)** [P1 · cross-subsystem · HIGH]. After image gen (image model dirty-resident), go back to chat and resend → text reload throws `OverridableMemoryError` even though it fits once the image is evicted. `budgetForSpec` computes `dirtyPressure` + budget from the PRE-eviction residents (`index.ts:241-243`), but `planEviction` evicts the image AFTER the budget is fixed → clean text (5235) > stale dirty budget (4345) → refused. Fix: compute the fit budget on the POST-eviction resident set (a clean incoming model whose only dirty pressure is an about-to-be-evicted resident should see the physical cap). Found by journey test, invisible to isolated `makeRoomFor` tests.
- [ ] **M-GAP — `handleMemoryWarning` can't reclaim a heavy** [defense-in-depth]. Only reclaims sidecars; with two heavies co-resident (M1) a real memory warning frees nothing. Moot once M1 lands.

## Journey recon (cross-subsystem flows) — 🔎 (cross-checked live on HEAD)

- [ ] **Q17 — voice note + a TOOL enabled on LiteRT sends RAW AUDIO to the model** [P0 · same class as B5/B9, missed on the tool path · HIGH]. My `modelMedia` fix covered `runLiteRTResponseImpl`, but the LiteRT **tool-loop** (`generationToolLoop.ts:468-472`, `callLiteRTForLoop`) re-derives `audioUris`/`imageUris` inline and bypasses `modelInputAudioUris`/`modelInputImageUris`. Send a voice note with a tool on → stale path "File does not exist" (B9) / non-audio model rejects (B5). Also **no vision gate** here (Q17b): image on a non-vision LiteRT model + tool → raw native crash instead of the graceful "does not support images". Fix: route this path through the same seam (one-line-ish; converges with the B5/B9 fix).
- [ ] **Q14 — pre-load "Safe to load" then hard "Insufficient memory" refusal (image models)** [DRY/SoC · HIGH]. Advisory check (`checkMemoryForModel`, 1.5/1.8× overhead) and the authoritative gate (`estimateImageModelRam`, 2.5×) use DIFFERENT size multipliers → disagree ~40%. User sees "safe", hits a wall. Fix: one image-RAM estimator both call. (`activeModelService/memory.ts:53` vs `hardware.ts:292`.)
- [ ] **Q15 — `ensureResident` ignores the `fits` verdict and loads anyway** [OOM footgun · MED, latent]. `modelResidency/index.ts:432` takes only `{evicted}` from makeRoomFor, discards `fits`, then loads unconditionally (`:439`) — the exact "call the gate, ignore its verdict" class CLAUDE.md warns about. Dead in prod today (callers use makeRoomFor+check fits) but a live trap. Fix: honor `fits`.
- [ ] **Q16 — residency doc says text/image mutually exclusive; code co-resides** [doc-drift, same root as M1]. `policy.ts:5-7` + `imageGenerationService.ts:250` claim swap; balanced planner co-resides. Resolve WITH M1 (make it true, don't just fix the doc).
- Q7, Q11 re-confirmed still live by a second agent (guidance-scale 2.0-vs-7.5 drift; context-full "New chat" drops the project).
- [ ] **Q18 — LiteRT mid-conversation temperature/topP change is ignored** [SOLID engine-divergence · HIGH]. Drag Temperature/Top-P in Chat Settings mid-conversation → LiteRT keeps sampling at the original value until a reset (new chat / system-prompt / compaction); llama applies it on the next send. Root: `litert.ts:219-226` `prepareConversation` only pushes `samplerConfig` on `needsReset` (id/sys/tools changed), so the fresh config read at `generationServiceHelpers.ts:245` is discarded; llama re-applies `buildCompletionParams(settings)` every `completion` (`llm.ts:304`). Fix: re-apply sampler when it differs from last-applied, even without a reset — so both engines converge.
- [ ] **Q9b — deleted-project orphan still injects `search_knowledge_base`** [functional consequence of Q9 · MED]. A chat orphaned by project deletion still force-injects the KB tool for a project whose RAG docs are gone, then silently falls back to the global prompt (`useChatGenerationActions.ts:314,318` key on projectId existing, not the project existing).

## Failure/interrupt-edge recon (cluster D) — 🔎 (cross-checked live on HEAD)

- [ ] **D1 (=B7) — failed image extraction is LOST on relaunch** [P1 · SoC root · HIGH, device-confirmed]. Image model download → extraction fails (missing unet.bin/etc.) → same session shows a retriable failed card → force-quit + relaunch → model GONE (no retry, no remove, no disk trace). Root chain: `downloadStore` is plain `create()` (not persisted); the finalize catch (`imageDownloadActions.ts:454-457`) unlinks BOTH the partial dir and the zip; `hydrateDownloadStore` rebuilds only from native active rows → a completed-then-failed transfer has none → store empty + disk wiped. Fix in a SERVICE, not the screen: persist failed/incomplete entries OR keep the partial dir + disk-scan it in `imageProvider.list()`/`reconcile()`.
- [ ] **D2 — dead `_zip_name` re-unzip recovery branch** [functional · MED]. `scan.ts:228-262` exists to re-extract a partial dir on next launch via `_zip_name`, but the zip finalize catch always deletes the dir+zip first → it can never fire for the primary zip path. Revived by the D1 fix (option b).
- [ ] **D3 — ROOT: image download finalize/retry/unzip logic lives in the PRESENTATION layer** [SoC · HIGH]. `imageDownloadActions.ts` + `imageDownloadResume.ts` own unzip, integrity, `_ready`/`_zip_name` writes, cleanup, store mutation, retry — the "no data/side-effects/finalize logic in a screen" rule the repo forbids. Text has a service seam (`textProvider`); image has none. This is WHY D1/D2 have no correct home. Fix: an image finalizer under `modelDownloadService`, migrate the logic off the screen. (Ties to the earlier B6/B7 backlog.)
- [ ] **D4 — iOS interrupted download can leave NO failed entry after app-kill** [iOS · MED · device-dependent]. URLSession discards its row on app-kill; reconcile iterates the native-rebuilt store, so a gone row = vanished download with no user-visible failed entry. `resumable=false` is correctly modeled as data, but the stranded-entry survival isn't. Needs a real iOS kill to confirm.
- Generation-pipeline failure paths (abort-flag reset, remote-failure clear, queue drain, cancel-mid-compile, relaunch-mid-turn) all reproduced as CORRECT — now locked with falsifying guards.

## Voice-model download/management recon (STT/TTS) — 🔎 (cross-checked live on HEAD)

- [ ] **V1 — deleting a whisper model CANCELS an unrelated in-flight download** [P1 · HIGH]. Download base.en; while it's downloading, delete an already-downloaded small.en in the DM → base.en is aborted + its partial unlinked. Root: `whisperService.deleteModel` cancels the single `activeDownloadId` regardless of which model id was passed (`whisperService.ts:172-176`). Fix: only cancel if the active download IS this model.
- [ ] **V2 — a partial/truncated whisper file is listed as a COMPLETED model** [P1 · B7/B8 class · HIGH]. App-killed mid-download leaves a truncated `ggml-<id>.bin` (writes go to the final path, no `.part`) → `listDownloadedModels` filters by NAME only → DM shows "downloaded" → load rejects it as corrupted, no retry. Root: `whisperService.ts:157-170` no size floor (a `MIN_MODEL_FILE_SIZE` exists but isn't applied here). Fix: enforce the size floor and/or download to `.part` renamed on complete.
- [ ] **V3 — interrupted STT download unrecoverable after relaunch** [P1 · =B7/D1 for STT · HIGH]. STT download killed → relaunch → DM shows nothing (no retry/remove). Root: `downloadStore` not persisted + `sttProvider.reconcile` reads the empty store, nothing scans disk (`sttProvider.ts:118-128`). Same root as D1 — fix together.
- [ ] **V4 — deleting a TTS model leaves residency accounting stale** [P1 · SoC · HIGH]. TTS loaded (registers `key:'tts'`, 320MB) → delete in DM → `deleteModels` frees engine RAM (`ttsDownloadActions.ts:107 engine.deleteAssets()`) but never `modelResidencyManager.release('tts')` → 320MB phantom pressure → can wrongly refuse/evict a later text/image load. Fix: `release('tts')` on delete.
- [ ] **V5 — a DM delete/retry on a non-active TTS engine HIJACKS the user's active engine** [LATENT · MED, fires when a 2nd TTS engine ships]. `ttsProvider.remove`/`retry` do `if (engineId !== active) setEngine(engineId)` first → active flips to the target (now with no model on disk). Also `setEngine` never `release('tts')`, so the stale resident's unload fn would release the WRONG engine. Only kokoro is registered today → latent. Fix: operate on the target engine instance without switching active selection.
- Gaps the agent flagged for a follow-up: delete a whisper model MID-transcription (live context → deleted file); delete a TTS model MID-playback (no canEvict veto); whisper small/medium variants (same generic code path, not parametrized).

## Validated FIXED by the sweep (independent adversarial confirmation — recheck on next build):
- [x] QNN/NPU image download integrity (B8) — fresh QNN download extracts + registers, no phantom `clip_v2.mnn.weight`.
- [x] LiteRT image prompt-enhancement — enhances via the active engine, no longer llama-hardcoded (engine-DIP).
- [x] Pre-tool-call thinking box — renders for separate-channel AND inline `<think>`, left-aligned 85% (parse-once + B3).
- [x] Voice note transcript-only across llama + litert — audio never sent as model media (B5/B9), 34 adversarial tests green.

## To re-test on the next build (🔁)
- [x] **B2** — ✅ VERIFIED: voice-mode thought-process / enhanced-prompt block matches audio-bubble width (IMG_0131).
- [x] **B3** — ✅ VERIFIED: pre-tool-call thinking box left-aligned + bubble-width, text + voice (IMG_0131).
- [x] **B4** — ✅ VERIFIED iOS: resend "Draw a dog" re-drew the image, enhanced prompt correct (IMG_0114).
- [ ] **B5** — send a voice note in text mode → it uses the transcript, no "Failed to load media" error.
- [ ] **B6** — retry an image download that failed extraction → it re-downloads (no "Download not found").
- [ ] **B8** — ✅ FIXED (root-caused): download an Android **NPU (QNN)** image model → extracts + registers, NO "incomplete/connection dropped". Also confirm an Android **CPU (MNN)** image model still downloads + extracts (both backends must be tested).
- [ ] **B8-cpu** — Android **CPU/MNN** image model (e.g. a `*.zip` GPU variant) downloads → extracts → generates.
- [ ] **B8-npu** — Android **NPU/QNN** image model (AnythingV5 / AbsoluteReality `_min`) downloads → extracts → generates.

## Verified on device (✅)
- [x] **B1** — E4B LiteRT "Load Anyway" on a 12GB Android: loads + generates, no OOM, no refuse-loop.
- [x] Both "Thought process" boxes now render the same width (B2/B3 width unification, IMG_0112).
- [x] Gemma-4 GGUF load + generate (iOS).
- [x] Gemma-4 LiteRT load + generate (Android).
- [x] TTS + STT.
- [x] Remote / Off Grid AI Gateway (GW).
- [x] Message queues.
- [x] Tool calling.
- [x] Regenerate image on iOS (tapping the image message).
- [x] Image gen on iOS (SD 2.1 Palettized / CoreML) — generates fine (IMG_0114 dog).

## Still open (🔎)
- [ ] **B9** (iOS) — every voice-mode message → "Generation Error: File does not exist or cannot be opened". STT transcribes fine, then generation fails. ROOT: the payload contains an `input_audio` part (iOS log) — the voice note's AUDIO is sent to the LLM as media, but the file is gone/stale → open fails. Sibling of B5: my B5 filter excludes audio with `textContent`, but the voice-MODE note has no textContent on the attachment (transcript is in message.content) → not excluded → sent as media. Fix: in the chat path, a voice note is display-only — exclude its audio from the LLM media builders when the message has a text transcript (message.content), not just when the attachment has textContent.
- [ ] **B7** (Android) — QNN image model (anythingv5) with failed extraction has NO retry in Download Manager after app restart. Root cause: downloadStore is NOT persisted (plain create) → the failed entry is wiped on relaunch; imageProvider.list() doesn't scan disk for incomplete dirs → the orphaned model is invisible. Fix: surface an on-disk-incomplete image model as failed+retriable (or removable). NB: same-session retry is fixed by B6 (ad6bf86d), not in the running build yet. Ties to the QNN-over-recommendation backlog item (anythingv5_npu_min is a non-flagship QNN model that keeps failing extraction on this SoC).
- [ ] **B5b** — empty transcript: a voice note recorded with whisper not ready attaches with no text.
- [ ] **B5c** — a media-load error should fall back to text-only generation, not hard-fail the turn.
- [ ] **B6b** — auto-retry/resume a download after a transient network drop (currently manual only).

---

## Bug details (reference)

- **B1** — E4B LiteRT refuse-loop. Override ceiling used raw Android availMem (~4.5GB) not the reclaimable-aware physical budget → 5.2GB model always refused. Fix: Android ceiling = modelMemoryBudgetMB (~70% total). Commit c02c5452. ✅
- **B2** — Voice-mode thinking/enhanced-prompt block was full-width (alignSelf:stretch). Fix: match audio-bubble width. Pro commit b8a6a4f7. 🔁
- **B3** — Tool-call thinking box rendered in systemInfoContainer (centered/full-bleed). Fix: left-aligned assistant container + bubble-width column. Core commit a0142d48. 🔁
- **B4** — Resend image turn → text. `recordedTurnKind` checked only the first reply, but an image turn's Enhanced-prompt message precedes the image. Fix: scan the whole turn. Commit 7b686154. 🔁
- **B5** — Voice note in text mode → "Failed to load media". A transcribed voice note's audio was re-sent to the LLM as media (mmproj can't load audio). Fix: transcribed audio is display-only, excluded from LLM media builders. Commit 398eb6fd. 🔁
- **B6** — Retry on an image download that failed at extraction → "Download not found" (native row gone). Fix: fall back to full re-download. Commit ad6bf86d. 🔁
- **B8** — Every fresh Android **NPU (QNN)** image download failed as "files incomplete (missing clip_v2.mnn.weight / unet.bin) — download corrupted or interrupted", surfacing as a fake "connection dropped" alert. NOT network, NOT truncation: text models (6.5GB) download fine, and the real `AnythingV5_qnn2.28_min.zip` (995,100,213 B) downloads byte-exact + `unzip -t` passes + contains **no `.weight` files**. ROOT: `checkImageModelFiles` ran the **MNN split-weight pairing loop for QNN too** — but QNN ships `clip_v2.mnn` as a MONOLITHIC graph (no `.weight` sibling; proven by the working on-device absolutereality_npu_min: `clip_v2.mnn` 156MB, no `.weight`, generates fine). So it demanded a file that never exists → false "incomplete". iOS unaffected (coreml early-returns). The varying byte counts (994/989/983M) were just the last progress tick, not truncation. Fix: gate split-weight pairing to `backend==='mnn'`; model QNN's real required set (unet.bin, vae_decoder.bin, self-contained clip; vae_encoder optional). Regression test uses the byte-exact zip + on-disk file set. 🔁
- **Width unification** — both thinking boxes + audio bubbles now one 85% width (mirrors core bubble maxWidth); voice tool-call double-padding removed. Pro commit 1824a0c0. ✅ (IMG_0112)
