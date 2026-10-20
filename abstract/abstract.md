![BITS Pilani logo](../assets/bits-logo.png)

# AI-Powered Web Page Summarizer

**A Chrome Extension with a Cloud Engine (V1) and an In-Browser Local Model (V2)**

| | |
|---|---|
| Course No. | [Insert Course No.] |
| Course Title | Dissertation / Project Work |
| Student Name | [Insert Student Name] |
| BITS ID | [Insert BITS ID] |
| Degree Program | [Insert Degree Program] |
| Research Area | Applied Natural Language Processing, Browser Extension Engineering, On-Device Inference |
| Project Carried Out At | [Insert Organization Name & Location] |

**BIRLA INSTITUTE OF TECHNOLOGY & SCIENCE, PILANI (RAJASTHAN)**
Pilani, Rajasthan 333031
[Insert Month and Year]

---

## 1. Broad Area of Work

This project sits between browser extension engineering and applied natural language processing. It is about getting a short, usable summary of any web page without leaving the page.

The project builds a Chrome extension that reads the text of the tab the user is on and shows a summary in the extension popup. The same extension is built in two versions. In Version 1 the summary is produced by a cloud LLM API that the user connects with their own free-tier key. In Version 2 the summary is produced by a small language model that runs inside the browser itself, so no key is needed and the page text never leaves the computer.

The work touches these areas:

- **Browser extension engineering:** building a Manifest V3 Chrome extension with a popup, a background service worker, a content script and an options page.
- **Web page text extraction:** reading the rendered page and keeping only the main text, without menus, advertisements and footers.
- **Long-text summarization:** splitting text that is longer than a model can take, summarizing each part, and merging the partial summaries into one.
- **Cloud LLM integration (V1):** calling a hosted model through its API, handling rate limits, bad keys and network failures.
- **In-browser inference (V2):** running a quantized model in the browser with WebGPU, downloading it once and caching it for later use.

## 2. Background

Most people have opened a long article or a documentation page only to find, five minutes later, that it did not answer their question. The text is usually buried under menus, banners and related-article lists, and the only way to find out is to read it. A one-click summary would save that time.

Tools that do this already exist. Browser assistants such as Microsoft Copilot can summarize an open page, and there are many summarizer extensions in the Chrome Web Store. Using them shows the same problems quickly. They send the page text to the vendor's cloud, which matters when the page is a private document, an internal wiki or an email. They usually need an account or a subscription. They offer no say over which model is used or how the summary is written. And most of them stop working without an internet connection. Chrome itself now has a built-in on-device Summarizer API, but it uses a model chosen by Chrome, supports a small set of languages, and asks for a lot of free disk space and a capable graphics card or processor, so it is not an answer for every machine.

This project builds the extension in two stages so that both sides of the trade-off can be studied. Version 1 is the quick route: the extension reads the page, splits it if it is long, and asks a cloud model for the summary using the user's own free-tier API key. Version 2 replaces only the summarization engine with a small model that runs in the browser on WebGPU. The model is downloaded once, kept in the browser cache, and used with no network afterwards. Text extraction, splitting, merging, progress display and the popup stay the same between the two versions.

There is a cost to the local route and the project states it up front. Models of about one to three billion parameters write weaker summaries than large cloud models, the first download is large, and the browser needs WebGPU and enough graphics memory. Measuring how big that gap is, in speed, quality and memory, is part of the work. The goal is a clear, honest comparison of a cloud engine and a local engine for this one job, not a claim that one always wins.

## 3. Objectives

The objectives of this project are:

1. To build a Manifest V3 Chrome extension whose popup summarizes the page in the active tab when the user presses one button.
2. To extract only the main readable text of a page, leaving out menus, advertisements and footers.
3. To handle pages longer than the model's limit by splitting the text into chunks, summarizing each chunk and merging the partial summaries into one summary.
4. To connect Version 1 to a cloud LLM API using a key that the user enters once in an options page, with a progress indicator and clear messages for a missing or invalid key, rate limits, and pages with too little text.
5. To build Version 2 so that it runs a small language model inside the browser using WebGPU, downloads it once with a progress bar, caches it, and then summarizes with no API key and no network.
6. To compare the cloud engine and the in-browser engine on speed, summary quality and memory use, and to report the differences honestly, including where the local model falls short.

## 4. Scope of Work

The following work will be carried out independently by the student during the semester:

- Studying how Manifest V3 extensions are structured and how the popup, service worker, content script and options page communicate.
- Building the text extractor that reads the rendered page of the active tab and keeps the main text only.
- Building the chunker and the merger for long pages, and testing them on short, long and badly formatted pages.
- Building the Version 1 engine that calls a cloud LLM API, including prompt design, retry with delay on rate limits, and the options page that stores the user's key in the browser.
- Writing clear error messages for a missing or invalid key, a busy service, no network, restricted browser pages, and pages with too little text.
- Choosing and testing small models of about one to three billion parameters for Version 2, and building the engine that runs the chosen model in the browser with a download progress bar and caching.
- Checking at startup whether WebGPU and enough graphics memory are available, and showing a clear message if not.
- Testing both versions on a set of real pages of different lengths and types, and recording speed, summary quality and memory use for the comparison.
- Preparing a `setup.bat` and `run.bat` and a README so the extension can be installed from the repository by loading it unpacked in Chrome.

