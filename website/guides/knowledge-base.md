---
layout: default
title: Knowledge Base and RAG — On-Device Document Search
parent: Guides
nav_order: 13
description: Upload PDFs and documents to Off Grid's project knowledge base. The app embeds and indexes them on-device using MiniLM, then retrieves relevant context automatically during your conversations.
faq:
  - q: Does the knowledge base send my documents to the cloud?
    a: No. Documents are processed entirely on-device. Text extraction, embedding, and retrieval all happen locally using a bundled MiniLM model stored in SQLite.
  - q: What is the embedding model used?
    a: all-MiniLM-L6-v2-Q8_0.gguf, bundled with the app (~24MB). It does not need to be downloaded.
  - q: How does retrieval work?
    a: At query time, your question is embedded with the same MiniLM model. Off Grid scores all document chunks by cosine similarity and passes the top results to your LLM as context via the search_knowledge_base tool.
---

# Knowledge Base and RAG — On-Device Document Search

Each Off Grid project can have its own knowledge base. Upload PDFs, text files, or code — the app processes them entirely on-device and makes them searchable in your conversations.

This is Retrieval-Augmented Generation (RAG) running completely locally. No document leaves your device.

---

## How it works

```
Your document
  → Text extraction (PDF or plain text)
  → Chunking (paragraph-aware, with sliding-window fallback)
  → Embedding (all-MiniLM-L6-v2-Q8_0.gguf, bundled with app)
  → Stored in SQLite on-device

When you ask a question:
  → Your question is embedded with the same MiniLM model
  → Cosine similarity scored against all chunks
  → Top-K most relevant chunks passed to the LLM as context
  → LLM answers using your document as a source
```

The `search_knowledge_base` tool is automatically injected into any project conversation when the project has documents. Compatible models call it automatically when they need information from your documents.

---

## Setting up a knowledge base

1. Open Off Grid → **Projects**
2. Create a new project or tap an existing one
3. Tap **Knowledge Base** → **Add Document**
4. Select a PDF or text file from your device

Off Grid extracts the text and runs it through the embedding pipeline. This takes a few seconds per document depending on length.

---

## Supported document formats

- **PDF** — native text extraction via platform APIs (PDFKit on iOS, PdfRenderer on Android)
- **Text files** — `.txt`, `.md`, `.log`
- **Code files** — `.py`, `.js`, `.ts`, `.java`, `.swift`, `.kt`, `.go`, `.rs`, `.sql`, `.sh`, and more
- **Data files** — `.csv`, `.json`, `.xml`, `.yaml`, `.toml`, `.html`

---

## Using the knowledge base in conversation

Once documents are added, compatible models will call `search_knowledge_base` automatically when they need to retrieve information. You'll see the tool call inline in the chat.

You can also trigger it explicitly:

> "Search my knowledge base for anything about onboarding flow"

> "Based on the uploaded architecture doc, explain how the download service works"

---

## Embedding model

**all-MiniLM-L6-v2-Q8_0.gguf** — ships bundled with Off Grid (~24MB). It's always available, no download required, and runs fast enough that embedding a 20-page PDF takes under 10 seconds on a modern phone.

---

## Which LLMs support knowledge base search?

Any model that supports tool calling can use the knowledge base. See the [Tool Calling guide]({{ '/guides/tool-calling' | relative_url }}) for the full list of compatible models.

---

## Related guides

- [Tool Calling]({{ '/guides/tool-calling' | relative_url }})
- [Document Analysis and Attachments]({{ '/guides/document-analysis' | relative_url }})
- [Which Model Should I Use?]({{ '/guides/which-model' | relative_url }})
