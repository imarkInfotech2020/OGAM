---
layout: default
title: How to Run Stable Diffusion on Your Android Phone (On-Device AI Image Generation)
parent: Guides
nav_order: 6
description: Generate AI images locally on your Android phone using Stable Diffusion — no cloud, no API key, no subscription. Complete guide for on-device image generation with Off Grid.
faq:
  - q: Can Android phones run Stable Diffusion locally?
    a: Yes. All Android phones running Off Grid use the MNN backend (CPU-based, works on all devices). Phones with Snapdragon 8 Gen 1 or newer also get QNN NPU acceleration, which is 2-3x faster.
  - q: How long does image generation take on Android?
    a: On Snapdragon 8 Gen 2/3 with QNN NPU, 512x512 images take roughly 5-10 seconds at 20 steps. CPU-only (MNN) takes around 15 seconds on the same chip.
  - q: Do I need a specific chipset for image generation?
    a: No. MNN backend works on all ARM64 Android devices. QNN NPU acceleration requires Snapdragon 8 Gen 1 or newer for the fastest results.
---

# How to Run Stable Diffusion on Your Android Phone (On-Device AI Image Generation)

Every image you generate on Midjourney, DALL-E, or Adobe Firefly is stored on their servers. Your prompts, the images, metadata. It's used for training and stored indefinitely.

Off Grid runs Stable Diffusion entirely on your phone using Alibaba's MNN framework (CPU) or Qualcomm's QNN engine (NPU). Nothing is uploaded.

---

## Requirements

- Android phone with 4GB RAM minimum (6GB+ recommended)
- Android 10 or later
- ~1–2GB free storage per model
- Internet once for the model download

---

## Step 1 — Install Off Grid

[Get Off Grid on Google Play](https://play.google.com/store/apps/details?id=ai.offgridmobile&utm_source=offgrid-docs&utm_medium=website&utm_campaign=download){: .btn .btn-green }

---

## Step 2 — Download an image model

1. Open Off Grid → **Models** → switch to the **Image** tab
2. Choose a model based on your chipset:

**All devices (MNN/CPU):**
- Anything V5 — anime/stylised art
- Absolute Reality — photorealistic
- QteaMix — versatile
- ChilloutMix — portrait-focused
- CuteYukiMix — stylised

**Snapdragon 8 Gen 1+ (QNN/NPU) — faster:**
- DreamShaper, Realistic Vision, MajicmixRealistic, and 15+ more

3. Tap **Download** (~1–1.2GB per model)

---

## Step 3 — Generate your first image

1. Open Off Grid → **Image Generation**
2. Type a prompt: `a mountain valley at sunset, photorealistic, golden hour`
3. Tap **Generate**

Off Grid automatically detects whether your device supports QNN NPU and uses it if available, falling back to MNN (CPU) otherwise.

---

## Performance

| Backend | Chipset | Time for 512×512 @ 20 steps |
|---|---|---|
| QNN NPU | Snapdragon 8 Gen 2/3/4 | ~5–10s |
| QNN NPU | Snapdragon 8 Gen 1 | ~10–15s |
| MNN CPU | Any ARM64 | ~15s (Snapdragon 8 Gen 3) |
| MNN CPU | Mid-range | ~25–40s |

---

## Tips for better images

**Prompt structure** — `[subject], [style], [lighting], [quality descriptors]`. Example: `a red fox in a forest, digital art, golden hour lighting, highly detailed, sharp focus`

**Use prompt enhancement** — Off Grid can use your loaded text model to automatically expand a short prompt into a detailed one. Enable it in the generation screen. Just type `a fox in a forest` and let the LLM do the rest.

**Steps** — 20 steps is a good default. 30 gives marginally better quality at the cost of ~50% more time.

**Negative prompt** — Add `blurry, low quality, distorted, deformed` to suppress common artifacts.

---

## Related guides

- [How to Run Stable Diffusion on Your iPhone]({{ '/guides/stable-diffusion-iphone' | relative_url }})
- [How to Run LLMs Locally on Your Android Phone in 2026]({{ '/guides/run-llms-locally-android' | relative_url }})
