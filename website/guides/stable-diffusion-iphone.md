---
layout: default
title: How to Run Stable Diffusion on Your iPhone (On-Device AI Image Generation)
parent: Guides
nav_order: 7
description: Generate AI images locally on your iPhone using Stable Diffusion and Core ML - no cloud, no API key, no subscription. Complete guide for iOS image generation.
faq:
  - q: How does image generation work on iPhone?
    a: Off Grid uses Apple's Core ML framework with Neural Engine (ANE) acceleration. The entire pipeline runs on-device - text encoding, UNet denoising, VAE decoding - with no data sent anywhere.
  - q: Which iPhones support image generation?
    a: iPhone 12 or newer. Palettized models (~1GB) run on any supported iPhone. Full precision models (~4GB) run best on iPhone 14 Pro and newer with more RAM and a faster Neural Engine.
  - q: How long does image generation take on iPhone?
    a: On A17 Pro (iPhone 15 Pro), 512x512 at 20 steps takes roughly 8-15 seconds with the palettized model. Full precision models are faster on the Neural Engine but use more RAM.
---

# How to Run Stable Diffusion on Your iPhone (On-Device AI Image Generation)

Off Grid uses Apple's Core ML pipeline with Neural Engine (ANE) acceleration to run Stable Diffusion entirely on your iPhone. No GPU server. No upload. No cost per image.

The pipeline: text prompt → CLIP tokenizer → text encoder → UNet (denoising, DPM-Solver scheduler) → VAE decoder → 512×512 image. All on-device.

---

## Requirements

- iPhone 12 or newer (A14 Bionic or later)
- iOS 16 or later
- 2GB free storage minimum (palettized models ~1GB, full precision ~4GB)
- Internet once for the model download

---

## Step 1 - Install Off Grid

[Download from the App Store](https://apps.apple.com/us/app/off-grid-local-ai/id6759299882?utm_source=offgrid-docs&utm_medium=website&utm_campaign=download){: .btn .btn-green }

---

## Step 2 - Download an image model

Open Off Grid → **Models** → **Image** tab. Available Core ML models:

| Model | Size | Best for |
|---|---|---|
| **SD 1.5 Palettized** | ~1GB | Best starting point - runs on all supported iPhones |
| **SD 2.1 Palettized** | ~1GB | Slightly better quality than 1.5 palettized |
| **SDXL iOS** | ~2GB | Higher resolution (768×768), 4-bit mixed-bit palettized |
| **SD 1.5 Full** | ~4GB | Fastest on Neural Engine, best quality, needs 6GB+ RAM |
| **SD 2.1 Base Full** | ~4GB | Best quality overall, needs 6GB+ RAM |

**Start with SD 1.5 Palettized** - it's ~1GB, runs on any supported iPhone, and delivers solid results.

---

## Step 3 - Generate an image

1. Open Off Grid → **Image Generation**
2. Enter your prompt: `a misty forest at dawn, cinematic lighting, photorealistic`
3. Tap **Generate**

You'll see a real-time preview update as the model denoises the image step by step.

---

## Performance

| iPhone | Model | Time @ 20 steps |
|---|---|---|
| iPhone 15 Pro (A17 Pro) | SD 1.5 Palettized | ~8–12s |
| iPhone 15 Pro (A17 Pro) | SD 1.5 Full | ~8–15s |
| iPhone 14 Pro (A16) | SD 1.5 Palettized | ~10–16s |
| iPhone 13 (A15) | SD 1.5 Palettized | ~14–20s |
| iPhone 12 (A14) | SD 1.5 Palettized | ~18–28s |

> **Note:** Palettized models (~1GB) use 6-bit quantisation and are slightly slower due to dequantisation overhead. Full precision models (~4GB) are faster on the Neural Engine but require iPhone 14 Pro or newer.

---

## Tips

**Prompt enhancement** - Off Grid can use your loaded text model to expand a short prompt automatically. Type `a fox in a forest` and let the LLM write the detailed prompt for you.

**Real-time preview** - Watch the image form step-by-step. You can cancel early if the composition is wrong without waiting for the full generation.

**Steps** - 20 is the default. Palettized models benefit from 25–30 steps for better detail. DPM-Solver converges faster than older schedulers, so you need fewer steps than you might expect.

---

## Related guides

- [How to Run Stable Diffusion on Your Android Phone]({{ '/guides/stable-diffusion-android' | relative_url }})
- [How to Run LLMs Locally on Your iPhone in 2026]({{ '/guides/run-llms-locally-iphone' | relative_url }})
