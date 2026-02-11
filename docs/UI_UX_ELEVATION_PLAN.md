# UI/UX Elevation Plan — "Venture Studio Grade"

> **Goal**: Transform LocalLLM from a solid brutalist interface into a polished, premium product that screams venture studio quality — while preserving the brutalist DNA. We're adding *motion, depth, and tactile feedback*, not color or decoration.

---

## 1. Library Stack

| Library | Purpose | Platform | Notes |
|---------|---------|----------|-------|
| **react-native-reanimated** (v3+) | Core animation engine | iOS + Android | Runs on UI thread, 60fps guaranteed, worklet-based |
| **@gorhom/bottom-sheet** | Bottom sheets for all modals | iOS + Android | Gesture-driven, snap points, backdrop, keyboard-aware |
| **moti** | Declarative animations + skeleton loaders | iOS + Android | Simple API wrapping Reanimated, great for entry/exit animations |
| **@shopify/flash-list** | High-performance lists | iOS + Android | Drop-in FlatList replacement, better scroll perf |
| **@react-native-community/blur** | Backdrop blur effects | iOS + Android fallback | iOS: native blur. Android: falls back to semi-transparent overlay on API < 31 |
| **lottie-react-native** | Micro-interaction animations | iOS + Android | Designer-grade loading states, success/error feedback |
| **react-native-haptic-feedback** | Haptic/tactile feedback | iOS + Android | iOS: full Taptic Engine. Android: vibration patterns (less granular but functional) |

**Already installed** (leverage more): `react-native-gesture-handler`, `react-native-screens`, `@react-navigation/native-stack`

**Not adding** (keeping it lean): react-native-skia (overkill), react-native-shared-element (experimental/unstable), heavy UI frameworks like Paper or gluestack (conflicts with brutalist system)

### Cross-Platform Considerations

- **Blur**: On Android < 12 (API 31), `@react-native-community/blur` falls back to a dimmed overlay. Even on API 31+, the Android blur can be janky on mid-range devices — **always develop and test the non-blur (opacity overlay) codepath on Android as the primary path**, not just a fallback. Use `Platform.OS` checks to gate blur to iOS only unless Android blur has been verified smooth on a budget device. Our sheets should look good with _either_ blur or solid overlay — always set a semi-opaque background as baseline.
- **Haptics**: Android has coarser haptic granularity. Map all haptic types to available Android vibration patterns via a utility wrapper. If haptics unavailable, fail silently.
- **Reanimated**: Fully cross-platform. Use `useReducedMotion()` hook to respect system accessibility settings on both platforms.
- **Bottom sheets**: `@gorhom/bottom-sheet` works on both platforms. Keyboard handling differs — use `android_keyboardInputMode="adjustResize"` in AndroidManifest if not already set.
- **Lottie**: Identical rendering on both platforms. Keep files under 50KB for performance on low-end Android.

---

## 2. Screen Transitions & Navigation

### 2.1 Stack Navigation Transitions

**Current**: Default `slide_from_right` for everything.

**New**:

| Transition | Where | Implementation |
|------------|-------|----------------|
| **Slide from right** (keep) | Standard pushes: Home → Chat, Settings → SubScreen | Default native stack, but tune spring config: `damping: 20, stiffness: 200` for snappier feel |
| **Slide from bottom** | All modals: DownloadManager, Gallery | `presentation: 'modal'` with `animation: 'slide_from_bottom'` |
| **Fade** | Tab switches | `animation: 'fade'` on tab navigator, 200ms duration |
| **None (instant)** | LockScreen overlay | `animation: 'none'` — security screen should feel instant |

### 2.2 Tab Bar Animation

**Current**: Static tab bar, instant switch.

**New**:
- Active tab icon scales up slightly with spring animation (`withSpring({ damping: 15, stiffness: 150 })`)
- Active tab label fades in with `moti` `AnimatePresence`
- Indicator bar (2px emerald line) slides between tabs using `useAnimatedStyle` + `withTiming(200ms)`
- Tab press triggers light haptic feedback (`impactLight`)

---

## 3. Bottom Sheet System (Replace All Modals)

### 3.1 The Problem

Every modal currently uses React Navigation's `Modal` presentation or a custom `<Modal>` component. These feel like overlays, not integrated surfaces. Bottom sheets feel native, tactile, and premium.

### 3.2 Migration Map

