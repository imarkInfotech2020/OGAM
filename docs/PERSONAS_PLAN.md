# Personas — Product & Engineering Plan

> Replaces the "Projects" mental model with "Personas" — a set of named AI assistants, each with their own personality, skills, knowledge base, and conversation history. The model picker becomes an implementation detail. Users just talk to their assistants.

---

## The Idea in One Sentence

Instead of "start a chat and pick a model", you "pick an assistant and start talking" — the app handles everything else.

---

## Data Model

```typescript
type Capability = 'text' | 'voice' | 'vision' | 'image-gen' | 'rag';

interface Persona {
  id: string;
  name: string;                        // "Jarvis", "Work Assistant", "Creative"
  avatar: string;                      // icon name (Feather) or initials fallback
  accentColor: string;                 // subtle per-persona color
  systemPrompt: string;                // personality / instructions
  capabilities: Capability[];          // what this persona can do
  knowledgeBaseIds: string[];          // attached knowledge bases
  modelOverrides?: {                   // power user only, optional
    text?: string;                     // model id
    vision?: string;
    imageGen?: string;
    stt?: string;
    tts?: string;
  };
  createdAt: number;
  lastUsedAt: number;
  isDefault: boolean;                  // shipped defaults, can be edited but not deleted
}
```

**Auto model selection logic** (hidden from user):
- `text` capability → best downloaded GGUF for device RAM
- `vision` capability → best downloaded vision GGUF + mmproj
- `image-gen` capability → local-dream / CoreML image model
- `voice` capability → whisper.rn for STT + TTS engine
- `rag` capability → MiniLM embedding model + op-sqlite

If the required model isn't downloaded, the app prompts a one-time download for that capability — not a model picker.

---

## Default Personas (ships out of the box)

| Name | Avatar | Capabilities | Personality |
|------|--------|--------------|-------------|
| **Jarvis** | `cpu` icon | text, voice, vision | General purpose, helpful, concise |
| **Coder** | `code` icon | text, rag | Technical, precise, no fluff |
| **Creative** | `feather` icon | text, image-gen, voice | Imaginative, expressive |
| **Research** | `book-open` icon | text, rag, vision | Thorough, cites sources, analytical |

These are editable but not deletable. Serve as templates and ensure zero setup friction on first launch.

---

## Screens

### 1. Personas Home (replaces or becomes the main tab)

**What it is:** The new home screen. A scrollable list of persona cards.

