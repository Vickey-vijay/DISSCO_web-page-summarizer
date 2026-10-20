# Introduction

## The problem

Many web pages are long, and the one fact a reader needs is often buried. A news article, a documentation page or an encyclopedia entry can run to several thousand words. Menus, banners, cookie notices and lists of related articles surround the text. To learn whether a page is worth reading, the reader has to scroll through much of it first.

A one-click summary would save that time. The reader presses one button while the page is open and gets a short account of what the page says, beside the page and without copying text into another service.

## Why the problem matters

Three concerns make this more than a convenience.

The first is cost and accounts. Many summary tools need a sign-in or a subscription before the first summary.

The second is where the text goes. A summary tool reads the page text, and that text travels to whoever runs the tool. For a public article this is harmless. For a private document, an internal wiki or an email, the reader may not want the text sent to a vendor's cloud.

The third is control. A ready-made assistant chooses its own model, summary length and handling of long pages. The reader cannot see the instructions sent to the model, or change how a long page is split.

This project tackles these concerns in stages. The first version, described here, addresses cost and control in part. It does not address where the text goes, and the background chapter explains that gap.

## What the project builds

Page Summarizer is a Google Chrome extension. An extension is a small add-on that Chrome loads from a folder of web files and runs alongside the browser. The first version, called V1 in the project documents, adds a toolbar button. When the user presses Summarize, the extension reads the main text of the open tab and sends it to Gemini, a language model hosted by Google that writes text in answer to a prompt. The extension calls Gemini through the Gemini API, the web address and rules that let a program send requests to Google's service. The summary comes back and appears in the popup, the small window that opens from the toolbar button. Long pages are split into parts, each part is summarized, and the part summaries are merged into one.

The user supplies their own key, a secret string that tells Google which account is making the requests. Google issues a free key through its AI Studio website. The user pastes it once, and the extension keeps it in the browser.

## Objectives

The objectives come from the project abstract. The table marks which ones V1 delivers.

Table: Project objectives and whether V1 delivers them

| No. | Objective | In V1? |
|---|---|---|
| 1 | Build a Manifest V3 Chrome extension whose popup summarizes the active tab with one button press. | Yes |
| 2 | Extract only the main readable text, leaving out menus, advertisements and footers. | Yes |
| 3 | Split pages longer than the model's limit, summarize each part, and merge the results into one summary. | Yes |
| 4 | Connect to a cloud language model with a user-entered key, with a progress indicator and clear messages for common errors. | Yes |
| 5 | Run a small language model inside the browser, with no key and no network. | No, later stage |
| 6 | Compare the cloud engine with the in-browser engine on speed, summary quality and memory use. | No, later stage |

Manifest V3 is the current format for Chrome extensions. The manifest is a file that tells Chrome what the extension contains and what it may do.

## Scope

V1 covers Google Chrome on a desktop computer, loaded from the project folder with "Load unpacked". It covers a popup with a Summarize button, a progress line, a numbered summary and a statistics line. It covers text extraction with a check for pages that have too little text, splitting and merging of long pages, a key box in the popup and an Options page, plain-English error messages, two setup scripts (setup.bat and run.bat), and automated and manual tests. The setup scripts are written for Windows.

The following are out of scope for V1: other browsers, PDF files, video pages, anything beyond summarizing the open page, a model that runs on the user's computer, use without a network, a history of summaries, export, other languages, and a cancel button. A running summary can only finish, fail, or be replaced when the reader presses Summarize on a different page.

## How to read this report

The chapters after this one cover the background and the existing tools, the requirements and how each was checked, the system design, and the technology choices. Technical terms are explained the first time they appear. Each technical section ends with a short paragraph headed "What this means in plain words". Numbers come from measured test runs and live runs. Where a number was not measured, the report says [to be measured]. Student details are left as placeholders.

### Questions this chapter answers

**Why build this when Chrome and Copilot-style assistants already summarize pages?**
Those tools cover the general need. They usually send the page to a vendor's cloud, require an account, and give the reader no say over the model or the handling of long pages. This project tests a narrower idea: the reader supplies the key, every setting is visible in the code, and the results are measured. The cost is that V1 still sends the page text to Google.

**Why is V1 a cloud version and not a local one?**
A local model needs a capable graphics card and a large first download, and its summary quality was not yet known. The cloud route let the core flow (read, split, summarize, merge, show) be built and tested first. The local engine is a later stage that reuses the same flow.

**Does V1 keep the page private?**
No. The extracted text of the page, with a short instruction and the page title, is sent to Google for each request. The connection is encrypted (HTTPS), but Google receives the text. The report states this limitation in several places.

**What counts as a working V1?**
A summary of a short page and of a long page appears in the popup, the common errors show plain messages, and the key stays in the browser. The requirements chapter lists how each requirement was checked.
