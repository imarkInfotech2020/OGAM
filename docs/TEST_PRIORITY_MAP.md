# Test Priority Map

This document maps all flows to priorities and testing layers.

**Legend:**
- 🔴 P0 = Critical (app broken without it)
- 🟡 P1 = Important (users notice if broken)
- 🟢 P2 = Nice-to-have (edge cases, polish)

**Testing Layers:**
- **U** = Unit test
- **I** = Integration test
- **R** = RNTL (component/screen)
- **E** = E2E (full device)
- **C** = Contract (native module)

---

## P0 - Critical Flows (Must Have Full Coverage)

These flows are core functionality. If broken, the app is unusable.

### Text Generation Core
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 9.1 | Send text message | ✓ | ✓ | ✓ | ✓ | |
| 9.2 | Message appears in chat | ✓ | | ✓ | ✓ | |
| 9.3 | Generation starts | ✓ | ✓ | ✓ | ✓ | |
| 9.4 | Streaming tokens | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9.6 | Generation completes | ✓ | ✓ | ✓ | ✓ | |
| 9.7 | Response saved | ✓ | ✓ | | ✓ | |
| 9.11 | Stop generation | ✓ | ✓ | ✓ | ✓ | |
| 9.12 | Partial response saved | ✓ | ✓ | | | |

### Model Loading Core
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 8.1 | Load text model | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8.4 | Model loaded confirmation | ✓ | | ✓ | ✓ | |
| 8.8 | Unload model | ✓ | ✓ | | ✓ | ✓ |
| 8.11 | Switch text models | ✓ | ✓ | ✓ | ✓ | |

### Model Download Core
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 5.23 | Start foreground download | ✓ | ✓ | ✓ | ✓ | |
| 5.24 | Download progress display | ✓ | | ✓ | ✓ | |
| 5.30 | Download complete | ✓ | ✓ | ✓ | ✓ | |
| 5.41 | View downloaded models | ✓ | | ✓ | ✓ | |

### Conversation Core
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 15.1 | Create new conversation | ✓ | | ✓ | ✓ | |
| 15.13 | Switch conversations | ✓ | | ✓ | ✓ | |
| 15.17 | Conversations persist | ✓ | ✓ | | ✓ | |
| 15.18 | Messages persist | ✓ | ✓ | | ✓ | |

### App Lifecycle Core
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 23.5 | Reopen after kill | ✓ | ✓ | | ✓ | |
| 23.8 | Settings restored | ✓ | | | ✓ | |

### Chat UI Core
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 16.12 | Type message | | | ✓ | ✓ | |
| 16.14 | Send button enabled | ✓ | | ✓ | | |
| 16.15 | Send button disabled | ✓ | | ✓ | | |
| 16.18 | Clear input after send | | | ✓ | | |

---

## P0 - Image Generation Core

| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 11.1 | Auto-detect triggers generation | ✓ | ✓ | ✓ | ✓ | |
| 11.4 | Generation progress | ✓ | | ✓ | ✓ | |
| 11.7 | Generation completes | ✓ | ✓ | ✓ | ✓ | |
| 11.8 | Image in chat | ✓ | | ✓ | ✓ | |
| 11.9 | Image in gallery | ✓ | ✓ | ✓ | ✓ | |
| 11.11 | Cancel image generation | ✓ | ✓ | ✓ | ✓ | ✓ |

### Intent Classification Core
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 10.1 | Clear text intent | ✓ | | | | |
| 10.2 | Clear image intent | ✓ | | | | |
| 10.3 | Question patterns → text | ✓ | | | | |
| 10.4 | Generation patterns → image | ✓ | | | | |
| 10.5 | Art style patterns → image | ✓ | | | | |
| 10.6 | Code patterns → text | ✓ | | | | |
| 10.7 | SD-specific → image | ✓ | | | | |
| 10.8 | Ambiguous prompt - pattern mode | ✓ | | | | |

---

## P1 - Important Flows

These flows are important features. Users would notice if broken.

### Onboarding
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 1.1 | Fresh install onboarding | | | ✓ | ✓ | |
| 1.2 | Onboarding with model download | | | ✓ | ✓ | |
| 1.5 | Onboarding completed flag | ✓ | | | | |

