![BITS Pilani logo](../assets/bits-logo.png)

**Project Work Title:**  
**AI-Powered Web Page Summarizer**

**Course No. : (Insert Course No.)**

**Course Title: Project Work**

**Project Work Done by:**

**Student Name: (Insert Student Name)**

**BITS ID: (Insert Student ID)**

**Degree Program: (Insert Degree Name)**

**Research Area: Applied Natural Language Processing, Browser Extension Engineering, On-Device Inference**

**Project Work carried out at:**

**(Insert Organization Name & Location)**

**BIRLA INSTITUTE OF TECHNOLOGY & SCIENCE, PILANI**  
**VIDYA VIHAR, PILANI, RAJASTHAN - 333031.**

**(Insert Month and Year)**

**Contents**

1. Broad Area of Work
2. Background
3. Objectives
4. Scope of Work
5. Plan of Work
6. Literature References
7. Particulars of the Supervisor and Examiner

---

## 1. Broad Area of Work

This project sits between browser extension engineering and applied natural language processing. It is about giving a person a short, usable summary of the web page they are reading, without leaving the page.

The project builds a Chrome extension that reads the text of the open tab and shows a summary in the extension popup. The summary is written by a language model. The extension can use a hosted model through an API key that the user connects, and it can use a small model that runs inside the browser on the computer's own graphics card, so that no key is needed and the page text never leaves the computer. The current research project focuses on the following application areas:

- Browser extension engineering: building a Manifest V3 Chrome extension with a popup, a background service worker, a content script and an options page.
- Web page text extraction: reading the rendered page and keeping only the main text, without menus, advertisements and footers.
- Long-text summarization: cutting text that is longer than a model can take into parts, summarizing each part and merging the partial summaries into one.
- Hosted model integration: calling a cloud language model through its API and handling rate limits, wrong keys and network failures.
- In-browser inference: running a small quantized model in the browser with WebGPU, downloaded once and kept in the browser's storage.

## 2. Background

Most of us have opened a long article or a documentation page, scrolled past menus and banners for five minutes, and found that it did not answer the question we came with. The only way to find out is to read it. A one-click summary of the page would save that time.

Tools that do this already exist. Browser assistants such as Microsoft Copilot can summarize an open page, and the Chrome Web Store has many summarizer extensions. Using them shows the same problems quickly. They send the page text to the vendor's cloud, which matters when the page is a private document, an internal wiki or an email. They usually need an account or a subscription. They give the user no say over which model is used or how the summary is written. And most of them stop working without an internet connection. Chrome itself now has a built-in on-device Summarizer API, but it uses a model that Chrome chooses, supports a small set of languages, and asks for a lot of free disk space and a capable graphics card or processor, so it does not suit every computer.

This project builds one extension that can produce the summary in two ways, so that both sides of the trade-off can be studied. With a hosted model, the extension reads the page, splits it if it is long, and asks the model for the summary using the user's own free-tier API key. With an in-browser model, the same extension runs a small model on WebGPU. That model is downloaded once, kept in the browser's storage, and used with no network afterwards. The text extraction, the splitting, the merging, the progress display and the popup are shared by both.

Running a model locally has a cost, and the project states it up front. Models of about one to three billion parameters write weaker summaries than large hosted models, the first download is large, and the browser needs WebGPU and enough graphics memory. Measuring how big that gap is, in speed, quality and memory, is part of the work. The aim is a fair comparison for this one job, not a claim that one way always wins.

In my own work I regularly read long web pages, such as product documentation, vendor pages and internal wiki pages, only to find one answer. A short summary of the page saves that reading time. Keeping the page text on my own computer also matters in a work setting, because some of these pages are internal and should not be sent to an outside service.

## 3. Objectives

The objectives of my project are as follows:

- Understand how Manifest V3 extensions are built and how the popup, service worker, content script and options page work together.
- Build an extension whose popup summarizes the page in the active tab when the user presses one button.
- Extract only the main readable text of a page and leave out menus, advertisements and footers.
- Handle pages longer than a model can take by splitting the text into parts, summarizing each part and merging the partial summaries into one.
- Connect the extension to a hosted language model through the user's own API key, with a progress indicator and clear messages for a missing or wrong key, rate limits, and pages with too little text.
- Run a small language model inside the browser with WebGPU, downloaded once with a progress bar and cached, so that summaries need no key and no network.
- Compare the hosted model and the in-browser model on speed, summary quality and memory use, and report the differences, including where the local model falls short.

## 4. Scope of Work

The following work will be done by me independently during the semester:

- Studying how Manifest V3 extensions are structured and how their parts communicate.
- Building the text extractor that reads the rendered page of the active tab and keeps the main text only.
- Building the chunker and the merger for long pages, and testing them on short, long and badly formatted pages.
- Building the hosted-model engine, including prompt design, retry with delay on rate limits, and an options page that stores the user's key in the browser.
- Writing clear error messages for a missing or wrong key, a busy service, no network, restricted browser pages and pages with too little text.
- Choosing and testing small models of about one to three billion parameters, and building the engine that runs the chosen model in the browser with a download progress bar and caching.
- Checking at startup whether WebGPU and enough graphics memory are available, and showing a clear message if not.
- Testing the extension on a set of real pages of different lengths and types, and recording speed, summary quality and memory use for the comparison.

