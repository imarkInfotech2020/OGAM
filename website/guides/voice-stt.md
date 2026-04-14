---
layout: default
title: Voice Input — On-Device Speech-to-Text with Whisper
parent: Guides
nav_order: 12
description: Use Off Grid's on-device Whisper speech-to-text to dictate messages to your AI. No audio is ever sent to a server. Works offline on both iPhone and Android.
faq:
  - q: Does voice transcription require internet?
    a: No. Off Grid uses whisper.cpp running entirely on-device. No audio is sent anywhere, ever.
  - q: Which Whisper model should I use?
    a: Start with Whisper Base — it's the best balance of speed and accuracy for most uses. Whisper Tiny is faster but less accurate. Whisper Small is more accurate but slower.
  - q: What languages does Whisper support?
    a: Whisper supports 99 languages. It detects the language automatically.
---

# Voice Input — On-Device Speech-to-Text with Whisper

Off Grid uses **whisper.cpp** (via whisper.rn) to transcribe your voice directly on your device. You hold the button, speak, and your words appear as text in the chat input — ready to send or edit.

No audio is ever sent to a server. The model runs in your phone's memory.

---

## Setup

Whisper models are downloaded automatically on first use. You don't need to do anything manually — tap the microphone button and Off Grid will prompt you to download a model if one isn't installed.

You can also select your preferred Whisper model in **Settings → Voice Input**.

---

## Whisper model comparison

| Model | Size | Speed | Accuracy | Best for |
|---|---|---|---|---|
| **Whisper Tiny** | ~75MB | Fastest | Good | Quick dictation, fast devices |
| **Whisper Base** | ~145MB | Fast | Very good | Best starting point |
| **Whisper Small** | ~465MB | Slower | Excellent | Accents, technical terms, multilingual |

**Recommended: Whisper Base** for most users. It transcribes in near-real-time on any modern phone with very high accuracy.

---

## How to use it

1. Open a chat in Off Grid
2. Tap and **hold** the microphone button
3. Speak — you'll see the waveform
4. Release to transcribe

The transcription appears in the message input field. You can edit it before sending, or send immediately.

**Slide to cancel** — while holding, slide left to discard the recording without transcribing.

---

## Partial transcription

Off Grid streams transcription results in real time as you speak. You'll see words appearing as the model processes your audio — you don't have to wait until you stop speaking.

---

## Language support

Whisper detects your language automatically. It supports 99 languages including English, Spanish, French, German, Japanese, Chinese, Arabic, Hindi, and many more.

If you're consistently speaking a language other than English and accuracy is low, try **Whisper Small** — it has stronger multilingual performance.

---

## Privacy

- Audio is buffered temporarily in native code and cleared immediately after transcription
- No audio data is written to disk
- No audio is sent to any server
- The Whisper model runs locally via whisper.cpp

---

## Related guides

- [Tool Calling]({{ '/guides/tool-calling' | relative_url }})
- [Quick Start]({{ '/quick-start' | relative_url }})