### Authentication
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 2.1 | First-time passphrase setup | ✓ | | ✓ | ✓ | |
| 2.5 | App lock on background | ✓ | | ✓ | ✓ | |
| 2.6 | Successful unlock | ✓ | | ✓ | ✓ | |
| 2.7 | Failed unlock attempt | ✓ | | ✓ | | |
| 2.9 | Lockout triggered | ✓ | | ✓ | | |
| 2.13 | Change passphrase | ✓ | | ✓ | | |
| 2.14 | Disable passphrase | ✓ | | ✓ | | |

### Model Management Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 5.1 | Models tab loads | | | ✓ | ✓ | |
| 5.4 | Search models by name | ✓ | | ✓ | | |
| 5.6-5.8 | Filter by credibility | ✓ | | ✓ | | |
| 5.27 | Download pause | ✓ | ✓ | ✓ | | |
| 5.28 | Download resume | ✓ | ✓ | ✓ | | |
| 5.29 | Download cancel | ✓ | ✓ | ✓ | ✓ | |
| 5.43 | Delete downloaded model | ✓ | ✓ | ✓ | | |
| 5.37 | Vision model download | ✓ | ✓ | | ✓ | |

### Background Downloads (Android)
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 7.1 | Start background download | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7.8 | Download completes | ✓ | ✓ | ✓ | ✓ | |
| 7.9 | App killed during download | | ✓ | | ✓ | |
| 7.10 | App reopens - download complete | ✓ | ✓ | | ✓ | |

### Generation Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 9.13 | Retry generation | ✓ | ✓ | ✓ | | |
| 9.14 | Edit user message | ✓ | | ✓ | | |
| 9.15 | Regenerate from edit | ✓ | ✓ | ✓ | | |
| 9.17 | Conversation history | ✓ | ✓ | | ✓ | |
| 9.18 | System prompt applied | ✓ | ✓ | | | |
| 9.19 | Context length limit | ✓ | ✓ | | | |
| 9.29 | Generation error | ✓ | ✓ | ✓ | | |
| 9.33 | Thinking blocks | ✓ | | ✓ | | |

### Voice Input
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 14.1 | Tap mic to start | | | ✓ | ✓ | ✓ |
| 14.4 | Stop recording | | | ✓ | ✓ | |
| 14.6 | Transcription complete | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14.11 | No Whisper model | ✓ | | ✓ | | |
| 14.17 | Download Whisper model | ✓ | ✓ | ✓ | | |

### Vision Models
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 12.1 | Load vision model | ✓ | ✓ | | ✓ | ✓ |
| 12.2 | Attach image from gallery | | | ✓ | ✓ | |
| 12.6 | Send with image | ✓ | ✓ | ✓ | ✓ | |
| 12.8 | Generate about image | ✓ | ✓ | ✓ | ✓ | |

### Projects
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 17.1 | View projects list | ✓ | | ✓ | | |
| 17.3 | Create new project | ✓ | | ✓ | ✓ | |
| 17.9 | Edit project | ✓ | | ✓ | | |
| 17.10 | Delete project | ✓ | | ✓ | | |
| 17.13 | Start chat from project | ✓ | ✓ | ✓ | ✓ | |

### Gallery
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 18.1 | View gallery | ✓ | | ✓ | ✓ | |
| 18.11 | Tap image | | | ✓ | | |
| 18.19 | Delete single image | ✓ | ✓ | ✓ | | |
| 18.21 | Multi-select mode | | | ✓ | | |
| 18.24 | Delete selected | ✓ | ✓ | ✓ | | |

### Settings
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 19.9-19.14 | Generation settings sliders | ✓ | | ✓ | | |
| 19.19 | GPU toggle | ✓ | | ✓ | | |
| 19.22 | Loading strategy toggle | ✓ | | ✓ | | |
| 19.36 | All settings persist | ✓ | ✓ | | ✓ | |

### Error Handling
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 25.1 | No internet - model browse | ✓ | | ✓ | | |
| 25.2 | No internet - download | ✓ | | ✓ | | |
| 25.8 | Corrupt model file | ✓ | | ✓ | | |
| 25.9 | Model load OOM | ✓ | | ✓ | | |
| 25.12 | Generation crash | ✓ | ✓ | ✓ | | |
| 25.16 | Storage full | ✓ | | ✓ | | |

---

## P2 - Nice-to-Have Flows

These are edge cases, polish, and less critical features.

