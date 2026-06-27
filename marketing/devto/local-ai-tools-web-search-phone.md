---
title: "How to Give a Local AI Tools (Web Search, Calculator) on Your Phone in 2026 (Offline Model, No Cloud)"
published: false
description: Let a local model on your phone call tools: web search, calculator, date and time, and your own documents. On-device function calling, no cloud account.
tags: ai, privacy, llm, mobile
cover_image:
---

A small model that runs on a phone forgets today's date and cannot do long arithmetic in its head. That is not a flaw to hide. It is the reason tool calling exists. Give the model a calculator and a search box and a 3B model on your phone starts answering questions it could never answer alone.

Off Grid is a free, open-source phone app that runs a local model and hands it real tools. The model decides when to search, calculate, or look something up, and you watch it work.

**[GitHub →](https://github.com/off-grid-ai/mobile)**

Free, open-source, runs on the phone. No account, no API key.

<!-- GIF: asking a question that triggers a web search, then watching the model use the result and cite a clickable link -->

## Why a model needs tools

A language model predicts text. It is good at language and bad at facts that change and math that is long. Asking it for a precise sum or yesterday's news is asking the wrong organ to do the job.

Tools fix that. The model writes a request to a tool, the tool runs real code or fetches a real page, and the result comes back into the conversation. Now the math is exact and the facts are current. The model handles the language, the tools handle the truth.

On a phone this matters more, because the on-device model is small. Tools close the gap between a small local model and what you actually need answered.

## What you need

**Minimum:** an iPhone with an A-series chip, or an Android phone with 6 GB RAM. A model that supports function calling, which Off Grid flags in the model browser.

**Recommended:** a recent flagship, an A17 Pro iPhone or a Snapdragon 8 Gen 2 or 3 Android, with 8 GB RAM or more so the model has room to think through a few tool steps.

Web search needs a connection for that one step. Everything else, including the model, runs on the phone.

## What Off Grid can do

Off Grid is a full on-device AI suite. Tool calling ties the pieces together.

- **Web search**: the model fetches live results and cites clickable links.
- **Calculator**: exact arithmetic, no hallucinated sums.
- **Date and time**: the model knows what day it is and can reason about schedules.
- **Device info**: battery, model, and other on-device facts.
- **Knowledge base search**: the model searches PDFs and notes you uploaded to a project.

<!-- GIF: the collapsible tool list in the composer, showing which tools are available for the current message -->

The app runs an automatic tool loop. The model calls a tool, reads the result, and decides whether to call another or answer. A runaway guard stops it from looping forever, so a confused model fails safe instead of spinning.

## How the tool loop works

When you send a message, Off Grid offers the model a set of tools. A model that supports function calling can reply with a tool call instead of a final answer. Off Grid runs that tool, feeds the output back, and asks the model to continue. This repeats until the model has what it needs.

You can see the tools on offer in a collapsible list in the composer, so you always know what the model could reach for. Search results come back with real links you can tap. Nothing is faked into the answer.

To keep the first message fast, Off Grid caches the tool embeddings it uses to match your request to the right tool. That cuts the time to first token after a cold start, so the loop feels responsive instead of laggy.

## Keeping it accurate and fast

A few notes.

Pick a model the browser marks as supporting tools. Not every small model can call functions reliably, and Off Grid tells you which ones can.

Keep the model large enough to reason but small enough to fit your RAM with headroom. The tool loop needs the model to stay loaded across several turns.

Be specific in your question. A clear ask like "what is 18.5 percent of 2,340" routes cleanly to the calculator. A vague one makes the model guess whether a tool is even needed.

## Privacy: only the search step leaves

Most of this runs on the phone. The model, the calculator, the date logic, and the knowledge base search all execute on the device.

Web search is the one tool that reaches out, because that is its job. When the model searches, that query goes to a search service for that step only. Your conversation, your documents, and the model itself stay on the phone. The app is open-source under MIT, with no account and no telemetry, so you can confirm exactly what crosses the line and when.

## Getting started

1. Install Off Grid from the [App Store](https://apps.apple.com/us/app/off-grid-local-ai/id6759299882) or [Google Play](https://play.google.com/store/apps/details?id=ai.offgridmobile).
2. Download a model the browser marks as tool-capable.
3. Open a chat and check the tool list in the composer.
4. Ask something that needs a fact or a calculation.
5. Watch the model call the tool, use the result, and answer.

<!-- GIF: a multi-step question where the model calculates, then searches, then answers -->

## What's coming

- More built-in tools.
- Finer per-chat control over which tools the model may use.
- Faster tool routing on cold start.

## FAQ

### Q: Is it really free?
Yes. The app and its built-in tools are free and open-source under MIT.

### Q: Does the model run on my phone?
Yes. The model runs on the device. Only the web search tool reaches the network, and only for that step.

### Q: Which models can call tools?
Models that support function calling. Off Grid marks them in the model browser so you can pick one that works.

### Q: What stops it from looping forever?
A runaway guard caps the tool loop, so a confused model stops instead of spinning.

### Q: Does it cite sources?
Yes. Web search results come back with clickable links in the answer.

### Q: Is my data private?
Your conversation, documents, and model stay on the phone. Only a live web search query leaves, and only when the model chooses to search.

Give your local model real tools and watch a small model punch above its size.

**[GitHub →](https://github.com/off-grid-ai/mobile)**
