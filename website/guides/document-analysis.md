---
layout: default
title: Document Analysis and Attachments
parent: Guides
nav_order: 14
description: Attach PDFs, code files, CSVs, and other documents to your Off Grid conversations. The app extracts and passes content to your local model for analysis — entirely on-device.
faq:
  - q: What file types can I attach?
    a: PDF, txt, md, most code file types (py, js, ts, java, swift, kt, go, rs, sql, sh, etc.), CSV, JSON, YAML, XML, HTML, and more. Maximum 5MB per file.
  - q: Does attaching a document send it to the cloud?
    a: No. The app extracts text from the document on-device and passes it to your local model. Nothing is uploaded.
  - q: Is there a file size limit?
    a: 5MB per file. Text content is truncated to 50,000 characters for context window management.
---

# Document Analysis and Attachments

Attach files directly to your conversations and ask your local model questions about them. PDFs, code, CSV data, config files — anything text-based works.

All processing happens on your device.

---

## Supported formats

**Documents:**
- PDF (text extracted natively via PDFKit on iOS, PdfRenderer on Android)

**Text and code:**
- `.txt`, `.md`, `.log`
- `.py`, `.js`, `.ts`, `.jsx`, `.tsx`, `.java`, `.c`, `.cpp`, `.h`, `.swift`, `.kt`, `.go`, `.rs`, `.rb`, `.php`, `.sql`, `.sh`

**Data files:**
- `.csv`, `.json`, `.xml`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.html`

**Limits:** 5MB per file. Text is truncated at 50,000 characters for context window management.

---

## How to attach a file

1. Open a chat in Off Grid
2. Tap the **attachment icon** in the message bar
3. Select **Document** from the picker
4. Choose your file from the system file browser

The file is copied to app storage (so it survives temp cleanup), and the extracted text is attached to your next message.

---

## Tapping to view

Tap any document badge in the chat to open it with the system viewer — QuickLook on iOS, the system intent viewer on Android.

---

## Paste as attachment

If you paste a large block of text into the message field, Off Grid offers to convert it to an attachment instead. This keeps the chat interface clean when you're passing in large context.

---

## What you can do

**Code review:**
> Attach a file → "Find potential bugs in this code"

**PDF analysis:**
> Attach a contract → "Summarise the key terms and flag anything unusual"

**Data analysis:**
> Attach a CSV → "What are the top 5 items by revenue?"

**Config explanation:**
> Attach a YAML/TOML file → "Explain what this configuration does"

---

## Difference vs knowledge base

Document attachments are **per-conversation** — you attach something to a specific message and the model sees it in that context window. They're not indexed or searchable.

The [Knowledge Base]({{ '/guides/knowledge-base' | relative_url }}) is **project-wide** — documents are embedded and indexed, and the model can retrieve relevant chunks from them automatically across many conversations.

Use attachments for one-off analysis. Use the knowledge base for documents you want to reference repeatedly.

---

## Related guides

- [Knowledge Base and RAG]({{ '/guides/knowledge-base' | relative_url }})
- [Vision AI — Analyse Images On-Device]({{ '/guides/vision-ai' | relative_url }})
- [Tool Calling]({{ '/guides/tool-calling' | relative_url }})
