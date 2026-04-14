---
layout: default
title: Vision AI — Analyse Images and Documents On-Device
parent: Guides
nav_order: 11
description: Use Off Grid's vision models to analyse photos, read documents, describe scenes, and answer questions about images — all on your phone with no cloud.
faq:
  - q: Which models support vision in Off Grid?
    a: SmolVLM (500M, 2.2B), Qwen3-VL (2B, 8B), and Gemma 4 (E2B, E4B). Gemma 4 models support both vision and thinking mode simultaneously.
  - q: Can I use vision AI completely offline?
    a: Yes. Vision inference runs entirely on-device using llama.rn multimodal. No image data is sent anywhere.
  - q: How long does vision inference take?
    a: SmolVLM models take 7-10 seconds on flagship devices. Qwen3-VL and Gemma 4 are slightly slower but significantly more capable.
---

# Vision AI — Analyse Images and Documents On-Device

Off Grid's vision models can look at images and answer questions about them. Point your camera at a document, a product, a diagram, a receipt — and ask anything.

All inference runs on-device via llama.rn's multimodal support. No image is uploaded anywhere.

---

## What you can do

- **Read receipts, invoices, business cards** — extract text from photos
- **Describe scenes** — understand what's in a photo
- **Analyse documents** — ask questions about a photo of a document
- **Identify objects** — "what is this?" with a photo
- **Read handwriting** — with capable models like Qwen3-VL
- **Code from screenshots** — show the model a UI and ask it to recreate the code

---

## Available vision models

| Model | Params | Min RAM | Speed | Best for |
|---|---|---|---|---|
| **SmolVLM2 500M** | 0.5B | 3GB | Very fast (~7s) | Quick visual Q&A on low-RAM devices |
| **SmolVLM 2B** | 2B | 4GB | Fast (~8s) | General vision tasks |
| **SmolVLM2 2.2B** | 2.2B | 4GB | Fast (~8–10s) | Vision + video understanding |
| **Gemma 4 E2B** | 2B (MoE) | 4GB | Medium (~10–15s) | Best vision quality for 4GB, thinking mode |
| **Gemma 4 E4B** | 4B (MoE) | 6GB | Medium (~12–18s) | Strongest reasoning + vision, thinking mode |
| **Qwen3-VL 2B** | 2B | 4GB | Medium | Multilingual vision, thinking mode |

> **Gemma 4 models** support both vision and thinking mode together — they can reason step-by-step about what they see, which dramatically improves accuracy on complex tasks.

---

## How to use vision

1. Open a chat in Off Grid
2. Tap the **attachment icon** → choose **Camera** or **Photo Library**
3. Select or capture your image
4. Type your question and send

The model receives both the image and your question. Vision models automatically download a companion **mmproj file** (multimodal projector) during setup — this is included in the model size estimate.

---

## Example prompts

**Document analysis:**
> "What are the line items on this receipt? Give me a total."

**Technical reading:**
> "Explain this architecture diagram."

**Handwriting:**
> "Transcribe the text in this photo."

**Visual Q&A:**
> "What model of phone is shown in this photo?"

**Code from UI:**
> "Write the React Native code to recreate this screen."

---

## Tips

**Use Gemma 4 for complex reasoning** — If you need the model to think carefully about what it sees (e.g. interpreting a chart, solving a problem from a photo), Gemma 4's thinking mode produces much better results than a faster model.

**Use SmolVLM for quick tasks** — For simple description or text extraction, SmolVLM2 500M is surprisingly capable and much faster.

**Image quality matters** — Blurry or low-contrast photos degrade accuracy significantly. For documents, flat lighting and a straight-on angle work best.

---

## Related guides

- [Which Model Should I Use?]({{ '/guides/which-model' | relative_url }})
- [Document Analysis and Attachments]({{ '/guides/document-analysis' | relative_url }})
- [Knowledge Base and RAG]({{ '/guides/knowledge-base' | relative_url }})
