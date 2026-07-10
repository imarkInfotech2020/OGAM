# Device test log — PR #510

On-device testing of PR #510 (Android dev `ai.offgridmobile.dev` + iOS "Mac's iPhone"). One line per bug.
Status: ✅ verified on device · 🔁 fixed, needs recheck on next build · 🔎 open/investigating.

## To re-test on the next build (🔁)
- [ ] **B2** — voice mode: thought-process / enhanced-prompt block width matches the audio bubbles.
- [ ] **B3** — text + voice: pre-tool-call thinking box is left-aligned + bubble-width (not full-bleed).
- [ ] **B4** — resend an image turn → it RE-DRAWS the image (does not load a text model / answer in text).
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

## Still open (🔎)
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
