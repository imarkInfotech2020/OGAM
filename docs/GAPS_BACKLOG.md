# Gaps backlog

Honest register of OPEN gaps, regressions, dead code, and "not fully done" items. Each
entry has a verdict and evidence. The standing gap agent picks these up, closes them, and
REMOVES them from this file once resolved (the record lives in git history + commit messages).
This file only ever contains work that is still open.

Verdict legend:
- **delete-safe** - unreferenced / unreachable and provably unused; remove it.
- **fix-the-guard** - the branch is SUPPOSED to fire but a condition prevents it; fix the condition (a latent bug, not litter).
- **instrument-and-revisit** - uncertain trigger; add a `[*-SM]` trace + an on-device journey to observe it live before deciding.

---

## Tooling gates — remaining follow-ups

The tooling spine is installed + enforced (depcruise 0 violations, knip 0 issues, sonarjs wired,
untyped dead-branch rules — all hard CI gates). These three are the open follow-ups:

1. **DIP value-branch ESLint rule.** depcruise catches the IMPORT-edge half of the engine-DIP rule;
   the VALUE-branch half (`model.engine === 'litert'` comparing a store value) is not an import edge.
   Guard it with an ESLint `no-restricted-syntax` rule so a new concrete-engine branch in a caller fails.

2. **SonarJS warn→error ratchet.** These rules are at `warn` (tripped on legacy core); ratchet each to
   `error` as its count hits zero. (`no-duplicate-string` stays OFF — it fights RN style literals.)

   | Rule | Count |
   |---|---|
   | sonarjs/prefer-single-boolean-return | 9 |
   | sonarjs/no-nested-template-literals | 6 |
   | sonarjs/no-collapsible-if | 2 |
   | sonarjs/prefer-immediate-return | 1 |
   | sonarjs/no-duplicated-branches | 1 |

3. **Typed `@typescript-eslint/no-unnecessary-condition` (AI dead-branch killer).** Needs typed linting
   (`parserOptions.project: ['./tsconfig.json']` — SLOWS eslint) + the typed config. Floods on AI code.
   CAUTION: many "unnecessary" conditions are DEFENSIVE against untyped runtime data (native bridge,
   JSON) — blindly deleting them can crash at runtime. So: enable, MEASURE, fix each by hand verifying
   it's not a real runtime guard (keep + `// eslint-disable` with a reason where the type lies about
   runtime). Fix-in-waves toward `error`. Companion tsconfig flags to measure: `allowUnreachableCode:false`,
   `noUnusedLocals/Parameters:true`.

---

## Dead-code recon — open (deferred) items - 2026-07-06

Recon sweep findings that are real but deferred (changing them risks behaviour). The false-positives
(AU1, AU2, DL4, ML1, ML2 — verified USED by tests/prod) have been dropped from the register.

### Model-load / generation
| # | Location | Symbol | Verdict | Note |
|---|----------|--------|---------|------|
| ML3 | activeModelService/utils.ts:16-17 vs types.ts:48-50 | overhead multipliers (1.2/1.3 hardcoded vs 1.5/1.8 constants) | fix-the-guard | HomeScreen memory display disagrees with the load-path math; import the shared constants |
| ML5 | activeModelService/index.ts:~338 + loaders.ts | `cpuOnly: false` (always false) | delete-safe (deferred) | native CPU-only branch unreachable from TS; removing the arg changes the native call — do as a typed refactor with tests |

### Download / model-manager
| # | Location | Symbol | Verdict | Note |
|---|----------|--------|---------|------|
| DL1 | downloadHydration.ts:33 | `case 'retrying'` in mapNativeStatus | delete-safe (deferred) | native never emits 'retrying'; removing a union value risks exhaustiveness breakage — typed refactor with tests |
| DL2 | DownloadManagerScreen/items.tsx (+ downloadStatusIcon.ts, downloadErrors.ts, useDownloads.ts) | branches on `status === 'retrying'` | fix-the-guard | unreachable given DL1; remove or document the contract |
| DL3 | modelManager/types.ts:13 | `BackgroundDownloadMetadataCallback` (@deprecated no-op) | delete-safe (deferred) | author-confirmed no-op, still threaded through 3 sites; needs on-device observation |
| DL5 | modelManager/download.ts:454-462 | `isFinalizing` reset only on error | instrument-and-revisit | verify re-entrancy window on the success path |

### Audio / TTS / STT
| # | Location | Symbol | Verdict | Note |
|---|----------|--------|---------|------|
| AU4 | ChatInput/Voice.ts:136-143 | stopRecording early-return guard | fix-the-guard | inverted condition; can't be true when recording |
| AU5 | whisperService.ts:338-400 | `transcriptionFullyStopped` promise overwrite | fix-the-guard | new start replaces a promise unloadModel may await |
| AU6 | audioRecorderService.ts:12-14 | `supportsDirectAudioInput()` stub `return true` | instrument-and-revisit | placeholder; add real capability detection |

### Image-gen / tools / remote
| # | Location | Symbol | Verdict | Note |
|---|----------|--------|---------|------|
| IM2 | localDreamGenerator.ts:67 (+ loaders.ts:296) | `backend` param always `'auto'` | delete-safe (deferred) | 'mnn'/'qnn' branches never reached from TS; removing the arg changes the native call |
| IM3 | imageGenerationHelpers.ts:42-44 | iOS short-circuit ignores `backend` | fix-the-guard | 'coreml'/default 'mnn' unreachable on iOS; make explicit |
| IM4 | localDreamGenerator.ts:236-238 | `hasKernelCache()` wraps `hasOpenCLCache` (name mismatch) | fix-the-guard | rename to match native call |
| IM5 | localDreamGenerator.ts:231-239 | `clearOpenCLCache`/`hasKernelCache` silent iOS no-op | instrument-and-revisit | throw or gate at call site on iOS |

---

## Image-gen QNN over-recommendation on non-flagship Snapdragons - 2026-07-08

**Verdict: fix-the-guard (DEFERRED — needs a curated SoC allowlist + on-device rounds).**

Observed live (AC2001 / OnePlus Nord, SoC SM7250): the app recommends a QNN/NPU image model, the
user downloads + loads it, and the native local-dream process crashes: `Failed to load image model:
Server process exited with code 1. Your device (SM7250) may not support this model's backend.` So it
recommends NPU then reports NPU unsupported — a self-contradiction.

Root cause (`src/services/hardware.ts`): `classifySmNumber` buckets every non-flagship Snapdragon into
`'min'`; `hasNPU = vendor === 'qualcomm' && !!qnnVariant` → `'min'` counts as NPU-capable; `getQualcommImageRec`
returns `recommendedBackend:'qnn'` for ALL variants incl. `'min'`. So SM7250 (Hexagon that can't run
the QNN binaries) is told QNN works, passes the pre-load gate, and crashes at runtime.

