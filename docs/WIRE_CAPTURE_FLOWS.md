# From-device ground-truth capture — fresh-start flow script

Goal: exercise EVERY native seam the test fakes invent a shape for, so fixtures are real, not guessed.
All capture lines are teed into an append-only, never-rotated file: `Documents/offgrid-wire.log`.

Run **from a fresh install** (delete the app first). Do Android fully, tell me "Android done", then iOS.
Pull after each phase (safe even though the file is lossless):

```sh
adb exec-out run-as ai.offgridmobile cat files/offgrid-wire.log > /tmp/wire-android.log   # Android
# iOS:
xcrun devicectl device copy from --device <IOS_UDID> --domain-type appDataContainer \
  --domain-identifier ai.offgridmobile --source Documents/offgrid-wire.log --destination /tmp/wire-ios.log
```

Label each paste: **platform · model/provider · which phase**.

---

## Phase 0 — fresh install
1. Delete app → reinstall → complete onboarding.
   - *Why:* empty-state hydration; confirms no stale rows. (No WIRE yet.)

## Phase 1 — downloads (queue / parallel / unzip)  → `[WIRE-DOWNLOAD]`, `[WIRE-UNZIP]`
2. Queue these back-to-back so they run **parallel + queued** (that's the point — capture the active/queued rows):
   gguf (Qwen3.5), litert (Gemma-4 litert), an **image** model (zip), whisper **STT**, a **TTS** voice, a **vision** gguf (+mmproj), an **embedding** model.
   - *Why:* `[WIRE-DOWNLOAD]` = real progress/complete/error event shapes + `getActiveDownloads` rows (parallel/queued) that drive the download + relaunch fixtures (D1/D4/V1/V2/V3).
3. Let the **image** model finish → it extracts.
   - *Why:* `[WIRE-UNZIP]` = the real extracted dir listing (file names + sizes) → grounds the integrity/truncation gate (V2) and the image-model-incomplete path.
4. Optional: kill the app mid-download of one, relaunch.
   - *Why:* iOS URLSession-dies-on-kill vs Android WorkManager-survives — the platform-parity capability the fake models.

## Phase 2 — on-device text, per engine  → `[WIRE-CAPS]`, `[WIRE-LITERT-LOAD]`, `[WIRE-RAM]`, `[WIRE-LLAMA*]`, `[WIRE-LITERT*]`
For **each** text model (Gemma-4 gguf, Qwen3.5 gguf, Mistral gguf, Llama gguf, Gemma-4 litert):
5. Select/load it. → `[WIRE-CAPS]` (gguf chat-template tool caps), `[WIRE-LITERT-LOAD]` (litert backend/maxTokens), `[WIRE-RAM]` (real memory numbers).
6. Send **plain**: `What is the capital of France?`
7. Send **thinking** (reasoning ON): `A train covers 60 km in 45 minutes. What is its speed in km/h? Reason step by step.`
8. Send **tool** (a tool enabled): `What is 47 times 89?` → let it run + answer.
9. Send **thinking + tool**: `Reason about it, then compute 128 * 256 with the calculator.`
10. Send **two tools**: `What is 12*12 and also 30% of 400?`
    - *Why:* `[WIRE-LLAMA]`/`[WIRE-LITERT]` = the real token stream shape (inline `<think>` vs `reasoning_content` channel); `[WIRE-LLAMA-TOOL]`/`[WIRE-LITERT-TOOL]` = the real tool-call framing (structured vs inline `<tool_call>`/`[TOOL_CALLS]`/`<|python_tag|>`) — the Q2/Q3 fault line. This is the single highest-value capture.

## Phase 3 — remote providers  → `[WIRE-REMOTE]`, `[WIRE-OLLAMA]`
11. Configure **LM Studio**, **Ollama**, **OGA Desktop** (one at a time). For each, prompts 6–10.
    - *Why:* `[WIRE-REMOTE]` (OpenAI-compat delta) + `[WIRE-OLLAMA]` (native /api/chat NDJSON) = how remote streams thinking + tool_calls (delta-partial vs final) — a different parser path than on-device.

## Phase 4 — image gen + settings→native  → `[WIRE-IMAGE-CONSTANTS]`, `[WIRE-IMAGE-PARAMS]`, `[WIRE-IMAGE]`, `[WIRE-IMAGE-PROGRESS]`
12. First image gen (defaults). → `[WIRE-IMAGE-CONSTANTS]` (real DEFAULT_STEPS/GUIDANCE/SUPPORTED sizes), `[WIRE-IMAGE-PARAMS]`, `[WIRE-IMAGE]`, `[WIRE-IMAGE-PROGRESS]`.
13. In settings, change **Image Size** (try 128 and 256), **Steps**, **Guidance** → generate after each.
    - *Why:* `[WIRE-IMAGE-PARAMS]` = requested-vs-native values → grounds the size-floor / guidance-clamp bugs (Q1/Q7/Q13). `[WIRE-IMAGE-PROGRESS]` = preview/progress event shape (differs Core ML vs LocalDream — parity).

## Phase 5 — vision / multimodal  → `[WIRE-VISION]`, `[WIRE-LLAMA]`
14. Load the vision gguf, attach a photo, ask `What's in this image?`.
    - *Why:* `[WIRE-VISION]` = real `initMultimodal` support flags; `[WIRE-LLAMA]` = the vision response shape.

## Phase 6 — STT  → `[WIRE-STT]`
15. Record a voice note → let it transcribe. Also record a **silent/short** clip.
    - *Why:* `[WIRE-STT]` = real whisper result shape (segments/timestamps/text) + the no-speech marker (`[BLANK_AUDIO]`) that drives the empty-transcript handling.

## Phase 7 — TTS  → `[WIRE-TTS]`
16. Tap **Speak** on an assistant reply (note the engine: OuteTTS / Kokoro / Qwen3).
    - *Why:* `[WIRE-TTS]` = audio-token count + decoded PCM length/sampleRate/duration. (OuteTTS instrumented; if you use Kokoro/Qwen3 tell me and I'll add those two synth points.)

## Phase 8 — embeddings / RAG  → `[WIRE-EMBED]`
17. Create a project, add a document to its knowledge base, start a chat in it, ask something answerable from the doc.
    - *Why:* `[WIRE-EMBED]` = the embedding model's real dimensionality → grounds the KB index/search + stale-dim fixtures (toolEmbeddingStaleDim).

## Phase 9 — settings that change native behavior  → `[WIRE-LLAMA-PARAMS]`
18. Change **Temperature**, toggle **Thinking**, change **max tokens** → send a prompt after each.
    - *Why:* `[WIRE-LLAMA-PARAMS]` = the exact params handed to the engine → proves the settings→native mapping (the class of bug where a slider doesn't reach the model).

---

### Capture tag → fake it grounds (checklist so nothing is missed)
`[WIRE-DOWNLOAD]` events+active · `[WIRE-UNZIP]` extract · `[WIRE-CAPS]` tool support · `[WIRE-LLAMA]`/`[WIRE-LITERT]` stream ·
`[WIRE-LLAMA-TOOL]`/`[WIRE-LITERT-TOOL]` tool framing · `[WIRE-LLAMA-PARAMS]`/`[WIRE-IMAGE-PARAMS]` settings→native ·
`[WIRE-LITERT-LOAD]` backend · `[WIRE-RAM]` memory · `[WIRE-REMOTE]`/`[WIRE-OLLAMA]` remote · `[WIRE-IMAGE]`/`[WIRE-IMAGE-PROGRESS]`/`[WIRE-IMAGE-CONSTANTS]` image ·
`[WIRE-VISION]` multimodal · `[WIRE-STT]` transcribe · `[WIRE-TTS]` synth · `[WIRE-EMBED]` embedding.
