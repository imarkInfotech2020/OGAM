# Device test log — PR #510 (refactor/parse-once-boundary)

Live on-device testing of the PR #510 build (Android dev `ai.offgridmobile.dev` + iOS "Mac's iPhone").
Every bug reported during this session is logged here with status + evidence. Status legend:
**FIXED-VERIFIED** (fixed + confirmed on device) · **FIXED-PENDING-RECHECK** (fix committed, rebuild to
confirm) · **INVESTIGATING** · **PASSED** (tested, works).

Session started 2026-07-10.

---

## Bugs reported

### B1 — E4B LiteRT "Load Anyway" refuse-loop / too aggressive (Android)
**FIXED-VERIFIED.** Hitting Load Anyway on gemma-4-E4B LiteRT (5.2GB) refused in a loop even with
nothing else resident (`residents=[]`), so "remove other models" did nothing. Root cause: the override
ceiling used raw Android `availMem` (~4.5GB) instead of the reclaimable-aware physical budget — a
FOREGROUND app's LMK reclaims background apps for real physical RAM (dirty models can use it; unlike
the reverted swap-credit). Fix: Android override ceiling = `modelMemoryBudgetMB` (~70% of total).
iOS unchanged. Commit c02c5452.
Evidence (device log 09:24): `OVERRIDE OK - post-evict free ~2673MB (effectiveAvail=7908)` →
`LiteRT loaded on gpu` → `sendMessage complete` ×2 → `session end reason=done`. No SIGKILL.

### B2 — Voice-mode thinking / enhanced-prompt block full-width (iOS + Android, audio mode)
**FIXED-PENDING-RECHECK.** In voice mode the "Thought process" + "Enhanced prompt" accordions rendered
full-bleed, wider than the AI audio bubbles. Fix: audio-mode thinking wrapper matches the assistant
audio-bubble width (88%, left-aligned); shared `ASSISTANT_AUDIO_BUBBLE_WIDTH`. Pro commit b8a6a4f7
(branch fix/audio-thinking-block-width) — rebuild pro to confirm.

### B3 — Pre-tool-call thinking box full-width / lost left alignment (text + voice)
**FIXED-PENDING-RECHECK.** A tool-call reply's thinking box + pre-text + tool cards rendered via
ChatMessage's `ToolCallWithThinking` into `systemInfoContainer` (centered) + `alignSelf:'stretch'` →
full-bleed, unlike a normal reply's bubble-width thinking box. Both text AND voice route through this
shared path. Fix: left-aligned assistant container + bubble-width (85%) content column. Commit a0142d48.

### B4 — Resend on an image turn generated TEXT instead of re-drawing (iOS)
**FIXED-PENDING-RECHECK.** Hitting Resend on an image message loaded gemma4 and answered with text
instead of re-drawing. Root cause: an image turn emits an "Enhanced prompt" assistant message (no
image) BEFORE the image-result message; `recordedTurnKind` checked only the FIRST reply → 'text' →
text pipeline. Fix: scan the WHOLE turn (until the next user message) — any image reply → 'image';
both resend entry points (user-msg + assistant-msg) unified through it.
Evidence (iOS log 09:41): `retry user msg ... recordedKind=text` on a "Draw a dog" turn. (Note the
09:40 assistant-msg resend correctly got `recordedKind=image` — the hole was the user-msg path.)

### B5 — Voice note in text mode has no transcript → "Generation Error: Failed to load media" (iOS)
**INVESTIGATING.** Recording a voice note in TEXT mode attached the voice message with NO transcript,
then generation failed with "Failed to load media". Suspected: STT transcription didn't run/attach for
a text-mode voice note, so the audio media can't be loaded for the turn. Need the [TTS-SM]/[STT]/
[GEN-SM] trace around the failed send.

---

## Verified passing (tested on device this session)
- Gemma-4 LiteRT load + generate (Android) — B1.
- Gemma-4 GGUF load + generate (iOS).
- TTS + STT.
- Remote / Off Grid AI Gateway (GW).
- Message queues.
- Downloads.
- Regenerate image (iOS) — worked when tapping the image-result message (B4 was the user-message path).
- Tool calling.
