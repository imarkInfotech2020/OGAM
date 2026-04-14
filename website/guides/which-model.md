---
layout: default
title: Which Model Should I Use?
parent: Guides
nav_order: 1
description: A practical guide to choosing the right LLM for your iPhone or Android — comparing Qwen 3.5, Gemma 4, Phi-4, Mistral, SmolLM by speed, quality, and RAM requirements.
faq:
  - q: What is the best model for a phone with 4GB RAM?
    a: Qwen 3.5 2B (Q4_K_M) is the best option for 4GB RAM devices. It supports 262K context, thinking mode, and runs comfortably within memory limits. For vision tasks, Gemma 4 E2B is the recommended choice.
  - q: What quantisation does Off Grid use by default?
    a: Q4_K_M. It gives the best balance of quality and size for mobile hardware and is the default for all recommended models.
  - q: What is the best model for on-device reasoning?
    a: Gemma 4 E4B or Qwen 3.5 9B on devices with 6–8GB+ RAM. Both support thinking mode — the model reasons step-by-step before answering, significantly improving accuracy on complex tasks.
  - q: Can I use vision models for free?
    a: Yes. SmolVLM2 500M works on any phone with 3GB RAM. Gemma 4 E2B gives much better vision quality and needs 4GB RAM.
---

# Which Model Should I Use?

Off Grid uses the actual models in the app — not generic suggestions. All recommendations below are sourced directly from the model catalogue. Default quantisation is **Q4_K_M** for everything.

---

## Quick pick by RAM

| Your device RAM | Best text model | Best vision model |
|---|---|---|
| 3GB | Qwen 3.5 0.8B | SmolVLM2 500M |
| 4GB | Qwen 3.5 2B | Gemma 4 E2B |
| 6GB | Gemma 4 E4B or Phi-4 Mini | Gemma 4 E4B |
| 8GB+ | Qwen 3.5 9B | Qwen 3.5 9B |

---

## Full model catalogue

### Text models

| Model | Params | Min RAM | Context | Best for |
|---|---|---|---|---|
| **SmolLM2 360M** | 0.36B | 3GB | 8K | Ultra-light, low-RAM devices only |
| **Qwen 3.5 0.8B** | 0.8B | 3GB | 262K | Fast responses, long context on budget devices |
| **Qwen 3.5 2B** | 2B | 4GB | 262K | Best general-purpose model for 4GB devices |
| **SmolLM3 3B** | 3B | 6GB | 128K | Purpose-built for constrained devices |
| **Phi-4 Mini** | 3.8B | 6GB | 128K | Reasoning, math, structured tasks |
| **Mistral 7B** | 7B | 6GB | 32K | Fast, reliable general purpose |
| **Qwen 3.5 9B** | 9B | 8GB | 262K | Best on-device quality overall |

### Vision models (can see images)

| Model | Params | Min RAM | Best for |
|---|---|---|---|
| **SmolVLM2 500M** | 0.5B | 3GB | Tiny vision model for low-RAM devices |
| **SmolVLM 2B** | 2B | 4GB | General vision tasks on mid-range phones |
| **SmolVLM2 2.2B** | 2.2B | 4GB | Vision + video understanding |
| **Gemma 4 E2B** | 2B (MoE) | 4GB | Best vision quality for 4GB devices, thinking mode |
| **Gemma 4 E4B** | 4B (MoE) | 6GB | Strongest reasoning + vision, thinking mode |

> **Gemma 4** uses a Mixture-of-Experts (MoE) architecture — the effective parameter count is lower than it looks, which is why it fits in less RAM than you'd expect while delivering quality above its weight class.

---

## What is thinking mode?

Qwen 3.5 and Gemma 4 models support **thinking mode** — the model reasons through a problem step-by-step before producing its final answer, similar to chain-of-thought prompting but built into the model weights.

Use it for: complex reasoning, math, multi-step problems. Skip it for: quick Q&A, summarisation, casual chat (it's slower).

---

## Understanding Q4_K_M

Off Grid defaults to **Q4_K_M** quantisation for all models. This means:

- ~4.5 bits per weight
- ~5–8% quality loss vs the full-precision original
- ~50–60% smaller than the float16 version
- Recommended by the llama.cpp community as the best mobile tradeoff

Don't go below Q4_K_S unless you're severely constrained on storage. Q2/Q3 models have noticeable quality degradation.

---

## RAM safety thresholds

Off Grid automatically checks if a model fits safely before loading:

- **4GB RAM devices**: model budget = 40% of total RAM
- **6GB+ RAM devices**: model budget = 60% of total RAM
- Text models need ~1.5x their raw size in RAM (KV cache + activations)
- Image models need ~1.5x on iOS (CoreML), ~1.8x on Android (Vulkan)

If a model is marked as incompatible with your device, this is why.

---

## FAQ

**What is the best model for 4GB RAM?**
Qwen 3.5 2B (Q4_K_M). For vision tasks, Gemma 4 E2B.

**What quantisation does Off Grid use?**
Q4_K_M by default — the best balance of quality and size for mobile.

**What is the best model for reasoning?**
Gemma 4 E4B (6GB RAM) or Qwen 3.5 9B (8GB RAM). Both have thinking mode.

---

## Related guides

- [How to Run LLMs Locally on Your Android Phone in 2026]({{ '/guides/run-llms-locally-android' | relative_url }})
- [How to Run LLMs Locally on Your iPhone in 2026]({{ '/guides/run-llms-locally-iphone' | relative_url }})
- [Vision AI — Analyse Images and Documents]({{ '/guides/vision-ai' | relative_url }})