### Permissions
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 3.1-3.8 | All permission flows | | | ✓ | | |

### Home Screen
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 4.1-4.11 | All home screen flows | ✓ | | ✓ | | |

### Model Management Polish
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 5.2 | Model list loading state | | | ✓ | | |
| 5.3 | Model list error state | | | ✓ | | |
| 5.10 | Multiple filters combined | ✓ | | ✓ | | |
| 5.12 | Empty filter results | | | ✓ | | |
| 5.14 | Pagination / infinite scroll | | | ✓ | | |
| 5.26 | Download ETA | ✓ | | ✓ | | |
| 5.32 | Multiple concurrent downloads | ✓ | ✓ | | | |
| 5.47 | Scan for untracked models | ✓ | ✓ | | | |

### Image Model Management
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 6.1-6.10 | All image model flows | ✓ | | ✓ | | |

### Model Loading Polish
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 8.2 | Loading progress indicator | | | ✓ | | |
| 8.5-8.7 | Load failure handling | ✓ | | ✓ | | |
| 8.16-8.17 | Memory warnings | ✓ | | ✓ | | |
| 8.20-8.21 | GPU loading | ✓ | ✓ | | | ✓ |
| 8.22 | Model session caching | ✓ | ✓ | | | |

### Generation Polish
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 9.5 | Streaming performance | | | | ✓ | |
| 9.8-9.10 | Generation metadata | ✓ | | ✓ | | |
| 9.16 | Delete messages after | ✓ | | ✓ | | |
| 9.20-9.21 | Context handling | ✓ | ✓ | | | |
| 9.23-9.27 | Settings impact | ✓ | | | | |
| 9.34-9.36 | Output rendering | | | ✓ | | |
| 9.38-9.41 | Metadata display | ✓ | | ✓ | | |

### Intent Classification Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 10.9 | Ambiguous prompt - LLM mode | ✓ | ✓ | | | |
| 10.10-10.12 | Classifier model handling | ✓ | ✓ | | | |
| 10.13-10.14 | Intent cache | ✓ | | | | |
| 10.16-10.17 | Pattern edge cases | ✓ | | | | |

### Image Generation Polish
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 11.5-11.6 | Preview updates | | | ✓ | | |
| 11.12 | Partial image on cancel | ✓ | | ✓ | | |
| 11.15-11.24 | Generation parameters | ✓ | | ✓ | | |
| 11.25-11.28 | Backend selection | ✓ | ✓ | | | ✓ |
| 11.29-11.32 | Generation errors | ✓ | | ✓ | | |
| 11.33-11.35 | Image metadata | ✓ | | ✓ | | |

### Document Attachments
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 13.1-13.9 | All document flows | ✓ | ✓ | ✓ | | |

### Voice Input Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 14.2-14.3 | Recording indicators | | | ✓ | | |
| 14.7 | Partial transcription | ✓ | | ✓ | | |
| 14.8-14.10 | Recording edge cases | | | ✓ | | |
| 14.18-14.22 | Whisper model management | ✓ | | ✓ | | |

### Conversations Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 15.3-15.5 | Conversation metadata | ✓ | | ✓ | | |
| 15.6-15.9 | Delete handling | ✓ | ✓ | ✓ | | |
| 15.10-15.12 | List display | ✓ | | ✓ | | |
| 15.16 | Search conversations | ✓ | | ✓ | | |
| 15.20 | Scroll position restored | | | ✓ | | |
| 15.21-15.23 | Project integration | ✓ | ✓ | ✓ | | |

### Chat UI Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 16.1-16.11 | Message display | | | ✓ | | |
| 16.13 | Multiline input | | | ✓ | | |
| 16.16-16.17 | Disabled states | ✓ | | ✓ | | |
| 16.19-16.22 | Input edge cases | ✓ | | ✓ | | |
| 16.23-16.24 | Keyboard handling | | | ✓ | | |
| 16.25-16.30 | Scrolling behavior | | | ✓ | | |
| 16.31-16.35 | Chat states | ✓ | | ✓ | | |
| 16.36-16.42 | Attachments UI | | | ✓ | | |

### Projects Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 17.2 | Default projects | ✓ | | | | |
| 17.4-17.8 | Project form | ✓ | | ✓ | | |
| 17.11-17.12 | Delete/duplicate | ✓ | | ✓ | | |
| 17.14-17.16 | Project details | ✓ | | ✓ | | |

