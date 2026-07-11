# Off Grid Mobile — Manual Release Test Checklist

A human-walkable, release-gate checklist. Go through this before every release. Independent of any automated
test claims. Aggregated from **both** adversarial/device sessions:
- Prior 6-agent adversarial sweep (`DEVICE_TEST_LOG.md`): Q1–Q20, M1–M11, D1–D4, V1–V5, log-B1–B9.
- Today's on-device wire-capture run (`DEVICE_TEST_FINDINGS.md`): DEV-B1–B33 + validated successes.

**Legend**
- **Type:** 🔴 = adversarial (a known/suspected bug — must be FIXED & verified before release) · ✅ = happy
  (must keep WORKING — regression check).
- **Sev:** P0 (blocker/crash/data-privacy) · P1 (major broken flow) · P2 (UX/cosmetic).
- **Device status:** what today's device run actually observed (BROKEN / WORKS / NOT-RUN / GUARDED).
- **Result:** you fill in ✅/❌ + notes each release.

How to use each row: do the **Steps** (real gestures), check the **Expected**, mark **Result**. If ❌, it
regressed / still broken.

Paste any table into Sheets/Excel (they're pipe-delimited).

---

## Area 1 — Model download & management

Columns: **Auto** = automated test (✅ file · ❌ none · ~ partial). **Steps** = gestures to imitate (same for a
manual tester and the automated test). **UI validation** = what to assert on the live rendered screen.

| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T001 | 🔴 P1 | ❌ | Mount Home → tap `browse-models-button` → tap download on a **vision** model (has mmproj); download fake emits `getActiveDownloads` with model + mmproj as 2 rows → tap download-manager icon → DownloadManagerScreen | top-bar badge number **==** count of download rows rendered in the list (RED: differ by 1 while mmproj in-flight). Falsify: non-vision model → equal | DEV-B7 · BROKEN | |
| T002 | 🔴 P2 | ❌ | Mount Home (foreground) → drive download fake to emit `DownloadComplete` for a **text** model; repeat for an **image** model | completion sheet/toast renders **identically** for both types in the same foreground state (RED: image shows sheet, text doesn't). *Needs product decision on intended behavior* | DEV-B4 · INCONSISTENT | |
| T003 | 🔴 P1 | ❌ | Start image-model download → fake emits native `DownloadComplete` but zip NOT extracted (no `_ready`, integrity files absent on memfs) → select model + image-mode send | model status ≠ "ready/usable" until extracted; on generate a visible "preparing/extracting" state (RED: "downloaded successfully" fires at native-complete, extract deferred) | DEV-B4 · PREMATURE | |
| T004 | 🔴 P1 | ✅ `imageExtractLostRelaunch` | Seed image download that completes-then-extraction-fails (missing `unet.bin`) → `simulateRelaunch()` (fresh stores, drop native rows, keep disk) → mount DownloadManagerScreen | a retriable/removable **failed card** renders after relaunch (RED: none renders — store not persisted, dir/zip unlinked) | D1/log-B7 · BROKEN | |
| T005 | 🔴 P1 | ✅ `whisperDeleteCancelsOther` | Start `base.en` whisper download (fake, in-flight) → mount DownloadManagerScreen → tap delete on downloaded `small.en` → confirm alert | `base.en`'s in-progress card **still present** after deleting small.en (RED: it vanishes — deleteModel cancels the single activeDownloadId) | V1 · BROKEN | |
| T006 | 🔴 P1 | ✅ `whisperTruncatedListed` | Seed a truncated `ggml-<id>.bin` on disk (below size floor) → mount DownloadManagerScreen / model list | truncated file NOT listed as a completed/loadable model (RED: shown as downloaded — name-only filter, no size floor) | V2 · BROKEN | |
| T007 | 🔴 P1 | ✅ `sttInterruptedRelaunch` | Seed STT download killed mid-flight → `simulateRelaunch()` → mount DownloadManagerScreen | a retriable/removable entry renders (RED: empty — store not persisted, no disk scan) | V3/D1 · BROKEN | |
| T008 | 🔴 P2 | ✅ `iosInterruptedNoFailedEntry` | iOS-shaped: download running → drop the native URLSession row (app-kill) → `simulateRelaunch()` → mount DownloadManagerScreen | a stranded/failed entry renders (RED: vanishes — reconcile reads empty native-rebuilt store) | D4 · NOT-RUN device | |
| T009 | ✅ P1 | ❌ | Mount → create project (form) → attach a text PDF to its KB (attach gesture); PDF fake returns real text; embed fake 384-dim | KB shows the doc indexed (chunk/embedding count); no error card | DEV · WORKS | |
| T010 | 🔴 P2 | ❌ | Attach a **scanned/image** PDF (pdf fake returns textLength:0) to a KB | a clear "no text layer / scanned PDF" message renders (RED: vague "could not extract text") | DEV · 0-text vague | |
| T011 | 🔴 P2 | ❌ | Attach a **>5MB** PDF to a KB (fake file size >5MB) | "Maximum file size is 5MB" renders, upload rejected (works — confirm still gated) | DEV · GATED | |
| T012 | ✅ P2 | ❌ | Seed N downloaded models (boundary) → mount ModelsScreen | the solid downloaded-count badge renders == N | DEV · WORKS | |

## Area 2 — Model load & compute backends

| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T013 | ✅ P1 | ✅ `firstMessage`/`modelLifecycle` | Model downloaded (boundary) → mount Home → tap `browse-models-button` → tap `model-item` (select) → tap `new-chat-button` → type + send | reply text renders in an assistant bubble (lazy-load on first send works) | DEV · WORKS | |
| T014 | ✅ P1 | ❌ | Mount → Model Settings → Text → Advanced → tap Backend → **GPU/OpenCL** → reload → send; llama-load fake reports OpenCL offload | reply renders; (invariant) load path shows GPU layers offloaded, not 0 | DEV · WORKS (24/36) | |
| T015 | 🔴 P1 | ❌ | Same, Backend = **NPU (Beta)/HTP** → reload → send; llama fake: HTP loads then emits gibberish tokens (real B22 shape) | assistant reply is a **correct answer**, not gibberish/empty (RED: NPU loads but generation is garbage) | DEV-B22 · BROKEN | |
| T016 | 🔴 P2 | ❌ | GPU backend, first load; llama-load fake models 8s init-timeout → retry → 24/36 | load succeeds without a silent 8s hang / partial-offload surprise (invariant on the load path; labeled) | DEV-B24 · timeout→24/36 | |
| T017 | ✅ P1 | ✅ `firstMessage` (litert) | litert model downloaded → select via Home picker → new chat → send | reply renders (litert GPU works) | DEV · WORKS | |
| T018 | 🔴 P1 | ❌ | Select litert model → Advanced → Backend = **CPU** → reload → send; litert fake throws `Status 13 Failed to invoke the compiled model` on CPU | an answer renders, OR the CPU option isn't offered for a GPU-compiled model (RED: "Failed to invoke the compiled model" error) | DEV-B23 · BROKEN | |
| T019 | 🔴 P2 | ❌ | litert + tools enabled + a tool prompt (long tool-augmented system prompt); litert fake clamps ctx to 880 | a tool-result bubble renders (RED: tool call dropped when the clamp truncates the tool prompt) | DEV-B25 · dropped once | |
| T020 | ✅ P1 | ❌ | Select a litert model in the picker (no send) | model shows loading/loaded on select (eager warm — acceptable) | DEV · WORKS | |
| T021 | 🔴 P2 | ❌ | Load a vision gguf (gemma-4-E2B + mmproj) via select+send | (invariant) estimate not mmproj-inflated → offloads to GPU, not forced 0/36 CPU (RED: est 5854MB → CPU fallback → slow) | DEV-B3 · CPU-fallback | |

## Area 3 — Memory / residency / budget

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T022 | 🔴 P0 | ❌ | Download an STT model (download fake `complete` event) → do NOT transcribe → load a chat model via picker+send | whisper NOT auto-resident; chat model loads without a phantom 1.5GB resident (invariant: assert `getResidents()` excludes whisper) (RED: whisper auto-loads on download) | DEV-B1 · BROKEN | |
| T023 | 🔴 P0 | ❌ | With whisper resident, mount Home → tap **Eject All** → confirm | after eject, `getResidents()` == [] incl. whisper (RED: ejectAll returns count=1, whisper survives) | DEV-B1 · BROKEN | |
| T024 | 🔴 P0 | ~ `failedUnloadOverCommits`/`overrideFloor` | Seed RAM so soft budget≥size but `os_procAvail`<size → drive a load via the real `makeRoomFor` gesture path | load refused (graceful card) OR doesn't over-commit (invariant: `fits` gates on physical, not soft budget) (RED: fits=true while size>procAvail) | DEV-B2/M2/M3 · BROKEN | |
| T025 | ✅ P1 | ✅ `residencySwap`/`resendAfterImageGen` | Generate an image (image resident) → go to chat → send text | (invariant) text load evicts image (`evicted` contains 'image'); text-model reply renders | M11/DEV · WORKS | |
| T026 | 🔴 P1 | ~ `smartBudgeting` | Load text model → start image-gen | text & image do NOT co-reside (`getResidents()` has one heavy) (verify — worked in one device flow) | M1/M16 · verify | |
| T027 | 🔴 P1 | ✅ `imageEstimatorDivergence` | Image model: the pre-load advisory (`checkMemoryForModel` 1.5/1.8×) vs the gate (`estimateImageModelRam` 2.5×) | both estimators agree (invariant) (RED: ~40% divergence → "safe to load" then a hard "not enough memory" card) | Q14 · BROKEN | |
| T028 | 🔴 P1 | ✅ `overrideFloor` | Load-Anyway a too-big dirty model at low real free RAM (RAM fake) | survival floor BLOCKS the guaranteed OOM (invariant: post-load free ≥ floor uses REAL free, not credited ceiling) | M3/M4 · verify | |
| T029 | 🔴 P2 | ❌ | iOS 12GB, 3.1GB free → Load-Anyway a 2GB dirty litert model (RAM fake, platform ios) | NOT over-refused (loads) (RED: flat 1200 floor over-refuses a safe load) | M5 · NOT-RUN device | |
| T030 | 🔴 P1 | ✅ `ttsDeleteResidencyStale` | Load TTS (registers key:'tts') → delete TTS in DM (gesture) → load a text/image model | no phantom TTS pressure (invariant: `release('tts')` fired on delete → resident set excludes tts) (RED: 320MB phantom → wrong refusal) | V4 · BROKEN | |
| T031 | 🔴 P0 | ❌ | Drive a very long/runaway context, keep sending | app caps/trims context (invariant/guard); doesn't grind to freeze (RED on device: 30–47s/token thermal-throttle → crash) | DEV-B31 · CRASHED | |

## Area 4 — Text generation (thinking / streaming / stop / queue)

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T032 | ✅ P1 | ✅ `firstMessage` | Thinking off, tools off → type + send a plain prompt (litert fake streams a clean answer) | reply text renders in the answer bubble; NO stray `<think></think>` block | DEV · WORKS | |
| T033 | 🔴 P1 | ❌ (`reasoning.happy` = happy only) | Thinking ON → send a reasoning prompt; llama fake streams `<think>…</think>` (Qwen) tokens | during streaming, reasoning tokens render in the THINKING block (answer bubble stays empty) from token 1 (RED: they render in the answer bubble until the close delimiter, then reclassify) | DEV-B14/B5 · BROKEN | |
| T034 | 🔴 P2 | ❌ | Send a prompt whose completion hits the max-predict cap (fake: `stopped_eos=false` at n_predict) | a "cut off / continue" indication renders (RED: silently truncated mid-sentence, no signal) | DEV-B15 · silent cutoff | |
| T035 | 🔴 P2 | ❌ | litert/remote turn (separate reasoning channel) — assert the thinking-box header WHILE reasoning streams | header reads "Thinking…" while streaming (RED: shows the DONE label + "T" badge; llama inline `<think>` is correct → divergence) | Q6 · BROKEN | |
| T036 | ✅ P1 | ✅ `resend` | Send msg 1 (fake holds it streaming) → type + send msg 2 before it finishes | both replies render in order; neither dropped/collided | DEV · WORKS | |
| T037 | ✅ P1 | ~ `resend` | Start a generation → tap the Stop button (input transforms to stop) mid-stream | generation halts; partial text retained; input returns to send state; next queued item proceeds | DEV · WORKS | |
| T038 | ✅ P2 | ✅ `tools` | Thinking + calculator on → send a reason+compute prompt (fake: reason→tool→reason→answer, real multi-round shape) | thinking block, tool-result bubble, and final answer all render in order | DEV · WORKS | |

## Area 5 — Tools (calculator / MCP / parallel)

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T039 | 🔴 P1 | ✅ `toolMessyJson` | Enable a tool (Tools screen switch) → send; fake emits a tool_call with **unquoted keys / trailing comma / single quotes** | a tool-result bubble renders with real data (RED: MCP strict JSON.parse drops it → "I couldn't find anything"). Falsify: quoted JSON → bubble renders | Q2 · BROKEN | |
| T040 | 🔴 P2 | ✅ `toolStringifiedArgs` | Tool on → send; fake emits `"arguments":"{...}"` (stringified) | tool runs with parsed params → result bubble (RED: raw string sent → error/empty bubble) | Q3 · BROKEN | |
| T041 | 🔴 P2 | ✅ `toolRouterFalsePositive` | Several tools; router prose contains a tool name as substring / says "none" | correct/no tool selected (RED: substring force-selects the wrong tool; "none" branch skipped) | Q4 · BROKEN | |
| T042 | 🔴 P1 | ✅ `toolEmptyFinal` | Tool on → send; fake: tool returns data, final turn EMPTY | the assistant bubble shows the tool data / non-empty reply (RED: blank reply; data discarded — note "(No response)" is never rendered through streaming) | Q5 · BROKEN | |
| T043 | ✅ P1 | ✅ `tools` | Enable calculator (real Tools-screen switch) → new chat → send "use the calculator: 500×321" | a tool-result bubble + correct answer (160500) render | DEV · WORKS | |
| T044 | ✅ P1 | ~ `tools` | Calculator on → send two calculations in one prompt (fake: parallel tool_calls index 0+1) | two tool-result bubbles render; both correct | DEV · WORKS | |
| T045 | ℹ️ P2 | n/a | 0.8B model + tools, no explicit "use tool" nudge | (KNOWN model limit) small models under-call tools — not an app bug; no test | DEV · model-limit | |

## Area 6 — Remote providers (OGAD / LM Studio / Ollama)

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T046 | ✅ P1 | ❌ | Mount remote-server config → scan (fake HTTP returns a server) or manual-add URL → tap connect | server appears + connects (connected state renders) | DEV · WORKS | |
| T047 | 🔴 P2 | ❌ | Scan with no server (fake HTTP: none) | "No servers found" AND the server list stays empty (RED: shows "none found" yet adds a server) | DEV-B8 · desync | |
| T048 | ✅ P1 | ❌ | Connect remote (OpenAI-compat fake replays real `[WIRE-REMOTE]` deltas) → send the 5 prompts | correct replies; thinking + parallel tool_calls render (accumulate by index) | DEV · WORKS | |
| T049 | 🔴 P1 | ❌ | LM Studio remote + reasoning model + thinking; fake emits `reasoning_content` deltas | thinking block renders (RED: no thinking toggle → thinkingEnabled=false → processDelta drops `reasoning_content` → reasoning=0). Tools DO work | DEV-B16 · BROKEN | |
| T050 | 🔴 P1 | ❌ | Mount chat settings with a remote model active | a thinking on/off toggle is present (RED: absent for remote) | DEV-B17 · MISSING | |
| T051 | ✅ P1 | ❌ | Ollama remote (native NDJSON fake, `message.thinking` field) + tools → send | thinking renders + tool-result bubbles render | DEV · WORKS | |
| T052 | 🔴 P1 | ✅ `remoteEnhanceSkipped` | Active text model = remote + image-gen + enhancement on → generate | enhancement runs via the remote model (RED: `generateStandalone` has only llama/litert branches → skipped on remote) | Q8 · BROKEN | |
| T053 | 🔴 P2 | ❌ | Open the model modality selector with a remote model selected | remote model is visually marked (cloud icon) (RED: identical to local, no indicator) | DEV · no indicator | |

## Area 7 — Vision (multimodal)

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T054 | ✅ P1 | ✅ `multimodalVision` | Vision model active → tap attach → Photo Library → faked picker → type "what's in this image?" → send | a coherent description of the (faked) image renders | DEV · WORKS | |
| T055 | 🔴 P1 | ❌ | Attach image to a bigger vision model → send; llama fake models the `invalid token / failed to decode` (SmolVLM/Qwen2B shape) | a description renders (RED: "Failed to evaluate chunks" error). Falsify: Qwen0.8B-shape → works | DEV-B9 · BROKEN | |
| T056 | 🔴 P1 | ❌ | Drive a generation that errors (e.g. the B9 vision decode fail) | the loading spinner CLEARS + an error bubble renders (RED: session ends reason=error but UI spins forever) | DEV-B13 · BROKEN | |
| T057 | 🔴 P2 | ❌ | Attach an image → tap the thumbnail in the input box (pre-send) | a preview opens (RED: tapping does nothing) | DEV · no preview | |
| T058 | 🔴 P2 | ❌ | Load gemma-4-E2B litert (reports supportsVision:true) then its gguf variant → check the attach/vision affordance | vision affordance consistent across engines (RED: litert hides vision, gguf shows it) | DEV-B20 · inconsistent | |
| T059 | 🔴 P1 | ✅ `voiceNoteToolAudio` | LiteRT model + a tool enabled → record a voice note → send | the TRANSCRIPT reaches the model, raw audio is NOT sent (RED: litert tool-loop re-derives audioUris → "File does not exist") | Q17 · BROKEN | |
| T060 | 🔴 P1 | ~ `voiceNoteToolAudio` | Attach an image on a non-vision LiteRT model + a tool → send | graceful "does not support images" (RED: no vision gate → raw native crash) | Q17b · BROKEN | |

## Area 8 — Image generation & settings

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T061 | ✅ P1 | ✅ `imageBackends`/`imageModeToggle` | Image model placed (boundary) → cycle image-mode to ON (`quick-image-mode`) → tap send "a fox in snow" | a generated image renders; details show the correct backend label (MNN GPU / Core ML) | DEV · WORKS | |
| T062 | 🔴 P1 | ❌ | Send "draw a dog" (routes to IMAGE ✓) → open action menu (long-press/3-dots) → tap **Regenerate/Resend** | resend STILL routes to IMAGE (re-runs ROUTE-SM classify) (RED: resend jumps to LLM text path, no classify → text answer). Falsify: fresh "draw a dog" → image | DEV-B33 · BROKEN | |
| T063 | ✅ P2 | ✅ `imageGenMeta` (guard) | Mount image settings → drag the image-size control to minimum | the size input floors at 256 (can't select 128) — green guard | Q1/DEV · GUARDED | |
| T064 | 🔴 P2 | ✅ `imageGenMeta`/`imageSettings` | Set image size (via Model Settings path) → generate | generated size == the size set (no silent floor at gen). Currently guarded at input (256 min) so the red is the chat-modal clamp divergence (Q13) | Q1/Q13 · guarded | |
| T065 | 🔴 P2 | ✅ `imageGenMeta` | Force `imageGuidanceScale` 0/stale → generate | meta shows cfg **7.5** (RED: drifts to 2.0 — three fallback literals) | Q7 · BROKEN | |
| T066 | 🔴 P2 | ✅ `imageSettings` | Change image params → open Chat Settings sheet → tap "Reset to Defaults" | image steps/size/guidance/threads ALSO reset (RED: only the 7 text params reset) | Q12 · BROKEN | |
| T067 | 🔴 P2 | ✅ `imageSettings` | Compare the Image-Size/Steps sliders in the chat modal vs Model Settings | same mins/fallbacks (RED: 256 vs 128 divergence — the root of Q1) | Q13 · BROKEN | |
| T068 | ✅ P1 | ✅ `imageLightbox` | Generate an image → tap the rendered `generated-image` | fullscreen viewer opens with Save/Close; Close dismisses; Save → "Image Saved" + file on disk | DEV · WORKS | |
| T069 | ✅ P1 | ✅ `imageIntentRouting` | With an image model active, send "what is the capital of France" (non-draw) | routes to TEXT (answer renders), image generator NOT called | DEV · WORKS | |
| T070 | ✅ P2 | ❌ | First image gen on a model | the "~120s one-time" warmup notice matches actual time (or is accurate) (device: said 120s, was ~10s — cosmetic) | DEV-B21 · misleading | |

## Area 9 — Prompt enhancement

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T071 | 🔴 P1 | ❌ (`promptEnhancement` = service-level, not B30) | Enable "Enhance Image Prompts" + thinking ON → send "draw a cat" | the enhancement request carries **no thinking** (`enable_thinking !== true`) and the enhanced prompt has NO reasoning markers (RED: "Thinking Process:…" becomes the image prompt) | DEV-B30 · BROKEN | |
| T072 | 🔴 P1 | ❌ | Same — measure the enhancement generation length | enhancement is a fast plain completion, not a multi-thousand-token reasoning chain (RED: slow "million characters") | DEV-B30 · SLOW | |
| T073 | 🔴 P2 | ❌ | During the enhancement step | it streams / shows progress (RED: static "Enhancing…", looks frozen) | DEV-B30b · no stream | |
| T074 | ~ P2 | ~ `promptEnhancement` (service-level) | Enhancement on, thinking OFF → generate | prompt rewritten → image regenerated from it (mechanics work; existing test is service-level, not UI-gesture) | DEV · works | |

## Area 10 — STT / voice input

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| ID | 🔴/✅ Sev | Auto | Steps (gestures to imitate) | UI validation (assert on live screen) | Ref · Device | Result |
|---|---|---|---|---|---|---|
| T075 | 🔴 P0 | ❌ | **Chat mode** → tap the mic (VoiceButton) → speak → release; whisper realtime fake | a transcript lands in the input / a message is sent (RED: `hasData:false` → nothing on screen). Falsify: the working file-transcribe path yields text | DEV-B26 · BROKEN | |
| T076 | 🔴 P1 | ✅ `voiceNoteChatModeEmptyTurn` | **Chat mode**, direct-audio model → record a voice note → send | the TRANSCRIPT reaches the model, never raw audio (RED: `onAudioAttachment` sends audio, content='') | Q20/DEV-B10 · BROKEN | |
| T077 | 🔴 P1 | ❌ | Start recording (mic) → wait / navigate away | recording auto-stops; whisper doesn't stay resident (RED: 7+ min capture, whisper resident 1.5GB) | DEV-B11 · BROKEN | |
| T078 | 🔴 P2 | ❌ | Double-tap the mic quickly (start-while-recording) | no `State:-100` race / collision; clean single recording (RED: "Already recording, stopping first" → race error) | DEV-B12 · BROKEN | |
| T079 | ✅ P1 | ✅ `transcription` | **Voice mode** → record a note (fake `transcribeFile` returns real `{segments:[{text}]}`) | the correct transcript renders (real whisper segment shape) | DEV · WORKS | |
| T080 | 🔴 P0 | ❌ | ARCHITECTURE seam: both chat-mode and voice-mode STT | both routes go through ONE transcribe pipeline (record→file→transcribe) (RED: 3 divergent mechanisms — the root of B26/Q20) | DEV-B28 · BROKEN | |

## Area 11 — TTS

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| T081 | ✅ P1 | Voice mode → get a reply | Kokoro speaks the answer aloud (24kHz) | DEV | WORKS | |
| T082 | 🔴 P1 | **Chat mode** → tap the speaker on an assistant bubble | Reads clean text (no `**`, `##`, backticks, table pipes) | Q19 | BROKEN (raw markdown) | |
| T083 | 🔴 P2 | Delete a TTS model mid-playback | Graceful (canEvict veto), no broken playback | V5-gap | verify | |

## Area 12 — Voice-mode journeys (end-to-end)

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| T084 | ✅ P1 | Voice mode → "draw a dog" | STT → routes to IMAGE → image renders → TTS confirms | DEV | WORKS | |
| T085 | ✅ P1 | Voice mode → "calculate 500 × 321" (nudge tool) | STT → routes to TEXT → calculator → correct answer → TTS | DEV | WORKS | |
| T086 | 🔴 P2 | Voice mode with a thinking reply | Thinking block == voice-note bubble width, LEFT-aligned (not full-width) | DEV-B27 | BROKEN (full-width) | |
| T087 | 🔴 P2 | Voice mode after a tool turn | No stray empty "#" bubble renders | DEV-B32 | BROKEN (stray # bubble) | |
| T088 | 🔴 P1 | Voice mode, generation in flight | Mic button becomes a STOP button (can't accidentally start a new recording) | DEV-B29 | BROKEN in some states | |

## Area 13 — Projects & RAG

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| T089 | ✅ P1 | Create a project (form) → add a text PDF to KB → chat a doc question (≥2B model) | Calls search_knowledge_base → retrieves real chunks → answer grounded in the doc | DEV | WORKS (validated) | |
| T090 | 🔴 P1 | Create a project + chats → delete the project | Chats not orphaned with a dangling projectId (re-filable/cleared) | Q9 | BROKEN | |
| T091 | 🔴 P1 | Orphaned chat (project deleted) → send | Does NOT inject search_knowledge_base for the gone project | Q9b | BROKEN | |
| T092 | 🔴 P1 | New chat → pick a project (before 1st message) → send | Chat is filed under the project | Q10 | BROKEN (pendingProjectId lost) | |
| T093 | 🔴 P2 | Project chat → context-full → tap "New chat" in the alert | New chat inherits the project | Q11 | BROKEN (unassigned) | |
| T094 | ℹ️ P2 | RAG with a 0.8B model | (KNOWN) needs ≥2B model to reliably call the KB tool | DEV | model-limit | |

## Area 14 — UI / rendering / misc

| ID | Type/Sev | Steps (gestures) | Expected | Ref | Device | Result |
|---|---|---|---|---|---|---|
| T095 | ✅ P2 | Complete onboarding with a server+model configured | Skips onboarding into the app | DEV | WORKS | |
| T096 | ✅ P2 | Support-share sheet (GH/X) → return from X | Sheet dismisses, doesn't re-nag | DEV | WORKS | |
| T097 | ✅ P2 | Home "Text" count with a remote model active | Count reflects reality (or "0 local" is clearly not a desync) | DEV | verify (showed 0) | |
| T098 | 🔴 P2 | Load a local model, then send a NEW message (not resend) | The local model is the ACTIVE model (not still remote) | DEV-B18 | verify (resend went isRemote) | |

## Platform parity (iOS — run the native-divergent ones)
Re-run on iOS (native differs): T003/T004/T008 (downloads/URLSession-kill), T015–T021 (backends — note litert is
Android-only; iOS has Metal), T024/T028/T029 (memory/jetsam), T054–T056 (vision Core ML), T061/T068 (image Core
ML + lightbox), T075–T080 (STT), T081 (TTS). Shared-JS areas (remote framing, thinking parse, routing) are
covered by Android — don't re-run the full matrix on iOS.

---

### Summary counts (fill Result each release)
- Adversarial 🔴 to verify-fixed: ~55 · Happy ✅ regression: ~25 · Known model-limits ℹ️: 3.
- P0 blockers to watch: T022/T023 (whisper leak+eject), T024/T031 (memory/thermal), T075/T080 (STT capture+arch).
