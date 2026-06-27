---
title: "How to Connect Your iPhone or Android to Ollama or LM Studio in 2026 (Local Network, No Cloud)"
published: false
description: Run big models on your desktop and use them from your phone over your own Wi-Fi. Off Grid auto-discovers Ollama, LM Studio, and LocalAI servers. No cloud.
tags: ai, ollama, lmstudio, mobile
cover_image:
---

Your desktop can run a model your phone cannot. A machine with 32 GB of RAM and a real GPU will serve a 14B model while your phone struggles past 4B. The usual fix is to pay a cloud API. The better fix is to point your phone at your own desktop.

Off Grid is a free, open-source phone app that connects to any OpenAI-compatible server on your local network. Ollama, LM Studio, LocalAI, your own. It finds the models for you and streams the answers back.

**[GitHub →](https://github.com/off-grid-ai/mobile)**

Free, open-source. Your traffic stays on your own network.

<!-- GIF: adding a server address in Off Grid, watching the model list auto-populate, then sending a chat -->

## Why run the model on your desktop

A phone is a great client and a small server. Your desktop is the opposite.

Keep the heavy model on the machine that can hold it. Ollama or LM Studio loads a 14B or 32B model into your desktop's RAM and GPU. Then you sit on the couch with your phone and talk to it over Wi-Fi. The phone sends text and receives text. The desktop does the thinking.

This gets you the best of both. Big-model quality from the desktop, the phone as the remote. And because it is your own network, nothing crosses the public internet.

## What you need

**On the desktop:** Ollama, LM Studio, or LocalAI installed and running, with at least one model pulled. Any of them exposes an OpenAI-compatible endpoint. Note the machine's local IP address and the port.

**On the phone:** Off Grid on iOS or Android. Both devices on the same Wi-Fi network.

That is the whole setup. No port forwarding, no account, no tunnel through a third party.

## What Off Grid can do

Off Grid runs models locally on the phone and connects to remote servers. You switch between them in the same app.

- **Remote LLM servers**: connect to any OpenAI-compatible server on your network. Models are discovered automatically.
- **Local models**: run Qwen 3, Llama 3.2, Gemma 3, or Phi-4 directly on the phone when you are away from your desktop.
- **Secure key storage**: API keys live in the system keychain, not in plain text.
- **Streaming**: answers stream back token by token over SSE, the same as a local chat.
- **Switch freely**: pick the local model on the go, the desktop model at home, in the same conversation history.

<!-- GIF: switching between a local on-phone model and a remote desktop model from the quick-settings popover -->

## Setting it up

First, make your desktop server reachable on the network.

For Ollama, set it to listen on all interfaces:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

For LM Studio, open the Developer tab, start the local server, and enable serving on the network. It will show you the address and port.

Then in Off Grid, add the server.

1. Open the model settings and choose to add a remote server.
2. Enter the address, for example `http://192.168.1.40:11434` for Ollama or the port LM Studio printed.
3. Off Grid queries the server and lists every model it is serving.
4. Pick a model and start chatting.

If the server needs a key, paste it once. Off Grid stores it in the keychain.

## How discovery works

Off Grid talks the OpenAI-compatible API that all three servers expose. It calls the models endpoint, reads the list the server returns, and shows you the names. You do not type model names by hand or guess what is loaded.

Responses come back over server-sent events, so text streams in as the desktop generates it. The phone renders it the same way it renders a model running on the phone itself. From your side, a remote 32B model and a local 3B model behave the same. Only the speed and the quality differ.

## Keeping it private

A cloud API sends your prompts to a company's servers and bills you per token. Off Grid pointed at your own desktop sends your prompts to your own desktop. The traffic stays inside your home network.

There is no Off Grid account and no telemetry. The app is open-source under MIT, so you can read exactly what it sends and where. When you are off your home network, switch to a model running on the phone and keep working with no connection at all.

## Getting started

1. Install Ollama, LM Studio, or LocalAI on your desktop and pull a model.
2. Start the server so it listens on your local network.
3. Install Off Grid from the [App Store](https://apps.apple.com/us/app/off-grid-local-ai/id6759299882) or [Google Play](https://play.google.com/store/apps/details?id=ai.offgridmobile).
4. Add the server's address in the model settings and pick a discovered model.
5. Chat from your phone, with the model running on your desktop.

<!-- GIF: end-to-end, from starting the LM Studio server to chatting on the phone -->

## What's coming

- Reaching your desktop securely from outside the home network.
- Faster reconnection when you move between Wi-Fi and the on-phone models.
- Richer per-server model metadata in the picker.

## FAQ

### Q: Is it really free?
Yes. The app is free and open-source under MIT. Connecting to your own server costs nothing.

### Q: Which servers work?
Anything that speaks the OpenAI-compatible API: Ollama, LM Studio, LocalAI, and others. Anthropic-compatible servers are supported too.

### Q: Do both devices need the same Wi-Fi?
Yes. The phone reaches the desktop over your local network, so they need to be on the same network.

### Q: Where are my API keys stored?
In the system keychain on the phone, not in plain text inside the app.

### Q: Can I still use the phone without my desktop?
Yes. Off Grid runs models directly on the phone, so when you leave home you switch to a local model and keep going.

### Q: Does my data go to a cloud?
No. Your prompts go to the server you point at. Pointed at your desktop, they never leave your network.

Run the big model at home, carry the remote in your pocket.

**[GitHub →](https://github.com/off-grid-ai/mobile)**
