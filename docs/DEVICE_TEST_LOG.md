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
**ROOT-CAUSED (fix pending).** Two compounding issues:
1. **The turn-breaker:** the DESIGN (voiceNoteSend.ts) is "whisper transcript → message.content (text);
   the audio attachment is display-only." But `formatLlamaMessages` (llmMessages.ts:15-18) ALSO injects
   the voice-note audio as a `<__media__>` marker + passes its uri as media whenever the model reports
   `supportsAudio`. gemma-4-E4B-it-GGUF's mmproj then tries to load the audio file and throws — surfaced
   as `[GenerationService] Tool generation error: Failed to load media` → `[ChatGen] Generation failed`
   (iOS log 09:42:33 / 09:43:27), hard-failing the whole turn. A transcribed voice note should be sent
   as its TEXT transcript only, never re-sent as audio media in the chat/text path.
2. **The empty transcript:** this voice note attached with NO textContent (transcription produced nothing
   — whisper not ready / failed / empty capture). Needs the [STT]/whisper-readiness trace; separate from #1.
FIX DIRECTION: (a) don't send a voice-note audio attachment as LLM media when it carries a transcription
(the transcript in message.content is the input) — likely never in the chat text path; (b) don't hard-fail
the turn on a media-load error — fall back to text-only generation; (c) chase the empty-transcript cause.

---

### B6 — Download retry not working + no auto-retry after network drop (Android)
**INVESTIGATING (fix in this PR).** Two parts:
1. **No auto-retry:** a whisper "Base" transcription-model download failed mid-way with "The connection
   dropped while downloading. Please try again." (IMG_0108) — it did NOT auto-resume/retry after the
   network blip. (Ties to backlog OD5: Android retry doesn't resume after a WiFi drop.)
2. **Manual Retry does nothing:** the Download Manager shows several failed downloads (SmolLM5,
   Mistral-7B-Instruct, whisper 99M small.en, Anything V5) with red-X + a Retry button; tapping Retry
   doesn't restart them (IMG_0109). CRITICAL LOG SIGNAL: tapping Retry produced ZERO `[DL-SM]` lines in
   the trace → the retry handler isn't firing (or isn't reaching modelDownloadService.retry()). Also
   "Anything V5" shows "File not found. It may have been moved or removed" (a stale/orphaned entry).
This also blocks B5 (the whisper model can't finish downloading → no transcription model → empty
transcript). Fix: wire/repair Retry → modelDownloadService.retry() (resume from partial), and add
auto-retry/resume on a transient network drop.

## Verified passing (tested on device this session)
- Gemma-4 LiteRT load + generate (Android) — B1.
- Gemma-4 GGUF load + generate (iOS).
- TTS + STT.
- Remote / Off Grid AI Gateway (GW).
- Message queues.
- Downloads.
- Regenerate image (iOS) — worked when tapping the image-result message (B4 was the user-message path).
- Tool calling.