Fix: QNN capability must be a narrow verified set (8gen1/8gen2 or an explicit allowlist), not "any
Snapdragon"; `hasNPU`/recommendation key off ACTUAL QNN-capability; the catch-all recommends `mnn`.
Needs device verification on affected SoCs (SM7250 + a true 8gen1/8gen2) before shipping.

## Image-gen inline preview not shown on first run - 2026-07-08

**Verdict: instrument-and-revisit (native-emission behaviour, not a JS/UI bug).**

First run (OnePlus Nord, mnn/OpenCL): the "Generating Image" card showed no inline preview. The UI IS
wired correctly (`ChatScreenComponents` renders `imagePreviewPath` fed by imageGenerationService's
onPreview → appStore). The preview only appears when the NATIVE localdream module includes `previewPath`
in its progress events — none were emitted, consistent with first-run OpenCL kernel compilation skipping
the intermediate-latent decode. Next: confirm whether previews appear on a SECOND (warmed) generation.
If yes → expected first-run behaviour (maybe show a hint). If never on mnn → native gap; JS/UI is correct.

---

## On-device test session - 2026-07-09 (Qwythos-9B vision + memory, 12GB iPhone/Android)

Surfaced live on real hardware during 0.0.103 vision/memory testing. None caught by the green suite —
the reason the on-device gate is mandatory.

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| OD1 | **Vision (mmproj) dropped on download retry** | fix-the-guard | `[DL-SM]` iPhone: main GGUF failed at 9% → auto-retry re-issued `needsMmProj:false, mmProjLocalPath:null` → finalized text-only. release/0.0.103 fix (persist metadataJson) targets this; UNVERIFIED on-device. |
| OD2 | **Repair Vision has no progress feedback** | fix-the-guard | ~900MB mmproj re-download behind an indeterminate "Repairing…" spinner. Needs determinate progress. USER-SELECTED. |
| OD3 | **Chat vs Home model-selector inconsistency** | fix-the-guard | `checkMemoryForModel` called ONLY in useChatModelActions.ts. Chat pre-checks (predictive fileSize×1.5 → gates behind "Load Anyway"); Home skips the pre-check → loads via measured makeRoomFor → succeeds. Two surfaces, one decision, divergent logic. USER-SELECTED. |
| OD4 | **UI freeze on forced heavy load (Load Anyway on 9B multimodal)** | instrument-and-revisit | RN touchables dead; debug log stopped = JS thread blocked by the synchronous native load. Root cause turned out to be threads=1 (see nThreads follow-up below). |
| OD5 | **Android download retry doesn't resume after network drop** | instrument-and-revisit | `[DL-SM]` android: errored at 75%, retry dispatched → NO further progress. Partly a real WiFi drop; retry-not-resuming is the reliability gap. |
| OD6 | **Kokoro TTS asset stuck loop** | instrument-and-revisit | `[KOKORO-DL] checkAssetStatus → downloading (phase=ready progress=1.00 genuineCompletion=false)` spamming — stuck "downloading" while phase=ready/progress=1.0. |
| OD7 | **Thinking toggle missing for Qwythos-9B in settings** | instrument-and-revisit | Model has reasoning + emits `<think>` but settings shows no toggle. Capability detection gap for community GGUF. |
| OD8 | **Voice-mode thinking not streamed (appears suddenly)** | instrument-and-revisit | Thinking renders live in text chat but batches in voice mode. Suspected in the audio-layout display path (pro/audio/ui/AudioModeLayout.tsx). USER-SELECTED. |
| OD9 | **TTS speaks tool-call content aloud (voice mode)** | fix-the-guard | DELEGATED (fix/tts-strip-tool-calls). `enqueueReadySentences` runs stripControlTokens per-SENTENCE-fragment, so a `<tool_call>…</tool_call>` spanning sentence boundaries leaks. Fix: withhold+strip whole control-token blocks before segmentation. |
| OD10 | **TTS stops mid-speak** | instrument-and-revisit | `KOKORO_SPEAK The model is currently generating` + `stream segment FAILED` — a double-speak concurrency collision. Needs speak/stream serialization checked. |
| OD11 | **Voice mode can't stream TTS alongside a large LLM** | fix-the-guard | With a big model resident, the single-model residency rule blocks the ~82MB Kokoro sidecar even with 4.4GB free; streamingSpeech loops `stream feed SKIP: engine not warm` then falls back to end-of-turn speech. Fix: allow SIDECAR types (tts/whisper/embedding) to co-reside when real free RAM fits them. |
| OD12 | **9B loads slowly on CPU + feels frozen** | instrument-and-revisit | GPU (Adreno 4.6GB) can't hold the 9.3GB model → CPU fallback; with threads=1 the load took ~1m43s (janky UI). Root cause = nThreads (below). Also: keep UI responsive during a long native load. |
| OD13 | **Qwythos output goes entirely to reasoning_content, answer undefined** | instrument-and-revisit | `content:undefined, reasoning_content:"The"`, `token:"<|channel>"` while `reasoning_format=deepseek`. Model's actual reasoning delimiters don't match the configured format. Needs per-model reasoning_format detection, or accept it's a bad-fit model. 'auto' native-first (parse-once) may fix it. |
| OD15 | **"Unable to generate parser for this template / Jinja: Conversation roles must alternate" on model switch after a tool call** | fix-the-guard | llama.rn minja compiling a chat_template that asserts strict user/assistant alternation when tools enabled / history has assistant+tool+assistant. Pre-existing. Fix: catch the LOCAL tool-parser-gen failure and retry WITHOUT tools (app already does this for REMOTE via isToolGrammarError). Separate PR. |
| OD16 | **Remote model capabilities feel flaky across Ollama / LM Studio / OGA Desktop** | instrument-and-revisit | remoteModelCapabilities has 39 unit + 4 integration tests but all FIXTURE-based. Real flakiness is response-shape variance across provider versions. Fix: capture real /props, /api/show, /v1/models from LIVE instances as fixtures; harden derivation; add a provider-abstraction contract test. Separate workstream. |

**nThreads sane-default follow-up (own PR):** OD4/OD11/OD12 shared a root cause — the 9B ran with
`threads=1` (device default nThreads:0/auto not resolving to a sane core count on an 8-core device).
Single-threaded native inference starved the iOS JS thread and crawled on Android; raising the thread
count fixed both (confirmed on device). Investigate why nThreads resolved to 1 for large models
(`[LLM] Resolved params: threads=1`) and ship a sane default. GPU/NPU are NOT viable for this model
(Adreno OpenCL 1GB max-alloc; Hexagon needs QNN-converted models; Qwythos is SSM-hybrid) — CPU-with-
proper-threads is the path.

