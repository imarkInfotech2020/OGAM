# Off Grid Mobile — QA Test Plan

> Every flow in the app, written as human-readable steps.
> A manual QA tester should be able to pick this up and know exactly what to do.

---

## How to use this document

- **Precondition** = what must be true before you start the test
- **Steps** = do these in order, one by one
- **Expected** = what you should see after each step
- **Priority** = P0 (critical, test every build), P1 (important, test every release), P2 (nice-to-have, test weekly)

---

# PART A: APP LIFECYCLE & FIRST RUN

## 1. FIRST LAUNCH (Fresh Install)

### 1.1 First launch — onboarding appears (P0)

| Precondition | App freshly installed, no prior data |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Launch the app for the first time | Onboarding screen appears (not Home). Slide content with animated keyword, accent line, title, and description |
| 2 | Observe bottom of screen | Dot indicators show current slide. "Skip" button top-right. "Next" button at bottom |
| 3 | Swipe left through all slides | Each slide animates in. Dots track progress |
| 4 | On the last slide, observe button text | Says "Get Started" instead of "Next" |
| 5 | Tap "Get Started" | Navigates to Model Download screen (not Home) |

### 1.2 First launch — skip onboarding (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | Fresh install, launch app | Onboarding appears |
| 2 | Tap "Skip" on the first slide | Goes directly to Model Download screen |

### 1.3 Model download screen — first time (P0)

| Precondition | Just completed/skipped onboarding |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Observe the screen | "Download Your First Model" title. Device info shown (RAM, device tier). Recommended models listed based on device capability |
| 2 | Models are filtered by device RAM | Only models that fit in ~60% of device RAM shown |
| 3 | Tap "Skip for Now" | Goes to Home screen. Setup card shows "Download a text model to start chatting" |

### 1.4 Model download screen — download first model (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | On model download screen, tap a recommended model card | Card shows model name with download button |
| 2 | Tap the download icon | Download starts. Progress bar with percentage appears |
| 3 | Wait for download to finish (may take several minutes) | "Success" alert appears |
| 4 | Tap "OK" | Navigates to Home screen. Model available in picker |

### 1.5 Second launch — onboarding does NOT appear (P0)

| Precondition | App was previously launched and onboarding completed/skipped |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Kill the app and relaunch | Home screen appears directly (no onboarding, no model download screen) |
| 2 | If a model was previously loaded | Model card shows the previously active model. "New Chat" button visible |

### 1.6 Second launch — model auto-state (P1)

| Precondition | Previously had a text model loaded, then killed the app |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Relaunch app | Home screen shows. Model cards show the previously selected models (but model may need re-loading into memory) |

---

## 2. APP LOCK & SECURITY

### 2.1 Enable passphrase lock (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings tab → Security | Passphrase Lock toggle visible (off by default) |
| 2 | Toggle ON | Passphrase Setup screen opens with: lock icon, "New Passphrase" input, "Confirm Passphrase" input, tips section |
| 3 | Enter "ab" (too short) and tap submit | Error: minimum 6 characters |
| 4 | Enter a 51-character passphrase | Error: maximum 50 characters |
| 5 | Enter "test123" in both fields but make them different | Error: passphrases don't match |
| 6 | Enter "test123" in both fields correctly | Tap "Enable Lock". Success alert. Returns to Security screen, toggle shows ON |

### 2.2 Lock screen on app reopen (P0 when enabled)

| Precondition | Passphrase lock enabled |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Kill the app from app switcher | App closes |
| 2 | Reopen the app | Lock screen appears: lock icon, "App Locked" title, passphrase input field, "Unlock" button |
| 3 | Enter correct passphrase and tap Unlock | App unlocks, Home screen appears |

### 2.3 Failed unlock — lockout after 5 attempts (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | On lock screen, enter wrong passphrase | Error message. Shows "4 attempts remaining" |
| 2 | Enter wrong passphrase 3 more times | Count decreases each time: "3 remaining", "2 remaining", "1 remaining" |
| 3 | Enter wrong passphrase one more time (5th failure) | "Too many failed attempts" message. Countdown timer starts at ~5:00 (MM:SS format) |
| 4 | Observe timer | Counts down in real-time every second |
| 5 | Wait for timer to reach 0:00 | Input becomes available again. Attempts reset |
| 6 | Enter correct passphrase | App unlocks |

### 2.4 Change passphrase (P2)

| Precondition | Passphrase lock enabled |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → Security → "Change Passphrase" | Passphrase Setup screen with an extra "Current Passphrase" field |
| 2 | Enter wrong current passphrase | Error: incorrect |
| 3 | Enter correct current passphrase + new passphrase + confirm | Tap "Change Passphrase". Success. New passphrase is now active |

### 2.5 Disable passphrase lock (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → Security → toggle OFF | Confirmation alert |
| 2 | Confirm | Lock disabled. App no longer shows lock screen on reopen |

---

# PART B: MODEL MANAGEMENT

## 3. TEXT MODEL — SEARCH, DOWNLOAD, LOAD

### 3.1 Search for a text model (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | Go to Models tab | Models screen with search bar, filter toggle, model list (or empty if first visit) |
| 2 | Tap the search input | Keyboard opens |
| 3 | Type "SmolLM2-135M-Instruct-GGUF unsloth" | Text entered |
| 4 | Tap "Search" button | Loading indicator. Results populate below |
| 5 | Results show model cards | Each card shows: model name, author, credibility badge (if any), compact layout |

