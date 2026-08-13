# Sync Feedback Release Repair Plan

Date: 2026-08-13  
Status: In progress  
Source acceptance plan: [MANUAL_TEST_2026-08-12.md](./MANUAL_TEST_2026-08-12.md)

## Objective

Repair the release branches against `main`, remove the known failure paths, and verify the complete
Desktop and Mobile journeys. Work is sequential. A later phase does not start until the prior phase
has a green focused gate.

The release repositories are:

- `shared`
- `desktop/pro`
- `desktop`
- `mobile/pro`
- `mobile`

Top-level `sync` is separate EasyShare work. `website` has no tracked release delta. Neither is part
of this release train.

## Completion language

Each item has three independent states:

- **Code**: the implementation exists.
- **Wired**: every consumer uses the canonical owner and the replaced path is gone.
- **Verified**: automated gates and the real user journey pass.

An item is complete only when all three states are true.

## Engineering rules

1. Give each fact, identity, rule, state machine, and resource one canonical owner.
2. Make UI and host representations read-only projections of that owner.
3. Keep business rules in services and pure shared policy. UI sends intent only.
4. Depend on typed contracts at filesystem, native, persistence, network, and model boundaries.
5. Reuse an existing abstraction when it is the correct owner. Do not add parallel helpers.
6. Remove the replaced path after migration. Compatibility aliases can exist only at input
   boundaries.
7. Fake only uncontrollable external boundaries. Do not mock Off Grid services, stores, hooks, or
   components.
8. Land one coherent, green commit per owning seam. Do not mix unrelated fixes.
9. Use merge commits. Do not squash.
10. Record evidence in this document after every completed gate.

## Canonical owners

| Fact | Canonical owner |
| --- | --- |
| File existence and metadata | Mobile filesystem adapter |
| Receive categories and legacy aliases | `@offgrid/sync` receive policy |
| Transfer state, visibility, and actions | `@offgrid/sync` transfer service |
| Persisted transfer order | Transfer-history contract |
| Device actions | Shared device-capability projection |
| Model origin | Validated transfer manifest |
| Current network endpoint | Desktop discovery service |
| Pending chat attachments | Desktop shared-file service |
| Chat edit and regeneration | Desktop conversation service |
| Clipboard consent and copy classification | Native clipboard service |
| Busy-state visuals | Shared design-system loader primitive |

## Sequential work plan

### Phase 0 - Freeze and record the baseline

- [x] Identify the five release repositories.
- [x] Record the current release branch heads.
- [x] Confirm that top-level `sync` and `website` are outside this release.
- [x] Make every release worktree clean, including the final Mobile Pro submodule pointer.
- [ ] Record the exact full-suite baseline after the filesystem test boundary is repaired.

Baseline heads at plan creation:

| Repository | Branch | Head |
| --- | --- | --- |
| `desktop` | `release/sync-feedback` | `79bb06ffd833` |
| `desktop/pro` | `release/sync-feedback` | `bfca9bdf07d7` |
| `mobile` | `release/sync-feedback` | `10e357f82849` |
| `mobile/pro` | `release/sync-feedback` | `5a4769caa8d5` |
| `shared` | `release/sync-feedback` | `966dd99ce0bd` |

### Phase 1 - Close the Mobile filesystem crash class

Decision: Option A. Production must not call `RNFS.stat`.

- [x] Remove executable production `RNFS.stat` calls.
- [ ] Confirm all file readers use the one filesystem adapter.
- [x] Add one faithful native-filesystem fake under the test harness.
- [ ] Make tests declare a directory tree once and derive parent listings from it.
- [ ] Replace test-local RNFS fakes with the shared boundary fake.
- [ ] Add an architecture rule that rejects future production `RNFS.stat` calls.
- [ ] Align `llama.rn` and the CocoaPods graph on version 0.13.
- [ ] Run Mobile lint and TypeScript.
- [ ] Run the complete Mobile test suite.
- [ ] Run the iOS simulator build.
- [ ] Verify startup model scan and debug-log flush on a physical iPhone.
- [ ] Verify the same filesystem journeys on a physical Android device.

Exit condition: zero executable production `RNFS.stat` calls, all Mobile suites pass, native builds
pass, and both physical-device journeys pass.