---

## Repo-wide /hygiene audit — open items - 2026-07-09 (SOLID §A/§B + DRY §C)

Through-line: decision/capability logic derived ad-hoc at many call sites instead of owned once by a
service.

### SOLID (§A/§B)
| # | Location | Verdict | Fix |
|---|----------|---------|-----|
| SO1 | src/screens/ModelsScreen/TextModelsTab.tsx:143 handleRetryDownload | BLOCKING | Renderer re-implements download retry (Platform.OS branch, store mutation, mmproj, polling) — CLAUDE.md says this moved to ModelDownloadService. Delete; delegate to modelDownloadService.retry() like useDownloadManager. |
| SO5 | src/screens/ModelsScreen/ImageFilterBar.tsx | DEBT | Platform.OS chooses which filter DIMENSIONS exist. Data-driven filter descriptor from service. |
| SO6 | src/services/remoteServerManagerUtils.ts:122 | DEBT | `provider instanceof OpenAICompatibleProvider` to call updateCapabilities. Put on the provider interface (ISP). |
| SO7 | pro/audio/ttsStore.ts:377,385 | DEBT | `instanceof OuteTTSEngine` for cache ops. Optional getAudioCacheSizeMB?/clearAudioCache? on the TTS engine interface. |
| SO8 | src/stores/remoteServerHelpers.ts:32,188 | DEBT-low | `kind==='vision'` capability branch; fold into shared deriveRemoteCapabilities. |