| Current Modal | New Bottom Sheet | Snap Points | Features |
|---------------|-----------------|-------------|----------|
| **ModelSelectorModal** | `ModelSelectorSheet` | [35%, 70%] | Scrollable model list, drag to expand for full view |
| **GenerationSettingsModal** | `GenerationSettingsSheet` | [50%, 90%] | Scrollable settings, drag up for more |
| **ProjectSelector** (in ChatScreen) | `ProjectSelectorSheet` | [40%] | Simple list, dismisses on selection |
| **Debug Panel** (in ChatScreen) | `DebugSheet` | [30%, 60%] | Peek at metrics, pull up for full context info |
| **CustomAlert** | `AlertSheet` | [25%] | Short, auto-dismiss option, replaces center-positioned alert |
| **DownloadManagerScreen** | Keep as modal | Full screen | Too complex for a sheet, but add sheet-style drag handle |
| **GalleryScreen** | Keep as modal | Full screen | Image grid needs full real estate |
| **Fullscreen Image Viewer** | `ImageViewerSheet` | [100%] | Full screen sheet with pinch-to-zoom, swipe down to dismiss |

### 3.3 Bottom Sheet Styling

```
Background: COLORS.surface with 95% opacity
Backdrop: BlurView (blur amount: 10, dark tint) on iOS; rgba(0,0,0,0.7) on Android <31
Handle: 40px wide, 4px tall, COLORS.textMuted, centered
Border radius: 16px (top corners only)
Border: 1px solid COLORS.border (top only)
Shadow: none (stays brutalist)
```

### 3.4 Backdrop Behavior
- Tap backdrop → dismiss sheet
- Backdrop uses `@react-native-community/blur` BlurView on iOS; semi-transparent dark overlay on Android fallback
- Blur amount animates from 0 to 10 as sheet opens (iOS), opacity animates 0 → 0.7 (Android)

---

## 4. Scroll Animations

### 4.1 Chat Message List (ChatScreen — FlatList → FlashList)

**Current**: Static messages, auto-scroll to bottom.

**New**:
- **Staggered entry**: New messages animate in with `moti`:
  - User messages: slide from right + fade in (150ms, translateX: 20 → 0)
  - Assistant messages: slide from left + fade in (150ms, translateX: -20 → 0)
  - Stagger delay: 50ms between consecutive messages on initial load
- **Scroll-to-bottom button**: When user scrolls up >200px from bottom, show a floating "↓" button that:
  - Fades in with scale spring (0.8 → 1.0)
  - Shows unread message count badge
  - Taps smooth-scroll to bottom
  - Disappears with fade + scale down when at bottom
- **Thinking indicator**: Replace simple animated dots with a smoother Lottie animation (3-dot pulse, monochrome)

### 4.2 Conversation List (ChatsListScreen)

**Current**: Static FlatList with long-press delete.

**New**:
- **Staggered mount**: On screen focus, list items animate in with staggered fade + slide up:
  - Each item: `translateY: 12 → 0`, `opacity: 0 → 1`
  - Stagger: 30ms per item, max 10 items animated (rest appear instantly)
- **Swipe-to-delete upgrade**: Use Reanimated gesture handler for buttery smooth swipe:
  - Red background reveals behind item as it slides right
  - Trash icon scales up as swipe progresses
  - Past threshold (40% width) → snap to delete with spring
  - Before threshold → spring back
  - Item height animates to 0 on delete (collapse, 200ms)
- **Pull-to-refresh**: Custom refresh indicator using Reanimated — emerald spinner that winds up as you pull

### 4.3 Model List (ModelsScreen)

**Current**: Static FlatList with expand/collapse.

**New**:
- **Card expand animation**: When tapping a model card to see file variants:
  - Height animates smoothly with Reanimated `measure()` + `withTiming`
  - File items stagger in (30ms each)
  - Chevron rotates 180° with spring
- **Download progress**: Progress bar fills with smooth `withTiming` animation (not jumpy setState)
- **Download complete**: Brief emerald flash on the card border (200ms pulse), then badge appears with scale spring

### 4.4 Sticky Headers

Where applicable (ModelsScreen filter bar, ChatScreen header):
- Header stays pinned on scroll using `Animated.event` with `onScroll`
- Header background blurs progressively as content scrolls behind it (BlurView with animated intensity 0→8 on iOS; opacity fade on Android)
- Subtle bottom border fades in when scrolled (`opacity: 0 → 1` based on scroll offset)

---

## 5. Button & Touch Interactions

### 5.1 Universal Button Press Animation

**Current**: `activeOpacity={0.7}` (just dims).

**New** — Every tappable element gets:
- **Scale down on press**: `withSpring` to `scale: 0.97` (subtle, not bouncy)
- **Scale up on release**: Spring back to `1.0` with `damping: 10, stiffness: 400` (snappy)
- **Haptic feedback**: `impactLight` on press for primary actions, `impactMedium` for destructive actions
- Implementation: Create an `AnimatedPressable` wrapper component that all buttons/cards use

