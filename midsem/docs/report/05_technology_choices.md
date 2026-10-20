# Technology choices

This chapter records the main decisions as short decision records. Each record gives the question, the options considered, the choice, the reasons against the others, and the trade-off accepted. Where a choice changed during the build, the record says so.

## Programming language

**The question.** Should the extension be written in plain JavaScript or in TypeScript?

Table: Language options compared

| Option | Build step before loading | Type checking |
|---|---|---|
| Plain JavaScript with ES modules and JSDoc comments | None; Chrome loads the files as they are | Editor hints from comments |
| TypeScript | A compiler must run first | Full checks at compile time |

**The choice.** Plain JavaScript, with ES modules (the import and export format that browsers and Node.js both read) and JSDoc comments, which describe parameter types in structured comments.

**Why not TypeScript.** The setup script would have to run a compiler on the client's computer, and a compiler update could break the build. The project plan chose no build step, so setup stays simple.

**Trade-off accepted.** The tests and careful reading must catch the type mistakes that a compiler would catch.

**What this means in plain words.** The code runs as written. Setup stays simple, but the tests carry more of the checking.

## Where the extension shows itself

**The question.** Should the interface be a toolbar popup, a side panel or a new tab?

Table: Interface options compared

| Option | Stays open while the reader works on the page? |
|---|---|
| Toolbar popup | No; it closes when the reader clicks elsewhere |
| Side panel | Yes, while it is open |
| New tab | Yes |

**The choice.** The toolbar popup. The project owner asked for a popup or a side panel and no new tab. The key box was placed inside the popup, so the reader does not leave it to add a key. The Options page still exists and opens in its own tab only when the reader chooses it.

**Why not the others.** The side panel was not built, so it was not tested. An early test harness opened the popup and the Options page as tabs. The owner noticed that the product looked as if it opened tabs, so the key moved into the popup and the harness opened the popup as a small window.

**Trade-off accepted.** The popup closes easily, so the work has to run in the background (see the next record).

**What this means in plain words.** The reader never leaves the page to use the tool, and the popup can disappear at any time.

## Text extraction

**The question.** How should the extension find the main text of a page and leave out menus, advertisements and footers?

Table: Extraction options compared

| Option | Fit for article pages | Effort |
|---|---|---|
| Mozilla Readability, copied into the project | Built to find the main article | Low; one file |
| Hand-written rules for each site | Depends on the rules | High; breaks when a layout changes |
| Raw visible text | Keeps menus and footers | Lowest |

**The choice.** Readability. The extractor uses it first. If the result is under 200 characters and the visible text is longer, the visible text is used. This fallback covers pages such as dashboards, which browser test T13 checks.

**Why not the others.** Rules would need one set per site. Raw text kept the noise. In the test article, 2,164 characters were visible, 1,711 characters were sent to the model, and none of the noise phrases such as "SUBSCRIBE NOW" reached it. Readability is the library behind Firefox's reading view.

**Trade-off accepted.** Readability can miss content. A defect shows the risk: table cells ran together in the text sent to the model. Browser test T21 caught it, and the fix joins cells with " | ".

**What this means in plain words.** The project uses a library built to pull out articles, plus a second method for pages it cannot read.

## Where the work runs

**The question.** Should the summary run in the popup or in the background service worker?

Table: Where the work can run

| Option | Keeps running when the popup closes? |
|---|---|
| Popup script | No; a multi-part summary would stop halfway |
| Service worker | Yes, while Chrome keeps it alive |

**The choice.** The service worker. It writes progress and the result to Chrome's session storage, which lasts until the browser restarts. The popup only sends a start message and reads the stored record.

**Why not the popup.** Closing the popup would kill the job. A full tab was ruled out for the reason in the interface record.

**Trade-off accepted.** Chrome can stop an idle worker mid-job. The design writes progress as it goes, marks a job found "running" after a restart as interrupted, and gives each job an id so that a replaced job can be stopped. The first version of this handling missed some cases. The browser tests found them, and they were fixed. Test T18 covers the stopped worker.

