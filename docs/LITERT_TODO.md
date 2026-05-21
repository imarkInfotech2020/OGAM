# LiteRT Production TODO

## P0 — Correctness blockers
1. **Fix stopGeneration()** — wire `liteRTService.stopGeneration()` into `generationService.ts`. Currently stop button does nothing for LiteRT, native thread keeps running.
2. **Fix multi-turn conversation history** — remove `resetConversation()` before every message. Only reset on new chat / model switch. For follow-up turns just call `sendMessage()` directly — native Conversation object already holds history. For app-resume cases use `ConversationConfig.initialMessages` to replay.
3. **Fix memory budget** — `memory.ts` lines 69 and 103: replace `llmService.isModelLoaded()` with `llmService.isModelLoaded() || liteRTService.isModelLoaded()`. LiteRT RAM not counted so image gen model can OOM when loaded alongside LiteRT.

## P1 — User-facing correctness
4. **Fix silent image drop** — when `liteRTVision=false` and user attaches image, show error toast instead of silently sending text-only. User thinks model saw the image, it didn't.
5. **Wire sampler settings** — `SamplerConfig` in `LiteRTModule.kt` `resetConversation()` is hardcoded to `topK=40, topP=0.95, temperature=0.8`. Read from `store.settings` instead.
6. **iOS platform guard** — use `liteRTService.isAvailable()` (already checks `Platform.OS === 'android'`) as the single gate. Never write `Platform.OS` inline anywhere else. Hide all LiteRT UI on iOS from this one method.
7. **Hide irrelevant settings for LiteRT** — when LiteRT model active, hide: KV cache type, GPU layers, flash attention, nThreads, nBatch, repeat penalty. Show only: backend (cpu/gpu/npu), temperature, topK, topP.

## P2 — Future-proofing
8. **Fix syncWithNativeState** — `utils.ts` only checks `llmService.isModelLoaded()`, not `liteRTService.isModelLoaded()`. App resume after background kill can show stale loaded state.
9. **Backend change reload for LiteRT** — `hasPendingSettings` returns false for LiteRT so CPU→GPU switch never reloads. Need to track `loadedBackend` and trigger reload when it changes.

## P3 — Tests
10. **Unit tests** — generation flow, stopGeneration, error paths, vision=false guard, memory budget with LiteRT loaded
11. **Integration tests** — load→generate→stop cycle, model switch llama↔LiteRT, image with vision disabled

## P4 — UI (lowest priority)
12. **Downloadable model catalog** — curated list of .litertlm models (Gemma variants), download with vision flag pre-set, Android only

---

## Build cleanup (do before merging litertsupport → main)
- Remove `org.gradle.java.home` from `android/gradle.properties` — machine-specific, breaks CI
- Rebuild gesture handler patch cleanly — current patch captured CMake build artefacts, not just the source fix. Check if `react-native-gesture-handler` has released a fix natively first.
- Test full main branch build after merge — Kotlin 2.2.0 upgrade is the highest risk item

---

## Key files
- `android/app/src/main/java/ai/offgridmobile/litert/LiteRTModule.kt` — native Android module
- `src/services/litert.ts` — JS bridge service
- `src/services/activeModelService/loaders.ts` — load routing (litert vs llama, line 171)
- `src/services/activeModelService/memory.ts` — memory budget (bug at lines 69, 103)
- `src/services/activeModelService/utils.ts` — syncWithNativeState (missing liteRT check)
- `src/services/generationServiceHelpers.ts` — generation routing, conversation reset
- `src/screens/ModelsScreen/importHelpers.ts` — engine tag set at import, vision dialog
- `src/types/index.ts` — DownloadedModel type, ModelEngine = 'llama' | 'litert', liteRTVision flag

## Architecture facts to remember
- Engine decided by `DownloadedModel.engine` field — set once at import, never changes
- LiteRT only on Android — `liteRTService.isAvailable()` is the single platform gate
- LiteRT loads model into RAM same as llama — no streaming from disk
- Vision requires `liteRTVision=true` on the model record AND `visionBackend=Backend.GPU()` in EngineConfig
- SamplerConfig (topK/topP/temp) not supported on NPU backend — skip it there
- Library: `com.google.ai.edge.litertlm:litertlm-android:0.11.0`
- iOS Swift SDK: not released yet, Coming Soon per Google
- Gemma 4 E2B on GPU: TTFT ~7s, ~38-41 chars/sec


i want to cleanup some branches haev got too many branches locally 
add-mailfeedback-and-lovewithWednesday
addmailto
0.0.84
85
dev/integration -dont know what this is about dont delete 
fdroid/wrapper-and-fastlane
feat/remote-server-api-keys can do 
 fix-file-delete-from-source-error
 fix-file-import
  fix-google-play-services
  fix-threads-resetting-auto-error
  fix-threads-resetting-auto-error2
  fix-whisper-downlaod
    fix/ios-document-picker-issue2
    fix/issue-201-view-old-chats-without-model
    fix/react-native-zip-archive-upgrade
      fix/local-model-import
        fix/remove-notification-permission
  fix/vision-retry-mmproj-restore
  fix/whisper-release-thread-join
  react-native-zip-patch
  remove-phi-list
  ui-ux/improvements/0.0.88
  make-tool-heuristic-based





  