### 3.2 Download a text model — first time (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | From search results, tap a model card | Model detail view: author, credibility badge, description, downloads count, likes count, "Available Files" section |
| 2 | Observe available files | Each file shows: filename (.gguf), file size, quantization type. Files larger than 60% of device RAM are hidden |
| 3 | Tap the download icon on a file (e.g. Q4_K_M) | Download starts. Progress bar on the card. Bytes downloaded / total shown |
| 4 | Wait for completion | "Success" alert |
| 5 | Tap "OK" | Model card now shows as downloaded |

### 3.3 Download a vision-capable model (with mmproj) (P1)

| Precondition | Search for a vision model (e.g. one with mmproj files) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Tap the model, observe files | Some files show "Vision files include mmproj" note |
| 2 | Tap download on a vision file | Two downloads start in parallel: main model file AND mmproj file |
| 3 | Wait for both to complete | Success alert. Model marked as vision-capable |

### 3.4 Re-download / model already exists (P2)

| Precondition | Model file already downloaded |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to same model in search | Model detail shows. File that was already downloaded shows as "downloaded" (no download button, may show checkmark) |
| 2 | Download button not available for existing files | Prevents duplicate download |

### 3.5 Cancel a download mid-progress (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Start downloading a model | Progress bar appears with X (cancel) button on the card |
| 2 | Tap the cancel (X) button | Download stops. Progress removed. File cleaned up |

### 3.6 Download with network failure (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Start a download | Progress appears |
| 2 | Turn off WiFi / airplane mode | Error alert after timeout |
| 3 | Turn WiFi back on | Can retry the download |