### Gallery Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 18.2-18.7 | Gallery display | ✓ | | ✓ | | |
| 18.8-18.10 | Gallery filtering | ✓ | | ✓ | | |
| 18.12-18.18 | Image actions | | | ✓ | | |
| 18.20-18.29 | Delete flows | ✓ | | ✓ | | |

### Settings Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 19.1-19.8 | Settings navigation | | | ✓ | | |
| 19.15-19.18 | Context/thread settings | ✓ | | ✓ | | |
| 19.20-19.21 | GPU settings | ✓ | | ✓ | | |
| 19.23-19.24 | Reset/save | ✓ | | ✓ | | |
| 19.25-19.31 | Image settings | ✓ | | ✓ | | |
| 19.32-19.35 | Intent settings | ✓ | | ✓ | | |
| 19.37-19.38 | Settings sync | ✓ | ✓ | | | |

### Storage & Device Info
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 20.1-20.11 | Storage settings | ✓ | | ✓ | | |
| 21.1-21.11 | Device info | ✓ | | ✓ | | |
| 22.1-22.12 | Download manager | ✓ | | ✓ | | |

### App Lifecycle Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 23.1-23.4 | Background handling | | | | ✓ | |
| 23.6-23.7 | State restoration | ✓ | ✓ | | | |
| 23.9-23.12 | Recovery edge cases | ✓ | ✓ | | | |

### Navigation
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 24.1-24.8 | All navigation flows | | | ✓ | | |

### Error Handling Extended
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 25.3-25.7 | Network errors | ✓ | | ✓ | | |
| 25.10-25.11 | Model errors | ✓ | | ✓ | | |
| 25.13-25.15 | Generation errors | ✓ | | ✓ | | |
| 25.17-25.23 | Platform errors | ✓ | | ✓ | | |

### Edge Cases & Stress
| ID | Flow | U | I | R | E | C |
|----|------|---|---|---|---|---|
| 26.1-26.7 | Input edge cases | ✓ | | ✓ | | |
| 26.8-26.13 | Scale edge cases | ✓ | | ✓ | ✓ | |
| 26.14-26.19 | Concurrent operations | ✓ | ✓ | | | |
| 26.20-26.22 | Memory pressure | ✓ | | | | |

---

## Summary by Testing Layer

| Layer | P0 Flows | P1 Flows | P2 Flows | Total |
|-------|----------|----------|----------|-------|
| Unit (U) | 45 | 85 | 120 | 250 |
| Integration (I) | 25 | 40 | 35 | 100 |
| RNTL (R) | 35 | 70 | 150 | 255 |
| E2E (E) | 25 | 30 | 15 | 70 |
| Contract (C) | 8 | 12 | 5 | 25 |

---

## Recommended Implementation Order

### Phase 1: P0 Unit + Contract Tests
Build the foundation. Fast tests that catch regressions.

1. Store mutations (chatStore, appStore)
2. Intent classifier patterns (all 70+ patterns)
3. Generation service state machine
4. Native module contracts (llama.rn, LocalDream)

**Expected coverage:** Core logic protected

### Phase 2: P0 RNTL Tests
Test critical screens respond correctly to state.

1. ChatScreen (send, streaming, stop)
2. ModelsScreen (download flow)
3. HomeScreen (model loading)

**Expected coverage:** UI matches state

### Phase 3: P0 E2E Tests
Test full flows on device with real models.

1. Text generation happy path
2. Image generation happy path
3. Model download happy path
4. App lifecycle (kill → restore)

**Expected coverage:** Real usage works

### Phase 4: P1 Flows
Add important features.

1. Authentication flows
2. Background downloads
3. Vision models
4. Voice input
5. Projects

### Phase 5: P2 Flows
Polish and edge cases as time permits.

---

## Test Count Estimates

| Phase | Unit | Integration | RNTL | E2E | Total |
|-------|------|-------------|------|-----|-------|
| 1 | 150 | 10 | 0 | 0 | 160 |
| 2 | 0 | 0 | 50 | 0 | 50 |
| 3 | 0 | 15 | 0 | 10 | 25 |
| 4 | 85 | 40 | 70 | 20 | 215 |
| 5 | 120 | 35 | 135 | 10 | 300 |
| **Total** | **355** | **100** | **255** | **40** | **750** |
