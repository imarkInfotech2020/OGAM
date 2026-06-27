---
title: "How to Point Your Phone Camera at Anything and Ask a Local AI (2026, Completely Offline)"
published: false
description: Point your camera at a document, receipt, or scene and ask a local vision model about it. SmolVLM, Qwen3-VL, and Gemma run on-device. No photos uploaded.
tags: ai, privacy, vision, mobile
cover_image:
---

Your phone camera and its chip can describe what they see without a server. SmolVLM and Qwen3-VL are small enough to run on the device and good enough to read a receipt or summarize a page. The reflex is still to send the photo to a cloud model. You do not have to.

Off Grid is a free, open-source phone app that runs vision models on the device. Point the camera, ask a question, get an answer. The image never leaves the phone.

**[GitHub →](https://github.com/off-grid-ai/mobile)**

Free, open-source, runs offline. Your photos stay on the device.

<!-- GIF: pointing the camera at a printed page, asking a question, and reading the model's answer -->

## What a vision model on a phone is for

A vision-language model takes an image and a question and answers in text. That covers more daily tasks than it sounds.

Read a receipt and pull out the total. Describe a scene out loud. Summarize a printed page you do not want to type. Identify a part, a plant, a label. Ask what a chart is showing. The model sees the image and reasons about it in words.

Doing it on the phone means the image is never uploaded. A photo of a document, an ID, a whiteboard full of someone's plans. It stays on the device that took it.

## What you need

**Minimum:** an iPhone with an A-series chip, or an Android phone with 6 GB RAM. A small vision model like SmolVLM 500M fits modest hardware.

**Recommended:** a recent flagship, an A17 Pro iPhone or a Snapdragon 8 Gen 2 or 3 Android, with 8 GB RAM or more for the larger vision models. On a flagship, inference runs in about seven seconds.

Vision models come in a range of sizes. Pick one that matches your phone.

## What Off Grid can do

Off Grid is a full on-device AI suite. Vision is the camera side of it.

- **Camera input**: point at anything and ask a question about it.
- **Image attachments**: pull a photo from your library and ask about that instead.
- **Multiple vision models**: SmolVLM, SmolVLM2, Qwen3-VL, and Gemma vision models.
- **Document tasks**: read receipts, summarize pages, pull fields from forms.
- **Scene description**: describe what the camera sees in plain language.

<!-- GIF: attaching a photo from the library and asking the model to extract specific fields -->

You choose the vision model in the model browser, sized to your phone. Smaller models answer faster, larger ones read finer detail.

## Which model to pick

| Phone | Model | What to expect |
|---|---|---|
| 6 GB RAM, older flagship | SmolVLM 500M | Fast answers, good for scenes and simple reads |
| 8 GB RAM flagship | SmolVLM2 2.2B | Sharper document reading, still quick |
| 8 GB+ recent flagship | Qwen3-VL or Gemma vision | Best detail on dense pages and charts |

These are guidelines. Try a smaller model first, then move up if you want finer reading.

## How it runs on your phone

The vision model runs as native code through llama.rn, the same engine that runs the text models. It uses the phone's own chips, the Apple Neural Engine and unified memory on iPhone, the CPU and available accelerators on Android.

The camera frame or the attached image is fed to the model on the device. The model produces its answer as text, the same as a chat reply. There is no upload step and no remote vision API. On a flagship, a single question takes a few seconds.

## Getting clear reads

A few notes.

Hold steady and fill the frame with the subject. A sharp, well-lit image reads far better than a blurry one, the same as for a person.

Ask a specific question. "What is the total and the tax on this receipt" gets a cleaner answer than "what is this."

Start with a smaller model for speed, then switch to a larger one when you need to read fine print or a busy chart.

Keep the model within your RAM budget. A vision model loaded alongside other features needs its own room.

## Privacy: the photo never leaves

A cloud vision feature uploads your image to a server to analyze it. Whatever is in the frame, a document, a face, a private note, goes to a company and may be logged.

Off Grid uploads nothing. The image is processed by a model on the phone. The app is open-source under MIT, with no account and no telemetry. Put the phone in airplane mode, point the camera, and it still answers. That is the proof a cloud feature cannot offer.

## Getting started

1. Install Off Grid from the [App Store](https://apps.apple.com/us/app/off-grid-local-ai/id6759299882) or [Google Play](https://play.google.com/store/apps/details?id=ai.offgridmobile).
2. Open the model browser and download a vision model sized to your phone.
3. Open a chat and choose the camera or attach a photo.
4. Frame the subject and ask your question.
5. Read the answer, generated entirely on the device.

<!-- GIF: the full flow, downloading a vision model and asking the first camera question -->

## What's coming

- More vision models at different size and speed tradeoffs.
- Faster inference on mid-range hardware.
- Tighter handoff from a vision answer into a follow-up tool call.

## FAQ

### Q: Is it really free?
Yes. The app and the vision models are free and open-source under MIT.

### Q: Does it work offline?
Yes. The vision model runs on the phone. After it downloads, you can point the camera with the network off.

### Q: Do my photos get uploaded?
No. The image is processed on the device and is never sent anywhere.

### Q: Which vision models are supported?
SmolVLM, SmolVLM2, Qwen3-VL, and Gemma vision models, sized from small to large.

### Q: How fast is it?
On a flagship, a question takes about seven seconds. Smaller models on modest phones are quicker but read less detail.

### Q: Does it work on both iPhone and Android?
Yes. It runs on iOS, Android, and on Apple Silicon Macs through the iOS app.

Point your camera at the world and ask, with nothing leaving your phone.

**[GitHub →](https://github.com/off-grid-ai/mobile)**
