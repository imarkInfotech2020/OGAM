---
layout: default
title: Remote Servers — Connect Ollama, LM Studio, and LocalAI
parent: Guides
nav_order: 9
description: Connect Off Grid to any OpenAI-compatible server on your local network — Ollama, LM Studio, LocalAI, vLLM. Access larger models from your desktop via your phone over WiFi.
faq:
  - q: Which remote servers does Off Grid support?
    a: Any OpenAI-compatible server — Ollama, LM Studio, LocalAI, vLLM, and others. If it exposes a /v1/chat/completions endpoint, it works.
  - q: Does connecting to a remote server require internet?
    a: No. Off Grid connects over your local WiFi network. No traffic goes to the internet. For access outside your home, use Tailscale.
  - q: Where are API keys stored?
    a: In your device's system keychain via react-native-keychain. Never in plain storage.
---

# Remote Servers — Connect Ollama, LM Studio, and LocalAI

Your phone can run impressive models locally, but your desktop or Mac can run much larger ones — Llama 3.1 70B, Mistral Large, DeepSeek, CodeLlama 34B.

Off Grid connects to any OpenAI-compatible server on your local network, giving you access to those models from your phone over WiFi. No internet required.

---

## Supported servers

| Server | Platform | Notes |
|---|---|---|
| **Ollama** | macOS, Linux, Windows | Most popular, easiest setup |
| **LM Studio** | macOS, Windows | Great UI, easy model management |
| **LocalAI** | Linux, Docker | Self-hosted, many model formats |
| **vLLM** | Linux | High-throughput, GPU-focused |
| **Any OpenAI-compatible** | Any | Needs `/v1/chat/completions` and `/v1/models` |

---

## Setting up Ollama

**1. Install Ollama on your desktop:**
```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh
```

**2. Allow remote connections** (Ollama only listens on localhost by default):
```bash
# macOS/Linux — run Ollama with remote access
OLLAMA_HOST=0.0.0.0 ollama serve

# Or set permanently in ~/.zshrc / ~/.bashrc
export OLLAMA_HOST=0.0.0.0
```

**3. Pull a model:**
```bash
ollama pull llama3.1:8b
ollama pull qwen2.5:14b
```

**4. Find your desktop's local IP:**
- macOS: System Settings → Network → Wi-Fi → Details → IP address
- Linux: `ip addr show` — look for your WiFi interface

---

## Setting up LM Studio

1. Download and install [LM Studio](https://lmstudio.ai)
2. Download a model in the app
3. Go to **Local Server** tab → click **Start Server**
4. Enable **"Allow connections from network"** in server settings
5. Note the IP and port shown (default port: 1234)

---

## Connecting from Off Grid

1. Open Off Grid → **Settings** → **Remote Servers**
2. Tap **Add Server**
3. Enter the server URL:
   - Ollama: `http://192.168.1.42:11434`
   - LM Studio: `http://192.168.1.42:1234`
4. Add an API key if your server requires one (stored in system keychain)
5. Tap **Test Connection** → should show green
6. Tap **Save**

Off Grid will automatically discover all models available on the server via `/v1/models`.

---

## Selecting a remote model

Open the model picker. Remote models appear under your server name. Tap one to make it active.

Off Grid streams responses via Server-Sent Events (SSE) in real time. Switching back to a local model is instant.

---

## Vision and tool calling over remote servers

Off Grid detects vision and tool calling support from model name patterns. If the model name includes `vision`, `vl`, `vlm`, or similar, Off Grid enables the camera attachment. Tool calling is similarly detected.

For servers that support it (Ollama with compatible models, LM Studio), tool calling and vision both work seamlessly over the remote connection.

---

## Access from outside your home with Tailscale

[Tailscale](https://tailscale.com) creates a private VPN between your devices. Install it on both your desktop and phone, then use the Tailscale IP of your desktop as the server URL.

This gives you access to your home desktop's models from anywhere — coffee shop, travel, office — without exposing anything to the public internet.

---

## Security note

Off Grid warns you before connecting to a public internet endpoint (non-private IP range). For remote access, always use Tailscale or a similar private tunnel rather than exposing your server directly to the internet.

---

## Related guides

- [How to Use Ollama From Your Android Phone in 2026]({{ '/guides/ollama-android' | relative_url }})
- [Which Model Should I Use?]({{ '/guides/which-model' | relative_url }})
- [Tool Calling]({{ '/guides/tool-calling' | relative_url }})