**What this means in plain words.** The summary keeps going when the popup closes. The cost is extra care, because Chrome can stop the background part at any time.

## How the cloud is called

**The question.** Should the extension call Google's API with a plain web request, or with Google's software development kit (SDK)?

Table: Ways to call the cloud service

| Option | Build step | Testability |
|---|---|---|
| Plain HTTPS request (fetch) | None | One endpoint, easy to fake |
| Official SDK | A bundler to package it | Harder to fake |

**The choice.** A plain HTTPS request with the browser's fetch function. The engine file, about 180 lines, holds the timeout, the retries and the mapping from HTTP status codes to the project's error codes.

**Why not the SDK.** The SDK needs a bundler, which adds a build step. A single endpoint is easy to replace with a fake server in the tests.

**Trade-off accepted.** The project owns the retry and error logic, which means more code to maintain. A timeout helper that the platform provides did not keep the test runner alive, so a test ended early. The project replaced it with its own timer that the code clears itself. The development log records this as a lesson about test harnesses.

**What this means in plain words.** The extension calls Google directly with a standard web request. The project handles failures itself.

## Where the key is stored

**The question.** Where should the Gemini key be kept?

Table: Key storage options compared

| Option | Where it is kept | Leaves this computer? |
|---|---|---|
| chrome.storage.local | This browser profile on this computer | No |
| chrome.storage.sync | Synced to the user's Google account | Yes, copied to the account |

**The choice.** chrome.storage.local. The popup and the Options page both say the key is kept in this browser only.

**Why not sync.** The project plan records that sync would copy the key to the user's Google account. Typing the key for every summary was also rejected as too much friction.

**Trade-off accepted.** The key is stored without encryption in the browser profile on disk. Anyone who can open that user account's profile could read it. The report states this as a limitation.

**What this means in plain words.** The key stays on the reader's computer, in the browser only, and it is not encrypted on disk.

## Which cloud model

**The question.** Which Gemini model should the extension call, and with which thinking setting?

Some models think before they answer, and the thinking takes time. The benchmark sent one request of about 7,000 characters to each candidate, three times per candidate.

Table: Measured request time for each candidate, from the model benchmark

| Model and setting | Measured time per request |
|---|---|
| gemini-3.8-flash, default thinking | 11.4 to 12.6 s |
| gemini-3.8-flash, thinking level low | 3.9 s, 3.9 s and 12.5 s |
| gemini-3.5-flash-lite, default | 1.6 to 2.0 s |
| gemini-2.5-flash, thinking off | 2.4 to 2.7 s |

The quota probe sent requests to each model until the service refused one, up to a ceiling of 30 requests. None of the four reached 30.

Table: Quota probe results, from the quota probe file

| Model | Successful requests before the first error | The first error |
|---|---|---|
| gemini-3.5-flash-lite | 16 | Quota error naming a limit of 15 |
| gemini-2.5-flash-lite | 11 | Quota error naming a limit of 10 |
| gemini-2.5-flash | 6 | Quota error naming a limit of 5 |
| gemini-3.1-flash-lite | 3 | Service reply 503, "high demand" |

The probe does not record the time window for each limit, so that window is [to be measured]. The first model recorded 16 successful requests against a named limit of 15, and the reason for that difference is [to be measured].

**The choice.** gemini-3.5-flash-lite with the thinking setting low. This is the default in the configuration file, and the live runs on real pages used it.

**How the choice changed.** The first choice was gemini-3.8-flash with low thinking. The development log records that its default setting took about 11 to 13 seconds per request, too close to the 25-second limit for a page with several parts. Low thinking cut the typical time to about 3.9 seconds, but one run in three still took 12.5 seconds. The project owner then asked for cheap models, and the default became gemini-3.5-flash-lite. It was the fastest in the benchmark and had the highest named limit in the probe.

**Why not the others.** The 3.8 model was slower and more variable. The 2.5 model with thinking off was slower, with a lower limit. The 2.5 lite model was not benchmarked, so its speed is [to be measured].

**Trade-off accepted.** The summary quality of the cheaper models was not compared formally. The live summaries show odd wording at times, for example "contagious error management" in the WebGPU summary, L07.