### 5.2 Specific Button Behaviors

| Button | Press Animation | Release Animation | Haptic |
|--------|----------------|-------------------|--------|
| **Send button** (ChatInput) | Scale 0.9 + rotate -5° | Spring back + brief emerald glow (borderColor pulse) | `impactMedium` |
| **Stop button** (generation) | Scale 0.95 | Spring back | `impactHeavy` |
| **New Chat button** | Scale 0.95 | Spring back | `impactLight` |
| **Model card** (tap to expand) | Scale 0.98 (whole card) | Spring back | `selectionClick` |
| **Download button** | Scale 0.95 → hold at 0.95 during press → spring to 1.0 | Checkmark morph if success | `impactMedium` |
| **Delete button** (destructive) | Scale 0.95, background flashes `COLORS.error` at 10% opacity | Spring back | `notificationWarning` |
| **Tab bar item** | Icon scales 0.85 | Spring to 1.1 → settle at 1.0 | `selectionClick` |
| **Toggle/Switch** | Thumb slides with spring + track color transitions (200ms) | N/A | `impactLight` on toggle |
| **Slider thumb** | Scale 1.3 on grab, subtle border appears | Scale back to 1.0 on release | `selectionClick` on grab/release |

---

## 6. Loading States

### 6.1 Skeleton Screens (Moti Skeleton)

Replace all `ActivityIndicator` spinners with skeleton loading:

| Screen | Skeleton Treatment |
|--------|--------------------|
| **HomeScreen** (loading models) | Skeleton cards for model selectors, skeleton list items for recent chats |
| **ChatsListScreen** (loading) | 5 skeleton rows with avatar circle + 2 text lines (name + preview) |
| **ModelsScreen** (API loading) | 4 skeleton model cards with image placeholder + 3 text lines |
| **ChatScreen** (loading model) | Full-width skeleton bar at top + pulsing "Loading model..." text |
| **GalleryScreen** (loading images) | 3-column grid of skeleton squares |

**Skeleton styling**:
```
Background: COLORS.surface
Shimmer: linear gradient sweep from COLORS.surface → COLORS.surfaceLight → COLORS.surface
Speed: 1.5s per sweep
Border radius: match the element being replaced (8px for cards, 4px for text, 50% for circles)
```

**Platform note**: Moti skeleton uses Expo Linear Gradient as a peer dependency. Since we're not using Expo, use `react-native-linear-gradient` (the maintained fork at `https://github.com/react-native-linear-gradient/react-native-linear-gradient`, npm package `react-native-linear-gradient`) — **not** the deprecated `react-native-community` fork. Configure Moti's skeleton `colorMode` to `"dark"` to match our dark theme.

### 6.2 Model Loading Overlay

**Current**: Full-screen modal with ActivityIndicator.

**New**:
- Bottom sheet (not full-screen overlay)
- Lottie animation: Abstract geometric loading (monochrome, terminal-inspired)
- Progress text with animated counter: "Loading Qwen2.5-3B..." with percentage counting up
- Memory bar fills in real-time (Reanimated interpolation)
- On success: Lottie checkmark animation (300ms) → sheet auto-dismisses with spring

### 6.3 Image Generation Progress

**Current**: Inline progress bar + step counter.

**New**:
- Progress ring (circular) instead of bar — more visual, less space
- Ring fills with smooth `withTiming` keyed to step progress
- Preview image fades in with each update (crossfade between preview frames, 200ms)
- Step counter uses animated counter component (numbers roll like a slot machine)
- On completion: Image scales from preview size to full message width with spring + subtle emerald border flash

### 6.4 Download Progress

**Current**: Linear progress bar with percentage.

**New**:
- Smooth animated progress bar (Reanimated `withTiming` interpolation, not jumpy setState)
- Speed indicator smoothly transitions between values
- On completion: Progress bar morphs into checkmark with a single fluid Lottie animation (bar → circle → check)
- The model card subtly pulses emerald once on download complete

---

## 7. Onboarding Flow Upgrade

### 7.1 Slide Transitions

**Current**: Horizontal FlatList with animated dots.

**New**:
- **Parallax layers**: Each slide has a background element that moves at 0.3x scroll speed and a foreground element at 1.0x (parallax via `Animated.event` + `interpolate`)
- **Icon entrance**: Icons on each slide animate in when the slide becomes active:
  - Scale from 0.5 → 1.0 with spring
  - Rotate from -10° → 0° with spring
  - 200ms delay after slide settles
- **Text entrance**: Title and description fade in + slide up (30ms stagger between title and description)
- **Dot indicator upgrade**: Current dots are already animated — enhance with:
  - Active dot morphs from circle to rounded rectangle (width: 8 → 24 with spring)
  - Color transition: muted → emerald (Reanimated color interpolation)
