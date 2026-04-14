---
layout: default
title: Tool Calling
parent: Guides
nav_order: 10
description: How to use Off Grid's built-in tools — web search, calculator, date/time, device info, and knowledge base search — with any function-calling model.
faq:
  - q: Which models support tool calling in Off Grid?
    a: Any model that supports function calling in GGUF format. Qwen 3.5, Gemma 4, Mistral 7B, and Phi-4 Mini all support it. Check the model card — if it lists "function calling" or "tool use", it works.
  - q: Does tool calling require internet?
    a: The calculator, date/time, and device info tools are fully offline. Web search requires an internet connection. Knowledge base search is fully local.
---

# Tool Calling

Off Grid ships with built-in tools that compatible models can call automatically during a conversation. The model decides when to use them — you don't need to trigger them manually.

---

## Available tools

| Tool | What it does | Requires internet |
|---|---|---|
| **Web search** | Searches the web and returns results with clickable links | Yes |
| **Calculator** | Evaluates mathematical expressions | No |
| **Date / Time** | Returns the current date, time, and timezone | No |
| **Device info** | Returns device name, OS version, available RAM | No |
| **Knowledge base search** | Searches documents you've uploaded to a project | No |

---

## How it works

When you send a message, the model reads the available tool definitions and decides whether to call one. If it does:

1. The model emits a function call (e.g. `search("best offline AI apps 2026")`)
2. Off Grid executes the tool and returns the result to the model
3. The model reads the result and generates its final response
4. This loop repeats until the model has enough information — with runaway prevention to avoid infinite loops

You see the tool calls inline in the conversation as collapsible cards.

---

## Which models support tool calling

Function calling requires a model trained for it. In Off Grid's recommended catalogue:

| Model | Tool calling |
|---|---|
| Qwen 3.5 0.8B | Yes |
| Qwen 3.5 2B | Yes |
| Qwen 3.5 9B | Yes |
| Gemma 4 E2B | Yes |
| Gemma 4 E4B | Yes |
| Phi-4 Mini | Yes |
| Mistral 7B | Yes |
| SmolLM3 3B | Limited |
| SmolLM2 360M | No |

If you're downloading a custom GGUF from Hugging Face, check the model card for "function calling" or "tool use" support.

---

## Using web search

Web search is automatic — just ask a question that requires current information:

> "What is the latest version of llama.cpp?"

The model will call `web_search`, get results, and cite them in its answer with clickable links.

**Note:** Web search is the only tool that requires an internet connection. All other tools work offline.

---

## Using the knowledge base tool

The `search_knowledge_base` tool is available automatically in any project that has documents uploaded. See the [Knowledge Base guide]({{ '/guides/knowledge-base' | relative_url }}) for setup.

---

## Disabling tools

Go to **Chat settings** → toggle off individual tools. You can disable web search to force fully offline responses, or disable all tools if you want pure text generation.

---

## Related guides

- [Knowledge Base and RAG]({{ '/guides/knowledge-base' | relative_url }})
- [Which Model Should I Use?]({{ '/guides/which-model' | relative_url }})
