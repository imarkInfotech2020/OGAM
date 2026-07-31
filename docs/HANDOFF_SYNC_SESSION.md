# Handoff — Off Grid Personal Mesh (session 3, 2026-07-31 afternoon)

Read `mobile/rules.md`, the workspace `CLAUDE.md`, and `brand/DESIGN_PHILOSOPHY.md` before touching
anything. The rules that governed this session:

- **One seam.** Anything true on more than one platform is defined ONCE in `shared/packages/sync`;
  hosts supply adapters only (transport, storage, clock, drawing). Bringing up the next platform is
  wiring, not logic.
- **No tests** unless the behaviour is verified working first, and never a `jest.mock` of our own code.
- **Report status as a gate: code / wired / verified.** Never inflate "done".
- **Commit incrementally. Never `--no-verify`.** Pre-commit enforces zero ESLint warnings on staged
  files and hard caps (500 lines/file, 350/function) - extract, never bypass.
- **Mobile has no modals. Bottom sheets only.**
- Design: cards use the Home tokens (radius 12, `colors.surface`, `shadows.small`); one screen header
  (`src/components/ScreenHeader.tsx`) matching Settings / Model Settings; never explain what a toggle
  does; no em dashes, no exclamation marks, no banned words.

## Devices and how to drive them

- **Android** (OnePlus, `ai.offgridmobile.dev`): `adb` works. `adb exec-out screencap -p > x.png` to
  see the screen - but do not screenshot while the user is in a personal app. JS logs ARE in logcat:
  `adb logcat -d | grep ReactNativeJS`. Native rebuild: `npx react-native run-android --mode=debug
  --appId ai.offgridmobile.dev --no-packager`.
