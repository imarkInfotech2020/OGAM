# Off Grid Mobile — Sync integration progress (for the desktop session)

Living log of the **mobile** side of `@offgrid/sync` integration so the desktop session can
coordinate. Path: `off-grid-ai/mobile/docs/SYNC_MOBILE_PROGRESS.md`. Updated as work lands.

## Shared contract (both apps consume the same public package → converge with no rework)

- **Package:** `@offgrid/sync` (`shared/packages/sync`), consumed by mobile via `file:` dep. Never
  forked. Wire protocol, NaCl crypto, op-log schema, and mDNS service type all live in the package.
- **Discovery:** LAN uses `_offgrid._tcp.local`; Apple proximity uses MultipeerConnectivity service
  `offgrid-sync` (`_offgrid-sync._tcp` + `_offgrid-sync._udp` privacy declarations).
- **Transport:** shared `MultiTransportBridge` races eligible LAN TCP and reliable Apple proximity
  routes. Shared Sync still owns length-prefixed NaCl encryption, framing, pairing, heartbeat, and
  every app/file payload; native adapters only provide reliable bytes. App messages ride the paired
  channel via `engine.sendApp(deviceId, channel, data)`.
- **Feature gating:** the mobile Sync _experience_ is Pro; the engine is public.
- **Desktop contract:** `shared/docs/DESKTOP_SYNC_INTEGRATION_PLAN.md`. This mobile record names each
  landed wire contract and the matching desktop requirement so the two integrations stay visible
  to each other.

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
- [x] RN glue: `rnByteCodec` (Buffer/base64 codec), `buildSyncEngine`
      (MultiTransportBridge + SyncEngine), and `buildDiscovery`
      (CompositeDiscoveryService + orchestrator).
- [x] `createNativeSync` binding (injects react-native-tcp-socket + react-native-zeroconf).
- [x] Native config: iOS `NSBonjourServices += _offgrid._tcp, _offgrid-sync._tcp,
  _offgrid-sync._udp`; Android `CHANGE_WIFI_MULTICAST_STATE`.
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
- [x] Pairing metadata persists independently of discovery, so trusted devices remain visible while
      offline. Sync distinguishes connected, reconnecting, offline, and needs-repair states.
- [x] Shared heartbeat marks a silent/dead peer offline instead of retaining stale connected state.
      Mobile local-device rename persists, updates the active engine identity, and re-advertises it;
      the same reusable sheet handles local names and saved peer aliases.
- [x] One-sided trust is recoverable through Pair again. Forget device clears the local secret,
      disconnects the session, and notifies a connected peer to clear its trust too.
- [x] The rendered persistence journey covers restart/reconnect, one-sided trust repair, re-pair,
      and two-sided forget. Settings → Sync also proves an offline device remains manageable.
- [x] iOS reliable proximity adapter uses one MultipeerConnectivity session per peer and feeds the
      same shared SyncEngine as LAN. Shared `MultiTransportBridge` and `CompositeDiscoveryService`
      provide route racing and discovery fallback (`26c0b09`); Mobile Pro `8c1f599f`, core
      `5762f0a5`. Root/Pro TypeScript and a full arm64 simulator app build are green.
- [ ] Physically verify iPhone ↔ signed macOS discovery, pairing, reconnect, and data transfer with
      Wi-Fi unavailable. Desktop proximity adapter: `e3406c3`.

### Phase 0.5 — Pro experience + licensed devices — COMPLETE

- [x] Sync UI and lifecycle orchestration live in the private Pro package, registered through the
      existing core screen/slot registries. Core owns only reusable native transport glue.
- [x] Sync is a first-class primary Settings row, not a buried Pro section. Home always shows a
      Sync card: `Set up Sync` before pairing, `Sync needs attention` when saved devices are
      offline, and current connection counts when active. Both entry points open the same device
      control center.