**Version split:** Version 1 (cloud engine) is delivered for the mid-semester review. Version 2 (in-browser engine) and the comparison are delivered for the final semester.

**Out of scope:** browsers other than Chrome on desktop, PDF files, video pages, and anything beyond summarizing the page that is open in the active tab.

## 5. Plan of Work

| Phase | Start - End Date | Work to be Done |
|---|---|---|
| Literature Review & Outline | Week 1 - Week 2 | Study Manifest V3, page text extraction, summarization of long text by chunking, and cloud and in-browser LLM options; prepare the project outline. |
| Extension Skeleton & Text Extraction | Week 3 - Week 4 | Build the popup, service worker and content script; build the extractor and test it on sample pages. |
| Chunking, Merging & Cloud Engine (V1) | Week 5 - Week 6 | Build the chunker and merger; connect the cloud LLM API; build the options page for the key; add progress display and error messages. |
| V1 Testing & Mid-Semester Submission | Week 7 | Test Version 1 on real pages, fix defects, and prepare the mid-semester report, presentation and knowledge-transfer document. |
| Local Model Study | Week 8 - Week 9 | Study in-browser inference with WebGPU; test small models of about one to three billion parameters for speed, memory and summary quality; choose the model. |
| In-Browser Engine (V2) | Week 10 - Week 11 | Build the local engine with first-run download, progress bar and caching; add the WebGPU check and its messages; confirm that summaries work with no network. |
| Comparison of Cloud and Local Engines | Week 12 | Run both engines on the same set of pages and record speed, quality and memory use. |
| Final Testing & Submission | Week 13 - Week 14 | Final testing, fixes, and completion of the final report, presentation and knowledge-transfer document; submit. |

## 6. Literature References

1. Chrome for Developers. (n.d.). *Manifest V3*. Google. https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 (accessed 20 October 2026). — Describes the extension platform used here, including background code running in service workers.
2. Ruan, C. F., Qin, Y., Parthasarathy, A. R., et al. (2024). *WebLLM: A High-Performance In-Browser LLM Inference Engine*. arXiv:2412.15803. https://arxiv.org/abs/2412.15803 — The in-browser inference engine considered for Version 2; runs language models in the browser with WebGPU and WebAssembly.
3. Mozilla. (n.d.). *Readability.js*. GitHub, licensed under Apache-2.0. https://github.com/mozilla/readability — The library used to pull the main article text out of a page's DOM.
4. Google AI for Developers. (2026). *Text generation* and *Using Gemini API keys*, Gemini API documentation. https://ai.google.dev/gemini-api/docs/text-generation — Reference for the cloud API called in Version 1 and for how the user's own key is used.
5. W3C. (2026). *WebGPU*, W3C Candidate Recommendation Draft, 15 September 2026. https://www.w3.org/TR/webgpu/ — The specification of the GPU API that Version 2 depends on, which is why a WebGPU check is part of the scope.
6. Liu, N. F., Lin, K., Hewitt, J., Paranjape, A., Bevilacqua, M., Petroni, F., & Liang, P. (2023). *Lost in the Middle: How Language Models Use Long Contexts*. arXiv:2307.03172. https://arxiv.org/abs/2307.03172 — Shows that model accuracy drops when the relevant information sits in the middle of a long input, which is one reason long pages are handled in smaller parts.
7. Meta. (2024). *Llama 3.2: Revolutionizing edge AI and vision with open, customizable models*. Meta AI blog, 25 September 2024. https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/ — Announces the 1B and 3B text models built for edge and mobile devices, the size class tested for Version 2.
8. Chrome for Developers. (2025). *Summarize with built-in AI* (Summarizer API). Google. https://developer.chrome.com/docs/ai/summarizer-api — Chrome's own on-device summarization API; its hardware, storage and language limits are part of the comparison in the project.

## 7. Particulars of the Supervisor and Examiner

| | Supervisor | Additional Examiner |
|---|---|---|
| Name | [Insert Name] | [Insert Name] |
| Qualification | [Insert Qualification] | [Insert Qualification] |
| Designation | [Insert Designation] | [Insert Designation] |
| Organization & Location | [Insert Organization & Location] | [Insert Organization & Location] |
| Phone No. | [Insert Phone No.] | [Insert Phone No.] |
| Email Address | [Insert Email Address] | [Insert Email Address] |

## 8. Remarks of the Supervisor

[To be written by the Supervisor after reading this abstract. Left blank on purpose.]

&nbsp;

Signature of Student: ____________________  Name: ____________________

Signature of Supervisor: ____________________  Name: ____________________

Signature of Additional Examiner: ____________________  Name: ____________________
