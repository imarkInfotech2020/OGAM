# Device wire-capture — progress & resume checklist

Android run, 2026-07-11 (2 sessions, ~9h). Full analysis: `DEVICE_TEST_FINDINGS.md`.
Raw commentary: `DEVICE_SESSION_COMMENTARY.md` (gitignored). Logs: `docs/wire-captures/` (15 snapshot sets).

**Latest:** `wire-android-20260711-part15-lastpull.log` (4079 lines, 0 malformed). Lossless append-only sink.
Pull: `adb exec-out run-as ai.offgridmobile.dev cat files/offgrid-wire.log > /tmp/wire-android.log`
(debug log: same with `offgrid-debug.log` — has the `[MEM-SM]`/`[GEN-SM]`/etc state-machine traces.)

---

## DONE (Android) ✅
- Device/SoC/RAM, downloads (14 models, parallel/queued), 3 memory gates
- **Text engines:** Qwen0.8B gguf (full: bare/thinking/tools/parallel/queue/stop), gemma-4-E2B gguf,
  **litert (full — 3rd thinking channel captured)**
- **Remote:** OGAD (all 5 cases), LM Studio (bare/tools/vision), Ollama (bare/tools/thinking/vision)
- **Vision:** Qwen0.8B works, SmolVLM+Qwen2B crash (B9), LM Studio remote vision works
- **Image gen:** AnythingV5 + Absolute Reality (GPU/mnn, ~10s each), image-intent routing
- **Budget/residency:** B1 whisper leak, B2 budget>physical, B3 CPU-fallback, M11 eviction-works
- **Thinking ground truth: all 4 formats captured** (inline `<think>` / `litert_thinking` / `reasoning_content` / ollama `thinking`)

## NOT DONE — pick up here next session (Android)
**First: force-restart app** (clears any whisper leak). Then:
- [ ] **STT working case** — record a voice note in a mode that SHOULD transcribe; capture `[WIRE-STT]` with
      real text (we only have the broken Q20 case). Also: does STT ever stop cleanly? (B11)
- [ ] **TTS** — tap **Speak** on a reply (kokoro → `[WIRE-TTS]`)
- [ ] **RAG** — project + **PDF** in knowledge base + ask (`[WIRE-EMBED]` + `[WIRE-PDF]`)
- [ ] **Image size 128** — set it, regenerate → does it floor to 256? (Q1 bug) + guidance change (Q7)
- [ ] **Image lightbox** — tap a generated image → viewer opens with save/close?
- [ ] **qnn/NPU image backend** — if a backend selector exists, try it (device supports qnn; default picked GPU)
- [ ] **Verify B18** — does loading a local model actually make it the active model? (resend went isRemote=true)

## iOS (fresh session)
- [ ] Repeat native-divergent seams for platform parity: image (**Core ML**), STT, one gguf turn,
      one litert turn, vision. Same pull, iOS UDID in `xcrun devicectl` command.

## KEY BUGS TO TURN INTO TESTS (priority order)
1. **B1 whisper coresidency leak** (auto-loads on download, ejectAll can't clear, makeRoomFor won't evict)
2. **B10/Q20 voice-note-not-transcribed** (spec: always transcript, never raw audio)
3. **B16 LM Studio reasoning_content dropped** (no toggle → thinkingEnabled=false → discarded)
4. **B14 thinking renders in answer bubble until close delimiter** (should be thinking-block from token 1)
5. **B2 budget > physical RAM** (fits=true while model > os_procAvail)
6. **B9 vision decode fails** on SmolVLM/Qwen2B (evaluate chunks)
7. **B13 error doesn't clear spinner**, **B15 silent max-predict cutoff**, **B3 CPU-fallback from inflated estimate**

## Per-model recipe (efficient)
1. Bare: thinking OFF + tools OFF → `What is 47*89 and what is 30% of 400?`
2. Combined: thinking ON + tools ON → same + "reason step by step"
