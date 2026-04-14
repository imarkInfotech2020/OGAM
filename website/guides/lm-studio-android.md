---
layout: default
title: How to Use LM Studio From Your Android Phone in 2026
parent: Guides
nav_order: 16
description: Connect Off Grid on Android to your LM Studio server and access larger models like Llama 3.1 70B over your local WiFi network — no cloud, completely private.
faq:
  - q: Can I use LM Studio from my Android phone?
    a: Yes. Off Grid connects to LM Studio's local server over your WiFi network. You get access to any model loaded in LM Studio from your Android phone.
  - q: Does it require internet?
    a: No. The connection is over your local WiFi. No traffic touches the internet.
---

# How to Use LM Studio From Your Android Phone in 2026

LM Studio runs large models on your Mac or PC with a polished interface. Models too large for your phone — Llama 3.1 70B, DeepSeek, Mistral Large — run on your desktop and stream to your phone over WiFi.

---

## What you need

- Mac or Windows PC running [LM Studio](https://lmstudio.ai) with a model loaded
- Android phone with [Off Grid](https://play.google.com/store/apps/details?id=ai.offgridmobile&utm_source=offgrid-docs&utm_medium=website&utm_campaign=download) installed
- Both devices on the same WiFi network

---

## Step 1 — Start LM Studio's local server

1. Open LM Studio
2. Load a model (click the model dropdown at the top)
3. Go to the **Local Server** tab (left sidebar)
4. Click **Start Server**
5. Enable **"Allow connections from network"** in the server settings
6. Note the displayed port (default: **1234**)

---

## Step 2 — Find your computer's local IP

**macOS:** System Settings → Network → Wi-Fi → Details → IP address (e.g. `192.168.1.55`)

**Windows:** Open PowerShell → `ipconfig` → look for IPv4 Address under your Wi-Fi adapter

---

## Step 3 — Connect from Off Grid

1. Open Off Grid → **Settings** → **Remote Servers**
2. Tap **Add Server**
3. Enter: `http://192.168.1.55:1234` (use your computer's actual IP)
4. Tap **Test Connection** → should show green
5. Tap **Save**

Off Grid automatically discovers models available on the server.

---

## Step 4 — Select a model and chat

Open the model picker in Off Grid. Your LM Studio models appear under the server name. Tap one to make it active and start chatting.

Responses stream in real time via SSE — the same way LM Studio's own interface works.

---

## Using Tailscale for access outside home

Install [Tailscale](https://tailscale.com) on both your computer and phone. Use your computer's Tailscale IP instead of the local IP. You can now access LM Studio from anywhere — office, travel, anywhere with a data connection.

---

## Related guides

- [Remote Servers — Connect Ollama, LM Studio, and LocalAI]({{ '/guides/remote-servers' | relative_url }})
- [How to Use Ollama From Your Android Phone in 2026]({{ '/guides/ollama-android' | relative_url }})
- [How to Run LLMs Locally on Your Android Phone in 2026]({{ '/guides/run-llms-locally-android' | relative_url }})