**What this means in plain words.** The project picked the fastest model the free tier allowed, after measuring the options on the same text. It did not measure whether the cheaper model writes better or worse summaries.

## Testing tools

**The question.** Which tools should run the unit tests and the browser tests?

**The choice.** The node:test runner, which is built into Node.js, for the unit tests. Playwright with its Chromium browser for the browser tests. The browser tests load the extension, open fixture pages, and call a small mock server in place of Google's API. The mock records each request and can simulate busy replies, errors, timeouts and empty answers.

**Why not the others.** Jest and Vitest add dependencies that node:test does not need. Selenium can drive a browser, but Playwright could also load the extension and take screenshots. Manual clicking alone cannot be repeated after each fix.

**A constraint that shaped the choice.** The project first tried to load the extension into the installed Google Chrome 155 with a command-line flag. The flag did not work. The development log records that Chrome 137 removed it from branded builds. So run.bat opens the extensions page and shows the steps, and the automated tests run on Playwright's Chromium, which still accepts the flag.

**Trade-off accepted.** The test copy adds a host permission for the local test server, so the browser tests do not exercise the real toolbar grant. The manual smoke test covers that path, and its results are [to be measured]. The mock also means the browser tests say nothing about the real model's answers. Live runs cover that, for the pages listed.

**What this means in plain words.** The tests run on a copy of the extension with a fake Google service, so they are repeatable and free. A manual check in the real browser is still needed.

## Look of the interface

**The question.** How should the popup and the Options page look?

**The choice.** A printed-page style: a paper background, dark ink, one red accent, a serif font for the summary, hairline rules, square corners, and numbered points. The owner said the first design looked as if an AI had made it, so the design was redrawn. A printed page suits a short text to read.

The screenshot shows the three popup states.

![Popup states: idle, no key yet with the key box open, and key saved inside the popup](../screenshots/ui-states-1.png)

Reading the screenshot: panel A shows the idle popup with a single black Summarize button. Panel B shows the state with no key. The key box is open, with the message "No API key yet. Paste your Gemini key in the Key box and save it." Panel C shows the key saved inside the popup, with "Key saved. Now press Summarize." and a link to remove the key.

**Trade-off accepted.** The style is hand-written CSS, which the project must maintain. No formal usability test was run, so clarity to readers is [to be measured]. The first run found a layout fault on the Options page, where the Save button squeezed the key field, and the second run records a fix. A note from the first run, that the progress bar looks stuck during a retry, is not recorded as fixed.

**What this means in plain words.** The popup looks like a printed page, which suits reading. Whether readers find it clear has not been tested.

## What was prioritised and what was left for later

The project put its effort into the path a reader uses every day: press Summarize, read the page, split long text, summarize the parts, merge them, show the result, and show a plain message when something fails. The key handling sits on that path, since nothing else can be tested with real pages without it. The tests and the live runs were built to catch the failures a reader would meet. The midsem deliverable is a working cloud version, and a comparison with a later engine needs a working first engine to compare against.

Left for later are the local engine, offline use and the model download. These depend on the client's laptop, because the model size depends on its graphics card and memory. The abstract's plan of work places them in weeks 8 to 14, and the comparison depends on them. Also still open are a run of the setup scripts on a clean copy of the project, and the recorded manual check in the real Chrome browser. Both results are [to be measured].

### What this means in plain words

The cloud version is built, tested and measured where measurement was possible. The local model, the comparison and the client's laptop check come later. The clean-copy and manual checks still need their results recorded.

### Questions this chapter answers

**Why Gemini and not another service?**
The requirements document left the provider open between Gemini and NVIDIA. The plan chose Gemini because it needs one request call, offers a free tier and uses a simple key. The report does not compare other providers.

**Why keep the cheaper model when its quality was not tested?**
Speed and quota were measured, and they decided the choice. Quality was not compared formally, and the report states that limit.

**What does the key-storage choice cost the reader?**
The key sits unencrypted in the browser profile on the reader's computer. Anyone who can open that account's profile could read it.
