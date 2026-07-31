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

## Remaining work, in the order I'd take it

1. **Android chat ops do not reach peers (BLOCKING, do this first).** The op-log is healthy
   (`ops=2245`) and clipboard syncs fine on its own channel, so transport is not the problem, yet
   chat records do not converge on macOS/iOS. Trace `record()` → `broadcast()` → `outboundMessage()`
   in `mobile/pro/sync/stateSyncService.ts`, then the peer's `onStateMessage`. Add an
   applied-count log on the RECEIVING side so send-vs-apply is distinguishable. Streaming is
   cosmetic if chats do not converge underneath it.

2. **Desktop does not DRAW peer previews.** It sends and accepts frames; `pro:sync:chat-stream` is
   broadcast with nothing listening. Blocker: the chat UI is `src/renderer/src/components/
   MemoryChat.tsx` (~2.9k lines) which is CORE and public — listening for a pro channel there breaks
   the open-core rule in `desktop/CLAUDE.md`. Add a generic slot seam in core that pro registers a
   preview renderer into (see `pro/renderer/slots.ts`), then append rows after `messages.map` at
   `MemoryChat.tsx:2829`. Mobile's equivalent shape is `src/screens/ChatScreen/types.ts`
   (`withRemotePreviews`) — consider lifting the row-projection rule into shared so both agree.

3. **Split Sending and Receiving into separate screens** (user's most recent request). The Sharing
   screen is cluttered. Register a new screen beside `SyncSharingSettings` in `mobile/pro/index.ts:94`
   and add a nav row next to the existing three at `mobile/pro/ui/SyncScreen/index.tsx:361`; move
   `ReceivingSection` out of `SyncSharingSettingsScreen.tsx`.

4. **PM10 — Android automatic screenshot sharing.** Genuinely unimplemented; the "unavailable in this
   build" message is honest. `src/services/sync/nativeScreenshot.ts:31,55` hard-gate
   `Platform.OS === 'ios'`. Needs a Kotlin module in
   `android/app/src/main/java/ai/offgridmobile/` (a `ContentObserver` on `MediaStore.Images` filtered
   to the Screenshots bucket, `READ_MEDIA_IMAGES`) emitting the same `SyncScreenshotCaptured` payload
   iOS emits. Also fix the shape while you are there: report capability as DATA the way
   `nativeMeshResidency.ts` does, not a `Platform.OS` branch.

5. **PM11 — Android downloads sharing.** "For your safety, share another folder" is Android's own SAF
   text; Android 11+ never grants SAF on `Download`. Use `MediaStore.Downloads` instead of SAF.

6. **Desktop clipboard gate.** The `CLIPBOARD_CHANNEL` branch in `pro/main/sync-ipc.ts` `onAppMessage`
   does not consult `acceptsIncoming(prefs.receivePolicy, deviceId, 'clipboard')`. Mobile does.

7. **Sticky ambient source error.** A skipped item is rendered as a source-LEVEL issue, so the
   Downloads card looks broken until the next scan. Make it dismissible or a per-item skip count.
   `ambientSetupIssues` in `pro/renderer/screens/DevicesScreen.tsx:360` only clears on a successful
   re-authorize.

8. **DESTINATION placement (desktop).** It sits between the ambient blurb and the cards doing two
   unrelated jobs: scoping the rules below AND hosting a one-off "Share file" action. Split them —
   destination inline with the AMBIENT SHARING heading, "Share file" as its own action row.

9. **Desktop chat list last-message preview.** Mobile has it, desktop does not. Requested twice,
   never started. Use a shared projection so both agree (`mobile/src/utils/conversationOrdering.ts`
   is the mobile half).

10. **Mobile's send-side category taxonomy is a second source of truth.** `pro/sync/syncPreferences.ts`
    hand-rolls `SyncCategory` (`settings`, `generatedMedia`, …) while `shared` owns the real catalogue
    (`model-settings`, `generated_media`, …) that desktop derives from. There is already an id-mapping
    hack at `pro/ui/SyncScreen/SyncSharingSettingsScreen.tsx` (`category === 'model-settings' ?
    'settings' : category`). Collapsing it needs a persisted-preferences migration.

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
