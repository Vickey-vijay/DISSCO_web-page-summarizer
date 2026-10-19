# PRD: AI-Powered Web Page Summarizer Chrome Extension

As of 2026-10-17 · Prepared by Vignesh V · Client: Jeffy (CoH 11)

A Chrome extension that summarizes any web page in one click. V1 (midsem) uses a cloud LLM API. V2 (final sem) runs the model inside the browser with no API key.

## Overview and problem

Browser assistants such as Copilot can already summarize an open page, but they send the page text to a vendor's cloud, depend on an account, and give the user no say over the model. This project builds a Chrome extension that reads the text of the current tab and returns a summary, with the engine changing between versions: a cloud LLM API in V1, a model running inside the browser in V2.

**Goals**

- Summarize the page in the active tab from the extension popup.
- Handle long pages by splitting the text and merging partial summaries.
- In V2, run with no API key and no page text leaving the machine.

**Not in scope:** other browsers, PDFs, video pages, and anything beyond summarizing the open page.

## Scope: V1 and V2

V1 is a complete working slice for the midsem; V2 is the full product for the final sem.

| Area | V1 (midsem) | V2 (final sem) |
| --- | --- | --- |
| Summarization engine | Cloud LLM API (Gemini or NVIDIA key, free tier) | Local model in the browser (Llama-class, WebGPU), weights kept in the browser cache |
| API key | Entered once in an options page, stored in the browser | Not needed |
| Network | Needed on every summary | Needed only for the first model download |
| Long pages | Split, summarize each part, merge | Same, with smaller chunks sized to the local model |
| Documents | Report (.docx), KT document, PPT | Same set, updated for V2 |

## Requirements

| ID | Requirement | Version |
| --- | --- | --- |
| FR1 | The user opens the extension on any page and presses Summarize; the summary appears in the popup. | V1, V2 |
| FR2 | The extension reads the main text of the active page and drops menus, ads and footers. | V1, V2 |
| FR3 | Text longer than the model's limit is split into chunks, each chunk is summarized, and the partial summaries are merged into one. | V1, V2 |
| FR4 | A progress indicator shows while chunks are processed. | V1, V2 |
| FR5 | The user enters their own API key once in an options page; it is stored in the browser. | V1 |
| FR6 | The model downloads on first use with a progress bar and is cached for later runs. | V2 |
| FR7 | After the model is cached, summaries are produced with no network. | V2 |
| FR8 | Clear messages for a missing or invalid key, rate limits, no WebGPU, and pages with too little text. | V1, V2 |

**Non-functional**

- Chrome desktop, Manifest V3.
- Installable by loading the unpacked extension from the repo; the README gives the steps, and setup.bat and run.bat wrap any build step.
- V2 must work on the client's own laptop; the model size is chosen after the laptop configuration is known.

## How it works

```
Content script (reads the active tab)
        |
Text extractor (keeps the main text only)
        |
Chunker (splits long pages)
        |
        +--> V1: cloud LLM API (Gemini or NVIDIA key)
        |
        +--> V2: local model (WebLLM on WebGPU, cached)
        |
Merger (joins chunk summaries)
        |
Popup (shows the summary)

Only the summarization engine differs between versions.
```

Extraction and chunking are shared, so V2 reuses everything built for V1 and swaps only the engine. Proposed stack: Manifest V3, JavaScript, a readability-style text extractor, and WebLLM for V2.

## Difference from Copilot

Copilot-style assistants already summarize pages, and their cloud models will usually write better summaries than a small local model. This project differs in cost, where the data goes, and how much control the user has.

| Aspect | Copilot-style assistant | This extension |
| --- | --- | --- |
| Cost | Cloud service tied to a vendor account | V1 runs on a free-tier API key; V2 needs no key and has no per-use cost |
| Data and privacy | Page text is sent to the vendor's cloud | V2 keeps the page text on the user's machine |
| Offline use | Not possible | V2 works offline once the model is cached |
| Control | Fixed vendor model and behavior | Model, chunk size and summary prompt are chosen and tuned for this one job |
| Research value | None for the project | Cloud (V1) and local (V2) can be compared on speed, quality and memory |

**Limitations to state upfront:** local models of about 1B to 3B parameters summarize less well than cloud models, the first model download is large, and V2 needs a WebGPU-capable browser and enough GPU memory.

## Risks

| Risk | Impact | Fallback |
| --- | --- | --- |
| A small local model summarizes poorly or slowly | V2 quality below V1 | Test 1B to 3B models early, keep chunks small, and report the gap honestly |
| Client laptop has no WebGPU or too little GPU memory (a 4-bit 1B model needs about 880 MB) | V2 will not run | Check at startup, show a clear message, and use a smaller model |
| Large first download (about 695 MB for a 4-bit 1B model, about 2 GB for Phi-3.5-mini) | Slow first run; cache can be evicted | Download once with a progress bar and re-download if the cache is cleared |
| Free-tier API rate limits (V1) | Summaries fail mid-demo | Retry with a delay and show a clear message |
| Pages whose text loads late or sits behind a login | Incomplete summary | Read the rendered page, and warn when little text is found |

## Open questions

- [ ] Exact author / submitted-by name to print on documents.
- [ ] Which GitHub repo? Suggested new repo name: chrome-page-summarizer.
- [ ] Client laptop OS, RAM and GPU; this sets the V2 model size.
- [ ] Midsem and final-sem dates (assumed V1 = midsem, V2 = final).
- [ ] V1 provider: Gemini or NVIDIA key.
- [ ] Should V2 keep the cloud engine selectable, or be local-only?

## Sources

Model sizes and limits come from web search results, not from pages opened in full, so treat them as approximate until tested on the client's laptop.

- [Run an LLM inside a browser tab (2026)](https://pinggy.io/blog/run_llm_in_browser_webgpu/)
- [Browser-native LLM inference](https://tianpan.co/blog/2026-04-17-browser-native-llm-inference-webgpu)
- [WebLLM: start to first response](https://dev.to/multigrid/webllm-start-to-first-response-in-the-browser-21d5)
- [WebLLM docs](https://docsearch.algolia.com/mcp/docs/repo/mlc-ai/web-llm)
- [Chrome built-in AI APIs overview](https://levelup.gitconnected.com/your-browser-is-now-an-ai-no-api-key-required-3f813e902f51)