### Phase 2 - Make receive policy one contract

- [ ] Define one canonical category for each record kind.
- [ ] Treat old underscore IDs as input migration aliases only.
- [ ] Generate UI rows and admission decisions from the same catalog.
- [ ] Remove duplicate Generated media and Message attachments rows.
- [ ] Test old settings, new settings, rendered rows, and actual admission.

Exit condition: one switch controls one content type, and Off always blocks it.

### Phase 3 - Make transfer history authoritative

- [ ] Preserve transfer `kind` during all updates.
- [ ] Keep hidden project transfers hidden when live progress exists.
- [ ] Persist `kind` in Desktop SQLite.
- [ ] Derive Retry, Cancel, and Dismiss from executable service commands.
- [ ] Make restored Mobile Cancel update durable history without a live manager.
- [ ] Remove Retry when its source is not durably available.
- [ ] Persist byte progress at a bounded interval and persist every state transition.
- [ ] Define one stable order for memory, adapters, SQLite, retention, and restart.
- [ ] Verify manual tests 9.3, 9.4, 9.6, and 9.7 through real stores and restarts.

Exit condition: history, live progress, available actions, and restart projection agree.

### Phase 4 - Fix the remaining Shared contracts

- [ ] Validate model-origin `repoId`, `revision`, and `path` at the manifest boundary.
- [ ] Keep compatibility with senders that omit origin.
- [ ] Reject malformed origin values before persistence.
- [ ] Base Reconnect and Rename on a real pairing credential.
- [ ] Keep Evict available for license-only rows.

Exit condition: every displayed action is executable and every stored model origin is valid.

### Phase 5 - Fix Desktop discovery

- [ ] Make the discovery service own one current endpoint object.
- [ ] Update it when the network interface changes.
- [ ] Build both the listening socket and Bonjour TXT record from it.
- [ ] Test the re-advertised TXT address, not only the watcher callback.
- [ ] Verify Wi-Fi to Ethernet and Ethernet to Wi-Fi without app restart.

Exit condition: peers always dial the current Desktop address.

### Phase 6 - Fix Desktop pending attachments and chat edits

- [ ] Make the shared-file service own a replayable pending-file snapshot.
- [ ] Deliver the current snapshot to every new subscriber before later updates.
- [ ] Preserve attachment identity and metadata during edit.
- [ ] Put edit, persistence, history construction, and regeneration behind one conversation command.
- [ ] Remove model-history construction from stale React state.
- [ ] Verify late Chat mount, edit plus attachment sync, reopen, and regeneration.

Exit condition: loaders survive late mount, edited attachments sync, and the model receives only the
edited prompt.

### Phase 7 - Fix Desktop thinking capability

- [ ] Reset model capability state on every reload.
- [ ] Make the active model session own its thinking dialect.
- [ ] Bound `/props` with a timeout and explicit failure state.
- [ ] Never reuse a previous model's dialect after probe failure.
- [ ] Verify Muse to Qwen and Qwen to Muse for success, failure, and timeout.

Exit condition: the Thinking control always sends the active model's supported option.

### Phase 8 - Fix Android clipboard consent and classification

- [ ] Put Clipboard Sync enabled state in the native clipboard service.
- [ ] Check consent before the accessibility service reads selected text.
- [ ] Clear selection memory when sync is disabled.
- [ ] Require verified text metadata before selection fallback.
- [ ] Ignore image, file, and unknown clipboard events.
- [ ] Add native tests for Off, non-text, stale selection, and valid text fallback.
- [ ] Verify manual test 3.6 on a physical Android device.

Exit condition: non-text copies stay quiet and selected text is not read or sent while Off.

### Phase 9 - Fix vision-repair provenance

- [ ] Pass repository, revision, and path through the provider contract.
- [ ] Use the recorded revision for tree listing and download URLs.
- [ ] Do not default a pinned transferred model to `main`.
- [ ] Capture one real Hugging Face boundary response and replay it offline.
- [ ] Verify a tag or commit receives its matching projector.

Exit condition: repair preserves the transferred model's exact provenance.

### Phase 10 - Unify loading states

