# Device test log — PR #510

On-device testing of PR #510 (Android dev `ai.offgridmobile.dev` + iOS "Mac's iPhone"). One line per bug.
Status: ✅ verified on device · 🔁 fixed, needs recheck on next build · 🔎 open/investigating.

## To re-test on the next build (🔁)
- [x] **B2** — ✅ VERIFIED: voice-mode thought-process / enhanced-prompt block matches audio-bubble width (IMG_0131).
- [x] **B3** — ✅ VERIFIED: pre-tool-call thinking box left-aligned + bubble-width, text + voice (IMG_0131).
- [x] **B4** — ✅ VERIFIED iOS: resend "Draw a dog" re-drew the image, enhanced prompt correct (IMG_0114).
- [ ] **B5** — send a voice note in text mode → it uses the transcript, no "Failed to load media" error.
- [ ] **B6** — retry an image download that failed extraction → it re-downloads (no "Download not found").

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
- [ ] **B8** (Android) — image download goes to PROCESSING before it's complete (~938–944 / 949MB, 99%), so it extracts a PARTIAL zip → "missing clip_v2.mnn.weight/unet.bin", then a fake "connection dropped" alert. CONFIRMED: user watched it flip to processing at 938/949; error fires at varying truncation points (994MB, 989MB, 938MB) → NOT a fixed bad file, it's cut off mid-download. absolutereality (993MB) completed fine → timing/size dependent. Suspect: resumeImageDownload / moveCompletedDownload triggered on an in-progress download (called from useImageModels.ts:113 + retryHandlers). Fix: never move/extract until bytes >= totalBytes; don't fire resume/finalize on an in-flight download.
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
- **Width unification** — both thinking boxes + audio bubbles now one 85% width (mirrors core bubble maxWidth); voice tool-call double-padding removed. Pro commit 1824a0c0. ✅ (IMG_0112)
