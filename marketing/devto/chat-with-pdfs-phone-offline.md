---
title: "How to Chat With Your PDFs on Your Phone in 2026 (On-Device RAG, Completely Offline)"
published: false
description: Upload PDFs to a project and ask a local model questions about them. On-device embeddings, local vector search, answers cited from your own files. No cloud.
tags: ai, privacy, rag, mobile
cover_image:
---

A 40-page PDF holds the answer you need on page 31. Reading to find it is slow. The common shortcut is to paste the document into a cloud chatbot, which means handing your file to a company. Your phone can do the same job without sending the file anywhere.

Off Grid is a free, open-source phone app that lets you upload documents to a project, then ask a local model about them. The embeddings, the search, and the answer all happen on the device.

**[GitHub →](https://github.com/off-grid-ai/mobile)**

Free, open-source, runs offline. Your documents never leave the phone.

<!-- GIF: uploading a PDF to a project, then asking a question and getting an answer pulled from the file -->

## Why chat with a document instead of reading it

You rarely want the whole document. You want one fact, one clause, one number. Skimming for it wastes the time the document was supposed to save.

Retrieval-augmented generation turns the document into something you can question. You ask in plain language, the app finds the relevant passages, and the model answers from them. You get the page-31 answer without reading pages 1 through 30.

Doing this on the phone means the file stays yours. A contract, a medical report, a private spec. None of it goes to a server to be searched.

## What you need

**Minimum:** an iPhone with an A-series chip, or an Android phone with 6 GB RAM. Space for a chat model and your documents.

**Recommended:** a recent flagship with 8 GB RAM or more, so the chat model and the embedding model run together comfortably.

The embedding model is tiny. Your chat model is the heavy part of the budget.

## What Off Grid can do

Off Grid is a full on-device AI suite. The project knowledge base is the document side of it.

- **Project knowledge base**: upload PDFs and text files to a project.
- **On-device embeddings**: a bundled MiniLM model turns your text into vectors on the phone.
- **Local vector search**: passages are retrieved by similarity and stored in local SQLite.
- **Cited answers**: the model answers from the retrieved passages, grounded in your file.
- **Automatic tool**: the search_knowledge_base tool is available in project chats without setup.

<!-- GIF: a project with several PDFs, asking a cross-document question, and seeing which passages the answer came from -->

Native PDF text extraction runs on both iOS and Android, so your PDFs are read on the device, not uploaded to a parser.

## How on-device RAG works

When you add a document, Off Grid extracts its text and splits it into chunks. Each chunk goes through a small embedding model, MiniLM, that runs on the phone. The result is a set of vectors stored in a local SQLite database.

When you ask a question, Off Grid embeds your question the same way, then finds the chunks whose vectors are closest by cosine similarity. Those chunks go to the chat model as context, and the model answers from them. The search is a tool the model calls automatically inside a project conversation.

Every step, extraction, embedding, search, and generation, runs on the device. There is no upload, no remote index, no embedding API.

## Getting good answers

A few notes.

Ask specific questions. "What is the termination notice period in this contract" beats "summarize this." Retrieval works best when the question points at a passage.

Keep a project focused. A knowledge base of ten related documents retrieves more cleanly than a junk drawer of fifty unrelated ones.

Pick a chat model with enough context room for the retrieved passages plus your question. A model that fits your RAM with headroom leaves space for the document chunks.

For long PDFs, let the import finish before you ask. Chunking and embedding a big file takes a moment, and a question mid-import sees only part of the document.

## Privacy: your files stay on the phone

A cloud document chatbot uploads your file, embeds it on a server, and stores the vectors somewhere you cannot see. You are trusting a company with whatever the document contains.

Off Grid uploads nothing. The text is extracted on the phone, embedded on the phone with MiniLM, and stored in a local database. The model that answers runs on the phone too. The app is open-source under MIT, with no account and no telemetry. Turn on airplane mode and you can still question your own documents.

## Getting started

1. Install Off Grid from the [App Store](https://apps.apple.com/us/app/off-grid-local-ai/id6759299882) or [Google Play](https://play.google.com/store/apps/details?id=ai.offgridmobile).
2. Download a chat model from the built-in browser.
3. Create a project and upload a PDF or text file to its knowledge base.
4. Wait for the import to finish embedding.
5. Ask a question in the project chat and read the answer pulled from your file.

<!-- GIF: the full flow, creating a project, uploading, and the first grounded answer -->

## What's coming

- More document formats handled on-device.
- Sharper retrieval for long and dense files.
- Showing the exact source passage inline with each answer.

## FAQ

### Q: Is it really free?
Yes. The app, the embeddings, and the document chat are free and open-source under MIT.

### Q: Does it work offline?
Yes. Extraction, embedding, search, and the model all run on the phone. After your models download, it works with the network off.

### Q: Do my documents get uploaded?
No. Your files are read and embedded on the device and stored in a local database.

### Q: What file types can I use?
PDFs and text documents, with native PDF text extraction on both iOS and Android.

### Q: How does it find the right passage?
Your text is embedded with a bundled MiniLM model and searched by cosine similarity, all on the phone.

### Q: How much RAM do I need?
6 GB runs a small chat model with the embedding model. 8 GB or more gives both comfortable room.

Ask your documents directly, and keep them on your own phone.

**[GitHub →](https://github.com/off-grid-ai/mobile)**