- **Final slide "Get Started" button**: Pulse animation when slide is in view (gentle scale 1.0 → 1.03 → 1.0, 2s cycle) to draw attention

### 7.2 Model Download Screen

- Recommended model cards stagger in (50ms apart, slide up + fade)
- When download starts: card border animates to emerald, progress bar slides in from left
- RAM indicator animates (number counts up from 0 to actual value)

---

## 8. Chat Experience Micro-interactions

### 8.1 Message Streaming

**Current**: Text appends token by token.

**New**:
- New tokens fade in with very subtle opacity animation (0 → 1 over 100ms) — gives a "materializing" feel instead of abrupt text insertion
- Cursor blink indicator at end of streaming text (emerald blinking block cursor, monospace-appropriate, 500ms blink cycle)
- When streaming completes: cursor disappears with fade, generation metadata slides in from bottom of message (translateY: 8 → 0, opacity: 0 → 1, 200ms)

### 8.2 Thinking Blocks

**Current**: Three animated dots.

**New**:
- Replace with Lottie animation: minimal monochrome thinking visualization (three dots that morph into a pulse pattern, or a simple terminal cursor blinking)
- Thinking block expand/collapse: smooth height animation with Reanimated (`measure` + `withTiming`)
- Thinking content fades in when expanded, fades out when collapsed (150ms)

### 8.3 Message Actions

**Current**: Long-press → action menu.

**New**:
- Long-press trigger: message scales to 0.98 + background dims slightly (haptic `impactMedium`)
- Action menu appears as a small bottom sheet (not an alert/popup):
  - Items stagger in (40ms each): Copy, Retry, Edit, Generate Image
  - Each item is a row with icon + label
  - Tap item → sheet dismisses with spring, action executes
  - Tap backdrop → dismiss
- **Edit mode**: Message content transitions to editable with a smooth border-appear animation (border fades in from transparent to `COLORS.borderFocus`)

### 8.4 Image Messages

- Generated images appear with a fade-in + subtle scale (0.95 → 1.0, 200ms)
- Tap image → full-screen viewer via bottom sheet (100% snap point):
  - Image animates from its position in the message to full screen
  - Swipe down to dismiss (sheet gesture)
  - Pinch-to-zoom with Reanimated gesture handler

### 8.5 Empty State (No Messages)

**Current**: Static icon + text.

**New**:
- Icon fades in + floats up (translateY: 20 → 0, 400ms)
- Text fades in with 200ms delay
- Subtle ambient animation on the icon: very slow gentle pulse (opacity 0.7 → 1.0 → 0.7, 4s cycle)

---

## 9. Voice Input Animations

### 9.1 Recording State

**Current**: Pulse animation (scale 1.0 → 1.2).

**Enhance**:
- Keep the pulse but add a concentric ring ripple effect:
  - 3 rings emanate from the mic button outward
  - Each ring: scale 1.0 → 2.0, opacity 1.0 → 0.0, 1s duration
  - Rings stagger by 300ms
  - Color: emerald at 30% opacity
- Waveform visualization: if audio levels available, show a real-time waveform bar chart (5-7 bars) that bounces with audio amplitude (Reanimated shared values driven by audio callback)

### 9.2 Transcription State

**Current**: Loading spinner.

**New**:
- Animated text effect: Transcribed words appear one by one with a typewriter-style fade-in
- Small Lottie animation replacing spinner (monochrome soundwave → text morph)

---

## 10. Gallery Animations

### 10.1 Grid Entry

- Images stagger in on screen mount: 3-column grid loads left-to-right, top-to-bottom
- Each thumbnail: `opacity: 0 → 1`, `scale: 0.9 → 1.0`, stagger: 30ms per item (cap at 12 items)

### 10.2 Selection Mode

- Toggle selection: Checkboxes scale in with spring on each selected image
- Selected images dim slightly (opacity 0.7) and show emerald border
- "Delete Selected" button slides up from bottom with spring

### 10.3 Image Viewer

- Tap thumbnail → image expands to full screen (Reanimated layout transition)
- Metadata panel slides up from bottom
- Swipe down to dismiss → image shrinks back

---

## 11. Settings Screen Animations

### 11.1 Navigation Items

- On screen focus: items stagger in (slide from right + fade, 40ms per item)
- Tap item → scale 0.98 + haptic → navigate

### 11.2 Sliders (ModelSettingsScreen)

**Current**: Standard React Native Slider.