Out of scope: browsers other than Chrome on desktop, PDF files, video pages, and anything beyond summarizing the page that is open in the active tab.

## 5. Plan of Work

| Phases | Start Date-End Date | Work to be done |
|---|---|---|
| Project Work Outline | 16 Nov 2026 – 29 Nov 2026 | Literature review on Manifest V3, page text extraction, summarization of long text by chunking, and hosted and in-browser language model options. Prepare the project work outline. |
| Design & Development | 30 Nov 2026 – 3 Jan 2027 | Design and build the extension: popup, service worker and content script; the text extractor; the chunker and merger; the hosted-model engine with its options page; the in-browser engine with first-run download, progress bar and caching; the WebGPU check; and the error messages. |
| Testing | 4 Jan 2027 – 24 Jan 2027 | Software testing on real pages of different lengths and types, user evaluation, and the comparison of the hosted and in-browser models on speed, quality and memory. Conclusion. |
| Project Work Review | 25 Jan 2027 – 7 Feb 2027 | Submit the project work to the Supervisor and the Additional Examiner for review and feedback. |
| Submission | 8 Feb 2027 – 14 Feb 2027 | Final review and submission of the project work. |

## 6. Literature References

The state of the art is the base for any successful research project. In the current project, the literature leans towards running small language models in the browser and summarizing text that is longer than a model can read in one go. The following are the references from the preliminary literature review.

[1] C. F. Ruan, Y. Qin, A. R. Parthasarathy, et al. *WebLLM: A High-Performance In-Browser LLM Inference Engine.* arXiv:2412.15803, 2024.

[2] N. F. Liu, K. Lin, J. Hewitt, A. Paranjape, M. Bevilacqua, F. Petroni, and P. Liang. *Lost in the Middle: How Language Models Use Long Contexts.* arXiv:2307.03172, 2023.

[3] J. Wu, L. Ouyang, D. M. Ziegler, N. Stiennon, R. Lowe, J. Leike, and P. Christiano. *Recursively Summarizing Books with Human Feedback.* arXiv:2109.10862, 2021.

[4] A. See, P. J. Liu, and C. D. Manning. *Get To The Point: Summarization with Pointer-Generator Networks.* In Proceedings of the 55th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers), pages 1073–1083. ACL, 2017.

[5] Meta. *Llama 3.2: Revolutionizing edge AI and vision with open, customizable models.* Meta AI blog, 25 September 2024. https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/

[6] W3C. *WebGPU.* W3C Candidate Recommendation Draft, 15 September 2026. https://www.w3.org/TR/webgpu/

[7] Chrome for Developers. *Manifest V3.* Google. https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 (accessed 20 October 2026).

[8] Google AI for Developers. *Text generation.* Gemini API documentation, 2026. https://ai.google.dev/gemini-api/docs/text-generation

## 7. Particulars of the Supervisor and Examiner

| | Supervisor | Additional Examiner |
|---|---|---|
| Name | | |
| Qualification | | |
| Designation | | |
| Employing Organization and Location | | |
| Phone No.(with STD Code) | | |
| Email Address | | |

## 8. Remarks of the Supervisor

The proposed project is practical and well scoped. The student has picked a real everyday problem, reading long web pages, and a sensible way to address it with a Chrome extension. Comparing a hosted language model with a small model that runs inside the browser gives the work a clear question to answer, and the objectives are realistic for the time available. The literature reviewed so far covers the browser platform, in-browser inference and the summarization of long text well enough to begin. The plan covers the building, testing and evaluation of the extension on real pages, and the scope is clear about what is left out. I approve the following project as the supervisor.

**Information about the Supervisor:**

**BIRLA INSTITUTE OF TECHNOLOGY & SCIENCE, PILANI**  
**WORK INTEGRATED LEARNING PROGRAMMES (WILP) DIVISION**  
**(INSERT SEMESTER) OF ACADEMIC YEAR (INSERT YEAR)**  

| | |
|---|---|
| **NAME OF THE STUDENT** | (Insert Student Name) |
| **STUDENT'S EMAIL ADDRESS** | (Insert Student Email Address) |
| **STUDENT'S EMPLOYING ORGANIZATION & LOCATION** | (Insert Organization Name & Location) |
| **SUPERVISOR'S NAME** | (Insert Supervisor Name) |
| **SUPERVISOR'S EMPLOYING ORGANIZATION & LOCATION** | (Insert Organization Name & Location) |
| **SUPERVISOR'S EMAIL ADDRESS** | (Insert Supervisor Email Address) |
| **ADDITIONAL EXAMINER'S NAME** | (Insert Examiner Name) |
| **ADDITIONAL EXAMINER'S EMPLOYING ORGANIZATION & LOCATION** | (Insert Organization Name & Location) |
| **ADDITIONAL EXAMINER'S EMAIL ADDRESS** | (Insert Examiner Email Address) |
| **PROJECT WORK TITLE** | AI-Powered Web Page Summarizer |

| | | |
|---|---|---|
| &nbsp; | &nbsp; | &nbsp; |
| **Signature of Student** | **Signature of Supervisor** | **Signature of Additional Examiner** |
| **Name:** | **Name:** | **Name:** |