### DRY (§C)
| # | Location | Verdict | Fix |
|---|----------|---------|-----|
| DR3 | src/screens/HomeScreen/components/ModelPickerSheet.tsx:63,201 (*1.8/*1.5, -1.5) | DRIFTED (live) | Third memory-fit verdict bypassing memoryBudget.ts. Can say "fits" when residency refuses — the Load-Anyway/selector bug family. Call modelMemoryBudgetMB. |
| DR4 | CHARS_PER_TOKEN=4 bare literal in llmHelpers,liteRTCompaction,litert,llm,generationServiceHelpers,providers/*,documentService | DEBT | Export CHARS_PER_TOKEN_ESTIMATE + estimateTokens(); all import. |
| DR5 | STOP_TOKENS (llmHelpers:427) + CONTROL_TOKEN_PATTERNS (messageContent:1) + tests re-hardcode | DEBT | One token registry; derive stop-list + strip-patterns; tests import. |
| DR6 | pro/audio outetts:363 + ttsService:207 '<\|im_end\|>' | DEBT-low | Shared IM_END_TOKEN. |
| DR8 | remoteModelCapabilities:202 deltaHasThinking vs openAICompatibleStream:155 | DEBT | Shared REASONING_DELTA_FIELDS + deltaHasReasoning(delta). |

### Test quality (§D)
| # | File | Verdict | Fix |
|---|------|---------|-----|
| TQ1 | __tests__/**/useDownloads.test.ts | WORST | Fakes the reducer under test (hand-sets entry.status then asserts the spy) — 37 call-asserts, 0 real-state. Drive real useDownloadStore; assert getState().downloads[key].status. |
| TQ2 | ChatScreenSpotlight (step 3→12 block) | WORST | Block ends after advanceTimersByTime with ZERO expect() — can never fail. Assert the coachmark text. |
| TQ3 | Spotlight trio (Chat/Home/ModelSettings, ~40 tests) | HIGH | Assert goTo(<int>) not the coachmark; unmock react-native-spotlight-tour, assert getByText(coachmark). |
| TQ4 | useChatGenerationActions.test.ts | HIGH | L932 tautology + mock-on-mock "message appeared"; assert store/rendered outcome. |
| TQ5 | coreMLModelUtils "downloads sequentially" | MED | Asserts order that only holds by .map push order while impl uses Promise.all. Assert real ordering w/ dynamic out-of-order mock or drop the claim. |
| TQ6 | render tests w/ no getByText: TTSButton, ModelFailureCard, ImageGenAdviceCard, ToolAccordionStreaming, ModelsManagerSheet, McpAddServerSheet, PlaybackControls, KokoroTTSBridge | MED | Assert visible content/state, not just container testID. |

---

## Pre-existing: mid-chat model switch doesn't refresh chat state until remount - 2026-07-10
**instrument-and-revisit** | Reported on-device (iOS, gemma-4 local + remote), confirmed present on the
OLD build (NOT introduced by this PR's work). Loading a new model from within the Chat screen mid-
conversation does not update the screen's derived active-model state — not a freeze; navigating Home →
back re-syncs. Suspect useChatModelStateSync / the chat's derived activeModel not re-running after an
in-chat load (the model loads fine; only the screen's projection is stale). Fix separately with its own
on-device repro — do NOT bundle into the current release PR (scope + risk).

---

## Device-verification gate before release (PR #510) — MUST pass before shipping

Unverified-on-device changes that MUST be checked on the Android dev build (ai.offgridmobile.dev) + iOS
before shipping (§H — device-gate unverified fixes). Pull `Documents/offgrid-debug.log` and grep the
state-machine traces:

- **Platform-aware override memory floor** (700MB Android / 1200MB iOS, physical-based, no swap credit) —
  confirm a tight-memory LiteRT load refuses cleanly (no OOM) via `[MEM-SM]`.
- **doUnloadTextModelLocked now unloads the ACTIVE engine** (LiteRT eviction frees native memory) —
  confirm `[MEM-SM]` on a LiteRT→llama switch under pressure.
- **Readiness change:** ensureModelReady/ensureModelLoadedFn now require isModelLoaded() (desync guard).
- **Deterministic resend** (image turn re-runs the image pipeline via recorded modality, not a
  re-classify — the Android 1★ "Resend → model cannot be loaded" fix): confirm an image resend on-device
  re-generates the image (does not try to load a text model).
- **Native-first Gemma flip** (buildThinkingCompletionParams reasoning_format 'none'→'auto') — a RUNTIME
  behavior change. Run a Gemma4 thinking + tool-call flow; grep `[GEMMA-FALLBACK]`. If it NEVER fires →
  native 'auto' works → DELETE parseGemmaNativeToolCalls + Gemma `<|channel>` hand-parser branches (dead)
  + narrow the hand-parsers to the remote-only fallback. If it fires → keep the hand-parser as fallback.
  ('auto' may also fix OD13.) Must not ship in a beta until this device check passes (TestFlight is
  distribution-signed → no container logs; verify on the dev build first).
- **iOS collapsed thinking-box width fix** — screenshot check.
- **STOP-PATH CLUSTER (device-diagnosed 2026-07-13, offgrid-debug.log 18:12–18:16 + IMG_0143/44/45): one root, four symptoms.**
  Root: a stop during PREFILL cannot interrupt llama until prefill completes (~9s on a 2.6k-token KB
  context; 74s cold on CPU), and the app's stop path lies about idleness while the native context
  unwinds. Chain + fixes (each at its owning seam):
  1. `llm.ts stopGeneration()` sets `isGenerating=false` BEFORE awaiting `activeCompletionPromise`
     → readiness says free while native is busy. FIX: declare idle only AFTER the unwind await.
  2. `generationToolLoop` is stop/interrupt-BLIND: no abortRequested check between iterations, and a
     completion result with `interrupted:true, predicted=0` flows onward as a normal empty result →
     zombie follow-up completions after a stop (these held the engine → the 'LLM service busy' error
     on the next send, log 18:12:34), and the empty result renders the WRONG "No response /
     incompatible backend (K-quant on NPU/GPU)" card (IMG_0145) — model/backend were fine. FIX:
     surface `interrupted` from `llmToolGeneration`/`generateResponseWithTools` returns; loop treats
     interrupted as STOPPED (finalize partial, no further completions, no error card).
  3. Resend/busy-error path left the send button latched as a fake STOP with phantom "..." while no
     session was live (IMG_0144; `prepareGenerationImpl` clears on readiness-throw, so the latch is in
     the RESEND caller's state) — find the resend action's generating flag + clear on error.
  4. A stale "No response" error card is not cleared when a subsequent retry succeeds (IMG_0145→next).
  Tests owed: rendered chat — send tool turn → stop mid-prefill (fake native with delayed unwind
  honoring stopCompletion) → assert stopped-partial finalization, NO busy sheet, NO "_(No response)_"
  bubble, button back to send; immediate resend then succeeds.
- **RESOLVED 2026-07-14 (reload capability drift + silent GPU→CPU): root cause was NOT a second load
  path.** Device log 18:50 proved the reload ran the ONE loadModel pipeline and detected thinking
  correctly (`Model loaded ... thinking: true` at 18:50:30.409) — but `applyLoadedContext` published
  `this.context` (the isModelLoaded readiness signal) BEFORE the multimodal probe + capability
  detection, so the 18:50:27.733 send raced into a ~3.5s window and generated with stale
  `thinkingSupported=false`. Fixed: capabilities derived on the local context, published atomically
  (396bea25; journey reloadRaceKeepsThinking.rendered.redflow). The GPU symptom was a REAL init
  timeout (18:57:19 `GPU context init timed out after 8000ms`) falling back silently — now surfaced
  as an always-on system notice (gpuFallbackNoticeVisible.rendered.redflow); the meta also stops
  claiming the uncapped layer count. `reloadWithSettings` (the drifted copy, zero callers) deleted.
  Residual gaps, still open:
  1. **Fallback notice needs a conversation.** The notice renders as a system-info chat message; a
     GPU→CPU fallback on a load with NO active conversation (fresh chat, Home-screen load) has no
     surface. Decide a surface (chat placeholder card / header chip) and add a rendered test.
  2. **CPU fallback inherits OpenCL-shaped params.** When the OpenCL attempt times out, attempts
     2/3 reuse the OpenCL-coerced params (no cache_type → f16, flash_attn off) instead of
     rebuilding CPU params (user's q8_0 + flash attn). Fix at initContextWithFallback/loadModel:
     rebuild params for the CPU attempt; assert via WIRE-LLAMA-LOAD in a journey.
  3. **8s GPU-init timeout may be too tight for this device/model** (earlier runs DID get 24/36
     layers on the same phone). Device-verify whether a longer Adreno timeout restores GPU.
- **Manager sheet = the residency surface (agreed design, 2026-07-14).** Move "In Memory" out of the
  Select Model picker into the MODELS manager sheet: each modality row shows its model + a RAM chip
  when RESIDENT + a per-row eject (power glyph, muted red, right of the fixed-width type label so all
  four align as a control column; generous hitSlop; row tap still opens the picker). "Eject All"
  stays. Needs: per-row residency projection (text/image/voice/speech), per-type eject actions via
  the owning services (no engine branching in the view), rendered journey tests per row + falsifiers.
- **Concurrent-retry race journey test (owed).** The 'No response'-card race fix (per-turn
  ToolLoopOutcome) is covered by construction + the stop journey's no-card assertions; still owed a
  rendered journey that starts a retry BEFORE the stopped turn's classifier runs and asserts no card.
- **Kokoro TTS download bypasses the 3-slot concurrency cap** (device-reported, 2026-07-13). The TTS
  (Kokoro) model download does NOT respect `backgroundDownloadService`'s `MAX_CONCURRENT_DOWNLOADS = 3`
  admission cap — it starts immediately regardless of how many downloads are already running. Likely
  cause: the TTS start path passes `isSidecar: true` (or otherwise goes through the uncounted
  `beginDownload(counted=false)` branch), which is meant only for dependent sub-downloads (a vision
  model's mmproj) that ride alongside their main. Kokoro is a standalone model, so it should be counted
  and queued like any other. Fix: route the Kokoro/TTS download through the counted path (not sidecar)
  so it occupies a slot and queues when the cap is hit; add a test that enqueues > 3 including the TTS
  model and asserts it queues rather than starting immediately.
- **Onboarding litert download-warning: rendered test for the ModelDownloadScreen caller** (2026-07-13).
  The device-aware curated-litert warning decision (`curatedLiteRTDownloadWarning`) is now a single owned
  function called by BOTH the Models tab (`TextModelsTab`) and the onboarding screen (`ModelDownloadScreen`).
  It is covered by an all-branch pure unit test + a rendered test through the Models-tab caller. The
  onboarding caller is identical thin wiring but has no dedicated rendered test yet (mounting the full
  onboarding screen with device-init + Android litert rendering is heavier). Follow-up: add a
  `ModelDownloadScreen`-mounted rendered test (Android, 12GB) that taps the E4B litert download and asserts
  no "may exceed your device's memory" sheet — the exact device-reported surface (IMG_0142).

---

## Cosmetic voice-mode label (deferred from the 0.0.103 device session)

**Verdict: instrument-and-revisit.** During the 0.0.103-beta device session, two fixes landed (Lean
per-model eject + thinking-block width). A third item — a **cosmetic label/chip in voice mode**
rendering the wrong text — was deferred: it is purely cosmetic (no functional impact) and pinning the
exact wrong value needs a device-log pull, not code reading. Next device session: pull the live tail of
`offgrid-debug.log` from the `.dev` container, grep the `[*-SM]` traces while entering voice mode, read
the actual rendered label value, then fix in `pro/audio/` UI. NOT a release hazard.

---

## #510 audit follow-ups (deferred from the load-anyway/dedup fix batch, 2026-07-15)

- **Onboarding litert download-warning unreachable** (`ModelDownloadScreen.tsx:299`): fix is code-ready
  (route the over-budget-but-warnable card through the owned `curatedLiteRTDownloadWarning`) but blocked
  by a mockist test `__tests__/rntl/screens/ModelDownloadScreen.test.tsx:607` that asserts the buggy
  pre-filter. Per doctrine: update/delete that mockist test, then land the fix.
- **`ModelSelectorModal.test.tsx` is mockist** (jest.mocks our stores/services/hardware) — 44 tests over a
  fake store. The RAM-parity fix is really proven by `pickerRamMatchesResidencyChip.rendered.redflow.test.tsx`;
  replace this file with rendered coverage post-release. Source carries a harmless `s.settings?.` to keep it green.
- **Queued-message imageMode carry** (`useChatGenerationActions`/`generationService`/`useChatScreen`): a
  force-image send that gets queued loses its force flag (re-decided at 'auto' on drain). Needs the
  QueuedMessage interface + drain handler edited together — own PR.
- **huggingface.findMatchingMMProj strict migration**: keep the generic-single-projector case, refuse a
  projector naming a DIFFERENT model (E4B for E2B). Own download-listing matcher in mmproj.ts. See the
  it.failing at `huggingfaceProjectorStrictness.test.ts`.
- **Reclaim-aware pre-load gate**: in progress on its own branch (device-verify on 12GB Android before merge).

---

## DEVICE FINDING (2026-07-15, iPhone) — false "something else is generating an image" (stale IMG-SM lock)

Symptom: image generation refused with a message that something else is generating an image ("I can't
help you right now, you can reload the model") when NOTHING else was generating. Reloading the model
cleared it and generation started.

Mechanism: `imageGenerationService.generateImage` rejects when `isInFlight(state.phase)` is true
(imageGenerationService.ts:402). The known failure paths reset the phase (`_ensureImageModelLoaded`→`_fail`;
`_runGenerationAndSave` catch→`resetState`/`_fail`), so a DIFFERENT path leaves `state.phase` stuck
in-flight ('loading'/'enhancing'/'generating') — plausibly tied to a refused/slow SDXL load or an
interrupted 120s ANE compile. Reload resets the service state → clears the false lock.

NOT fixed yet (would be a speculative guard without a red-verifiable repro). TO PIN IT: reproduce on
device, `xcrun devicectl device copy` the `.dev` container's `offgrid-debug.log`, grep `[IMG-SM]` — the
stuck transition (a `phase X → <in-flight>` with no following reset) names the exact path. Then fix at
that seam + a rendered red-flow (image mode → trigger the stuck path → next generate must NOT report
"already generating"). Candidate hardening once pinned: a top-level try/finally in generateImage so no
throw can leave the phase in-flight, and/or a self-healing staleness check on the isInFlight rejection.

---

## #510 audit — remaining PARTIAL fixes (found during the finding→code verification, 2026-07-15)

These are honestly NOT fully closed by the load-anyway batch — logged so they are not lost:

- **STT terminal-failure has no override card.** The realtime dictation now RECOVERS via
  ensureWhisperForTranscription (free the generation model → retry) — the common case. But if that retry
  ALSO fails, transcriptionOutcome.ts returns a static "Couldn't load the voice model — free some memory
  and try again" string, NOT a reportModelFailure('stt', {onLoadAnyway}) card. There is no generation
  model left to free at that point, so there is genuinely nothing more to do — but the product rule
  ("any memory refusal offers Load Anyway on any type") is only PARTIALLY met for STT: recovery yes,
  terminal override no. reportModelFailure is now called for text/image/tts but NOT stt/embedding.
- **Embedding-model load failure never surfaces a card.** modelFailureHandler reserves an 'embedding'
  type but nothing calls reportModelFailure('embedding', …). A RAG/embedding load failure is still
  silent. Low user impact (embedding is background) but it violates the "nothing is silent" promise.
- **ModelPickerSheet:216 RAM display**: the fit VERDICT uses the owned fileExceedsBudget, but the
  displayed "~X GB RAM" number is a separate 1.5x estimate — the "(may not fit)" tag and the number can
  disagree at the margin. Assessed as by-design (verdict is authoritative; number is a hint) but noted.

---

## #510 audit — STT-terminal + embedding: VERIFIED WORKING-AS-DESIGNED (not bugs, do NOT "fix")

Re-examined the two items I earlier logged as "partial fixes needed". Code inspection shows both are
correct terminal states, NOT dead-ends — surfacing failure cards would be theater or a regression:
- **Embedding load failure**: `src/services/rag/retrieval.ts:43,53` catch a failed embedding load/embed
  and RETURN `ragDatabase.getChunksByProject` (keyword/FTS chunks) — search still works (graceful
  degradation). `toolEmbeddingRouter`/`generationToolLoop:821` likewise fall back to "use all tools".
  A reportModelFailure('embedding') card would interrupt a working degraded flow → NOT added.
- **STT terminal**: `ensureWhisperForTranscription` frees the generation model and retries; if whisper
  STILL won't load, whisper-alone exceeds the device → a genuine HARD limit. The "free some memory"
  string is the honest message; a Load-Anyway there is a guaranteed-fail no-op. The recovery IS the fix.
CONCLUSION: these two need no code change. Removed from the "to fix" list.

## #26 text-half (deferred, cosmetic-low)
ModelPickerSheet text RAM hint still uses formatModelRam's 1.5 default, not the backend-aware
textOverheadMultiplier the residency chip / TextTab use — so on a GPU backend the picker number can
read lower than the chip. Verdict (fileExceedsBudget) is correct; this is a display-number nicety.
Fix = pass settings.inferenceBackend into ModelPickerSheet + formatModelRam(model, textOverheadMultiplier(backend)).
Deferred to avoid a new HomeScreen-picker dependency right before release. Image half fixed.

## M5a (marginal, logged) — exact budget boundary untested
fileExceedsBudget's boundary (size == budget: `>` vs `>=`) has no test straddling the exact equality —
the verifier's `>`↔`>=` mutant survived. Off-by-one-byte at the budget edge; no user-visible impact
(a model exactly at the budget is a measure-zero case). Add a boundary test if fileExceedsBudget is
touched again. Not fixed now (marginal, near release).

## A1 mmproj fix — possible load-immediately-after-download vision race (2026-07-24)

**Verdict: instrument-and-revisit (LOW — unconfirmed). NOT a merge blocker; PR #605 verified on both
platforms.**

A1's fix is verified on-device on BOTH iOS and Android (ggml-org SmolVLM-256M → real vision answer;
`[WIRE-VISION] initialized:true, vision:true` on both; mmproj on disk as the correct
`smolvlm-256m-instruct-mmproj-Q8_0.gguf`, `mmProjFileExists:true`). So the naming/matching fix is
correct and complete on both platforms.

Watch-item: during the FIRST Android attempt — a messy sequence right after download, on a
non-debuggable build, with a system notification-permission dialog intercepting taps — a vision send
threw "Multimodal support not enabled". It did NOT reproduce on the clean debuggable run (model
downloaded+linked, loaded fresh → vision:true → correct description). Possible unconfirmed cause: a
model loaded text-only if loaded in the window before its mmProjPath is persisted on the record
(load-immediately-after-download race), OR just the permission-dialog interference. If a real user
reports vision failing right after a first download, instrument the load path: assert the model
record's mmProjPath is set before the first load, and re-derive multimodal if a mmproj is linked after
a text-only load.

---

## Personal Mesh (sync across macOS, iOS, Android) — 2026-07-30

First entry for Personal Mesh in this doc. Found by auditing the shared state machines in
`@offgrid/sync` against what the two apps actually wire, with Android in scope as a first-class
target. The shared layer is largely complete; these are the app-side holes.

**Closed in this pass (code + wired, NOT device-verified):**

| ID | Gap | Status |
|---|---|---|
| PM1 | Public core minted a second device identity (`getOrCreateLocalDevice` persisted a random id), so op-log provenance and version vectors were keyed to an identity absent from every roster and membership. `stateSyncService` used it directly while pairing used the fingerprint. | Fixed: core exposes display facts only; `getCanonicalLocalSyncDevice` is the one place an id is attached; a one-time pure migration re-attributes persisted ops. Needs device verification (matrix rows 5-6). |
| PM2 | Backgrounding Android suspended the process: mDNS, the TCP listener and in-flight transfers stopped while the peer still showed the device connected. Only WorkManager's download service was declared. | Fixed: `MeshResidencyService` dataSync foreground service + one TS contract both platforms satisfy, with the capability gap declared as data (iOS honestly reports `survivesBackground: false`). Needs device verification (matrix rows 18-21). |
| PM3 | Dead `devHarness` was a second identity minter behind a permanently-false flag. | Deleted. |

**Open:**

| ID | Gap | Verdict |
|---|---|---|
| PM4 | ~~Android reinstall orphans a licensed seat.~~ **By design, not a gap.** Android wipes the Keystore on uninstall so a reinstall mints a new fingerprint and consumes a seat. This is the exact case auto-eviction of the least-active installation plus user-driven device management already answers: the dead entry is by definition least-active, so it is what gets replaced. Closed. |
| PM5 | ~~No license-key revocation or rotation.~~ **Out of scope by product decision (2026-07-30).** We do not support revoking or rotating a key: if a key is compromised, that is the user's loss. Device eviction remains the only removal mechanism. Do not re-open this as a gap. |
| PM6 | ~~Two shared projections have zero callers.~~ **Wrong - both are rendered** (`KnownDevicesSection.tsx:78`, `DevicesScreen.tsx:2348`); the original grep excluded `shared/`. The real defect was the COPY: the confirmation said eviction "removes the pairing from both devices", omitting that the seat is freed and what happens to the target's saved licence. Fixed in shared: the copy now splits on reachability, so an offline device is told cleanup stays queued rather than claimed already clean. Closed. |
| PM7 | **Devices UI never audited against the brief's state table.** Both platforms consume `projectSyncControlCenter`, but nobody has checked all six credential x registered x paired x connected rows render distinctly, that capacity reads "N of 5 registered", or that roster freshness is shown rather than stale data presented as authoritative. | audit. Matrix rows 39-42. |
| PM8 | **The four riskiest areas have zero verified coverage.** The iOS/macOS manual gate (`desktop/outputs/ios-macos-sync-manual-gate-20260729`) is 8/108 verified: pairing 0/9, discovery 0/9, membership 0/7, persistence 0/5. It also has no Android axis at all, and defers the five-device cap as needing real multi-device hardware. | superseded by `docs/PERSONAL_MESH_TEST_MATRIX.csv` (42 rows, macOS/iOS/Android columns). |

| PM9 | ~~No receive-side consent.~~ **Out of scope by product decision (2026-07-30).** Same-owner devices auto-accept, which is what AirDrop does between devices on one Apple ID; Personal Mesh is same-owner-only by definition, so a prompt would be friction with no threat model behind it. The `admitIncoming` gate exists in shared but stays unwired, so behaviour is accept-everything. Do not re-open as a gap; if a shared/family mesh ever ships, that is when the gate gets a policy behind it. |

| PM10 | **Android has no screenshot watcher, so automatic screenshot sharing cannot work.** `ScreenshotSyncSource` calls `nativeScreenshotBoundary.observe()` and swallows the failure with the comment "Android and older iOS builds do not expose this native watcher". iOS ships `ios/SyncScreenshotModule.swift`; there is no Kotlin counterpart (`android/.../ai/offgridmobile/` has clipboard, devicememory, directory, download, litert, localdream, pdf, sync - no screenshot). The UI therefore reports "automatic sharing is not available" on Android. This is the platform-parity rule violated exactly as rules.md describes it: a capability that exists on one platform and silently no-ops on the other. | real gap, user-reported 2026-07-30. Android CAN do this: a `ContentObserver` on `MediaStore.Images` filtered to the Screenshots bucket. Until then the gap must be declared capability DATA, not a swallowed throw. |
| PM11 | **"For your safety, share another folder" when sharing Downloads on Android is the OS refusing, not our bug.** `SyncDirectorySourceModule.kt` uses the Storage Access Framework (`DocumentsContract` tree URIs), and Android 11+ refuses to grant SAF access to the `Download` directory (and `Android/data`, `Android/obb`) - that sentence is stock Android picker copy. So the app offers Downloads as a share target and the OS then declines it, which reads to the user as our failure. | real gap, user-reported 2026-07-30. Fix is not a permission: on Android, enumerate downloads through `MediaStore.Downloads` (API 29+), which needs no SAF grant, and stop routing that category through the folder picker. Do NOT retry SAF against Download - it cannot be granted. |

**Verified as already correct (no code needed):**

- **Android discovery and advertise.** `react-native-zeroconf` acquires a `MulticastLock` in both its NSD and rx2dnssd backends, `CHANGE_WIFI_MULTICAST_STATE` is declared, and Android supports `registerService`, so it advertises rather than only browsing. Android reports `['lan']` while the iOS-only proximity route surfaces as route data - the capability-as-data pattern, not a `Platform.OS` branch.
- **Clipboard provenance.** Records carry immutable `provenance` plus a derived `isLocal`, so an Off Grid receipt is attributed to the sending device and an Apple Universal Clipboard pickup is recorded as a local pasteboard observation - never as an Off Grid transfer. Android has no Universal Clipboard, so that false-attribution risk does not exist there.

### RESOLVED: Forget did nothing on a licensed device this phone never paired with

Fixed. An eviction's local side may now be empty: `prepareCapacityReplacement` no longer refuses when
there is no active pairing, and `finalizeMembershipEviction` owns the rule that an empty local side is a
no-op (both the immediate and the restart-recovery path go through it). The failure is also no longer
swallowed - `KnownDevicesSection` reports it on the same error surface disconnect and reconnect use.
Covered by `licensedDevices.integration.test.tsx`, which asserts the seat comes back at the PROVIDER.

Original report follows.

**Symptom.** Sync lists a device that holds a seat on your licence but that this phone has never paired
with - a phone you replaced, say. Its row offers Forget, the button is enabled, tapping it opens the usual
confirmation sheet, and confirming "Evict device" does **nothing at all**: no error, no change, the seat
stays occupied. At the device cap this leaves you unable to pair a new device with no explanation.

**Mechanism.** `syncService.forgetDevice` -> `evictDevice` -> `PersonalMeshDeviceEvictionCoordinator.evict`
-> `membership.prepareEviction` -> `pairingSecretStore.prepareCapacityReplacement`, which requires an
active LOCAL pairing:

    const active = activePairing(installation.syncDeviceId);
    if (!active?.membershipId) throw new PersonalMeshEntitlementError('mapping_required');

There is no local pairing for such a device, so it throws `mapping_required` ("The oldest licensed
installation cannot be matched to a Sync device.") BEFORE `registry.deregisterInstallation` is reached.
The seat is therefore never released. `SyncScreen/index.tsx` then calls
`syncService.forgetDevice(deviceId).catch(() => undefined)`, so the failure never surfaces.

Note the coordinator already has a path for exactly this shape - `revokeUnregistered`, used when the
registry has no installation for the device - but it does not cover the mirror case: the registry HAS the
installation and the local device has no pairing.

**Two separable defects, worth deciding on separately:**
1. The eviction cannot release a seat without a local pairing, when releasing the seat is the entire point.
2. The failure is swallowed, so a broken action is indistinguishable from a working one. Even once (1) is
   fixed, an eviction that fails for a real reason (offline, provider error) will still look like nothing
   happened. This is the "dead button" class in the backlog: capability and handler should travel together
   so a button that cannot act is not offered as if it can.

Check whether desktop has the same hole: its own `prepareEviction` may impose the same requirement, and
the ghost-row report there ("repair asks for a pairing code") is the same underlying situation.

### WITHDRAWN (not a bug): "after a failed credential save, a device appears to pair and never does"

Reported here earlier today and WRONG. The pairing did land; entitlement reconciliation then retired it,
deliberately, because the peer held no installation on the licence. `personal-mesh-entitlement.ts` retires
any device it finds locally trusted but absent from the authoritative roster - that is the rule that stops
a device lingering in your mesh after it has been removed from your licence elsewhere.

The test was at fault: its stand-in desktop never registered, which no real licensed Mac does. Registering
it makes the whole journey pass, including the clean retry after a storage failure. The trust surviving
reconciliation is now asserted, which is the part that matters - a pairing whose trust is withdrawn a
moment later still reports success on its way past.

Worth keeping in mind when reading a device log: "paired, then gone" is the signature of a device missing
from the licence roster, not of a broken handshake.


### Open bug: evicting an OFFLINE device may not leave the eviction outstanding

Found by `__tests__/pro/sync/syncPersistence.integration.test.ts` ("keeps an offline eviction pending
across restart and completes it on rediscovery"). Two of that suite's three journeys pass; this one does
not. Held open. Not fixed.

**What should happen.** Evicting a device that is not reachable releases the licence seat immediately and
leaves a PENDING revocation, because the other device still holds trust that has to be withdrawn when it
next appears. That pending record is what survives a restart and completes on rediscovery.

**What happens.** No pending revocation is persisted, so there is nothing to restore after the restart.

**Where to look.** `PersonalMeshDeviceEvictionCoordinator.evict()` announces the registry change BEFORE it
finalises the transaction:

    await this.options.onRegistryChanged?.(installation)
    await this.options.membership.finalizeEviction(token)

On mobile that announcement runs reconciliation, and reconciliation calls `resumeCommittedEvictions()`,
which finalises every committed transaction - including the one the caller is holding. So the local trust
is retired by the recovery path rather than by the caller, and which of them stages the peer's revocation
depends on which got there first.

That ordering also made eviction report `replacement_failed` after succeeding, because the caller then
finalised a transaction that no longer existed. That half is fixed: finalising an already-finalised
transaction is a no-op rather than an error (finishing twice is not a failure; finishing something never
committed still is).

**And it is not an occasional race - it is the normal flow.** Coverage over the sync suites shows the
caller's finalize reaching only the already-finalised branch: the lines that actually retire the local
trust and complete the transaction
(`pairingEntitlementReplacementAdapter.ts` 66-75) are never executed at all, while the no-op branch
above them always is. Every eviction is therefore completed by the recovery path, and the code that
reads as the main path is dead in practice.

So the answer to "should the announcement happen before the transaction closes" is no. Until it moves,
the adapter's finalize is a formality and `resumeCommittedEvictions` is the real implementation - which
is worth knowing before anyone edits either of them.

## Deleting the mockist ChatScreen suite leaves real ChatScreen journeys uncovered

`__tests__/rntl/screens/ChatScreen.test.tsx` was deleted: 155 tests that rendered ChatScreen with FOURTEEN
of our own modules stood in for. Coverage it reported was not coverage of our behaviour - the stubs answered
most of the questions the assertions asked - so the number was inflated rather than earned. Measured before
deleting, over `src/screens/ChatScreen/**`:

|                | mockist suite (155 tests) | rendered suites (227 tests) |
|----------------|---------------------------|-----------------------------|
| statements     | 70.72%                    | 62.93%                      |
| branches       | 63.45%                    | 57.47%                      |
| functions      | 69.17%                    | 58.56%                      |
| lines          | 73.88%                    | 64.74%                      |

The 8-point statement drop is the honest number, and it is concentrated. These are the journeys that now
have NO real coverage, and each wants a rendered test through `harness/chatHarness` (real screen, native
faked) rather than a re-mocked one:

- `ChatModalSection.tsx` (70% -> 30%) - the modals reachable from a chat: which one opens from which
  affordance, and that dismissing returns the user to the conversation rather than a blank screen.
- `useChatMessageHandlers.ts` (80% -> 53%) - per-message actions: edit, retry, copy, delete, speak. A dead
  action here is invisible until a user long-presses a message and nothing happens.
- `useChatModelActions.ts` (66% -> 42%) - switching model mid-conversation, and what happens to a reply in
  flight when the user does.
- `ChatScreenComponents.tsx` (89% -> 58%), `modelReadiness.ts` (56% -> 48%), `index.tsx` (63% -> 54%).

Policy this follows: a mockist suite is deleted, not repaired, and the coverage it was claiming is logged
here as a gap instead of being carried as a green number. Lower and true beats higher and fake.

## Image-generation journeys left uncovered by deleting imageGenerationFlow.test.ts

`__tests__/integration/generation/imageGenerationFlow.test.ts` was deleted: 60 tests that stood in for
`localDreamGenerator` (the image generator itself), `activeModelService`, `llm` and `litert`. Six of its case
names end in a line number - "should call stopGeneration after successful enhancement (line 247)",
"(lines 253-255)", "(lines 290-292)" - which is what a test written to move a coverage number looks like
rather than one written to protect a user.

Already covered properly by rendered suites, so not re-created: draw-prompt routing (`imageIntentRouting`),
force/off image mode (`imageModeToggle`), the OOM card and Load Anyway (`imageOomCard`, `imageMemoryCard`),
lightbox + save-to-gallery (`imageLightbox`), voice-mode image journeys, and the enhancement rules
(`enhancementNoThinking`, `enhancementReasoningPrompt`, `enhancementStreamingProgress`).

Rewritten for real in `imageGenerationInFlight.rendered.guard.test.tsx`: STOP reaching the native generator,
progress moving on the card, and a second send not starting a second diffusion.

STILL UNCOVERED, each a real user-visible journey wanting a rendered test:

- **image backend metadata on the finished message.** The per-message details should name the backend that
  actually rendered it (QNN / MNN / Core ML). Wrong or missing backend attribution is how a user concludes
  the NPU is being used when it is not. (`gpuBackendMeta` covers the TEXT side only.)
- **enhancement conversation context rules.** The enhancement request carries recent chat context, capped at
  the last 10 messages, with system messages skipped and long messages truncated. Uncapped context is a
  silent context-window overflow on a small model; including system prompts leaks instructions into the
  rewritten image prompt.
- **image model auto-load on demand**, and reload when the thread count changed. A user who generates,
  changes threads in settings, then generates again must not silently keep the old context.
- **generating with no conversation open** saves to the gallery without trying to add a chat message.

Policy: the mockist file is gone rather than repaired, and what it was claiming is written down here instead
of carried as a green number.

## Two real-sqlite adapters for one boundary (harness DRY)

`__tests__/harness/sqliteFake.ts` exposes `installRealSqlite` / `doMockRealSqlite`, backing the op-sqlite
boundary with a real `node:sqlite` in-memory database. `__tests__/hardening/batch9-kb-roundtrip.test.ts`
hand-rolls the SAME adapter inline (`makeInMemoryDb`, its own `toParam` blob conversion, its own
transaction/DDL special-casing). Both are real sqlite and both are correct today, which is the problem: the
next schema change (or the next blob column) has to be understood twice, and a divergence between them would
show up as a knowledge-base test failing for reasons that have nothing to do with the knowledge base -
exactly the failure mode batch9's own header describes from its previous hand-rolled matcher.

Fix: batch9 requires `doMockRealSqlite` from the harness and deletes its private engine. Low risk (both
already pass over real sqlite), and it makes the harness the single definition of that boundary.

## Ejecting a model mid-reply unloads the engine WITHOUT stopping the generation

**Verdict: fix-the-guard (live bug, observed in a rendered test).**

In chat, the model chip opens `ModelsManagerSheet`, whose per-row eject (`models-row-text-eject`) calls
`ejectResident` -> `modelResidencyManager.evictByKey`. That path never touches the generation owner.

Observed with a LiteRT reply still streaming (rendered ChatScreen, native LiteRT faked, real everything else):

| native call | times called |
|---|---|
| `unloadModel` | 1 |
| `stopGeneration` | **0** |

So the engine is torn down while a generation is still running against it. On a device that is a native
generation pointed at a released context - a crash or a hang rather than a clean stop - and at best tokens
arriving for a model that no longer exists.

This is the same abstraction failure as the three `llmService.stopGeneration()` bypasses (fixed: two now go
through `generationService.stopGeneration()`, the mid-turn compaction retry through `stopAllTextEngines()`),
but in a fourth place and one layer lower. The residency manager evicts on its own authority - which is right
for an idle sidecar and wrong for the model that is mid-reply.

Likely fix: `evictByKey` (or its callers) must stop generation on the owner first when the key being evicted
is the model currently generating - not eject-then-hope. Wants a device check too: eject mid-reply on a LiteRT
model and watch for a native crash.

Related, and why the fix above is not enough on its own: `handleUnloadModelFn` - the `ModelSelectorModal`
"Unload" button - is no longer reachable from chat's model chip at all. Either that modal is dead surface
from ChatScreen (it is still mounted, and still reachable from ChatsListScreen) or the sheet should route
through it. Worth deciding which, because right now two unload affordances exist with different behaviour.

## Revoking ambient sharing does not cancel a transfer already streaming

**Verdict: fix-the-guard (needs a cancellation seam that does not exist).**

Turning ambient sharing off now revokes the grant atomically with the policy write (mobile-pro f36bf909) and
reconnect no longer resurrects it (ebdc8cd8). What is still true: a transfer whose bytes are already moving
runs to completion, so that one file arrives after consent was withdrawn.

There is no handle to cancel it with. `fileTransferService.cancel(deviceId, requestId)` exists, but the ambient
delivery lifecycle exposes only `completed()` and `failed(error)` to the scheduler, and the send happens under
an `activityId` (`sharedFileActivityId(deviceId, syncId)`) with no mapping back to the transfer's requestId.

The fix is a dependency-surface change, not a patch: add `cancelDelivery(deviceId, syncId)` to
`AmbientShareDependencies`, have `sharedFileSyncService` implement it by resolving the syncId to its in-flight
requestId and calling `fileTransferService.cancel`, and call it from the revocation path. Three call sites
supply those dependencies today (`sharedFileSyncService` plus two test harnesses), so the change is contained -
it was deferred because it widens the sync core's contract and deserves review rather than an end-of-branch
edit.

Bounded until then: the exposure is one already-streaming file, not every reconnection from then on. Raised by
Greptile on mobile-pro#47, where the thread is deliberately left open so the seam stays tracked.