**Layout:**
```
┌─────────────────────────────────────┐
│ Your Assistants          [+ New]    │  ← header
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ ● Jarvis                    ··· │ │  ← accent dot, overflow menu
│ │ General assistant               │ │
│ │ ◎ text  ◎ voice  ◎ vision       │ │  ← capability pills
│ │ "How can I help?"          >    │ │  ← last message preview
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ● Coder                     ··· │ │
│ │ ...                             │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Interactions:**
- Tap card → open chat with that persona
- Long press or `···` → Edit / Duplicate / Delete
- `+ New` → Persona Create screen
- Personas sorted by `lastUsedAt` desc

---

### 2. Persona Chat Screen (extends current ChatScreen)

**What it is:** The existing chat screen, scoped to a persona. Mostly reuses current chat UI.

**Changes from current ChatScreen:**
- Header shows persona name + avatar instead of model name
- Capability bar below header — tap to activate voice, image gen, etc.
- Model name shown as a tiny META label (optional, can hide in settings)
- Conversations are scoped to the persona — no cross-persona bleed
- If a capability's model isn't downloaded, tapping it shows a download prompt inline

**Layout:**
```
┌─────────────────────────────────────┐
│ ← Jarvis                       ⚙   │  ← persona name, settings
│ ─────────────────────────────────── │
│ [text] [voice] [vision] [image]     │  ← active capability selector
│ ─────────────────────────────────── │
│                                     │
│         (conversation area)         │
│                                     │
│ ─────────────────────────────────── │
│ [mic] [input field...]    [send]    │
└─────────────────────────────────────┘
```

**Capability bar behaviour:**
- Only shows capabilities enabled for this persona
- Active capability highlighted
- Switching capability mid-conversation is allowed (e.g. text → image gen)
- Voice capability: mic button replaces text input

---

### 3. Persona Create / Edit Screen

**What it is:** A single screen for creating or editing a persona. Scrollable form.

**Sections:**

**Identity**
- Name (text input)
- Avatar (icon picker — Feather icons grid + accent color picker)
- System prompt (multi-line, expandable — "Describe how this assistant should behave")

**Capabilities**
Toggle cards, not just switches — each shows what it does:

```
┌─────────────────────────────────────┐
│ ◎ Text Conversation          [ON]   │
│   Chat, answer questions, write     │
├─────────────────────────────────────┤
│ ◎ Voice                      [ON]   │
│   Speak and listen                  │
├─────────────────────────────────────┤
│ ◎ Vision                     [OFF]  │
│   Understand images                 │
│   Requires vision model   [Get →]   │  ← inline download CTA if missing
├─────────────────────────────────────┤
│ ◎ Image Generation           [OFF]  │
│   Create images from text           │
├─────────────────────────────────────┤
│ ◎ Knowledge Base             [OFF]  │
│   Search your documents             │
└─────────────────────────────────────┘
```

**Knowledge Bases** (shown when RAG capability is on)
- List of attached knowledge bases with attach/detach
- "Create new knowledge base" shortcut

**Advanced** (collapsed by default)
- Model overrides per capability (for power users)
- Context length, temperature, etc.

---

### 4. Persona Conversations Screen

**What it is:** Per-persona conversation history. Accessed from the persona chat header or a tab.

- Lists all conversations for this persona, sorted by recency
- Same as current conversations screen but scoped
- Search within persona's conversations
- "Start new conversation" button

---

### 5. Onboarding (updated)

**Current:** Download a model → start chatting  
**New:** Meet your assistants → pick one → start talking (download happens in background or on first capability use)

**Flow:**
1. Welcome screen — "Meet your AI assistants. Private. Offline. Yours."
2. Persona cards carousel — swipe through the 4 defaults, see what each does
3. Tap one to "activate" it — triggers background model download for its capabilities
4. Land in that persona's chat — ready to go (or spinner if model still downloading)

Model download moves from a hard blocker to a background process. User can start typing while it downloads.

---

## Navigation Changes

**Current tab structure** (assumed):
- Conversations | Models | Settings (or similar)

**New tab structure:**
- **Assistants** (home — persona cards) ← replaces or joins Conversations
- **Explore** (model browser — kept for enthusiasts)
- **Settings**

Conversations are no longer a top-level tab — they live inside each persona. This reinforces the mental model that conversations belong to an assistant, not to the app globally.

---

## Capability → Model Auto-Selection Logic

```typescript
function resolveModelForCapability(
  capability: Capability,
  downloadedModels: Model[],
  deviceRam: number,
  overrides?: ModelOverrides
): Model | null {
  if (overrides?.[capability]) {
    return downloadedModels.find(m => m.id === overrides[capability]) ?? null;
  }
  // rank by: fits in RAM → type match → size (prefer smaller for speed)
  return downloadedModels
    .filter(m => capabilityMatches(m, capability))
    .filter(m => m.sizeBytes < deviceRam * 0.6)
    .sort((a, b) => scoreModel(b, deviceRam) - scoreModel(a, deviceRam))[0] ?? null;
}
```

If no model available → show capability-specific download prompt, not the full model browser.

---

## What Gets Reused (no rebuild needed)

| Existing | Reused as |
|----------|-----------|
| `ProjectsScreen` | `PersonasHomeScreen` (renamed + reskinned) |
| `Project` data model | `Persona` (extend, not replace) |
| `ChatScreen` | Persona chat (add capability bar, scope conversations) |
| `ConversationsScreen` | Per-persona conversations (filter by personaId) |
| Knowledge base / RAG | Attached to persona via `knowledgeBaseIds` |
| Model auto-selection (existing RAM logic) | Plugged into capability resolver |
| `ModelDownloadScreen` | Capability-specific download prompts (simplified) |

---

## What's New (needs building)

| New thing | Complexity |
|-----------|------------|
| Persona card component | Low |
| Capability toggle cards | Low |
| Capability bar in chat | Low |
| Auto model resolver | Medium |
| Capability-specific download prompt | Low |
| Avatar / accent color picker | Low |
| Updated onboarding flow | Medium |
| Per-persona conversation scoping | Low (filter by personaId) |

---

## Implementation Order

1. **Data model** — add `Persona` type, migrate `Project` → `Persona` in store
2. **Personas home screen** — persona cards, `+ New`, last used sorting
3. **Persona create/edit** — identity + capability toggles + knowledge base attach
4. **Scope conversations** — filter by `personaId`, update ChatScreen header
5. **Capability bar** — in-chat capability switcher
6. **Auto model resolver** — capability → best downloaded model
7. **Capability download prompts** — replace hard model picker with targeted CTAs
8. **Default personas** — seed on first launch
9. **Updated onboarding** — persona carousel replaces model download gate
10. **Power user model overrides** — last, in advanced settings

---

**Last Updated:** April 2026