**New**:
- Custom slider built with Reanimated + GestureHandler:
  - Thumb scales up on grab (1.0 → 1.3)
  - Value label appears above thumb (floats up with spring, shows current value)
  - Track fill color: emerald (animated width via Reanimated)
  - Release: thumb scales back, value label fades out
  - Haptic ticks at certain intervals (e.g., every 0.1 for temperature)

### 11.3 Toggles

**Current**: Standard Switch component.

**New**:
- Custom animated toggle:
  - Thumb slides left/right with spring (`withSpring, damping: 15`)
  - Track color transitions smoothly (gray → emerald for on, reverse for off)
  - Thumb slightly overshoots then settles (spring bounce)
  - Haptic on toggle

---

## 12. Elevation & Depth System

### 12.1 Philosophy

We do NOT add traditional shadows (that would break brutalism). Instead, we use:
1. **Blur-based depth**: Background blur for overlapping surfaces (bottom sheets, overlays)
2. **Border luminosity**: Active/elevated elements get brighter borders
3. **Layer stacking**: `background → surface → surfaceLight → overlay` hierarchy enforced via z-index + blur
4. **Scale-based hierarchy**: Active elements are slightly larger (1.02x) than resting state

### 12.2 Elevation Tokens

| Level | Use Case | Treatment |
|-------|----------|-----------|
| `elevation-0` | Background, base content | `COLORS.background`, no border |
| `elevation-1` | Cards, list items | `COLORS.surface`, `COLORS.border` border |
| `elevation-2` | Active/focused cards, expanded items | `COLORS.surfaceLight`, `COLORS.borderLight` border, scale 1.01 |
| `elevation-3` | Bottom sheets, overlays | `COLORS.surface` at 95% opacity, backdrop blur (10) on iOS / `rgba(0,0,0,0.7)` on Android, `COLORS.borderLight` top border |
| `elevation-4` | Critical overlays (alerts, confirmations) | `COLORS.surface` at 98% opacity, backdrop blur (15) on iOS / `rgba(0,0,0,0.8)` on Android, emerald top border accent |

### 12.3 Focus Ring

Interactive elements on focus/active get a subtle emerald glow:
- Not a shadow — a 1px emerald border that animates in (opacity 0 → 1, 150ms)
- This replaces the current static `borderFocus` with an animated version
- Works identically on iOS and Android (pure border + opacity, no platform-specific rendering)

---

## 13. Haptic Feedback Map

| Action | Haptic Type | iOS | Android |
|--------|-------------|-----|---------|
| Button press (primary) | `impactLight` | Taptic light | Short vibration (10ms) |
| Button press (destructive) | `notificationWarning` | Taptic warning | Double vibration |
| Send message | `impactMedium` | Taptic medium | Medium vibration (20ms) |
| Stop generation | `impactHeavy` | Taptic heavy | Long vibration (30ms) |
| Tab switch | `selectionClick` | Taptic selection | Short tick |
| Toggle switch | `impactLight` | Taptic light | Short vibration |
| Slider grab/release | `selectionClick` | Taptic selection | Short tick |
| Slider tick (value milestones) | `selectionClick` | Taptic selection | Short tick |
| Swipe-to-delete threshold | `impactMedium` | Taptic medium | Medium vibration |
| Long-press trigger | `impactMedium` | Taptic medium | Medium vibration |
| Pull-to-refresh trigger | `impactLight` | Taptic light | Short vibration |
| Download complete | `notificationSuccess` | Taptic success | Pattern vibration |
| Error | `notificationError` | Taptic error | Pattern vibration |
| Model loaded | `notificationSuccess` | Taptic success | Pattern vibration |

**Implementation**: Create `src/utils/haptics.ts` with a `triggerHaptic(type)` function that wraps `react-native-haptic-feedback` and silently no-ops if haptics are unavailable (e.g., emulators, devices without haptic hardware).

---

## 14. Lottie Animations Needed

Custom monochrome Lottie files to commission/find (all monochrome white/emerald on transparent):

| Animation | Where Used | Description | Duration |
|-----------|-----------|-------------|----------|
| `thinking.json` | ChatMessage thinking state | 3 dots morphing/pulsing | Loop, ~1s |
| `loading-model.json` | Model loading overlay | Geometric/circuit loading pattern | Loop, ~2s |
| `download-complete.json` | Model download finish | Progress bar → circle → checkmark morph | One-shot, ~800ms |
| `success-check.json` | General success feedback | Simple checkmark draw | One-shot, ~500ms |
| `error-x.json` | General error feedback | Simple X draw | One-shot, ~500ms |
| `empty-state.json` | Empty conversation/list | Minimal floating chat bubble | Loop, ~4s |
| `onboarding-*.json` (4) | Onboarding slides | Per-slide hero illustrations | Loop, ~3s each |
| `voice-wave.json` | Voice transcription state | Soundwave → text morph | Loop, ~1.5s |
| `image-generating.json` | Image generation progress | Abstract pixel assembly | Loop, ~2s |

