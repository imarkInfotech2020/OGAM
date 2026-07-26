# Off Grid Mobile — Sync integration progress (for the desktop session)

Living log of the **mobile** side of `@offgrid/sync` integration so the desktop session can
coordinate. Path: `off-grid-ai/mobile/docs/SYNC_MOBILE_PROGRESS.md`. Updated as work lands.

## Shared contract (both apps consume the same public package → converge with no rework)
- **Package:** `@offgrid/sync` (`shared/packages/sync`), consumed by mobile via `file:` dep. Never
  forked. Wire protocol, NaCl crypto, op-log schema, and mDNS service type all live in the package.
- **mDNS service type:** `_offgrid._tcp.local` (mobile advertises + browses this; must match desktop).
- **Transport:** length-prefixed NaCl-encrypted frames over TCP (ephemeral bound port, advertised
  over mDNS TXT). App messages ride the paired channel via `engine.sendApp(deviceId, channel, data)`.
- **Feature gating:** the mobile Sync *experience* is Pro; the engine is public.

## Devices (mobile side, on hand for real 2-device tests)
- **iPhone 17 Pro Max** — hardware UDID `00008150-000225103CD8C01C` ("Mac's iPhone"), iOS 26.5.2.
  Driven via WebDriverAgent (`http://192.168.1.14:8100`) + `devicectl`.
- **Android** — `adb` id `505b53a0` (OnePlus). Driven via `adb`.
- Both on the same LAN as the laptop. Can pair phone↔phone and phone↔desktop.

## UUID coordination (agreed)
- Synced entities keyed by **UUID** (conversations, projects, settings). **Mobile owns adding
  stable UUIDs on its side** (chatStore conversations, projects, per-message UUIDs). Message-content
  sync needs a per-message UUID (desktop is adding a UUID column on `rag_messages`; mobile adds the
  equivalent to its message store). Conflict resolution is the engine's LWW — not reimplemented.

## Phase progress
### Phase 0 — Foundation (transport live) — IN PROGRESS
- [x] Consume `@offgrid/sync` file: dep + pure-JS crypto deps (tweetnacl, tweetnacl-util, js-sha512).
- [x] Metro resolves the package + `./rn` `./rn-discovery` `./portable` (watchFolder + subpath
      aliases; not global package-exports). Bundles on both platforms.
- [x] RN glue (all unit/integration tested off-device, 11 tests):
      `rnByteCodec` (Buffer/base64 codec), `buildSyncEngine` (RnTcpTransport + engine),
      `buildDiscovery` (RnDiscovery + orchestrator). Real pairing + app-message test over an
      in-memory base64 socket passes.
- [x] `createNativeSync` binding (injects react-native-tcp-socket + react-native-zeroconf).
- [x] Native config: iOS `NSBonjourServices += _offgrid._tcp`; Android `CHANGE_WIFI_MULTICAST_STATE`.
- [x] iOS `pod install` autolinked tcp-socket 6.4.1 + zeroconf 0.14.0 (+ CocoaAsyncSocket).
- [x] Native rebuild: **iOS built + installed + launched** (autolinked tcp-socket + zeroconf).
      Android APK **built OK** but install failed (`No connected devices!` — phone dropped off adb
      mid-build); needs reconnect + `installDebug` (no recompile).
- [x] **iOS transport LIVE on device:** `[SYNC] started ... port=51770 platform=ios`; the Mac's
      `dns-sd -B _offgrid._tcp` sees `OffGrid-<id>` → native Bonjour publish + service type confirmed
      on the real LAN.
- [ ] Two-device handshake (discover → NaCl pair → app message): pending Android reinstall (peer).

### Phase 0.5 — Pro experience + licensed devices — COMPLETE
- [x] Sync UI and lifecycle orchestration live in the private Pro package, registered through the
      existing core screen/settings registries. Core owns only reusable native transport glue.
- [x] Settings → Sync exposes discoverability, pairing, peer state, and one licensed-device surface.
- [x] Keygen device management lists active machines, marks this device, and allows another machine
      to be deactivated after confirmation.
- [x] Activating a sixth device automatically deactivates the least-recently-seen existing machine,
      then retries activation. Revalidation follows the same replacement path.
- [x] Boundary tests cover the real Keygen HTTP sequence (five active → delete oldest → activate
      current), and a rendered AppNavigator journey covers Settings → Sync → device deactivation.

### Phase 1 — State sync (chats/projects/settings) — NOT STARTED (needs mobile UUID migration first)
### Phase 2 — Model transfer — NOT STARTED
### Phase 3 — Ambient sharing — NOT STARTED

## Security note (logged for GA)
Crypto is sound (NaCl secretbox authenticated encryption; passphrase never on the wire; LAN-only).
Hardening item before GA: the KDF is a hand-rolled iterated SHA-512 ("PBKDF2-like") — pair with a
high-entropy auto-generated code + a real KDF (scrypt/argon2) so a weak passphrase isn't brute-forceable.

## Branch
`feat/sync-integration-phase0` (mobile). Commits are small + each has tests + hygiene.

## Prior-art decision (2026-07-26)
`feature/sync` (based 2026-07-09, now **708 commits behind main**) has a full prior mobile
Track-A implementation: `src/services/backup/{backupArchive,backupData,backupFiles,backupIo,
backupService,types}.ts` (the four-port adapters over `@offgrid/sync/portable` — CURRENT API,
`BackupEngine`/`BackupDataPort`/`BundleError`), a `BackupRestoreScreen`, `portableWorkspace/import
journal`, and store/RAG changes. It's the impl the desktop plan mirrors.
**Decision:** do NOT merge the stale branch (708 commits of store/screen/RAG drift = conflict mess).
Instead, in **Phase 1**: reuse the four-port ARCHITECTURE + lift the near-pure adapters
(archive/files/io) as reference, and REWRITE `backupData` against current stores (chatStore/
projectStore/appStore/ragService have all drifted). The transport layer (Phase 0, this branch) is
fresh + aligned to the current `@offgrid/sync` package — keep it. Envelope + ID-stability rules
(projects/threads/conversations = merge-by-id; messages/chunks/memories = rebuild) come from the
shared package, matching desktop.
