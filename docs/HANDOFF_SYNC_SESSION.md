# Handoff — Personal Mesh sync (streaming + receive rules + Sync UI)

Read `mobile/rules.md` and the workspace `CLAUDE.md` first. The overriding rule this session
established, now folded into the `/hygiene` skill: **anything true on more than one platform is
defined ONCE in `shared/packages/sync`, and each host supplies only adapters — transport, storage,
clock, drawing. Bringing up the next platform must require wiring and NO logic.** Primitives without
an orchestrator are duplication wearing a library costume.

No tests. The user's standing instruction: behavioural integration tests only once functionality is
verified working. Do not write unit tests or mock our own code.

Report status as a gate: **code / wired / verified**. Never inflate "done".

## What landed (do not redo)

All committed and typechecking across `shared`, `mobile`, `mobile/pro`, `desktop`, `desktop/pro`.

- `shared/packages/sync/src/chat-stream-orchestrator.ts` — `ChatStreamOrchestrator` owns the entire
  live-streaming lifecycle. Hosts inject `send`, `connectedDeviceIds`, `canSend`, `canReceive`,
  `onPreviewsChanged`, `now`, `uuid`, `log`. Fed by ONE input, `observeLocalStream(snapshot | null)`.
- Three defects fixed in `chat-stream.ts`, once, for both platforms:
  - a `done` frame no longer deletes the preview (it marks it `complete`); the preview retires only
    when `noteDurableRecord(conversationId, deviceId?)` fires, with a bounded settle window. This was
    the "message showed then disappeared" bug.
  - the `done` frame carries the final text, so the send throttle cannot strand the last tokens.
  - shrinking cumulative text starts a new stream id (the resend case).
- `shared/packages/sync/src/receive-policy.ts` — receive rules derived from the SAME catalogue as
  sharing (`SYNC_RELEASE_WORKSPACE_CATEGORIES` + `SYNC_AMBIENT_SOURCE_DEFINITIONS`), plus `files` and
  `models`. On/off only, global + per-device (pairing is the consent; there is no per-file prompt).
  Exports `acceptsIncoming`, `admitInboundOps`, `receiveCategoryForTransfer`, `projectSyncReceiving`,
  and the `with*` mutators. `projectSyncReceiving().summary` is EMPTY when all-on or all-off.
- **Mobile**: `pro/sync/chatStreamService.ts` is adapters only (162 → 60 lines), fed by a
  `useChatStore.subscribe` so no code path can forget to notify sync. `pro/sync/receivePreferences.ts`
  persists the policy. Gates wired at the op-log boundary (`stateSyncService`), the transfer boundary
  (`fileTransferService.admitIncoming`), and the clipboard channel. Rules cleared on unpair via
  `pro/sync/forgetDeviceRules.ts`.
- **Desktop**: `pro/main/sync/chat-stream-service.ts` + `src/main/chat-stream-state.ts` (core folds
  deltas and publishes a snapshot through the `syncStreamingState` hook). `SyncPrefs` carries a
  `receivePolicy`; gates wired the same two places. `pro/renderer/components/ReceivingControls.tsx`.
- **Sync UI (mobile)**: cards match the Home tokens (radius 12, `surface`, `shadows.small`, no
  border); THIS DEVICE / PERSONAL MESH / PAIRING CODE compressed; device actions are inline icons;
  receiving is scoped with a `FROM [All devices] [device]` selector like ambient sharing, so
  per-device control is per CATEGORY.

**Verified on the Android device** (OnePlus, `ai.offgridmobile.dev`): `[ChatStream] started
chatsEnabled=true receiving=true`, `[StateSync] oplog ready device=6e1c3b71 ops=2245`,
MeshResidency FGS running, and the compressed/elevated Sync screen by screenshot.
Everything else below is code, not verified.

## Session 2 (2026-07-31) - what landed since

Verified live: streaming Android -> Mac draws on the Mac ("OFF GRID AI - ANSWERING ON ONEPLUS NORD 5"),
and the rebuilt Sync screen renders on Android by screenshot.

- **Replication is diagnosable.** Shared `StateSync` reports counts only - what it advertises, what it
  backfills, received-versus-applied per batch, and the entity names in a batch. Hosts report the same
  numbers (mobile `logger`, desktop `logSyncLifecycle`). Send side reports `peers=N sent=M` and says
  when a message was withheld, logged only when the outcome CHANGES so a backfill cannot spam it.
- **Desktop draws peer previews.** Core slot `chat.messagesFooter` (inert), pro registers
  `RemoteChatPreviews`. Rows come from shared `chatStreamPreviewRows`, which now yields ONE row per
  device - a second preview from the same device is a superseded generation, and both were drawn.
- **A synced message shows when it arrives.** Only conversation ops broadcast
  `rag:conversations-changed`; messages told nobody, so the phone's question appeared after the answer.
  Desktop broadcasts on message materialisation and the open thread reloads (skipped while that Mac is
  generating).
- **Mac chat list shows the last message**, through shared `chatListPreviewLine`, which the phone's list
  now uses too.