- [x] Settings → Sync exposes discoverability, pairing, peer state, and one licensed-device surface.
- [x] Consumer information architecture separates Devices, Sync sharing, and Sync activity.
      Devices retains pairing, rescan, connection state, reconnect/disconnect, icon rename, model
      send, forget, and licensed slots. Sharing owns category and ambient consent. Activity owns
      queue/history with All, Pending, In progress, Failed, and Completed filters. Rescan reports a
      persistent outcome instead of silently restarting discovery (Pro `0f38f9ee`, root
      `bdc5000f`).
- [x] A wrong incoming pairing code stays visible as a specific, dismissible error and permits an
      immediate clean retry; the shared engine closes the failed session instead of retaining it.
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
- [x] Knowledge-base documents now have a stable RFC 4122 `sync_id`. The RAG migration backfills
      existing autoincrement rows once, preserves that identity, and assigns it to new documents.
      The RAG owner emits indexed, enabled, and deleted lifecycle intents through the existing
      optional Pro hook. Real SQLite coverage: core `9deceba5`.
- [x] Knowledge-document control and verified bytes now sync independently and converge in either
      arrival order. Shared `KnowledgeDocumentSync` owns control/file gating, tombstones, project
      retry, conflict cleanup, and race serialization; Mobile owns only RNFS staging, the 5 MiB
      policy, and RAG adapters. A real encrypted/SQLite/rendered journey proves Desktop file-first
      input waits for project state, becomes visible in the project, a document picked on Mobile
      streams back with the same stable identity, and a Desktop tombstone removes it. Shared
      contracts `84cc414`, `e65086e`, `254c506`, `29dd19a`; Pro `f8b0e91a`; core `b51d80a4`.
- [x] Mobile transfer owners import their byte codec explicitly, so knowledge/shared-file/model
      transfers work under Hermes without a global `Buffer`. The shared knowledge contract accepts
      exact legacy Desktop `proj_<uuid>` project identities while new IDs remain bare UUIDs.
- [x] Shared file transfer retransmits the latest durable cumulative acknowledgement while a sender
      waits, so one dropped proximity ACK cannot permanently stall a knowledge/model/media stream
      (`346a39d`). Both hosts consume the same transfer owner.
- [x] Shared short-document chunking keeps non-empty documents smaller than the overlap as one
      searchable chunk (`ad9f92a`); Mobile consumes it through `@offgrid/rag` (`9e305d31`) and
      resolves the built shared entry directly in Metro (`b6ff258d`).
- [x] Portable tool/thinking artifacts materialize through the shared wire contract and render in
      Mobile chats (shared `408bdf4`, Pro `866193f6`, core `6513b334`).
- [ ] Verify conversation/project/message convergence with the real desktop app on physical iOS
      and Android devices.

### Phase 2 - Model transfer - IN PROGRESS

- [x] Receive one text GGUF over the encrypted paired channel. Mobile writes to a resumable `.part`
      file, verifies byte count, checksum, and the `GGUF` header, then registers the model.
- [x] Invalid files are rejected and both the final file and partial file are removed.
- [x] Send an installed single-file GGUF from a paired device row. Sync shows transfer progress,
      failure, cancellation, completion, and dismissal states.
- [x] Knowledge/model byte sends are serialized per device through shared `KeyedSerialQueue`;
      queued, active, failed, retry, and dismissal states are visible instead of silently dropping
      invalid/missing sources (shared `0efce95`, Pro `273ba743`, core `46df6bbf`; activity/error
      slice Pro `329762de`, core `b68e2b5e`).
- [x] Receive mobile-compatible multi-file packages for vision and Whisper models. Package
      admission reuses the mobile model registry and rejects desktop-only image and Parakeet models.
- [x] The rendered AppNavigator journey covers Settings to Sync, pairing-code entry, valid receive,
      invalid receive, model admission, and sending the admitted model back.
- [ ] Verify a full-size GGUF transfer in both directions on real iOS and Android devices.

