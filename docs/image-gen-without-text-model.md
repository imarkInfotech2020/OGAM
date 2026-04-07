# Image Generation Without a Text Model

## Goal

Allow users to download an image model, open a chat, and generate images — with no text model required. No new screens, no new flows. The existing chat interface handles everything.

---

## Current Behaviour (Why It's Blocked)

There are four independent gates, all of which must be removed or relaxed:

### Gate 1 — HomeScreen hides "New Chat"
**File:** `src/screens/HomeScreen/index.tsx:106-139`

`activeTextModel` is the only condition checked. If it's falsy, the "New Chat" button is replaced with a setup card telling the user to select a text model. An active image model is completely ignored here.

### Gate 2 — ChatScreen renders `<NoModelScreen>`
**File:** `src/screens/ChatScreen/useChatScreen.ts:85-118`

`hasActiveModel` is computed from `activeTextModel` (local) or `activeRemoteTextModelId` (remote). If neither exists, `hasActiveModel = false` and the chat screen renders `<NoModelScreen>` instead of the chat UI.

### Gate 3 — `startGenerationFn` bails early
**File:** `src/screens/ChatScreen/useChatGenerationActions.ts:237`

```typescript
if (!deps.hasActiveModel) return;
```

Even if somehow the chat UI were rendered, text generation — and by extension image routing — is gated behind `hasActiveModel`.

### Gate 4 — Prompt enhancement hard-depends on text model
**File:** `src/services/imageGenerationService.ts:131-178`

`_enhancePrompt()` calls `llmService.generateResponse()`. If no text model is loaded this throws. The `enhanceImagePrompts` setting guards it, but only if the user has disabled enhancement — there's no check for whether a text model is actually available.

---

## Proposed Changes

### 1. Extend `hasActiveModel` to include image model
**File:** `src/screens/ChatScreen/useChatScreen.ts`

```typescript
// Before
const hasActiveModel = !!localModelId || isRemote;

// After
const hasImageModel = !!useAppStore.getState().activeImageModelId;
const hasActiveModel = !!localModelId || isRemote || hasImageModel;
```

This is the foundational change. Everything else cascades from `hasActiveModel` being true.

Subscribe to `activeImageModelId` from the store so it's reactive — use `useAppStore(s => s.activeImageModelId)`.

---

### 2. Enable "New Chat" on HomeScreen when image model is active
**File:** `src/screens/HomeScreen/index.tsx`

```typescript
// Before
const canStartChat = !!activeTextModel;

// After
const canStartChat = !!activeTextModel || !!activeImageModelId;
```

When `canStartChat` is true but `activeTextModel` is null (image-only mode), show the "New Chat" button as normal. Optionally show a small subtitle under it like "Image generation" to set expectations — but this is cosmetic and not required.

The setup card copy should also be updated to acknowledge image models:
- Before: "Select a text model to start chatting"
- After: "Select a text or image model to start" (only shown when neither is active)

---

### 3. Image-only routing in `startGenerationFn`
**File:** `src/screens/ChatScreen/useChatGenerationActions.ts`

Currently the flow is:
1. Check `hasActiveModel` → bail if false
2. Check `shouldRouteToImageGeneration` → routes to image gen or text gen

In image-only mode (`hasImageModel && !hasTextModel`), step 2's intent classifier can't run — it uses the LLM. The fix: short-circuit to image generation if no text model is loaded.

```typescript
// In shouldRouteToImageGenerationFn, before intent classification:
if (!deps.hasTextModel && deps.imageModelLoaded) {
  return true; // always route to image gen in image-only mode
}
```

Add `hasTextModel` to the `deps` object in `useChatGenerationActions.ts`. Derive it from `activeModelInfo.modelId !== null`.

This means in image-only mode, every message the user sends becomes an image generation prompt. No intent classification needed.

---

### 4. Make prompt enhancement conditional on text model availability
**File:** `src/services/imageGenerationService.ts`

```typescript
// In _enhancePrompt / generateImage:
const textModelAvailable = llmService.isModelLoaded();
if (settings.enhanceImagePrompts && textModelAvailable) {
  prompt = await this._enhancePrompt(prompt, context);
}
```

`llmService.isModelLoaded()` is already implemented. Just add it as a guard before calling enhancement. No user-visible change when a text model IS loaded — enhancement works as before.

---

### 5. Update `NoModelScreen` copy
**File:** `src/screens/ChatScreen/NoModelScreen.tsx` (or wherever it lives)

With gate 2 fixed, `NoModelScreen` will only show when truly nothing is loaded (no text model, no remote, no image model). Update the copy from something implying text-model-only to something neutral:

- "No model loaded — download a text or image model to get started"

---

### 6. Chat input hint in image-only mode
**File:** `src/screens/ChatScreen/index.tsx` or the input component

When `hasTextModel = false` and `imageModelLoaded = true`, show a placeholder in the chat text input like:

> "Describe an image..."

instead of the default:

> "Message"

This sets user expectations without adding any new UI elements. One `placeholder` prop change.

---

## What Does NOT Need to Change

- **Image model download flow** — already works independently of text models.
- **Image model picker on HomeScreen** — already available regardless of text model state.
- **`imageGenerationService.generateImage()`** — already handles model loading internally.
- **Chat history / message rendering** — image messages already render fine.
- **The image generation mode toggle** — still works, just defaults to always-on in image-only mode.
- **Navigation** — no new routes, no new screens.

---

## File Change Summary

| File | Change |
|---|---|
| `src/screens/ChatScreen/useChatScreen.ts` | Add `activeImageModelId` to `hasActiveModel` computation |
| `src/screens/ChatScreen/useChatGenerationActions.ts` | Short-circuit to image gen when no text model; add `hasTextModel` to deps |
| `src/screens/HomeScreen/index.tsx` | `canStartChat` includes `activeImageModelId`; update setup card copy |
| `src/services/imageGenerationService.ts` | Guard `_enhancePrompt` behind `llmService.isModelLoaded()` |
| `src/screens/ChatScreen/NoModelScreen.tsx` | Update copy to be model-type-agnostic |
| `src/screens/ChatScreen/index.tsx` | Input placeholder changes to "Describe an image..." in image-only mode |

---

## Testing Checklist

- [ ] No model loaded → HomeScreen shows setup card, can't start chat
- [ ] Image model only → HomeScreen shows "New Chat", chat opens, every message generates an image
- [ ] Text model only → existing behaviour unchanged
- [ ] Both models loaded → existing behaviour unchanged (intent classification routes appropriately)
- [ ] Both loaded, then text model unloaded → chat falls back to image-only mode automatically
- [ ] `enhanceImagePrompts = true`, no text model → enhancement silently skipped, generation proceeds
- [ ] `enhanceImagePrompts = true`, text model loaded → enhancement runs as before
- [ ] `NoModelScreen` only appears when genuinely nothing is loaded
