---
layout: default
title: Android Setup
parent: Guides
nav_order: 3
description: How to run LLMs locally on your Android phone in 2026 — no cloud, no account, no subscription. Complete setup guide for Off Grid on Android.
---

# Android Setup

Run a local AI model on your Android phone — completely offline, no account, no API key.

---

## Requirements

- Android 10 or later
- 4GB RAM minimum (6GB+ recommended for larger models)
- At least 3GB free storage
- Internet for the initial model download only

---

## Step 1 — Install Off Grid

[Download from Google Play](https://play.google.com/store/apps/details?id=ai.offgridmobile){: .btn .btn-green }

---

## Step 2 — Download a model

1. Open Off Grid
2. Tap **Models**
3. Choose a model — **Phi-3 Mini** or **Gemma 2B** are good starting points for most Android devices
4. Tap **Download**

---

## Step 3 — Load and chat

1. Tap **Load** next to your downloaded model
2. The model loads into RAM (5–20 seconds depending on device)
3. Tap **Chat** and start

---

## Android-specific notes

**Vulkan acceleration** — On supported devices, Off Grid uses Vulkan for GPU inference. This significantly reduces response time compared to CPU-only. Devices with Snapdragon 8 Gen 2 and newer, Dimensity 9000+, and Exynos 2400 support this.

**Background behaviour** — Android may kill the model process if the app is backgrounded for too long. Keep Off Grid in the foreground during long conversations, or enable "Don't optimise battery" for the app in settings.

**Storage** — Models are stored in app-private storage. They don't appear in your gallery or Files app, which means they also won't be accidentally deleted by a cleaner app.

---

## Tested devices

| Device | RAM | Models confirmed working |
|---|---|---|
| Pixel 8 Pro | 12GB | Llama 3.1 8B, Mistral 7B |
| Samsung S24 | 8GB | Llama 3.2 3B, Mistral 7B Q4 |
| Pixel 7 | 8GB | Llama 3.2 3B, Phi-3 Mini |
| OnePlus 12 | 12GB | Llama 3.1 8B |
| Samsung A55 | 8GB | Phi-3 Mini, Gemma 2B |

---

## Related guides

- [Which model should I use?]({{ '/guides/which-model' | relative_url }})
- [Run Stable Diffusion on Android]({{ '/guides/stable-diffusion-android' | relative_url }})
- [Connect Ollama from your phone]({{ '/guides/ollama-android' | relative_url }})
