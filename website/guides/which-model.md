---
layout: default
title: Which Model Should I Use?
parent: Guides
nav_order: 1
description: A practical guide to choosing the right LLM for your iPhone or Android phone — comparing Llama, Phi, Mistral, Gemma by speed, quality, and RAM requirements.
faq:
  - q: Can I run Llama 3 on an iPhone 13?
    a: Yes. Llama 3.2 3B runs well on iPhone 13 (4GB RAM). The 8B version requires iPhone 15 Pro or newer (8GB RAM).
  - q: What is the smallest model that is actually useful?
    a: Phi-3 Mini (3.8B) is the smallest model that gives genuinely useful responses for everyday tasks. It runs on any phone with 4GB RAM.
  - q: Do larger models always give better answers?
    a: Not always. For simple tasks like summarisation or Q&A, Phi-3 Mini often matches larger models. Larger models shine on complex reasoning, coding, and nuanced writing.
---

# Which Model Should I Use?

The honest answer: start small, go bigger only when you hit a ceiling.

---

## Quick recommendation by device

| Device | RAM | Recommended model |
|---|---|---|
| iPhone 12 / 13 | 4GB | Phi-3 Mini 3.8B |
| iPhone 14 | 6GB | Llama 3.2 3B or Mistral 7B Q4 |
| iPhone 15 Pro / 16 series | 8GB+ | Llama 3.1 8B |
| Android mid-range (2022–2024) | 4–6GB | Phi-3 Mini or Gemma 2B |
| Android flagship | 8–12GB | Llama 3.1 8B or Mistral 7B |

---

## Model comparison

| Model | Size | Speed | Quality | Best for |
|---|---|---|---|---|
| **Phi-3 Mini** | ~2GB | Very fast | Good | General Q&A, quick tasks |
| **Gemma 2B** | ~1.5GB | Very fast | Good | Summarisation, simple chat |
| **Llama 3.2 3B** | ~2GB | Fast | Very good | Chat, writing assistance |
| **Mistral 7B Q4** | ~4.1GB | Medium | Excellent | Reasoning, longer tasks |
| **Llama 3.1 8B** | ~4.7GB | Medium | Excellent | Best overall on-device |

---

## Understanding quantisation

Models come in different quantisation levels (Q4, Q5, Q8). This is a compression format:

- **Q4** — ~50% smaller, ~5–10% quality loss. Best for phones with 4–6GB RAM.
- **Q5** — middle ground. Good balance.
- **Q8** — near-original quality, larger. Use if you have 8GB+ RAM.

When in doubt, pick Q4 — the quality difference is smaller than you'd expect.

---

## FAQ

**Can I run Llama 3 on an iPhone 13?**
Yes. Llama 3.2 3B runs well on iPhone 13 (4GB RAM). The 8B version requires iPhone 15 Pro or newer (8GB RAM).

**What is the smallest model that is actually useful?**
Phi-3 Mini (3.8B) is the smallest model that gives genuinely useful responses for everyday tasks. It runs on any phone with 4GB RAM.

**Do larger models always give better answers?**
Not always. For simple tasks like summarisation or Q&A, Phi-3 Mini often matches larger models. Larger models shine on complex reasoning, coding, and nuanced writing.
