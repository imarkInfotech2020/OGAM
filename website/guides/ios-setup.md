---
layout: default
title: iOS Setup
parent: Guides
nav_order: 2
description: How to run LLMs locally on your iPhone in 2026 — no cloud, no account, no subscription. Step-by-step setup guide for Off Grid on iOS.
---

# iOS Setup

Run a local AI model on your iPhone with no cloud dependency. This guide covers everything from download to first inference.

---

## Requirements

- iPhone 12 or newer (A14 Bionic chip or later)
- iOS 16 or later
- At least 3GB free storage (for the app + one model)
- Internet connection for the initial model download only

---

## Step 1 — Install Off Grid

[Download from the App Store](https://apps.apple.com/us/app/off-grid-local-ai/id6759299882){: .btn .btn-green }

The app itself is under 50MB. Models are downloaded separately inside the app.

---

## Step 2 — Download a model

1. Open Off Grid
2. Tap **Models** in the tab bar
3. Select a model — if you're starting out, pick **Phi-3 Mini** (~2GB)
4. Tap **Download**

The download goes to your device. This is the only step that requires internet.

---

## Step 3 — Load and chat

1. Tap **Load** next to your downloaded model
2. Wait 5–15 seconds for it to load into memory
3. Tap **Chat** and start talking

You're now running AI entirely on your iPhone.

---

## Tips for better performance

**Use Metal acceleration** — Off Grid automatically uses Apple's Metal GPU for inference. This makes models 3–5x faster than CPU-only.

**Close background apps** — iOS may reclaim RAM from background apps. If the model unloads unexpectedly, close other apps and reload.

**Quantisation matters** — For 4GB RAM devices (iPhone 12/13), stick to Q4 models. For 8GB+ (iPhone 15 Pro+), you can use Q5 or Q8 for slightly better quality.

---

## Offline use

Once a model is downloaded, Off Grid works in airplane mode. Put your phone offline and it continues to work normally.

---

## Related guides

- [Which model should I use?]({{ '/guides/which-model' | relative_url }})
- [Connecting Ollama from your phone]({{ '/guides/ollama-android' | relative_url }})