### Phase 3 — Ambient sharing — IN PROGRESS

- [x] Add explicit opt-in clipboard Sync on mobile. It sends text copied after the toggle is enabled
      over the encrypted paired-device app channel and never sends images or files.
- [x] Native iOS and Android clipboard observers bridge local copies into Sync and apply received
      text without echo loops. Payloads are deduplicated, validated, and capped at 256 KiB.
- [x] Integration coverage proves opt-in persistence, encrypted paired delivery, receive/apply,
      duplicate suppression, malformed/oversized rejection, and the rendered toggle.
- [x] Settings → Sync → View clipboard opens a persistent text history with source attribution
      (`This phone` or the paired device name). Tapping restores a clip to the system clipboard;
      individual delete and confirmed Clear are available. Retention is bounded to 100 entries and
      1 MiB of text.
- [x] The rendered AppNavigator journey pairs a real loopback peer, captures one local and one
      encrypted remote clip, proves both source labels, restores the remote clip, deletes it, and
      clears the remaining history.
- [x] iOS native test, Android native test, and a signed physical-iPhone build all pass.
- [x] Ambient file replication uses one shared `shared_file` StateSync entity and one
      `application/vnd.offgrid.shared-file` byte contract for `screenshot`, `download`,
      `generated_media`, and `message_attachment`. Shared `ControlledFileSync` owns state/file
      ordering, tombstones, dependency gating, retry, and race serialization; Mobile owns durable
      RNFS staging, admission, gallery/chat materialization, and the visible transfer queue.
- [x] Generated images and message attachments have stable UUIDs, immutable origin provenance,
      resumable verified bytes, reconnect resend, and delete propagation. Attachment import waits
      until its owning conversation and message exist.
- [x] Received screenshots and downloads are retained in app-owned storage and shown in the
      existing Sync control center with kind, size, immutable source device, and an explicit iOS
      Share/export action.
- [x] The existing Sync control center uses the shared ambient policy for Screenshots, Downloads,
      Generated media, and Attachments. Each source can be Off, Ask, or Auto for All devices or one
      named device; a named-device rule overrides All devices. All rules default Off.
- [x] Ask opens the global item-specific bottom sheet and sends no metadata or bytes until the user
      approves. Auto sends silently with an ACTIVE indicator. Offline behavior is independently
      Skip or Queue; queued items are checked against the current policy before reconnect delivery.
- [x] Downloads and Attachments use the shared document-kind classifier and filter: PDF, text,
      documents, spreadsheets, presentations, archives, images, audio, video, or other. Mobile does
      not define a second host-only policy.
- [x] iOS screenshot sharing listens only to the system's new-screenshot event after the user
      enables Screenshots and grants Photos access. It copies that one new asset into app-owned
      storage before creating a stable portable record; it does not scrape photo history.
- [x] Mobile intentionally does not scrape the global iOS Files/Downloads folder. Outbound
      `download` records require an explicit Off Grid-owned download completion event; Desktop
      downloads can already arrive and be exported from Mobile.
- [x] The adversarial rendered AppNavigator journey pairs a real loopback peer, selects a
      device-specific Ask rule through visible controls, proves rejection sends no state or bytes,
      forces a receiver refusal, shows the retained failure, and retries the verified transfer.
- [x] Focused iOS native coverage proves screenshot bytes are copied into app-owned storage before
      a transfer descriptor exists and that a failed copy produces no descriptor.
- [ ] Verify clipboard text in both directions against a desktop build implementing the same
      `clipboard` app channel. iOS observes copies while active and rechecks on foreground.
- [ ] Physically verify generated media, message attachments, screenshots, and downloads in both
      directions against the signed Desktop build, including attribution, queue progress,
      interruption/reconnect, retry/cancel/dismiss, and deletion.

## Post-proximity roadmap (authoritative cross-device order)

Proximity is a transport milestone, not the end of Sync. Mobile and Desktop agreed this ordering on
2026-07-28:

