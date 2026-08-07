# Off Grid Mobile — `@offgrid/sync` integration plan

Integrate the device-to-device Sync engine into Off Grid Mobile. Built in parallel with a desktop
session; both converge automatically because **both apps consume the same public `@offgrid/sync`
package** — the wire protocol, mDNS service type (`_offgrid._tcp.local`), crypto, and op-log schema
all live in the package, so there is no per-app protocol to keep in sync and no rework.

## Non-negotiable principles
- **Consume the package, never fork it.** All protocol / crypto / state / transfer logic stays in
  `@offgrid/sync`. Mobile adds only thin, app-level glue.
- **Public engine, Pro feature.** The engine is public (auditable transport + NaCl crypto). The
  mobile Sync *experience* (UI, orchestration, entitlement gate) lives in `pro/`, gated like MCP/TTS.
- **Native glue is injected.** The package's RN adapters (`@offgrid/sync/rn`, `/rn-discovery`) take
  `react-native-tcp-socket`, `react-native-zeroconf`, and a Buffer byte-codec from the host; the
  package never imports RN.
- **Every phase: own PR, hygiene + real tests + on-device verification on BOTH iOS and Android.**

## v1 scope (device ↔ device, phone ↔ desktop)
1. **State sync** — chats/conversations, workspace/projects, model settings (op-log + state-sync).
2. **Model transfer** — move downloaded model files (GGUF / CoreML) between phone and desktop.
3. **Ambient sharing** — over the same encrypted transport.

---

## Phase 0 — Foundation: transport live (nothing syncs until this works)
- [x] Add `@offgrid/sync` as a `file:../shared/packages/sync` dep; **node resolves it** (`VERSION 0.0.1`).
- [ ] **Metro resolution** — Metro must resolve the package (outside project root) and its subpath
      exports (`./rn`, `./rn-discovery`, `./portable`): add `../shared/packages/sync` to
      `watchFolders`, ensure `unstable_enablePackageExports`. De-risk with a bundle probe.
- [ ] **Native modules** — `react-native-tcp-socket` (TCP) + `react-native-zeroconf` (Android NSD /
      iOS Bonjour): install, pod install, gradle, **native rebuild** both platforms.
- [ ] **Injection glue** — a mobile `SyncTransport` that wires `TcpSocket` + `Zeroconf` + a Buffer
      codec into the package's RN adapters and constructs the engine + `DiscoveryOrchestrator`.
- [ ] **Minimal dev surface** — discovered-devices list → start engine → pairing handshake.
- [ ] **VERIFY on-device (both platforms):** phone discovers desktop (or other phone) over mDNS and
      completes the **encrypted NaCl handshake**. Read `[SYNC]` trace from the device log.

## Phase 1 — State sync (chats / projects / model settings)
- Map mobile stores (chat conversations, projects, `appStore` settings) → op-log ops via
  `@offgrid/sync` `state-sync`; apply inbound ops with LWW.
- Verify convergence phone ↔ desktop on-device (edit on one, appears on the other).

## Phase 2 — Model transfer
- Wire `@offgrid/sync` transfer to send/receive downloaded model files with progress + resume.
- Verify a real multi-GB model transfers phone ↔ desktop and **loads** on the receiver.

## Phase 3 — Ambient sharing
- Wire ambient sharing over the transport (the transport-agnostic layer the desktop session flagged
  as needing `@offgrid/sync`'s transport wired first).

## Cross-cutting
- Pro entitlement gate. Device cap (Pro-only, 5-device personal mesh) via the package's `cap.ts` + Keygen.
- Feature code in `pro/`; native modules + injection glue in core (native is app-level).