**File size target**: < 50KB each for smooth playback on low-end Android devices.

---

## 15. Implementation Priority & Phases

### Phase 1: Foundation (Week 1-2)
**Install & configure core libraries**
1. Install `react-native-reanimated` v3, configure babel plugin
2. Install `@gorhom/bottom-sheet`
3. Install `moti` (+ `react-native-linear-gradient` for skeleton shimmer)
4. Install `react-native-haptic-feedback`
5. Install `lottie-react-native`
6. Install `@react-native-community/blur`
7. Run `pod install` for iOS, verify Android gradle sync
8. Create `AnimatedPressable` wrapper component (universal button animation)
9. Create `AnimatedEntry` wrapper component (staggered list item entry via moti)
10. Add elevation tokens to `src/constants/index.ts`
11. Add haptic utility in `src/utils/haptics.ts`
12. Verify all libraries work on both iOS simulator and Android emulator

### Phase 2: Bottom Sheets (Week 2-3)
**Migrate modals to bottom sheets**
1. Replace `ModelSelectorModal` → `ModelSelectorSheet`
2. Replace `GenerationSettingsModal` → `GenerationSettingsSheet`
3. Replace `CustomAlert` → `AlertSheet`
4. Replace ChatScreen project selector → `ProjectSelectorSheet`
5. Replace ChatScreen debug panel → `DebugSheet`
6. Add backdrop blur (iOS) / dark overlay (Android) to all sheets
7. Style all sheets with elevation-3 tokens
8. Test keyboard interaction on both platforms (especially GenerationSettingsSheet with text inputs)

### Phase 3: Chat Polish (Week 3-4)
**Elevate the core chat experience**
1. Message entry animations (staggered slide + fade via moti)
2. Streaming cursor indicator (blinking block cursor)
3. Streaming token fade-in effect
4. Generation metadata slide-in on completion
5. Scroll-to-bottom button with badge
6. Thinking indicator Lottie replacement
7. Message action bottom sheet (replace long-press menu)
8. Image message fade-in + tap-to-fullscreen with gesture dismiss
9. Empty state animation
10. Haptic feedback on send, stop, long-press

### Phase 4: Lists & Loading (Week 4-5)
**Polish all list screens**
1. Skeleton loading screens (Home, ChatsList, Models, Gallery) using Moti Skeleton
2. Staggered entry animations for all lists
3. Enhanced swipe-to-delete (Reanimated gesture, collapse animation)
4. Model card expand/collapse animation
5. Download progress smoothing (Reanimated interpolation)
6. Download complete feedback (Lottie + haptic + border flash)
7. Pull-to-refresh custom indicator
8. Replace FlatList with FlashList where applicable
9. Test scroll performance on low-end Android device

### Phase 5: Navigation & Transitions (Week 5-6)
**Screen-level polish**
1. Tab bar indicator animation (sliding emerald line)
2. Tab icon scale animation
3. Navigation transition spring tuning
4. Onboarding parallax + icon entrance animations
5. Model loading bottom sheet with Lottie + progress
6. Settings screen staggered entry
7. Custom animated sliders and toggles
8. Voice recording ripple effect enhancement

### Phase 6: Final Polish (Week 6-7)
**Details that make it premium**
1. Commission/source all Lottie animations
2. Image generation circular progress ring
3. Gallery grid stagger + image viewer transitions
4. Animated counter components (stats, progress numbers)
5. Haptic feedback tuning (test on real iOS and Android devices, adjust intensity)
6. Performance audit (ensure 60fps on low-end devices, profile with Flipper/Perf Monitor)
7. Accessibility audit (ensure animations respect `useReducedMotion()` on both platforms)
8. Update `DESIGN_PHILOSOPHY_SYSTEM.md` with animation/interaction tokens

---

## 16. Performance Guardrails