### P0 — Joint physical iOS/macOS gate — CURRENT

- Rebuild/install the iOS app with its native proximity module and launch the signed Desktop build.
- Manually verify LAN and Wi-Fi-off nearby reconnection without re-pairing; stale peers must become
  offline within about 30 seconds.
- Verify chats/projects/messages/settings, tool artifacts, short RAG documents, both-direction
  knowledge bytes and controls, queue/error visibility, rename, clipboard, generated media,
  message attachments, screenshots, and downloads.
- Keep automated device driving, hooks, pre-push, and push deferred until this manual gate closes.

### P1 — Security and reliability foundation

- Shared: replace the hand-rolled KDF/weak-code path with a real KDF and high-entropy pairing flow;
  validate every peer payload at the protocol boundary; expose true per-device session close/unpair;
  prevent duplicate LAN/proximity sessions and make route handoff deterministic.
- Hosts: retain pairing secrets in safeStorage/Keychain and own the pairing/unpair UI.
- Do not independently change the shared boundary; agree the exact cross-host slice first.

### P2 — Complete the live replicated corpus

- The release corpus is conversations/chats, messages, projects, model settings, model transfer,
  copied text, screenshots, downloads, generated media, and message attachments. Memories,
  Entities, todos, actions, Vault, backup/restore, and remote inference are explicitly excluded.
- Shared portable-record provenance, `shared_file` state, and controlled byte coordination are
  landed. Mobile and Desktop own their durable stores, admission, consent, materialization, and UI.
- Remaining work here is physical cross-host validation plus any concrete media owners not yet
  connected to the shared-file mutation boundary; do not add parallel record schemas.

Mobile store inventory:

- Mobile does not currently have a product Memory store, Entity store, or standalone artifact
  library. Adding those surfaces requires new Mobile owners after the shared records are defined;
  RAM budgeting code named `memory` is unrelated.
- Completed tool results already live on a stable message UUID as text-only
  `Message.toolArtifacts: {name,result}[]`. The shared message-context parser admits them today.
- Generated-image metadata is persisted in `useAppStore.generatedImages` as
  `{id,prompt,negativePrompt?,imagePath,width,height,steps,seed,modelId,createdAt,conversationId?}`.
  Native generation assigns a UUID. PNG bytes remain local in `Documents/generated_images` on iOS
  and `files/generated_images` on Android. A disk-only recovery can reconstruct the ID, path, and
  timestamp, but not the full prompt/model metadata.
- Chat attachments are nested under the stable message UUID as
  `{id,type,uri,mimeType?,width?,height?,fileName?,textContent?,fileSize?,audioFormat?,
  audioDurationSeconds?}`. Existing attachment IDs are timestamp-based rather than UUIDs. Document
  bytes live under `Documents/attachments`; picked images retain picker-owned URIs; voice notes
  retain recorder-owned paths.
- Audio-mode messages store `{audioPath,waveformData,audioDurationSeconds}` on the message. Generated
  PCM files live under `Documents/audio-cache/<conversationId>/<messageId>.pcm`. Clearing the audio
  cache removes every clip; chat deletion does not currently own per-message audio cleanup.
- Current StateSync message records carry content, reasoning, and completed tool artifacts. They do
  not carry attachments, generation metadata, audio metadata, gallery records, or media bytes.
- Generated-image deletion removes metadata and its PNG through the native generator. Deleting a
  chat removes generated images scoped by `conversationId`, but attachment and audio-file lifecycle
  is not yet centralized.

Current cross-host state: generated media and message attachments use the shared portable-file
contract and host materializers. Desktop also owns explicit completed Desktop/Downloads watchers;
Mobile owns new iOS screenshot events and will only add downloads when an Off Grid download owner
can emit a real completion event.

### P3 — Five-device personal mesh

- Enforce a maximum of five active devices. Users can inspect and evict a device from either host.
- Support gossip/anti-entropy through non-origin peers, capabilities/presence, per-peer policy, and
  duplicate-free route selection across those five devices.
