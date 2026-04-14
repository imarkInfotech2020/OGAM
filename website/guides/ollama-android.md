---
layout: default
title: How to Use Ollama From Your Android Phone in 2026
parent: Guides
nav_order: 8
description: Connect your Android phone to your home Ollama server and use larger models like Llama 3.1 70B over your local network — no cloud, completely private.
faq:
  - q: Can I use Ollama from my Android phone?
    a: Yes. Off Grid can connect to any Ollama server on your local network or accessible via VPN. You get access to any model loaded on your desktop from your phone.
  - q: Does connecting to Ollama require internet?
    a: No. Off Grid connects to Ollama over your local WiFi network. No traffic goes to the internet.
---

# How to Use Ollama From Your Android Phone in 2026

Ollama lets you run large language models on your desktop. Models that are too big for your phone — Llama 3.1 70B, Mistral Large, CodeLlama 34B — can run on your desktop and be accessed from your phone over your home network.

---

## What you need

- Desktop or laptop running [Ollama](https://ollama.ai) with at least one model loaded
- Android phone with [Off Grid](https://play.google.com/store/apps/details?id=ai.offgridmobile) installed
- Both devices on the same WiFi network (or Ollama accessible via VPN/Tailscale)

---

## Step 1 — Configure Ollama to accept remote connections

By default Ollama only listens on localhost. To accept connections from your phone:

**macOS / Linux:**
```bash
OLLAMA_HOST=0.0.0.0 ollama serve
```

Or set it as a permanent environment variable:
```bash
# ~/.zshrc or ~/.bashrc
export OLLAMA_HOST=0.0.0.0
```

**Windows:** Set `OLLAMA_HOST=0.0.0.0` as a system environment variable and restart Ollama.

---

## Step 2 — Find your desktop's local IP

**macOS:** System Settings → Network → your WiFi connection → IP address (e.g. `192.168.1.42`)

**Windows:** `ipconfig` in terminal → IPv4 address under your WiFi adapter

**Linux:** `ip addr show` — look for your WiFi interface

---

## Step 3 — Connect from Off Grid

1. Open Off Grid → **Settings** → **Remote Servers**
2. Tap **Add Server**
3. Enter: `http://192.168.1.42:11434` (replace with your desktop's IP)
4. Tap **Test Connection** — it should show green
5. Tap **Save**

---

## Step 4 — Select a model and chat

1. Open the model picker
2. You'll see models loaded on your Ollama server listed under **Remote**
3. Select one and start chatting

Your queries go from your phone → your desktop → back to your phone. Nothing touches the internet.

---

## Using Tailscale for access outside your home

If you want to use Ollama from your phone while away from home, [Tailscale](https://tailscale.com) creates a private VPN between your devices. Install it on both your desktop and phone, then use the Tailscale IP of your desktop instead of the local one.

---

## FAQ

**Can I use Ollama from my phone without internet?**
Yes — over local WiFi only. For remote access you need Tailscale or a similar VPN.

**Which Ollama models work best from a phone?**
Any model loaded on your desktop works. `llama3.1:70b` and `mistral-large` are popular choices since they're too large to run locally on a phone.

---

## Related guides

- [How to Run LLMs Locally on Your Android Phone in 2026]({{ '/guides/run-llms-locally-android' | relative_url }})
