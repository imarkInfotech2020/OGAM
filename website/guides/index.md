---
layout: default
title: Guides
nav_order: 6
has_children: true
description: Step-by-step guides for running AI locally on your iPhone and Android phone with Off Grid.
---

# Guides

Everything you need to get the most out of running AI locally on your phone.

---

## Getting started

<div class="guide-grid">
  <a href="{{ '/guides/which-model' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Which Model Should I Use?</div>
    <div class="guide-card-desc">Pick the right model for your device RAM and use case. Full catalogue with performance numbers.</div>
  </a>
  <a href="{{ '/guides/ios-setup' | relative_url }}" class="guide-card">
    <div class="guide-card-title">iOS Setup</div>
    <div class="guide-card-desc">Download, install, and run your first model on iPhone. Metal GPU acceleration, supported devices.</div>
  </a>
  <a href="{{ '/guides/android-setup' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Android Setup</div>
    <div class="guide-card-desc">Get up and running on Android. Vulkan acceleration, background behaviour, tested devices.</div>
  </a>
</div>

---

## Running LLMs locally

<div class="guide-grid">
  <a href="{{ '/guides/run-llms-locally-iphone' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Run LLMs on Your iPhone in 2026</div>
    <div class="guide-card-desc">Qwen 3.5, Gemma 4, Phi-4 Mini running locally on iPhone via llama.cpp and Metal. Real tok/s numbers.</div>
  </a>
  <a href="{{ '/guides/run-llms-locally-android' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Run LLMs on Your Android Phone in 2026</div>
    <div class="guide-card-desc">Local LLMs on Android with CPU and Vulkan GPU acceleration. Device performance table.</div>
  </a>
</div>

---

## Image generation

<div class="guide-grid">
  <a href="{{ '/guides/stable-diffusion-iphone' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Stable Diffusion on iPhone</div>
    <div class="guide-card-desc">On-device image generation using Core ML and the Apple Neural Engine. SD 1.5, 2.1, SDXL.</div>
  </a>
  <a href="{{ '/guides/stable-diffusion-android' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Stable Diffusion on Android</div>
    <div class="guide-card-desc">MNN (CPU, all devices) and QNN NPU (Snapdragon 8 Gen 1+). 5-10s images on flagship chips.</div>
  </a>
</div>

---

## Vision, voice and documents

<div class="guide-grid">
  <a href="{{ '/guides/vision-ai' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Vision AI</div>
    <div class="guide-card-desc">Point your camera at anything and ask questions. SmolVLM, Qwen3-VL, Gemma 4 - all on-device.</div>
  </a>
  <a href="{{ '/guides/voice-stt' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Voice Input with Whisper</div>
    <div class="guide-card-desc">On-device speech-to-text via whisper.cpp. Hold to record, auto-transcribe. 99 languages, no audio leaves your phone.</div>
  </a>
  <a href="{{ '/guides/document-analysis' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Document Analysis</div>
    <div class="guide-card-desc">Attach PDFs, CSVs, and code files directly to your chat. Native PDF extraction on iOS and Android.</div>
  </a>
  <a href="{{ '/guides/knowledge-base' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Knowledge Base and RAG</div>
    <div class="guide-card-desc">Upload documents to a project. Off Grid embeds and indexes them on-device, retrieves context automatically.</div>
  </a>
</div>

---

## Tools and intelligence

<div class="guide-grid">
  <a href="{{ '/guides/tool-calling' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Tool Calling</div>
    <div class="guide-card-desc">Web search, calculator, date/time, device info, knowledge base search. Automatic tool loop with runaway prevention.</div>
  </a>
</div>

---

## Remote servers

<div class="guide-grid">
  <a href="{{ '/guides/remote-servers' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Remote Servers</div>
    <div class="guide-card-desc">Connect to Ollama, LM Studio, LocalAI, or vLLM on your home network. Access larger models from your phone over WiFi.</div>
  </a>
  <a href="{{ '/guides/ollama-android' | relative_url }}" class="guide-card">
    <div class="guide-card-title">Ollama from Android</div>
    <div class="guide-card-desc">Run Llama 3.1 70B on your desktop, control it from your Android phone over WiFi.</div>
  </a>
  <a href="{{ '/guides/lm-studio-android' | relative_url }}" class="guide-card">
    <div class="guide-card-title">LM Studio from Android</div>
    <div class="guide-card-desc">Use LM Studio's local server from your phone. Port 1234, network access enabled.</div>
  </a>
</div>
