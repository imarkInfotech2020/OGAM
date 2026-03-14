# QA Test Plan — Fixes TODO

Last validated: 2026-03-14

## Code Fixes

### 1. Duplicate server prevention (Section 6.6)
- **File:** `src/stores/remoteServerStore.ts`
- Add URL normalization + duplicate endpoint check in `addServer()`
- Normalize: lowercase, strip trailing slashes, strip `/v1` suffix

### 2. Thinking capability badge not rendered (Section 7.2)
- **Files:**
  - `src/components/ModelSelectorModal/TextTab.tsx` — add badge after tool calling badge (~line 168)
  - `src/components/ModelSelectorModal/remoteStyles.ts` — add `thinkingBadge` style
- `supportsThinking` is detected and tracked in `RemoteModelCapabilities` but never shown in UI

### 3. Flagship tier card missing (Section 23.1)
- **File:** `src/screens/DeviceInfoScreen.tsx` — add 4th card in Compatibility section (~line 70-86)
- `getDeviceTier()` in `src/services/hardware.ts` returns `'flagship'` for 8GB+ but UI only renders 3 cards
- Format: "Flagship (8GB+)" — "All models + largest"

## Doc Fixes (test plan is wrong, code is right)

### 4. Section 1.3 — wrong title
- Test plan says: "Download Your First Model"
- Actual code: "Set Up Your AI"

### 5. Section 1.3 — wrong RAM filtering threshold
- Test plan says: models where min RAM < 60% of device RAM
- Actual code: `model.minRam <= totalRam` (any model that fits, no 60% threshold)

### 6. Section 6.10 — LocalAI port 8080 not scanned
- Test plan says: scans ports 11434, 1234, 8080
- Actual code: only 11434 (Ollama) + 1234 (LM Studio). See `PROVIDERS` array in `src/services/networkDiscovery.ts`
- Also: timeout is 500ms not 300ms

### 7. Section 6.7 — health not auto-tested on app load
- Test plan says: "All servers auto-tested on load"
- Actual code: health only updated when user opens RemoteServersScreen (useEffect auto-tests all servers)
- `initializeProviders()` is called at app startup (App.tsx) but doesn't update `serverHealth`

### 8. Section 19.5 — iOS Gallery save path
- Test plan says: saves to `Documents/OffgridMobile_Images`
- Actual code (Gallery): opens native iOS Share sheet via `Share.share({ url: ... })`
- `Documents/OffgridMobile_Images` path is only used by ChatScreen's `saveImageToGallery`, not Gallery
- Timestamp format is ISO 8601 not `YYYY-MM-DD_HHmmss`

### 9. Section 23.1 — RAM tier boundaries
- Test plan says: Low (0-3GB), Medium (3-6GB), High (6-8GB), Flagship (8GB+)
- Actual code: Low (<4GB), Medium (<6GB), High (<8GB), Flagship (>=8GB)

### 10. Section 26.1 — image share prompt trigger
- Test plan says: "Any image generation" (every time)
- Actual code: same pattern as text — 2nd + every 10th (`count === 2 || count % 10 === 0`)
- Both use independent counters but same `shouldShowSharePrompt()` function in `src/utils/sharePrompt.ts`

### 11. Section 27.2 — ping is a stub
- Test plan says: "Ping button — each 15 s"
- Actual code: `src/services/PingService.ts` generates random values, does not actually ping

## Validation Checklist (run this next time)

1. Read each section of the test plan
2. Find the corresponding source file
3. Verify the described behavior matches the actual code
4. Check types/interfaces match expected values
5. Verify UI rendering matches described badges/cards/screens
6. Check trigger conditions (when things happen) match described flow
7. Verify platform-specific behavior (iOS vs Android)