- **iOS** (Mac's iPhone, physical): `IOS_DEVICE_ID=00008150-000225103CD8C01C bash scripts/ios-device.sh`.
  Takes several minutes. If install hangs on "Enabling developer disk image services", the Mac-side
  `CoreDeviceService.xpc` is wedged - kill it, do not reboot the phone.
- **Desktop**: `npm run dev` in `desktop/`. **Only ever ONE instance.** Killing electron-vite while
  Electron lives leaves a zombie pointing at a dead :5173 (`ERR_CONNECTION_REFUSED`) - kill BOTH
  (`pkill -f electron-vite; pkill -f off-grid-ai/desktop/node_modules/electron`) then start once.
  Main-process changes need a restart; renderer hot-reloads.
- The user pastes images into the chat. `~/Downloads` is unreadable to the agent (macOS TCC).

## Verified working on real devices this session

Chats (durable), projects, knowledge base, clipboard, Android screenshot capture -> macOS, live chat
streaming across all pairs, the rebuilt Sync screen, the Mac's chat-list previews, desktop peer
preview rows.

## What landed (do not redo)

- **PM10 Android screenshot capture**: Kotlin `ContentObserver` on `MediaStore.Images` filtered to the
  Screenshots bucket, copies into the app, emits the same `SyncScreenshotCaptured` payload iOS emits.
  The TS boundary no longer asks `Platform.OS` - presence of the module IS the capability.
- **PM11 Android downloads via MediaStore** (no folder picker; Android 11+ never grants SAF on
  `Download`). Honest limit: with a media permission MediaStore returns MEDIA in Download; another
  app's PDF is not reachable.
- **Streaming**: "empty buffer means a new reply" now means neither content NOR reasoning (a thinking
  model streamed reasoning with content empty, so every frame minted a new sender - 73 previews for
  one answer). One row per device. Reasoning-only previews render.
- **A synced message shows when it arrives** (desktop broadcasts on message materialisation; the open
  thread reloads, skipped while that Mac is generating).
- **Model state has one owner**: `activeModelService.resolveSelectedTextModel()` (tolerates a rebuilt
  id by falling back to the file) and `selectedTextModelId()` (selection, then remembered choice).
  Chat/chat-list/Home read `useActiveTextModel`; the picker's row state comes from
  `useActiveModelStatus` + `loadingTextRowId`, never from the tap.
- **Ambient folders**: one unusable file no longer fails a whole scan; a file received from the mesh is
  never shared back (content key = name + size).
- **LAN discovery**: the advertiser publishes its numeric address in the TXT record (`addr`), because
  Bonjour answers with a hostname and Android cannot resolve `.local`. Desktop advertises
  `lanAddress()` (skips utun/bridge/awdl/169.254), not the `0.0.0.0` it binds.
- **UI**: one `ScreenHeader` everywhere (Sync, Clipboard, Pro); Sync is titled cards with divided rows;
  sharing sections are accordions; the desktop file preview is a side panel; Pro screen's empty half
  carries "Included with Pro"; paste-text into a project knowledge base.
- **Gates**: desktop `npm run build` passes for the first time (stale licensing tests were blocking
  typecheck; moved to pro, and they found two real bugs - a 201 activation reported as failure, and
  licensed devices showing no last-seen). Shared has ESLint for the first time. Mobile test failures
  166 -> 41, desktop 61 -> 23.

## Open, in the order I would take it

1. **VERIFY Android <-> macOS over LAN.** Everything is committed but unverified: the phone needs a JS
   reload (to pick up the rebuilt `@offgrid/sync`) and then Sync -> Rescan. Two possible outcomes:
   it connects with route LAN, or the phone logs `[Discovery] resolved a peer with no dialable address
   (addresses=N host=name)`. If the latter, Android's zeroconf is giving no address AND the peer
   published no `addr` - resolve the name natively (NsdManager gives an InetAddress).
   Facts already established: `ping <mac>.local` from the phone answers "unknown host"; the Mac's
   record was being announced on `utun0` (a VPN), not `en0`; **Android has NO proximity route**
   (`src/services/sync/nativeSync.ts:90` gates it on iOS), so LAN is the only route it has and a
   "Nearby" label for the Mac on Android is a lying route label.
2. **The Mac's sync port is ephemeral** - it changes on every restart, so any saved host/port goes
   stale. Discovery re-resolves, so this only bites when discovery fails. Consider a fixed port.
3. **Eviction on Android uses `Alert.alert`** - a modal, which the user has explicitly ruled out on
   mobile. `pro/ui/SyncScreen/KnownDevicesSection.tsx` (`confirmForget`, and the action-error alerts).
   Convert to a bottom sheet (`AppSheet`).
4. **iOS renders a synced reply twice.** Strong lead: **nothing calls `expireStale()`** on either host
   (`ChatStreamOrchestrator.expireStale` has zero callers), so a preview that fails to retire never
   expires - the 10s settle window is dead code. Ask whether the second bubble ever disappears.
5. **PM11 untested on device**, and the Downloads card still says "Choose folder" where Android now
   shows a permission dialog (widening that label needs a shared type change).
6. **The mesh notification is dismissible** on Android 13+ despite `setOngoing(true)`
   (`MeshResidencyService.kt:76`); the platform allows it and dismissal does NOT stop the service. Only
   fix is a `deleteIntent` that re-posts - it fights the user's swipe, so it was left for a decision.
7. **Desktop merges are HELD at the user's request** until they have verified this build. Core is 13
   behind main, pro 7 behind with two files changed on both sides:
   `pro/renderer/settings-sections.tsx` and `pro/main/__tests__/capture-opt-in.integration.test.ts`
   (main landed Windows-Pro work). mobile/pro is already merged.
8. **Remaining test debt** (none of it from this session's changes, each verified against the
   pre-change file): mobile 41 - stale suites for code that moved (`deviceFingerprint`,
   `syncService.acceptIncomingPairing`) plus the Pro-access refactor sitting uncommitted in the tree;
   desktop 23 - legacy MemoryChat expectations, a `proOn` stub the harness never provides,
   App.navigation.
9. **Mobile's send-side category taxonomy is a second source of truth**
   (`pro/sync/syncPreferences.ts` hand-rolls `SyncCategory` while shared owns the catalogue; there is
   an id-mapping hack in `SyncSharingSettingsScreen.tsx`). Collapsing it needs a persisted-preferences
   migration.
10. **Honesty gaps found and not closed**: the context length is silently floored by device RAM
    (`llm.ts:204` - a 256K request became 4096 with nothing said); the resend path bails with "no
    active model" rather than loading the selected one; the vision projector (a 205 MB F16 mmproj) is
    loaded on every text-only chat start and could be lazy.

## Uncommitted work in the tree that is NOT mine

Leave it alone: a Pro-access slice in progress (`src/stores/proAccessSlice.ts` untracked, plus
`appStore`/`proLicenseService`/`useProStatusLabel`/`ProUpsellBanner`), `pro/licensing/proLicenseProvider.ts`,
two sync integration tests and a test util, `ios/SyncClipboardModule.swift`, `scripts/ios-device.sh`,
desktop's ROADMAP and e2e screenshots, and shared's `packages/models/src/catalog.ts` (one `sizeBytes`).

## Watch out

- `sharedFileSyncService.ts` is at exactly 500 lines; `SettingsScreen.tsx` render is at 341/350.
  The next addition to either needs an extraction first.
- Mobile typecheck: `npx tsc --noEmit 2>&1 | grep -E "^(src|pro)/"`. Desktop: filter `__tests__`.
- Twenty mobile suites stub `activeModelService`; new methods on that seam go in
  `__tests__/utils/activeModelServiceStub.ts`, not into each file.