- All animations use Reanimated worklets (UI thread by default) — never Animated API on JS thread for new work
- Respect `useReducedMotion()` from Reanimated — disable all decorative animations, keep functional ones (progress bars, loading states)
- Skeleton loaders: max 6 items rendered (don't over-create)
- Stagger animations: cap at 10-12 items, rest appear instantly
- FlashList for any list > 20 items
- Bottom sheet backdrop blur: fall back to semi-transparent overlay on Android < 12 (blur can be expensive)
- Lottie files: keep under 50KB each, use bodymovin optimization
- Profile on lowest-target device (Android) before merging each phase
- Avoid `measure()` in hot paths (e.g., during scroll) — cache layout measurements
- Test on both iOS simulator and a real Android device for each phase

---

## 17. UI/UX Testing Strategy

Animations, styles, and interactions are notoriously hard to unit test. We use a layered approach: visual snapshot regression, automated E2E flows, structured manual checklists, and performance profiling.

### 17.1 Visual Regression Testing — Storybook + Snapshot

**Tool**: [React Native Storybook](https://storybook.js.org/tutorials/intro-to-storybook/react-native/en/get-started/) + screenshot comparison

**Setup**:
1. Install `@storybook/react-native` alongside the app (dev dependency, not bundled in production)
2. Create stories for every component with visual states (idle, pressed, loading, error, disabled, focused)
3. Use `@storybook/addon-react-native-web` to also run stories in a browser for fast iteration

**Stories to create** (one per component, covering all visual states):

| Component | States to Capture |
|-----------|-------------------|
| `AnimatedPressable` | idle, pressed (scale 0.97), disabled |
| `Button` | primary, secondary, outline, ghost, loading, disabled |
| `Card` | default, pressed, elevation-1, elevation-2 |
| `ChatMessage` | user message, assistant message, streaming (with cursor), thinking block (expanded/collapsed), with image, with metadata, edit mode |
| `ChatInput` | empty, with text, with attachment, recording state, transcribing state, image mode active, disabled |
| `ModelCard` | default, downloading (25%, 50%, 75%), download complete, expanded with files |
| `ModelSelectorSheet` | open with models, loading skeleton, empty state |
| `GenerationSettingsSheet` | open at 50%, open at 90% |
| `AlertSheet` | info, warning, destructive |
| `Skeleton screens` | Home skeleton, ChatsList skeleton, Models skeleton, Gallery skeleton |
| `VoiceRecordButton` | idle, recording (pulsing), transcribing, error |
| `ThinkingIndicator` | Lottie playing |
| `Toggle` | on, off, transitioning |
| `Slider` | idle, grabbed (thumb scaled), with value label |
| `Tab bar` | each tab active, indicator position |
| `Onboarding slides` | each slide with dot indicator state |

**Screenshot comparison**:
- Use `react-native-storybook-loader` + Detox or Appium to capture screenshots on both iOS and Android simulators
- Compare against baseline images using `pixelmatch` or `reg-suit`
- CI pipeline flags any pixel diff > 0.1% as a regression
- Baseline images stored in `__tests__/snapshots/ui/`

### 17.2 Component Tests — RNTL (React Native Testing Library)

Extend existing `__tests__/rntl/` tests to verify animation _triggers_ (not visual output):

| Test | What It Verifies |
|------|------------------|
| `AnimatedPressable.test.tsx` | `onPressIn` triggers scale change, `onPressOut` triggers spring back, haptic called |
| `BottomSheet.test.tsx` | Sheet renders at correct snap point, backdrop tap calls `onClose`, gesture dismiss works |
| `SkeletonScreen.test.tsx` | Skeleton renders when `isLoading=true`, real content renders when `isLoading=false` |
| `SwipeToDelete.test.tsx` | Swipe gesture past threshold triggers `onDelete`, swipe below threshold snaps back |
| `StaggeredList.test.tsx` | Items mount with correct delay props passed to moti `MotiView` |
| `ScrollToBottom.test.tsx` | Button appears when scroll offset > 200, disappears at bottom, tap scrolls to end |
| `MessageActions.test.tsx` | Long-press opens action sheet, tap action triggers callback + dismisses sheet |

**How to test Reanimated animations in RNTL**:
- Use `jest.setup.js` with `react-native-reanimated/mock` for unit tests
- Test that animated shared values reach expected end states using `getAnimatedStyle` from `react-native-reanimated` test utils
- For moti: verify `MotiView` receives correct `from`, `animate`, and `transition` props

### 17.3 Manual UI Checklist (Per Phase)

A structured checklist to run manually on real devices after each phase. Saved as `docs/ui-checklist.md` for the team.

**Device matrix**: Test on at minimum:
- iPhone 15 Pro (or latest simulator) — iOS
- iPhone SE 3rd gen (or oldest supported) — iOS low-end
- Pixel 7 / Samsung S23 (emulator or real) — Android flagship
- Pixel 4a / budget Samsung (real device preferred) — Android low-end

**Per-phase checklist template**:

```markdown
## Phase [N] UI Checklist — [Phase Name]

### Animation Quality
- [ ] All spring animations settle within 300ms (no lingering oscillation)
- [ ] No animation jank (dropped frames) visible to naked eye
- [ ] Stagger animations feel natural, not robotic
- [ ] Animations are disabled when system "Reduce Motion" is ON

### Consistency
- [ ] All bottom sheets use same handle style, same border radius, same backdrop
- [ ] All pressable elements use AnimatedPressable (uniform press feedback)
- [ ] All haptics fire at correct moments (test with device in hand)
- [ ] Skeleton loaders match the layout of real content they replace

### Cross-Platform
- [ ] iOS blur backdrop renders correctly
- [ ] Android fallback overlay renders correctly (no blur artifacts)
- [ ] Haptics work on iOS (Taptic Engine feel)
- [ ] Haptics work on Android (vibration patterns feel intentional)
- [ ] Bottom sheets handle keyboard correctly on both platforms
- [ ] Navigation transitions feel consistent across platforms

### Edge Cases
- [ ] Fast tapping doesn't break animations (no stacking/flickering)
- [ ] Interrupting an animation mid-way looks graceful (not glitchy)
- [ ] Rotating device mid-animation doesn't crash
- [ ] Background/foreground transition during animation doesn't crash
- [ ] Empty states animate correctly (not just when there's data)
```

### 17.4 Performance Profiling

**Tools**:
- **React Native Perf Monitor** (`Cmd+M` → "Show Perf Monitor" on Android, shake → Perf Monitor on iOS): Watch JS and UI thread frame rates during animations. Both must stay at 60fps.
- **Flipper** (React Native plugin): Profile JS bridge traffic during animations — animations should NOT cause JS bridge calls (Reanimated runs on UI thread).
- **Xcode Instruments** (iOS): Time Profiler for CPU, Core Animation for GPU compositing. Check that blur and spring animations aren't over-taxing the GPU.
- **Android Studio Profiler**: CPU and GPU rendering profiling. Look for frame drops during list scrolls and bottom sheet gestures.

**Benchmarks to hit**:

| Metric | Target | How to Measure |
|--------|--------|---------------|
| UI thread FPS during animations | >= 58fps (allow 2 frame drops) | Perf Monitor |
| JS thread FPS during animations | >= 58fps | Perf Monitor |
| Bottom sheet open/close | < 300ms perceived | Stopwatch / slow-mo video |
| Staggered list entry (10 items) | < 500ms total | Slow-mo video |
| Skeleton → real content transition | < 100ms (no flash of unstyled content) | Visual inspection |
| Lottie animation CPU usage | < 5% per animation | Instruments / Android Profiler |
| Memory increase from animation libs | < 15MB total | Xcode Memory Graph / Android Memory Profiler |

**When to profile**: After each phase, before merging. Profile on the lowest-end target device (budget Android phone). If it's smooth there, it's smooth everywhere.

### 17.5 Accessibility Testing

- **VoiceOver (iOS) + TalkBack (Android)**: Verify all animated elements are still accessible. Bottom sheets must announce themselves. Buttons must remain focusable during/after animation.
- **Reduce Motion**: Toggle "Reduce Motion" (iOS) / "Remove animations" (Android) → verify all decorative animations are disabled, only functional animations remain (progress bars, loading indicators).
- **Switch Control**: Verify bottom sheets are navigable with Switch Control. Dismiss gestures must have button alternatives.

---

## 18. What We're NOT Doing

Staying true to brutalism means we explicitly avoid:

- **Shadows/drop shadows**: No elevation via shadow. Depth comes from blur + border luminosity
- **Gradients on surfaces**: No gradient backgrounds on cards or buttons
- **Color animations**: No rainbow effects, color cycling, or multi-color transitions (only monochrome ↔ emerald)
- **Bounce/elastic overuse**: Springs should be snappy and settle fast (high damping). No jelly/rubber-band effects
- **Decorative particles**: No confetti, sparkles, or particle effects
- **3D transforms**: No card flips, 3D rotations, or perspective effects
- **Auto-playing carousels**: Nothing moves without user intent
- **Sound effects**: Haptics only, no audio feedback
- **FABs**: No floating action buttons — keep actions inline and contextual

---

## References

- [Animate React Native](https://www.animatereactnative.com/animations) — Animation inspiration catalog
- [React Native Reanimated Docs](https://docs.swmansion.com/react-native-reanimated/)
- [Moti](https://moti.fyi/) — Declarative animations + skeleton
- [Moti Skeleton](https://moti.fyi/skeleton) — Skeleton loader component
- [@gorhom/bottom-sheet](https://gorhom.dev/react-native-bottom-sheet/) — Premium bottom sheet
- [Best RN Animation Libraries 2025](https://www.f22labs.com/blogs/9-best-react-native-animation-libraries/)
- [RN Animation Libraries Overview](https://arccusinc.com/blog/best-animation-ui-component-libraries-for-react-native-in-2025/)