### 3.7 Background download — switch apps (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Start a model download | Progress bar shown |
| 2 | Switch to another app (don't kill) | Download continues in background |
| 3 | Switch back to Off Grid | Progress bar reflects actual progress (not stale) |

### 3.8 Load a text model from Home picker (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | On Home screen, tap the Text model card | Model picker sheet slides up. Shows "Text Models" header, list of downloaded local models, and remote models section (if servers configured) |
| 2 | Tap a downloaded model | Picker closes. Full-screen loading overlay: "Loading Text Model", model name, "Please wait..." |
| 3 | Wait for loading | Overlay disappears. Text card shows model name, quantization, estimated RAM. "New Chat" button appears |

### 3.9 Low memory warning when loading (P1)

| Precondition | Device has limited available RAM, model is close to available memory |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Select a large model from picker | Warning alert with estimated memory usage |
| 2 | Tap "Load Anyway" | Model loads (may be slower) |
| 3 | Alternative: Tap "Cancel" | Returns to picker without loading |

### 3.10 Unload a text model (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | With text model loaded, tap Text model card | Picker opens. "Unload current model" button visible (red, power icon) |
| 2 | Tap "Unload current model" | Model unloads. Home shows setup card again. "New Chat" button disappears |

### 3.11 Filter text models (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | On Models tab, tap the filter icon | Filter section expands: parameter dimensions, type, source, quantization |
| 2 | Select a filter | Model list updates. Only matching models shown |
| 3 | Tap "Clear filters" or remove selections | Full list restored |

### 3.12 Import a local .gguf file (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | On Models screen, tap "Import Local File" | File picker opens |
| 2 | Select a .gguf file from device storage | Import progress card appears |
| 3 | Wait for import | Model added to downloaded list |

---

## 4. IMAGE MODEL — DOWNLOAD, LOAD, BACKENDS

### 4.1 Download an image model — CPU backend (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Models tab → "Image Models" tab | Image model cards. Each shows: display name, author, size, compatibility info |
| 2 | Find a model labeled "(CPU)" | Compatible with all devices |
| 3 | Tap download icon | Download starts with progress bar |
| 4 | Wait for completion | "Success" alert. Model auto-activated as active image model |

### 4.2 Image model compatibility warnings (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | On image models list, find a model marked incompatible | Shows reason: "Requires NPU", "Too large for device", or similar |
| 2 | Download button is disabled or not shown | Cannot download incompatible model |

### 4.3 Image model — NPU/CoreML backend (P2)

| Precondition | Device with Apple Neural Engine or Qualcomm NPU |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | On Image Models tab, observe NPU-compatible models | Models show NPU/CoreML badge |
| 2 | Download an NPU model | Downloads CoreML/QNN-specific files |
| 3 | Load the model | Uses hardware accelerator (faster than CPU) |

### 4.4 Load image model from Home picker (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | On Home, tap the Image model card | Picker opens showing "Image Models" header |
| 2 | Tap a downloaded image model | Loading overlay: "Loading Image Model". After loading, Image card shows model name and style (e.g. "Realistic") |

### 4.5 Unload image model (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | With image model loaded, tap Image model card | Picker opens with "Unload current model" button |
| 2 | Tap "Unload current model" | Model unloaded. Card shows "Tap to select" |

### 4.6 Eject all models (P1)

| Precondition | At least one model loaded (text or image) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | On Home, tap "Eject All Models" | Confirmation alert |
| 2 | Confirm | All models unloaded. Both cards show empty state. "Eject All" button disappears |

### 4.7 "Show Recommended Only" toggle (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | On Image Models tab, toggle "Show Recommended Only" | List filters to only recommended models for your device tier |
| 2 | Toggle off | Full list shown again |

---

## 5. DOWNLOAD MANAGER

### 5.1 View active and completed downloads (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Models screen → tap downloads icon (top-right) | Download Manager screen. "Active Downloads" section (with progress bars if any). "Completed Downloads" section with all downloaded models |
| 2 | Each completed model shows | Model name, file name, file size, delete button |

### 5.2 Delete a model from Download Manager (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap trash icon on a completed model | Confirmation: "Delete" |
| 2 | Confirm | Model deleted. Storage freed. If model was active, it gets unloaded |

### 5.3 Repair vision (mmproj) file (P2)

| Precondition | Vision model downloaded but mmproj file missing or corrupt |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | In Download Manager, observe "Repair Vision" button (eye icon, orange) on the affected model | Button visible |
| 2 | Tap "Repair Vision" | Re-downloads mmproj file. Progress shown |
| 3 | Wait for completion | Vision capability restored |

### 5.4 Orphaned files cleanup (P2)

| Precondition | Files exist in model directory that don't belong to any downloaded model (e.g. from failed downloads) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → Storage | "Orphaned Files" section appears (if any exist) |
| 2 | Observe orphaned files | Listed with names and sizes |
| 3 | Tap clean up / delete | Files removed. Storage freed |

---

# PART C: REMOTE SERVERS

## 6. REMOTE SERVER MANAGEMENT

### 6.1 Add an Ollama server (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings tab → Remote Servers | Server list (or empty state with "Add Server" button) |
| 2 | Tap "Add Server" | Modal opens: Name field, Endpoint URL field, notes field, API key field (optional) |
| 3 | Enter name: "My Ollama" | Text entered |
| 4 | Enter endpoint: "http://192.168.1.100:11434" | Text entered. No public network warning (it's a private IP) |
| 5 | Tap "Test Connection" | Loading indicator. Tests `/v1/models`, falls back to `/api/tags`. Shows "Connected — Xms" or error |
| 6 | Tap "Save" | Modal closes. Server appears in list with green "online" indicator |

### 6.2 Add an LM Studio server (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Add server with endpoint "http://192.168.1.100:1234" | Server type auto-detected as LM Studio via `/v1/models` response |
| 2 | Models fetched | Shows all loaded models from LM Studio |

### 6.3 Add server with API key (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Add server with API key field filled | Key stored securely in device keychain (never logged or displayed) |
| 2 | Test connection | Authorization: Bearer header sent. Connection succeeds if key valid |

### 6.4 Public endpoint warning (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Enter a public URL (e.g. "https://api.example.com") | Warning shown: endpoint is not on private network |

### 6.5 Invalid endpoint (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Enter "not-a-url" as endpoint | Validation error: invalid URL format |
| 2 | Enter valid URL but unreachable host | Test connection fails: timeout/connection refused. Server saved but shown as "offline" (red indicator) |

### 6.6 Duplicate server prevention (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Try to add a server with the same endpoint as an existing one | Warning: server already exists (deduplication by normalized endpoint) |

### 6.7 Server health monitoring (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Open Remote Servers screen with servers configured | All servers tested automatically on screen load. Status updates: green = online, red = offline |
| 2 | Manually tap "Test Connection" on a server | Shows latency (e.g. "Connected — 45ms") or error message |

### 6.8 Delete a remote server (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Swipe left on a server (or tap delete) | Confirmation alert |
| 2 | Confirm | Server removed. If it was the active server, active server cleared and models go back to local |

### 6.9 Scan local network for servers (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap "Scan Network" | Scanning progress indicator. Scans common ports: 11434 (Ollama), 1234 (LM Studio), 8080 (LocalAI) |
| 2 | Wait for scan (~5-8 seconds) | Discovered servers auto-added to list. Or "No servers found" |
| 3 | Existing servers are skipped | No duplicates added |

---

## 7. REMOTE MODEL USAGE

### 7.1 Select a remote text model (P1)

| Precondition | At least one remote server configured and online |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Home → tap Text model card | Picker opens. Below local models: "Remote Models" section with server name header. Models listed from remote server |
| 2 | Tap a remote model | Text card shows model name with a "wifi" badge and "Remote" label |
| 3 | "Add Server" button visible in picker | Tapping it navigates to Remote Servers screen |

### 7.2 Chat with remote model — streaming (P1)

| Precondition | Remote text model selected and server online |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Start a new chat and send a message | Message sent. Response streams in via SSE (Server-Sent Events) or NDJSON (Ollama). Tokens appear word-by-word |
| 2 | Observe generation metadata | Shows "Remote" as GPU backend. Token count is approximate (estimated from character count) |

### 7.3 Remote model with vision capability (P2)

| Precondition | Remote model detected as vision-capable (e.g. llava, moondream, pixtral) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Select vision-capable remote model | Model loads with vision support detected from name pattern |
| 2 | Attach a photo and send | Photo sent to remote server with message. Response describes the image |

### 7.4 Remote model with tool calling (P2)

| Precondition | Remote model supports function calling |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Enable tools in quick settings | Tools enabled |
| 2 | Ask "What time is it?" | Tool call sent to remote server. Tool results streamed back. Up to 5 tool iterations |

### 7.5 Remote model with thinking/reasoning (P2)

| Precondition | Remote model supports thinking (e.g. via `<think>` tags or Ollama `think` param) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Enable thinking in quick settings | Thinking toggle ON |
| 2 | Send a reasoning question | Thinking block appears (collapsible). Final response follows |

### 7.6 Remote server goes offline during generation (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Start generating with remote model | Streaming begins |
| 2 | Kill the remote server process | Generation fails. Error shown. Server health marked as "offline" |
| 3 | Chat input becomes ready again | Can switch to local model or retry |

### 7.7 Select a remote image model (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Home → tap Image model card | Picker shows remote image models (if server supports them) |
| 2 | Tap a remote image model | Image card shows model with wifi badge and "Remote - Vision" label |

### 7.8 Unload remote model — switch to local (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | With remote model active, open picker | "Unload current model" visible |
| 2 | Unload remote model | Active server cleared. Can now select a local model |
| 3 | Alternatively, tap a local model | Switches from remote to local seamlessly |

---

# PART D: CHAT & GENERATION

## 8. TEXT GENERATION — CORE FLOW

### 8.1 Send message and receive response (P0)

| Precondition | Text model loaded (local or remote), on Chat screen |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Observe chat screen | Header: model name (tap to change), settings icon. Empty state: "Start a Conversation". Input pill at bottom with text field |
| 2 | Tap text input | Keyboard opens. Placeholder "Message" disappears |
| 3 | Type "Hello, respond with one word: OK" | Text appears. Pill icons (attach, settings) collapse/hide. Send button (arrow) appears to the right |
| 4 | Dismiss keyboard, tap send | User message bubble (right-aligned). Stop button appears. Assistant message streams in (left-aligned) |
| 5 | Generation completes | Timestamp + generation time below message. Send button reappears (or voice button if input empty) |

### 8.2 Stop generation mid-stream (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | Send a long prompt: "Write a 2000 word detailed essay about AI" | Stop button (square icon) appears |
| 2 | Tap stop immediately | Generation halts. Partial response visible. Input becomes ready |

### 8.3 Multi-turn conversation (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Send "Say HELLO" → wait for response | First exchange complete |
| 2 | Send "Now say GOODBYE" | Model responds with context from first message |
| 3 | Scroll up | Earlier messages visible. Scroll-to-bottom button appears |
| 4 | Tap scroll-to-bottom button | Jumps to latest message |

### 8.4 Message actions — long press menu (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Long press on an assistant message | Action sheet slides up: Copy, Edit (if user message), Retry, Generate Image (if image model loaded) |
| 2 | Tap "Copy" | "Copied" alert. Text in clipboard |
| 3 | Long press again → "Retry" | Previous response replaced with new generation |
| 4 | Long press a user message → "Edit" | Edit sheet with original text. Modify and save → new response generated |

### 8.5 Generation metadata display (P2)

| Precondition | "Show Generation Details" enabled in Model Settings |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Send a message and get response | Below assistant message: GPU info (enabled/disabled + backend type), model name, tokens/sec, time to first token |
| 2 | For local models | Actual GPU info, exact token counts |
| 3 | For remote models | Shows "Remote" as backend, approximate token count |

### 8.6 Context compaction — very long conversation (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Have a conversation with 50+ messages | At some point, context compaction runs silently (summarizes early messages to free context window) |
| 2 | Continue chatting | Responses still coherent. No crash or visible error |

### 8.7 Message queue — rapid sends (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Send a message (generation starts) | Stop button visible |
| 2 | Type another message and send while first is generating | Queue indicator above input: "1 queued" with preview text |
| 3 | First generation completes | Queued message auto-sent. Queue count drops to 0 |
| 4 | Tap "Clear queue" | Queued messages discarded |

---

## 9. TOOL CALLING

### 9.1 Tool call with local model (P2)

| Precondition | Model supports tool calling, tools enabled in quick settings |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Tap quick settings (gear in input pill) → observe "Tools" row | Shows count of enabled tools |
| 2 | Tap "Tools" row | ToolPickerSheet opens listing available tools (web_search, calculator, get_current_datetime, get_device_info) |
| 3 | Enable/disable individual tools | Toggle each tool |
| 4 | Close tool picker and ask "What time is it?" | Tool call message appears: "Using get_current_datetime". Tool result follows (expandable). Then assistant response uses the result |

### 9.2 Expand tool result details (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | See a tool result message with chevron icon | Chevron indicates expandable |
| 2 | Tap the tool result row | Expands to show full tool output (markdown rendered) |
| 3 | Tap again | Collapses |

### 9.3 Multi-step tool use (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Ask something requiring multiple tool calls | Model may chain up to 5 tool iterations. Each call+result shown sequentially |

---

## 10. THINKING / REASONING

### 10.1 Thinking with local model (P2)

| Precondition | Model supports thinking (e.g. a model with `<think>` tag support) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Tap quick settings → toggle "Thinking" to ON | Badge shows "ON" |
| 2 | Send a reasoning question: "What is 17 * 23?" | Thinking block appears (collapsed): "Thinking..." title |
| 3 | Tap thinking block header | Expands to show model's internal reasoning |
| 4 | Tap again | Collapses |
| 5 | Final response appears below the thinking block | Shows the answer |

### 10.2 Thinking with remote model — Ollama (P2)

| Precondition | Remote Ollama server with thinking-capable model |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Enable thinking, send a question | Ollama receives `think: true` parameter. Reasoning streamed in separate field. Thinking block appears in chat |

### 10.3 Thinking with remote model — LM Studio (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Enable thinking with LM Studio server | Uses `chat_template_kwargs: { enable_thinking: true }`. `<think>` tags parsed from response |

---

## 11. ATTACHMENTS

### 11.1 Attach a document (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | On Chat screen, input is empty. Tap the "+" (attach) button inside the input pill | Popover appears with: "Photo" (camera icon) and "Document" (file icon) |
| 2 | Tap "Document" | Native file picker opens |
| 3 | Select a file (PDF, TXT, MD, etc.) | Popover closes. Attachment preview thumbnail appears above the input |
| 4 | Observe the preview | Shows document icon with filename. X button to remove |
| 5 | Tap X on preview | Attachment removed |
| 6 | Re-attach a document, type a message, and send | Message sent with document context. Assistant response accounts for document content |

### 11.2 Attach a photo — with vision model (P1)

| Precondition | Vision-capable model loaded (has mmproj file) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Tap "+" → "Photo" | Image picker opens (camera roll) |
| 2 | Select a photo | Attachment preview shows image thumbnail |
| 3 | Type "What's in this image?" and send | User message shows with attached image. Assistant describes the image contents |

### 11.3 Attach a photo — without vision model (P2)

| Precondition | Model does NOT have mmproj (not vision-capable) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Tap "+" → "Photo" | Alert: "Vision Not Supported — Load a vision-capable model (with mmproj) to enable image input." |

### 11.4 Multiple attachments (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Attach a document, then attach another | Both previews shown above input |
| 2 | Remove one | Only remaining attachment shown |
| 3 | Send with remaining attachment | Message sent correctly |

### 11.5 Attachment persists across keyboard dismiss (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Attach a file, type text | Preview + text visible |
| 2 | Dismiss keyboard | Attachment preview still visible. Text preserved |
| 3 | Re-open keyboard and send | Everything sent correctly |

---

## 12. VOICE INPUT

### 12.1 Download whisper model (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → Voice Transcription | Shows 5 model variants: tiny.en (~75MB), base.en, small.en (~466MB), etc. Each with accuracy/speed description |
| 2 | Tap a model to download | Progress bar with percentage |
| 3 | Download completes | Status changes to "Downloaded" with green badge |

### 12.2 Record and transcribe (P1)

| Precondition | Whisper model downloaded |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | On Chat screen with empty input, observe the circular button | Shows microphone icon (voice record button) |
| 2 | Press and hold the mic button | Recording starts. Pulsing ripple animation. Haptic feedback |
| 3 | Speak clearly: "Hello world" | Partial transcript may appear in real-time (3-second streaming chunks) |
| 4 | Release the button | "Transcribing..." state shown (spinner). After processing, transcribed text appears in input field |
| 5 | Tap send | Message sent with transcribed text |

### 12.3 Cancel voice recording by drag (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Press and hold mic button | Recording starts |
| 2 | Drag finger left > 80px while holding | Visual cancel zone indication. Haptic warning feedback |
| 3 | Release in cancel zone | Recording cancelled. No text added. Input unchanged |

### 12.4 Voice input without whisper model (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | No whisper model downloaded. Observe mic button | May show as unavailable or show warning when pressed |
| 2 | Press mic button | Alert: voice model not downloaded. Suggests going to Voice Settings |

### 12.5 Remove whisper model (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → Voice Transcription → "Remove Model" | Confirmation alert |
| 2 | Confirm | Model deleted. Voice input disabled until new model downloaded |

### 12.6 Corrupt whisper model — auto-recovery (P2)

| Precondition | Whisper model file is corrupt (< 10MB, invalid) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | App validates model on load | Detects invalid file (< 10MB threshold) |
| 2 | Auto-deletes corrupt file | Prompts re-download |

---

# PART E: IMAGE GENERATION

## 13. IMAGE GENERATION — MODES & SETTINGS

### 13.1 Auto-detect mode with Pattern method (P0)

| Precondition | Text + image model loaded. Image gen mode = Auto, method = Pattern |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Open chat settings (sliders icon) → expand "IMAGE GENERATION" | Settings visible |
| 2 | Tap "Auto" mode button | Auto mode active |
| 3 | Tap "Pattern" detection method | Pattern method selected (fast, keyword-based) |
| 4 | Close settings → type "Draw a picture of a cute cat" and send | Pattern detects image keywords ("draw", "picture"). Text response generates, then image generation starts |
| 5 | Wait for image (up to 3 min) | Generated image appears as attachment on assistant message |

### 13.2 Auto-detect — Pattern DOES NOT trigger on text queries (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | With Pattern method active, send "What is machine learning?" | Pattern correctly identifies this as a text query. No image generation triggered. Text-only response |

### 13.3 Auto-detect mode with LLM method (P2)

| Precondition | Text + image model loaded. Image gen mode = Auto, method = LLM |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Set detection method to "LLM" | LLM classification active |
| 2 | Send "Can you show me what a sunset over mountains looks like?" | Status shows: "Analyzing request..." as LLM classifies intent. If classified as image: generation starts. If not: text-only response |

### 13.4 LLM method with classifier model (P2)

| Precondition | A small classifier model downloaded (e.g. SmolLM) |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | In image gen settings, select a classifier model from dropdown | Classifier model selected |
| 2 | Send an ambiguous image request | Status: "Loading classifier model..." → "Analyzing request..." → "Restoring text model..." (if performance strategy) |
| 3 | Result | Correct classification. Original text model restored for response |

### 13.5 Manual / Force image mode (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap quick settings (gear in input pill) → tap "Image Gen" until badge shows "ON" | Force mode active |
| 2 | Send any message (even "hello") | Image generation triggers regardless of content |
| 3 | Cycle to "OFF" | Image generation disabled even for explicit image requests |
| 4 | Cycle to "Auto" | Returns to auto-detect behavior |

### 13.6 No image model loaded — fallback (P1)

| Precondition | Image gen mode = Auto, but NO image model loaded |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Send "Draw a cat" | Pattern detects image intent, but no image model available. System prepends meta info: "[User wanted an image but no image model is loaded]". Text-only response |

### 13.7 Image generation settings — basic (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Model Settings → Image Generation section | Steps slider (4-50, default 8), Size options (128-512, default 256), Guidance scale (1-20, default 7.5) |
| 2 | Set steps to 20 | More steps = higher quality but slower |
| 3 | Set size to 512x512 | Larger image, more time/memory |
| 4 | Set guidance to 12 | Higher = follows prompt more strictly |
| 5 | Generate an image | Uses the updated settings |

### 13.8 Image generation settings — advanced (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap "Advanced" in image settings | Expands: Threads slider (1-8, default 4), OpenCL toggle (Android only), Clear GPU Cache button (Android only) |
| 2 | Adjust threads to 2 | Takes effect on next image model load |

### 13.9 Prompt enhancement (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | In image settings, toggle "Enhance Image Prompts" ON | Enhancement active |
| 2 | Send "a cat" | Status: thinking indicator appears. Text model enhances prompt (adds artistic style, lighting, quality modifiers, up to 75 words). Then image generates with enhanced prompt |
| 3 | Observe the thinking message | Shows the enhanced prompt text |

### 13.10 OpenCL GPU acceleration — Android (P2)

| Precondition | Android device with GPU support |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | OpenCL toggle is ON by default | GPU acceleration enabled |
| 2 | First image generation ever | Shows "Optimizing GPU..." status (~120 seconds one-time kernel compilation) |
| 3 | Subsequent generations | Much faster (kernels cached) |
| 4 | Tap "Clear GPU Cache" | Cache files removed. Next generation will re-optimize |
| 5 | Toggle OpenCL OFF | Falls back to CPU. Slower but more compatible |

### 13.11 View generated image fullscreen (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | After image generated in chat, tap the image | Fullscreen viewer opens |
| 2 | Swipe/pinch to zoom | Image navigable |
| 3 | Back / swipe down | Returns to chat |

### 13.12 Image generation — cancel mid-progress (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Start image generation | Progress shown in Gallery banner (step X/Y) |
| 2 | Open Gallery, tap X on the generation banner | Generation cancelled. Preview image removed |

---

# PART F: SETTINGS — DETAILED

## 14. TEXT GENERATION SETTINGS

### 14.1 Temperature (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Model Settings → Text Generation → Temperature slider | Range 0.0-2.0, default 0.7 |
| 2 | Set to 0.1 | Responses become more focused/deterministic |
| 3 | Set to 1.5 | Responses become more creative/diverse |

### 14.2 Max Tokens (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Max Tokens slider | Range 64-8192, step 64, default 1024 |
| 2 | Set to 64 | Very short responses |
| 3 | Set to 4096 | Longer responses allowed |

### 14.3 Context Length (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Context Length slider | Range 512 to model max (up to 32768), step 1024, default 2048 |
| 2 | Set to 8192+ | Warning appears: "High context uses significant RAM and may crash on some devices" |
| 3 | Setting requires model reload | Next model load uses new context length |

### 14.4 Top-P / Repeat Penalty (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Top-P slider | Range 0.1-1.0, default 0.9. Controls nucleus sampling |
| 2 | Repeat Penalty slider | Range 1.0-2.0, default 1.1. Penalizes repeated tokens |

### 14.5 CPU Threads and Batch Size (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | CPU Threads | Range 1-12, default 6. Requires model reload |
| 2 | Batch Size | Range 32-512, step 32. Higher = faster, more memory |

### 14.6 GPU Acceleration — Android (P1)

| Precondition | Android device |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | GPU Acceleration toggle | ON by default |
| 2 | Toggle ON | GPU Layers slider appears (range 1-99, default 1) |
| 3 | Increase GPU layers to 20 | More layers offloaded to GPU = faster but uses more VRAM. Requires reload |
| 4 | Note constraint | Android + GPU forces f16 KV cache. Warning shown: "GPU acceleration on Android requires f16 KV cache" |

### 14.7 Flash Attention (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Flash Attention toggle | ON by default |
| 2 | Toggle OFF | Warning if quantized cache selected: "Quantized cache will auto-enable flash attention" |
| 3 | Select q8_0 or q4_0 cache with flash attn off | Flash attention auto-enabled (required for quantized KV cache) |

### 14.8 KV Cache Type (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Cache Type buttons: f16, q8_0, q4_0 | Default q8_0 |
| 2 | Select f16 | Full precision, highest memory, best quality |
| 3 | Select q4_0 | 4-bit quantized, lowest memory, may reduce quality |
| 4 | On Android with GPU enabled | Only f16 available. q8_0 and q4_0 disabled/grayed out |

### 14.9 Model Loading Strategy (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Two buttons: "Save Memory" and "Fast" | Default: "Fast" (performance) |
| 2 | "Save Memory" | Models loaded on demand. Slower switching between text/classifier |
| 3 | "Fast" | Models kept in memory. Faster responses, higher RAM usage |

### 14.10 Reset All Settings to Defaults (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Scroll to bottom → "Reset All to Defaults" | Confirmation alert |
| 2 | Confirm | All sliders/toggles revert: temp=0.7, maxTokens=1024, contextLength=2048, topP=0.9, etc. |

### 14.11 Default System Prompt (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Model Settings → expand "System Prompt" section | Text area with current default system prompt |
| 2 | Edit the text | Changes persist. All new chats (not within a project) use this prompt |

---

## 15. APPEARANCE & THEME

### 15.1 Change theme (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings tab → Appearance section: System / Light / Dark | Current selection highlighted |
| 2 | Tap "Light" | Entire app immediately switches to light colors |
| 3 | Tap "Dark" | Entire app switches to dark colors |
| 4 | Tap "System" | Follows device setting |
| 5 | Navigate through all tabs/screens | Theme consistent everywhere (no dark-on-dark or light-on-light issues) |

---

## 16. STORAGE & DEVICE INFO

### 16.1 View storage usage (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → Storage | Storage bar (used vs free). Breakdown: LLM model count, Image model count, total storage used, conversation count |

### 16.2 Delete model from storage (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap delete on a model | Confirmation. Model removed. If active, model unloaded. Storage bar updates |

### 16.3 View device info (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → Device Information | Device Model, OS + version, Total RAM, Device Tier (Low/Medium/High/Flagship) |
| 2 | Tier cards | Three cards showing tier thresholds. Current tier highlighted. Shows what models are compatible per tier |

### 16.4 Device tier classification (P2)

| Device RAM | Tier | Expected Model Compatibility |
|---|---|---|
| < 4 GB | Low | Only tiny models (< 1-2 GB) |
| 4-6 GB | Medium | Small-medium models |
| 6-8 GB | High | Most models |
| 8+ GB | Flagship | All models including large |

---

# PART G: PROJECTS & KNOWLEDGE BASE

## 17. PROJECTS

### 17.1 Create a project (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Projects tab → "New" button | Project Edit screen: Name input, Description input (optional), System Prompt input (multiline) |
| 2 | Leave name empty, tap Save | Error: name required |
| 3 | Enter name but leave system prompt empty, tap Save | Error: system prompt required |
| 4 | Enter name "Test Project", system prompt "You are a coding assistant", tap Save | Returns to Projects list. New project appears with icon (first letter), name |

### 17.2 Open and edit a project (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap a project | Project Detail screen: project info, chats list, knowledge base section |
| 2 | Tap Edit | Project Edit screen with fields pre-filled |
| 3 | Change name, tap Save | Name updated |

### 17.3 Delete a project (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | On Projects list, swipe left | Delete action visible |
| 2 | Confirm | Project removed. Chats remain but are unlinked from project |

### 17.4 Chat within a project (P1)

| Precondition | Project with system prompt exists, text model loaded |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Open project → "New Chat" | Chat opens. Header shows project name next to model name |
| 2 | Send a message | Response follows the project's system prompt instructions (e.g. if prompt says "respond in Spanish", response is in Spanish) |

### 17.5 Switch project in chat (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | In chat, tap the project name/folder icon in header | Project selector sheet opens |
| 2 | Select a different project | Header updates. System prompt switches |

---

## 18. KNOWLEDGE BASE (RAG)

### 18.1 Add a document — supported file types (P1)

| Precondition | Project exists |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Open project → Knowledge Base | KB screen (empty or with existing docs) |
| 2 | Tap "Add Document" | File picker opens |
| 3 | Select a .pdf file | Progress: "extracting..." → "chunking..." → "indexing..." → "embedding..." → "done" |
| 4 | Document appears in list | Shows name, file size, enabled toggle (on by default) |

### 18.2 Supported document types (P2)

| File Type | Expected Behavior |
|-----------|-------------------|
| .pdf | Extracted via native PDF module |
| .txt, .md, .csv | Direct text read |
| .json, .xml, .html | Direct text read |
| .py, .js, .ts, .swift, .kt, .go, etc. | Code files — direct text read |
| .yaml, .yml, .toml, .ini | Config files — direct read |
| Files > 5 MB | Rejected (max file size) |
| Text > 500 KB per file | Truncated to 500KB for RAG indexing |

### 18.3 Document chunking and embedding (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Add a document | Chunked into ~500 char segments with 100 char overlap at paragraph boundaries |
| 2 | Embedding model loads | all-MiniLM-L6-v2 (384-dim, Q8_0), CPU-only, 2 threads |
| 3 | Embeddings generated | Each chunk gets a vector embedding stored in SQLite |

### 18.4 Toggle document on/off (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Toggle a document's switch OFF | Document excluded from RAG queries (but embeddings kept) |
| 2 | Toggle back ON | Document immediately included again |

### 18.5 Delete a document (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Swipe left on a document → confirm | Document, chunks, and embeddings all removed from database |

### 18.6 Preview a document (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap a document name | Document Preview screen shows full text content, scrollable, with file name and size in header |
| 2 | If file has been deleted from device | "File not found" error with recovery hint |

### 18.7 RAG query during chat (P1)

| Precondition | Project with indexed document(s), text model loaded |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Start a chat within the project | Chat opens |
| 2 | Ask a specific question about the document content | System queries knowledge base: semantic search (cosine similarity) finds top 5 most relevant chunks |
| 3 | Chunks formatted into prompt | `<knowledge_base>` block with source attribution per chunk: `[Source: filename (part N)]` |
| 4 | Response includes document information | Answer references the indexed content accurately |

### 18.8 RAG with no embeddings yet (P2)

| Precondition | Document indexed but embedding model failed to load |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Ask a question | Fallback: returns first 5 chunks by position (no semantic ranking) |
| 2 | Responses are less targeted | But still have some context from the document |

### 18.9 RAG budget constraint (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Large knowledge base with many documents | RAG uses 25% of context window budget. Accumulates chunks until budget exceeded |
| 2 | If budget exceeded | Shows `truncated: true` flag. Only most relevant chunks included |

### 18.10 Multiple documents in knowledge base (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Add 3+ documents to a project | All appear in KB list |
| 2 | Ask a question that spans multiple documents | Response may pull from multiple sources. Source attribution shows which document each chunk came from |

---

# PART H: GALLERY & NAVIGATION

## 19. GALLERY

### 19.1 View image grid (P1)

| Precondition | At least one generated image exists |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Home → tap Image Gallery card | Gallery screen: header with count badge + "Select" button. Multi-column image grid |
| 2 | Tap an image | Fullscreen viewer with action buttons: Save, Delete, Share, Details |
| 3 | Tap back | Returns to grid |

### 19.2 Select and bulk delete (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Long press an image | Select mode activates. Image gets checkbox |
| 2 | Tap more images | Multiple selections. Header: "X selected" |
| 3 | Tap "All" | Every image selected |
| 4 | Tap delete | Confirmation. All selected images removed |

### 19.3 Gallery during image generation (P2)

| Precondition | Image generation in progress |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | Open Gallery | Banner at top: preview image (if available), "Generating..." text, prompt, progress bar (step X/Y), cancel (X) button |
| 2 | Tap cancel (X) | Generation stops. Banner disappears |
| 3 | Wait for generation to complete | New image appears in grid. Banner disappears |

### 19.4 Conversation-specific gallery (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Open gallery from within a chat (if available) | Shows only images from that conversation |

---

## 20. TAB BAR & NAVIGATION

### 20.1 Tab navigation (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | Tap Home tab | Home screen |
| 2 | Tap Chats tab | Chats list. Each conversation shows title, preview, timestamp, project badge (if linked) |
| 3 | Tap Projects tab | Projects list with icons, names, descriptions, chat counts |
| 4 | Tap Models tab | Models screen with search, tabs, model list |
| 5 | Tap Settings tab | Settings with theme, navigation links |
| 6 | Tap same tab repeatedly | No crash, no duplicate navigation |

### 20.2 Deep navigation stack (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Home → New Chat → send message → tap settings icon | Deep in navigation stack |
| 2 | Tap back from settings modal → back from chat | Returns to Home correctly |
| 3 | Models → search → tap model → detail → back | Returns to search results (preserved, not reset) |

### 20.3 Chats list features (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to Chats tab | Conversations listed with timestamps: time (today), "Yesterday", weekday name (this week), full date (older) |
| 2 | Tap a conversation | Opens Chat screen with full history |
| 3 | Swipe left on a conversation | Delete action (red) |
| 4 | Confirm delete | Removed from list |
| 5 | Tap "New Chat" in header | Creates new conversation (if model loaded). Alert if no model |

---

## 21. ONBOARDING SPOTLIGHT TOUR

### 21.1 Guided checklist (P2)

| Precondition | Onboarding complete but checklist not dismissed |
|---|---|

| # | Step | Expected |
|---|------|----------|
| 1 | On Home, tap pulsating icon (top-right) | Onboarding sheet with 6-step checklist: download model, load model, send message, try image gen, explore settings, create project |
| 2 | Tap a step | Spotlight highlights the relevant UI element with tooltip |
| 3 | Follow spotlight guidance | Completes that step. Checklist updates |
| 4 | Complete all steps | Full checklist shows done |

### 21.2 Spotlight chain (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Follow the "send a message" step into chat | Spotlight on ChatInput (step 3) → after that spotlight, automatically chains to VoiceRecordButton spotlight (step 12) |
| 2 | Transition between spotlights | ~800ms delay for new element to mount, then spotlight appears |

---

# PART I: CROSS-CUTTING CONCERNS

## 22. HAPTIC FEEDBACK

| Action | Expected Haptic | Priority |
|--------|-----------------|----------|
| Tap send button | Medium impact | P2 |
| Tap stop button | Light impact | P2 |
| Long press message | Medium impact | P2 |
| Tap model card on Home | Selection | P2 |
| Tap gallery card on Home | Selection | P2 |
| Start voice recording | Press feedback | P2 |
| Drag to cancel voice | Warning in cancel zone | P2 |
| Tap quick settings items | Light impact | P2 |
| Tap action menu items | Selection | P2 |

## 23. ANIMATIONS

| Element | Expected Animation | Priority |
|---------|-------------------|----------|
| Home screen sections | Staggered fade-in from bottom | P2 |
| List items (conversations, models) | Staggered entrance | P2 |
| Onboarding slides | Keyword → accent line → title → description cascade | P2 |
| Input pill icons | Collapse when typing, expand when empty | P2 |
| Voice record button | Pulsing ripple while recording | P2 |
| Loading overlay | Fade in/out | P2 |
| Model picker / action sheets | Slide up from bottom | P2 |

## 24. ERROR SCENARIOS

### 24.1 Network failure during model download (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Start a model download, then go airplane mode | Error alert after timeout |
| 2 | Re-enable network | Can retry download |

### 24.2 Generation error — context exceeded (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | With small context length, send very long messages | Error: context exceeded. Chat input remains usable |

### 24.3 Image generation pipeline crash (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | If image model crashes during generation | Error: "Image generation failed — the model encountered an error and was unloaded. Please try again." |
| 2 | Retry | Image model reloads and retries |

### 24.4 App backgrounding during generation (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Start text generation, switch to another app | Generation may continue or pause |
| 2 | Return | Shows whatever was generated. App responsive |

### 24.5 App backgrounding during download (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Start model download, switch apps | Download continues in background (native download manager on Android) |
| 2 | Return | Progress reflects actual state |

### 24.6 Low memory during model load (P1)

| # | Step | Expected |
|---|------|----------|
| 1 | Try loading a model near device RAM limit | Low memory warning with estimated usage |
| 2 | "Load Anyway" | Model loads (may be slow) |
| 3 | "Cancel" | Returns to picker |

### 24.7 Corrupt model file (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Model file is corrupted on disk | Load fails with error message |
| 2 | User can re-download the model | Download replaces corrupt file |

### 24.8 Remote server auth failure (P2)

| # | Step | Expected |
|---|------|----------|
| 1 | Add server with wrong API key | Test connection returns 401/403. Server saved as offline |
| 2 | Edit server and fix API key | Re-test succeeds |

---

## Summary: Test Count by Priority

| Priority | Count | When to Run |
|----------|-------|-------------|
| P0 | ~20 tests | Every build / every PR |
| P1 | ~50 tests | Every release build |
| P2 | ~65 tests | Weekly regression |
| **Total** | **~135 tests** | |

### P0 Quick Checklist (Run Every Build)

1. First launch → onboarding appears
2. Skip onboarding → model download screen
3. Second launch → no onboarding
4. Download a text model
5. Load a text model from picker
6. Send message → get response
7. Stop generation mid-stream
8. Tab bar navigation (all 5 tabs)
9. Lock screen works (if enabled)
10. Auto-detect image generation (pattern mode)
