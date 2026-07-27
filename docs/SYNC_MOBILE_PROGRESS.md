# Off Grid Mobile — Sync integration progress (for the desktop session)

Living log of the **mobile** side of `@offgrid/sync` integration so the desktop session can
coordinate. Path: `off-grid-ai/mobile/docs/SYNC_MOBILE_PROGRESS.md`. Updated as work lands.

## Shared contract (both apps consume the same public package → converge with no rework)

- **Package:** `@offgrid/sync` (`shared/packages/sync`), consumed by mobile via `file:` dep. Never
  forked. Wire protocol, NaCl crypto, op-log schema, and mDNS service type all live in the package.
- **mDNS service type:** `_offgrid._tcp.local` (mobile advertises + browses this; must match desktop).
- **Transport:** length-prefixed NaCl-encrypted frames over TCP (ephemeral bound port, advertised
  over mDNS TXT). App messages ride the paired channel via `engine.sendApp(deviceId, channel, data)`.
- **Feature gating:** the mobile Sync _experience_ is Pro; the engine is public.

## Devices (mobile side, on hand for real 2-device tests)

- **iPhone 17 Pro Max** — hardware UDID `00008150-000225103CD8C01C` ("Mac's iPhone"), iOS 26.5.2.
  Driven via WebDriverAgent + `devicectl`; read the current WDA URL from `launchWda.ts`.
- **Android** — `adb` id `505b53a0` (OnePlus). Driven via `adb`.
- Both on the same LAN as the laptop. Can pair phone↔phone and phone↔desktop.

## UUID coordination (agreed)

- Synced entities keyed by **UUID** (conversations, projects, settings). **Mobile owns adding
  stable UUIDs on its side** (chatStore conversations, projects, per-message UUIDs). Message-content
  sync needs a per-message UUID (desktop is adding a UUID column on `rag_messages`; mobile adds the
  equivalent to its message store). Conflict resolution is the engine's LWW — not reimplemented.

## Phase progress

### Phase 0 - Foundation (transport live) - COMPLETE

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
- [x] Two-device handshake (discover, NaCl pair, app message) verified manually on real devices.
- [x] Pairing secrets persist in Keychain. A paired peer reconnects after the mobile Sync service
      restarts without asking for the pairing code again.

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
- [x] Debug-only Pro access is labeled as local development access instead of a Lifetime license.
      Its Sync card explains that Keygen device slots require a license key and never renders a
      misleading `0 of 5`; the pairing field uses an unmistakable instruction placeholder.

### Phase 1 - State sync (chats/projects/settings) - IN PROGRESS

- [x] Stable RFC 4122 UUIDs for new conversations, projects, and messages. The persisted chat
      migration backfills legacy message UUIDs once and preserves them across relaunch.
- [x] Canonical mobile mutations reuse the desktop wire entities and field names for
      `conversation`, `message`, and `project`; core data owners emit through one optional Pro hook.
- [x] Pro persists the op-log and runs the shared `StateSync` anti-entropy protocol over the
      encrypted `state` app channel. Existing local records backfill when the service starts.
- [x] Settings to Sync exposes Chats and Projects sharing controls. A disabled category is filtered
      before it can leave the phone; re-enabling it backfills current records.
- [x] One rendered AppNavigator journey proves a pre-pair desktop project/chat/message arrives and
      becomes visible, a project created through the phone UI stays local while Projects sharing is
      off, and enabling Projects sends it over the real loopback transport.
- [x] Sync the shared `model_setting` keys through the canonical desktop wire names. The mobile
      app store remains the settings owner; inbound values are validated and applied without
      rebroadcast, while local changes and resets emit through the optional Pro hook.
- [x] The rendered AppNavigator journey proves an inbound desktop temperature becomes visible in
      Model Settings, a phone edit stays local while Model settings sharing is off, and re-enabling
      the category backfills the current value. A contract test round-trips every supported
      desktop↔mobile key and rejects malformed or unsafe peer values.
- [x] The same rendered journey disconnects peers with identical histories, makes one temperature
      edit on each side at the same Lamport, reconnects, and proves both sides select the shared
      engine's higher-device-ID LWW winner. Restarting the mobile state service preserves the op
      count, and remounting AppNavigator shows the winning value without duplicate backfill ops.
- [x] Project deletion now has one non-destructive cross-lane contract: both apps remove the
      project and unfile its conversations without deleting messages. The rendered journey deletes
      an inbound project through mobile UI and proves the tombstone, unfiled conversation, and
      preserved message all reach the peer.
- [ ] Verify conversation/project/message convergence with the real desktop app on physical iOS
      and Android devices.

### Phase 2 - Model transfer - IN PROGRESS

- [x] Receive one text GGUF over the encrypted paired channel. Mobile writes to a resumable `.part`
      file, verifies byte count, checksum, and the `GGUF` header, then registers the model.
- [x] Invalid files are rejected and both the final file and partial file are removed.
- [x] Send an installed single-file GGUF from a paired device row. Sync shows transfer progress,
      failure, cancellation, completion, and dismissal states.
- [x] The rendered AppNavigator journey covers Settings to Sync, pairing-code entry, valid receive,
      invalid receive, model admission, and sending the admitted model back.
- [ ] Verify a full-size GGUF transfer in both directions on real iOS and Android devices.
- [ ] Add multi-file transfer before exposing vision models or other model formats.

### Phase 3 — Ambient sharing — NOT STARTED

## Security note (logged for GA)

Crypto is sound (NaCl secretbox authenticated encryption; passphrase never on the wire; LAN-only).
Hardening item before GA: the KDF is a hand-rolled iterated SHA-512 ("PBKDF2-like") — pair with a
high-entropy auto-generated code + a real KDF (scrypt/argon2) so a weak passphrase isn't brute-forceable.

## Branch

`feat/sync-integration-phase0` (mobile). State-sync checkpoints:
`f50dea2c` (stable IDs), `b8abb869` (withhold unsafe project tombstones),
Pro `07e06ee2` and core `78df85ba` (model settings), and `69f16ccb`
(non-destructive project deletion). Pro `afca0d7e` and core `9ced2a55` distinguish Debug Pro from
real Keygen device activation.
Commits are small + each has rendered integration coverage + hygiene.

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