- **Ambient folders survive one bad file.** An ingest failure threw out of the scan loop: the rest of
  the folder went untaken and that file's message became the source's `issue` until the next clean scan.
  Per-item failures are counted (`snapshot.skipped`); `issue` means the source itself.
- **Shared-file reconcile survives one unreachable destination**, and both `peerConnected` calls report
  failures instead of leaking an unhandled rejection in main.
- **Desktop clipboard is gated** on the receive policy, like mobile.
- **Model state has one owner.** `activeModelService.resolveSelectedTextModel()` resolves the selection
  (falling back to the file the id ends with, because the id is persisted while the downloaded list is
  rebuilt at launch - that mismatch made chat refuse to send to a loaded model), and
  `selectedTextModelId()` is the one answer for what to load (`activeModelId` and `lastTextModelId` had
  diverged, so chat loaded SmolVLM while Qwen sat selected). Chat, the chat list and Home read
  `useActiveTextModel`; the picker's row state comes from `useActiveModelStatus` + `loadingTextRowId`
  instead of a flag set on tap, which is why a row span forever.
- **UI**: Sync screen is titled cards with divided rows (Storage idiom), sharing sections are
  accordions (shared `Accordion` in core), Pro screen's empty half carries "Included with Pro", the
  model-loading bar animates on the native driver, and Files previews are cached and lazily requested.

## Remaining work, in the order I'd take it

1. **Ops that keep arriving and applying nothing.** The Mac logs `ops from=<phone> received=15
   applied=0` in repeating bursts. The batch is now entity-tagged, so one live run names the entity:
   the phone re-sends because that entity's watermark on the Mac never advances. Look at whether those
   ops are refused before they reach the log, or ingested and not persisted.
2. **PM10 - Android automatic screenshot sharing.** Still unimplemented; the "unavailable in this
   build" message is honest. `src/services/sync/nativeScreenshot.ts:31,55` gate `Platform.OS === 'ios'`.
   Needs a Kotlin module in `android/app/src/main/java/ai/offgridmobile/`: a `ContentObserver` on
   `MediaStore.Images` filtered to the Screenshots bucket, `READ_MEDIA_IMAGES`, emitting the same
   `SyncScreenshotCaptured` payload iOS emits. Report capability as DATA, not a `Platform.OS` branch.
   Needs a native rebuild, so do it when nobody is mid-test.
3. **PM11 - Android downloads sharing.** Android 11+ never grants SAF on `Download`; use
   `MediaStore.Downloads`.
4. **Mobile's send-side category taxonomy is a second source of truth.**
   `pro/sync/syncPreferences.ts` hand-rolls `SyncCategory` (`settings`, `generatedMedia`) while shared
   owns the real catalogue (`model-settings`, `generated_media`); there is an id-mapping hack in
   `SyncSharingSettingsScreen.tsx`. Collapsing it needs a persisted-preferences migration.
5. **Context cap is silent.** `llm.ts:204` floors the requested context by device RAM and nothing says
   so - a 256K request became 4096 and the user had to diagnose it by feel. Say it where it happens.
6. **The resend path bails instead of loading.** `[RESEND-SM] retry BAIL: no active model` refuses
   rather than loading the selected model or explaining why it cannot.

## Environment gotchas that cost me time

- **`~/Downloads` is unreadable** to the agent process (macOS TCC) — `ls` works, file reads fail with
  EPERM even with the sandbox off, and `cp`/`cat`/`ditto` all fail. Ask the user to paste images into
  the chat instead of giving a path.
- **Metro may already be running** (port 8081) from the user's own terminal. `metro.config.js` watches
  `../shared/packages/sync`, so a `shared` rebuild is picked up without restarting Metro.
- After changing `shared`, run `npm run build` in `shared/packages/sync` — mobile and desktop consume
  the built `dist`.
- Android: `npm run android` (appId `ai.offgridmobile.dev`). All three physical iPhones reported
  offline to `xcrun xctrace list devices`; iOS ran on the "OGA-A1 Simulator".
- Pre-commit hooks enforce ESLint with **zero warnings** and hard line caps (500 lines/file,
  350/function). Extract rather than bypass — never `--no-verify`.
- Mobile typecheck has PRE-EXISTING failures in `__tests__/` the user does not care about. Filter:
  `npx tsc --noEmit 2>&1 | grep -E "^(src|pro)/"`. Desktop: `grep -v "__tests__"`.

## Copy and design rules the user enforced hard this session

- **Never explain what a toggle's off state means.** A switch shows its own state. State only what the
  user cannot see — e.g. "Refused data is never written to this phone and never passed on."
- Show a fact ONCE. Derivable facts are not facts: "2 slots free" is max minus used; "offline or
  available" is saved minus connected.
- Explain only when something is wrong. "Discoverable" needs no sentence beneath it.
- Cards use the Home tokens: radius 12, `colors.surface`, `shadows.small`, no border. If it is
  card-shaped it is elevated, whatever it is named (`deviceRow` and `navigationRow` were both missed
  for exactly this reason).
- No em dashes, no exclamation marks, no curly quotes, no banned words. Icons over labels for row
  actions (`react-native-vector-icons` Feather on mobile, `@phosphor-icons/react` on desktop).