- Shared owns topology/routing. Hosts surface peer status and capabilities.
- This precedes using the mesh for remote-compute selection.

### P4 — Track A portable backup/export-import

- This remains intended and is separate from realtime Sync.
- Desktop core implements the public BackupEngine adapters/UI. Mobile rewrites the stale Track-A
  adapters against current stores instead of merging the old branch.
- The versioned envelope is shared; host payloads may differ and imports regenerate embeddings.

### P5 — Remote search, inference, and model routing

- Shared provides streaming RPC with request IDs, cancellation, backpressure, and capabilities.
- Desktop proxies universal search plus gateway/model runtimes.
- Mobile prefers a capable nearby Desktop, falls back immediately on disconnect, and visibly labels
  where execution occurred. No raw unauthenticated ports.

### P6 — On-demand large media and files

- In-scope shared-file bytes currently replicate through the visible resumable transfer queue after
  category consent; they are not metadata-only placeholders.
- Future media kinds may use on-demand fetch, but must reuse the shared controlled-file and transfer
  owners. Hosts retain checksum, resume, size, admission, storage, and rendering.
- Complete physical full-size model transfer, interruption/resume, checksum, and receiver-load gates
  in parallel.

### P7 — Ambient sharing and platform parity

- Shared controlled-file policy/ordering, provenance, queue serialization, and anti-loop behavior
  are landed. Finish physical iOS/macOS gates before adding Android native sources.
- Add Android nearby transport and Windows firewall/transport packaging.
- Close clipboard and background-lifecycle parity across platforms.

## Security note (logged for GA)

Crypto is sound (NaCl secretbox authenticated encryption; passphrase never on the wire; local LAN
or Apple peer-to-peer transport only).
Hardening item before GA: the KDF is a hand-rolled iterated SHA-512 ("PBKDF2-like") — pair with a
high-entropy auto-generated code + a real KDF (scrypt/argon2) so a weak passphrase isn't brute-forceable.

## Branch

`feat/sync-integration-phase0` (mobile). State-sync checkpoints:
`f50dea2c` (stable IDs), `b8abb869` (withhold unsafe project tombstones),
Pro `07e06ee2` and core `78df85ba` (model settings), and `69f16ccb`
(non-destructive project deletion). Pro `afca0d7e` and core `9ced2a55` distinguish Debug Pro from
real Keygen device activation. Core `9deceba5` gives knowledge documents a stable cross-device
identity and records their lifecycle at the RAG owner. Pro `f8b0e91a` and core `b51d80a4` complete
knowledge-document state/file convergence using the shared coordinator and MIME registry.
Recent reliability/proximity checkpoints: shared heartbeat `4dbcdd7`, shared scheduler `0efce95`,
shared multi-transport `26c0b09`, Pro `8c1f599f`, and core `5762f0a5`.
Recent personal-mesh/ambient checkpoints: shared provenance `a4bd0ff` + `abc49ce`, shared route/cap
`be2106f`, shared controlled files `2c02b05`, Pro `11bae32f`, `5522acac`, `261e0092`,
`b5fdc021`, `a770ddb9`, and core `ff2bea6e`, `cda022df`, `fa566a90`, `02edb640`,
`fb3924c8`, plus shared ambient policy `306279a`, Pro `ef745bc5`, and core `621dc12b`.
Latest pairing/knowledge/UI recovery checkpoints: shared `8f094f4` and `584f6aa`, Mobile Pro
`8f6da549` and `3d1a2e2c`, root `f02cf775`. The current Debug app was rebuilt, installed, and
launched on physical iOS without clearing its profile.
Focused no-mockist coverage is green for the ambient Ask/refuse/retry journey and the native
app-owned screenshot copy. Full hooks, pre-push, push, and automated device driving remain deferred
until the manual iOS/macOS gate closes.

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