- [ ] Keep Mobile `LoadingDots` as the one Mobile implementation.
- [ ] Add a production-ready web `LoadingDots` primitive to the component library.
- [ ] Include tokens, ARIA, and reduced-motion behavior.
- [ ] Consume it through one thin Desktop adapter.
- [ ] Replace rotating rings and local dot implementations in the manual-test scope.
- [ ] Add a real pending state to Share and disable duplicate intent while pending.
- [ ] Verify all manual-test C states by screenshot and interaction.

Exit condition: every target surface uses the same three-dot behavior and no pending action can be
submitted twice.

### Phase 11 - Full verification

- [ ] Build and test `shared`.
- [ ] Build and test `desktop/pro`.
- [ ] Build, test, and package `desktop`.
- [ ] Build and test `mobile/pro`.
- [ ] Lint, typecheck, test, and build Android and iOS in `mobile`.
- [ ] Run physical iOS and Android journeys.
- [ ] Run the complete manual test document from a clean install.
- [ ] Run the restart, reconnect, and network-change cases again.
- [ ] Inspect every required screenshot and interaction recording.

### Phase 12 - PR and review train

- [ ] Push `shared` and finish its review loop.
- [ ] Push `desktop/pro` and finish its review loop.
- [ ] Push `mobile/pro` and finish its review loop.
- [ ] Push `desktop` and finish its review loop.
- [ ] Update the Mobile Pro pointer, push `mobile`, and finish its review loop.
- [ ] Merge in dependency order with merge commits.

## Progress log

### 2026-08-13 - Plan created

- Created this progress source of truth.
- Confirmed the five release repository heads shown above.
- Confirmed that Mobile has no executable production `RNFS.stat` call. One explanatory comment still
  names the old call.
- Current Mobile worktree change is the `pro` submodule pointer.
- Phase 1 remains in progress because the full test boundary migration and gates are not yet green.

### 2026-08-13 - Draft PRs published

- Published the exact local release branch heads as draft PRs so the complete deltas can be reviewed.
- Skipped the pre-push hooks for this publication at the owner's explicit direction. The skipped or
  failed gates remain open work. No PR is merge-ready.
- Uploaded the Desktop branch's 88 referenced Git LFS objects before GitHub accepted the branch.

| Repository | Draft PR |
| --- | --- |
| `shared` | [off-grid-ai/shared#3](https://github.com/off-grid-ai/shared/pull/3) |
| `desktop/pro` | [off-grid-ai/desktop-pro#41](https://github.com/off-grid-ai/desktop-pro/pull/41) |
| `desktop` | [off-grid-ai/OGAD#80](https://github.com/off-grid-ai/OGAD/pull/80) |
| `mobile/pro` | [off-grid-ai/mobile-pro#50](https://github.com/off-grid-ai/mobile-pro/pull/50) |
| `mobile` | [off-grid-ai/OGAM#628](https://github.com/off-grid-ai/OGAM/pull/628) |

### 2026-08-13 - Mobile filesystem boundary, incremental verification

- Added one stateful, directory-based native filesystem boundary in
  `__tests__/harness/nativeFileSystem.ts`.
- Updated file-sharing validation and the Oute/Qwen audio asset suites to use that boundary.
- Pushed commits `f093c65f`, `3379b68b`, and `783dc27f` to Mobile draft PR #628.
- Switched to one defect, one focused gate, one commit, and one push so each change can be verified
  manually before the next defect starts.
- Repaired the debug-log rotation suite. It now uses real stored bytes and parent directory entries;
  all 12 tests pass, including rotation after the 5 MB limit.

## Current status

| Phase | Code | Wired | Verified | State |
| --- | --- | --- | --- | --- |
| 0. Baseline | Partial | Partial | No | In progress |
| 1. Filesystem boundary | Partial | No | No | In progress |
| 2. Receive policy | No | No | No | Pending |
| 3. Transfer history | No | No | No | Pending |
| 4. Shared contracts | No | No | No | Pending |
| 5. Desktop discovery | No | No | No | Pending |
| 6. Desktop chat | No | No | No | Pending |
| 7. Thinking capability | No | No | No | Pending |
| 8. Android clipboard | No | No | No | Pending |
| 9. Vision repair | No | No | No | Pending |
| 10. Loading states | No | No | No | Pending |
| 11. Full verification | No | No | No | Pending |
| 12. PR train | No | No | No | Pending |
