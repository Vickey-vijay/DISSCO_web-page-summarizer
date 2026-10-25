# Read me first: the knowledge transfer guide for Page Summarizer, Version 2

*Purpose: this page says what Version 2 is, how it differs from Version 1, how to use the seven-file KT pack, and the five things to remember before the viva.*

## What this document is

This is the knowledge transfer (KT) guide for Page Summarizer, Version 2. It is for the student who explains the project at the viva, and for whoever maintains the extension later. Every number comes from the repository: the code in `finalsem/project`, the saved runs in `finalsem/docs/test-runs`, `finalsem/docs/DECISIONS.md`, `finalsem/docs/CLIENT_LAPTOP.md` and `DEVLOG.md`. Where a number is missing, the pack says `[to be measured]`.

The pack has been revised four times, after a code review, a failure in the real Chrome (24 October), the client's laptop photos and the speed work (26 October). Where an older chapter statement conflicts with a later one, the later one is the true one.

## What the project is

Page Summarizer is a Chrome extension. You click its icon on an article, press a button, and a short summary appears in the popup. Version 2 makes the summary with a small language model that runs inside Chrome, on your computer's graphics card. There is no account and no API key, and the page text does not leave the computer.

## How Version 2 differs from Version 1

| Item | Version 1 (`midsem`) | Version 2 (`finalsem`) |
|---|---|---|
| Where the summary is written | Google's Gemini service | Your computer's graphics card |
| What you need to start | A free Gemini key | Nothing to paste. The first use downloads the model (about 695 MB) |
| Internet | Needed for every summary | Needed once, for the download |
| Part size and limit | 8,000 characters, at most 30 parts | 6,000 characters, at most 12 parts |
| Automated tests | 65 unit and 28 browser (its run 3) | 93 unit, 31 browser scenarios, 15 script checks |

Version 1 is untouched in its own folder, so the midterm submission stays as it was.

## How to use this KT pack

| File | Read it when |
|---|---|
| `01_how_it_works.md` | Day 1: the walk from the button press to the summary |
| `02_module_by_module.md` | Day 2: every source file and what breaks without it |
| `03_how_to_run_and_demo.md` | Day 3, and the day before the viva: setup, demo, the client's laptop, errors, tests |
| `04_decisions_in_your_words.md` | Day 4: the decisions, each with a sentence to say |
| `05_glossary.md` | Day 5: plain definitions |
| `06_viva_questions.md` | Days 6 and 7: thirty questions with answers |

## A ten-minute reading path

1. **Two minutes.** Read "What the project is" above, then the first section of chapter 01.
2. **Three minutes.** Read the steps under "One summary, from the click to the screen" in chapter 01, including the condense step.
3. **Three minutes.** Read decision 7 in chapter 04 (the built-in graphics and the model choice) and say it aloud.
4. **Two minutes.** Read the questions "Why is it fast now?", "Why not a smaller model?", "What was not measured?" in chapter 06.

## The five things to remember

1. **The model runs on the laptop.** The page text stays on the computer. The network is used only for the first download, about 695 MB for Llama 3.2 1B.
2. **The client's laptop has only built-in graphics.** It is an Intel Iris Xe chip on a 15-watt processor. The extension has never been run on that laptop, nor in a visible Chrome window.
3. **Long pages are shortened on built-in graphics.** The default reads the opening of the page and the first sentences of each section, about one part of 6,000 characters. The popup says how much was read, and offers "Read the whole page (slower)". The Wikipedia Lighthouse page took 124.6 s on the developer's built-in chip, against about 10 minutes before.
4. **Answers are short on built-in graphics, and the big model is the default.** SmolLM2 is available only as a visible choice, Settings > Quality > Fast, because its summaries were often muddled or wrong.
5. **Some things are not verified.** Timing on the client's laptop, timing in a visible Chrome on mains power, a second runtime, and any language other than English.

*If asked about evidence, say: "The numbers come from saved runs on the developer's laptop and from pretend-model scenarios. None of them is from the client's laptop, and the repository does not score summary quality."*


<div style="page-break-after: always"></div>

# How Version 2 works, step by step

*Purpose: this chapter follows one summary from the button press to the text on the screen, for first use and later use, including the step that shortens a long page on built-in graphics, and explains in plain terms what the graphics card does.*

This chapter names the file that does each step, so you can find the code when a tutor asks. Read it once slowly, then say the walkthrough aloud without notes.

## The parts

- **The popup** is the small window that opens from the toolbar. It shows the button, the model line, the progress, the summary and the Settings choice (Quality: Better or Fast). It does not run the model.
- **The service worker** is a background script that Chrome runs for the extension. It owns the job and keeps running when the popup closes.
- **The offscreen page** is a hidden page that Chrome lets an extension open for a heavy task. It holds the loaded model and has no window.
- **The web worker** is a second background thread, started by the offscreen page. The model's heavy work runs there.
- **WebLLM** is the open-source library, copied into the project as one file (`src/lib/web-llm.js`), that loads the model and runs it.
- **The graphics card** does the arithmetic, reached through WebGPU. On the developer's laptop and on the client's, the card is built into the processor.
- **Storage** holds three kinds of data: the job record (session storage, cleared when the browser closes), the settings and the Quality choice (local storage), and the model files (IndexedDB, which stays).

![Layers of Version 2: the popup and service worker at the top, the offscreen page and its web worker holding WebLLM, WebGPU on the graphics card at the bottom, and the three stores beside them](../figures/V02_layers.png)

Reading the figure: the popup starts a job with START_SUMMARY, and the service worker owns it. It sends LOCAL_* messages to the offscreen page, which keeps the model loaded and closes after five minutes idle. The offscreen page passes work to the web worker, which calls WebLLM, which sends shader programs to WebGPU on the card. The web page is read by an injected script. On the right, chrome.storage.local holds the settings, chrome.storage.session holds the job record, and IndexedDB holds the model files (about 695 MB).

## First use: the model is not on the computer yet

The popup says "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." and the button says "Download model and summarize". Pressing it runs these steps.

1. **The page is read.** The popup sends `START_SUMMARY`. The service worker writes a job record and starts the pipeline, which reads the page text (`extractFromTab`).
2. **The graphics card is checked.** The service worker asks the offscreen page for the card's status (`LOCAL_STATUS`). The page checks for WebGPU and the `shader-f16` feature, and whether the model is already stored. On a card built into the processor, the popup shows the note "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The model stays Llama 3.2 1B, and the answers are kept short.
3. **The model is downloaded.** The offscreen page asks WebLLM to load the model (`LOCAL_LOAD`). The model is not stored, so WebLLM downloads its files and saves them in IndexedDB. The popup shows "Downloading the model (first time only): n%".
4. **The model is loaded into the graphics card.** WebLLM copies the model's numbers into the card's memory. The popup shows "Loading the model into the graphics card: n%".
5. **The model is warmed up.** The first answer makes the card compile its small programs. The extension does this with one short prompt before any real page is sent, and shows "Warming up the model (first time can take about 30 seconds)...".
6. **The parts are summarized.** See the walkthrough below.

The clean first-use run on the NVIDIA card (`v2-local-nvidia-cold-first-attempt.md`), made before 26 October, has these phases for a short article of 1,711 characters.

| Phase | Start (s) | End (s) | About |
|---|---|---|---|
| Read and check | 0 | 0.5 | 0.5 s |
| Download | 0.5 | 158.8 | 158.3 s |
| Loading into the card | 158.8 | 162.6 | 3.8 s |
| Warm-up | 162.6 | 193.1 | 30.5 s |
| Writing the summary | 193.1 | 196.8 | 3.7 s |

![First use as one timeline: a 158.3 s download, a 3.8 s load into the card, a 30.5 s warm-up and a 3.7 s summary, total 196.8 s](../figures/V09_cold_timeline.png)

Reading the figure: the long box is the download, from 0.5 s to 158.8 s, and it is most of the wait. The load, the warm-up and the summary follow in order. The footnote says that a "Loading 0%" line at 5.1 s, during the download, is not drawn, because the repository does not explain it.

On built-in graphics the first use is longer. The saved run on the developer's Intel chip (`v2-local-intel-better.md`, made on 26 October) took 200.6 s for the short fixture, including the 695 MB download (118 s), the load into the card (121.4 s) and a warm-up of about 28 s. The writing speed was 2 tokens a second.

## Later use: the model is already stored

The popup says "Model: Llama 3.2 1B. Downloaded, runs on this computer." and the button says "Summarize this page". There is no download. The clean offline run on the NVIDIA card (`v2-local-nvidia-offline.md`, made before a label fix) has these phases for the same short article, with the outside websites blocked.

| Phase | Start (s) | End (s) | About |
|---|---|---|---|
| Loading from the browser's stored copy | 1.3 | 7.6 | 6.3 s |
| Warm-up | 8.1 | 8.6 | 0.5 s |
| Writing the summary | 8.6 | 15.3 | 6.7 s |

The total was 15.3 s. The saved load time, 6,890 ms, runs from the start of the load to the end of the warm-up. The timeline also had a "Downloading the model (first time only): 0%" line at 3.9 s, although the model was stored. That was the label fix described under "What changed". The repeat after the fix (`v2-local-nvidia-offline-after-label-fix.md`) has no such line and took 17.7 s. Use 15.3 s for timings, and say that it was measured before the fix.

![First use and later use as two sequence diagrams, with the measured times as labels](../figures/V03_first_run_vs_cached.png)

Reading the figure: the upper sequence is the first use, with the download and save taking 158.3 s, the load 3.8 s, the warm-up about 30 s and the summary 3.7 s. The lower sequence is later use, with the status "stored", the load and warm-up taking 6.9 s and the summary 6.7 s. The footnote says the warm-up was 30.5 s on first use and 0.5 s in the later run, and that the reason is not measured.

![Screenshot, real model, NVIDIA card, first use: the popup in the middle of the download at 32 percent](../screenshots/v2-nvidia-short-downloading.png)

Caption: real model, NVIDIA card, first use. The popup shows the title "How a Lighthouse Lens Works", the button "Download model and summarize" greyed out while the job runs, the model line "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only).", and the progress line "Downloading the model (first time only): 32%".

## One summary, from the click to the screen

This walkthrough is the same for first use and later use. The download and warm-up steps apply only when they apply.

1. **You open the popup.** The popup asks the service worker for the model state (`GET_MODEL_STATE`) and shows the model line and the button text. If the model is stored and the page is a normal web page, the popup also sends `PRELOAD_MODEL`. The service worker then loads and warms the model in the background, so the first answer does not wait for it. Preloading never downloads anything.
2. **You press the button.** The popup sends `START_SUMMARY` with the tab number and waits for the reply. It does not call the model itself. The button "Read the whole page (slower)" sends the same message with `full: true`.
3. **The service worker starts a job.** `startJob` in `src/background/service-worker.js` writes the record `job:<tab id>` with the phase "extracting", then answers "ok".
4. **The page is read.** `extractFromTab` in `src/background/extract-tab.js` places Readability and the page reader into the tab. Chrome's own pages and local files are refused with RESTRICTED_PAGE.
5. **The back matter is cut.** `cleanPageText` in `src/core/trim-text.js` removes the back matter (a heading such as See also, References, Notes or External links that starts after 40 percent of the page and at least 800 characters in) and markers such as [12] or [edit]. On the Lighthouse page this removed 8,788 of 36,752 characters, 24 percent. A text under 200 characters stops with TOO_LITTLE_TEXT.
6. **A long page is shortened, on built-in graphics.** `runPipeline` in `src/core/pipeline.js` asks the engine how many characters it should read (`readBudgetChars`). On built-in graphics the budget is 6,000 characters. On other computers it is 0, which means read everything. `condenseText` in `src/core/condense.js` keeps the opening of the page in full, up to 35 percent of the budget, then the first sentences of the paragraphs, spread evenly over the rest of the page, with the headings of the sections it keeps. The result fits in one part, so there is no merge request. The popup then says how much was read.
7. **The model is prepared.** The pipeline calls `engine.prepare()`. The steps are the ones under "First use", or the shorter ones under "Later use".
8. **Each part is summarized.** On built-in graphics the answers are short: 3 sentences for a single part (at most 130 tokens), 2 sentences per part of a longer page (90 tokens), and 4 or 5 sentences for the merge (180 tokens). On a fast card the richer format is kept, with a limit of 320 tokens for a single part and the final summary and 300 for a part. A part that WebLLM refuses for size is cut in half and summarized again, up to three levels deep (`summarizeChunk`).
9. **The parts are merged.** If there was more than one part, the summaries are joined with one more model call. The popup shows "Combining 2 summaries...".
10. **The job is marked done.** The service worker writes the summary, the title and the stats into the job record. The stats include the number of parts and requests, the model's name, the graphics card's vendor, the load time, the decode speed, `textChars` (after cleanup), `readChars`, `condensed`, `trimmedChars` and `estimateFullSeconds`, a rough guess of the time for the whole page from the measured speed.
11. **The popup shows the result.** `popup.js` builds the text with `textContent`, so the model's words are shown as text and never run as HTML. If the page was shortened, a notice appears above the summary: "This is a long page. To keep it quick on this computer, the opening of each section was read: about N% of the text. Reading all of it would take roughly M minutes." Below it is "Read the whole page (slower)". If the smaller model wrote the summary after the main one failed, a second notice says so. The stats line reads, for example, "7 parts · 8 requests · 124.6 s · Llama 3.2 1B · read 21% of the text".
12. **You close the popup.** The job keeps going. Reopening the popup on the same page reads the same record.

Each model call uses the same route. The service worker calls `send` in `src/background/offscreen-manager.js`. The manager creates the offscreen page on first use and forwards the message. The offscreen page (`src/offscreen/offscreen.js`) answers through its engine, which sends the work to the web worker and returns the text. Model calls are queued, so only one generation runs at a time.

![The phases of a job in order, as the popup shows them: reading, checking, the skipped download, loading, warm-up, summarizing, combining, and done or error](../figures/V06_job_phases.png)

Reading the figure: the phases run from top to bottom. The dashed "Downloading (first time only)" step is skipped on later use. The footnote says that later use is meant to skip it, that one offline run showed it for about 1 s before the label fix, and that TOO_LITTLE_TEXT and TOO_LONG stop the job before the model is used.

![Screenshot, pretend model: the finished summary with three numbered points and the stats line](../screenshots/ui-07-result.png)

Caption: pretend model, not the real one. The popup shows a summary with three numbered points and the stats line "1 part · 1 request · 0.2 s · Llama 3.2 1B". The points and the 0.2 s are the fake model's output. The popup code and the layout are the real ones.

## What the offscreen page keeps alive

- **Keepalive.** While the offscreen page is working, it sends `KEEPALIVE` to the service worker every 10 seconds (`beginWork` in `offscreen.js`). Each message also refreshes the update time of every running job record, so one long answer is not shown as dead.
- **In-flight count.** The manager counts the messages sent and not yet answered (`inFlight`). The page is never closed while that count is above zero.
- **Idle close.** When the last message finishes, the manager starts a five-minute countdown (`idleCloseMs`, 300,000 ms). If no work arrives in that time, the page closes and the model leaves the card's memory. The stored files stay in IndexedDB, so the next use loads the model again without a download.
- **Quality change.** The offscreen page unloads a loaded model before it loads a different one, so switching Quality does not keep two models in memory.

## The graphics card in simple terms

A language model is a large set of numbers, called weights. Llama 3.2 1B stores about one billion of them, in 4-bit form, in files of about 695 MB. An answer is made one token at a time. Each token has two phases.

- **Prefill (reading).** The model takes in the whole prompt. On built-in graphics this is slow. The benchmark on the developer's Intel chip measured 15.6 tokens a second for Llama 3.2 1B, and it found that reading takes about 80 percent of the time of one part.
- **Decode (writing).** The model writes one token at a time, and each token needs another pass through the model. On the same chip Llama 3.2 1B wrote 2 tokens a second. On the NVIDIA card the saved clean runs wrote 34 to 53.

The card runs small programs called shaders. Before the first answer, those programs must be compiled for the model. That is the warm-up, about 30 s on first use. Preloading, described above, moves that wait to the moment the popup opens.

![How the model writes: the prompt is read in one pass, then one token is written per step, with the measured speeds labelled](../figures/V15_how_a_model_writes.png)

Reading the figure: the boxes run from the page text, to the prompt, to reading (prefill), to writing (decode), to the summary. Each small square is one token written. The panel at the bottom gives the saved clean NVIDIA values, 34 to 53 tokens a second, and labels the 63 tokens a second and 600 for reading as a speed test recorded in the DEVLOG that was not saved as a run file.

## The numbers the team measured

The table lists the saved runs used in this chapter. The NVIDIA and Intel rows, before 26 October, used the SmolLM2 default on built-in graphics; those rows are labelled.

| Case | Chip | Model | Total (s) | Parts and requests | Writing (tokens/s) |
|---|---|---|---|---|---|
| Short article, first use | NVIDIA RTX 3050 | Llama 3.2 1B | 196.8 | 1 part, 1 request | 47 |
| Long article, stored, offline | NVIDIA RTX 3050 | Llama 3.2 1B | 16.5 | 2 parts, 3 requests | 42 |
| Wikipedia Lighthouse, stored | NVIDIA RTX 3050 | Llama 3.2 1B | 74.1 | 7 parts, 8 requests | 34 |
| Wikipedia Lighthouse, whole page, SmolLM2 default (before 26 October) | Intel built-in | SmolLM2 360M | 616.4 | 7 parts, 8 requests | 4 |
| Wikipedia Lighthouse, shortened (26 October) | Intel built-in | Llama 3.2 1B | 124.6 | 1 part, 1 request, 21% read | 2 |
| Long fixture, shortened (26 October) | Intel built-in | Llama 3.2 1B | 103.8 | 1 part, 1 request, 50% read | 2 |

Reading the table: the Intel rows with Llama 3.2 1B are the new default. The 124.6 s run is about five times quicker than the whole-page SmolLM2 run, and its summaries were judged accurate. The popup's estimate for reading all of the Lighthouse text was 692 s, a rough guess from the measured speed. The earlier real run on the full text took 616 s with the small model.

The Lighthouse article is 36,752 characters, or 27,964 after the back matter is cut. About 5,968 characters of that were read in the shortened run.

## When something fails

Every failure becomes a code, defined in `src/core/errors.js`, with a plain message for the popup. There are fifteen codes. CONTEXT_TOO_LONG was added on 24 October for a part that still does not fit after the halving. For the two vague messages, SERVICE_ERROR and MODEL_LOAD_FAILED, the popup also shows a "Technical detail" line with the first 240 characters of the detail. Chapter 03 gives every message and what to do with it.

![Error codes with what causes them and the exact message, coloured by what the extension does next](../figures/V11_error_flow.png)

Reading the figure: the yellow rows (GPU_MEMORY and MODEL_LOAD_FAILED) are retried once with SmolLM2 360M before the message is shown. The red rows stop the job and show their message. The grey rows are refused early or are not shown. CANCELLED is never shown. The figure predates two changes: it has no CONTEXT_TOO_LONG row, and its TIMEOUT row says 3 minutes, while the limit is now 10 minutes.

A job counts as dead after five minutes without an update, in both the service worker and the popup. If Chrome stops the service worker mid-job, the next start marks the old record as INTERRUPTED. If the tab moves to another page, the old job is aborted.

## What changed after review, and after the real Chrome

The first code review found these faults, which are fixed. The DEVLOG rows dated 21 October tell the story.

- **A wrong label for a stored model.** Any WebLLM text containing "fetch" was shown as a download. A stored model is now always "loading".
- **Copied markers.** A small model copied the page's start marker into its answer. `stripPageMarkers` removes the markers from every answer. The recorded Intel output and its screenshot were made before this fix.
- **A silent fallback.** When the main model ran out of memory and the small model wrote the summary, nothing said so. Now a notice says it.
- **Idle close during a message, and a stale limit.** The page could close during a running load, and a slow answer could look interrupted. The dead-job limit is now five minutes.

The real Chrome then failed on 24 October. On the Wikipedia Lighthouse page, on the developer's Intel chip with SmolLM2, the popup said "Something went wrong inside the extension. Try again." with no reason. A hidden run failed with TIMEOUT, because one answer ran past 180 seconds. The DEVLOG row dated 2026-10-24 tells the story. The changes were a 10-minute answer limit, halving of a part that does not fit (CONTEXT_TOO_LONG), a heartbeat that refreshes running jobs, and the Technical detail line.

On 26 October the speed work changed the built-in path, which is the client's path. The changes are these.

- **The default model is Llama 3.2 1B on built-in graphics too.** The automatic switch to SmolLM2 is removed. SmolLM2 is used only when the person chooses Quality: Fast, after a memory or load failure of the main model, or on a computer that reports under 8 GB of memory.
- **Long pages are shortened on built-in graphics**, with the notice and the "Read the whole page (slower)" button.
- **Short answers** on built-in graphics.
- **The back matter and the markers are cut** before reading.
- **Preloading** while the popup is open, when the model is stored.
- **Settings > Quality** in the popup, Better or Fast.
- **Cleaner answers.** A repeated copy of the prompt's own safety sentence, or an empty "Summary:" label, is now an empty answer (EMPTY_ANSWER), not a summary.

## What still holds (limits, not fixed)

- `modelOverride` is never cleared. Once the small model has been saved after a failure, it stays until the stored settings are cleared.
- Closing the tab during a download does not stop the download, because `prepare()` ignores the abort signal.
- The model line is not refreshed while a download or warm-up is running.
- Built-in graphics detection recognises Intel only.
- The shortened summary covers about a fifth of a long page, and it is not a summary of the whole article. "Read the whole page" can take 5 to 12 minutes on built-in graphics.
- The time estimate for the whole page is a rough guess from measured speed.
- The TIMEOUT path has no automated scenario, because the pretend model has no timeout.
- The small models make factual slips, and the 1B model repeats its opening sentence in some merged answers.

## What this means in plain words

The popup only shows. The service worker owns the job. The offscreen page holds the model, and its web worker does the arithmetic on the graphics card. A long page is cut to what the slow chip can read in a few minutes, and the popup says how much was read. The first use is slow because of the download and the warm-up. Later use is faster, because the file is kept and preloading starts the warm-up when the popup opens.


<div style="page-break-after: always"></div>

# The modules, one by one (Version 2)

*Purpose: this chapter lists every source file in `finalsem/project/src`, the scripts and the main root files, says what each one is for, names its main functions, gives the answer to give if a tutor asks, and says what breaks if the file is removed.*

The line numbers quoted here are the numbers in the files as they are now. If you edit a file, the numbers move. Each file carries one label, from a comparison with the Version 1 folder (`midsem/project`):

- **Reused** means the file is byte-for-byte the same as in Version 1.
- **Changed** means the file exists in both versions, with edits.
- **New** means the file has no Version 1 counterpart.

## The map

| File | Label | One-line purpose |
|---|---|---|
| `src/ui/popup.html` | Changed | Layout: button, model line, Settings (Quality), notices, "Read the whole page", summary |
| `src/ui/popup.js` | Changed | Shows the job, starts jobs, preloads the model, reads the Quality choice |
| `src/ui/ui.css` | Changed | The printed-page style, with the old key-box rules removed |
| `src/ui/summary-format.js` | Reused | Turns the summary text into paragraphs and points |
| `src/background/service-worker.js` | Changed | Owns the job, preloads the model, refreshes running jobs |
| `src/background/extract-tab.js` | Reused | Checks the tab's address and places the page reader |
| `src/background/offscreen-manager.js` | New | Creates, talks to and closes the offscreen page |
| `src/offscreen/offscreen.html` | New | The page Chrome opens to hold the model; loads `offscreen.js` |
| `src/offscreen/offscreen.js` | New | Answers status, load and generate requests with WebLLM |
| `src/offscreen/engine-worker.js` | New | Starts WebLLM's handler inside a web worker |
| `src/offscreen/mock-engine.js` | New | The pretend model for the browser tests (12 modes) |
| `src/engines/local.js` | New | The engine the pipeline calls: reading budget, short answers, halving |
| `src/core/condense.js` | New | Shortens a long page to the opening and the first sentences of each section |
| `src/core/trim-text.js` | New | Cuts the back matter and markers before reading |
| `src/core/gpu-check.js` | New | Decides whether the card is usable and which model to use |
| `src/core/engine-errors.js` | New | Turns WebLLM's error text into one of our codes |
| `src/core/pipeline.js` | Changed | Runs the steps of one job in order |
| `src/core/chunker.js` | Reused | Cuts the text into parts at natural breaks |
| `src/core/merger.js` | Reused | Joins part summaries, in groups if needed |
| `src/core/prompts.js` | Changed | The instructions, the short ("brief") prompts and the answer cleaners |
| `src/core/url.js` | Reused | Decides whether two addresses are the same page |
| `src/core/config.js` | Changed | Models, sizes, limits, reading budgets, answer lengths, stored settings |
| `src/core/errors.js` | Changed | The fifteen error codes and their plain messages |
| `src/content/extract.js` | Reused | Copies the page's main text inside the page |
| `src/lib/readability.js` | Reused | The Readability library, one file, Apache-2.0 |
| `src/lib/web-llm.js` | New | The WebLLM library, one file, Apache-2.0 |
| `manifest.json` | Changed | Names the extension, its files and its permissions |
| `setup.bat`, `run.bat` | Changed | Check the computer, then open Chrome's extension page |
| `scripts/*` | New or changed | Checks, the graphics-card setting, the measurement, the benchmark, the page-text dump |

Three Version 1 files are gone: `src/engines/gemini.js`, `src/ui/options.html` and `src/ui/options.js`.

## 1. The popup

### `src/ui/popup.js` and `popup.html` (changed)

**Purpose.** The popup shows what the job record says and starts jobs. It never runs the model. On 26 October it also got a Settings section, a shortened-page notice and a "Read the whole page (slower)" button.

**Main functions.** `renderModelState` (line 61) writes the model line and the button text. `loadModelState` (line 109) asks the service worker for the model state. `preloadIfPossible` (line 102) sends `PRELOAD_MODEL` when the popup opens on a normal page and the model is stored, once per model. `refreshModelLineOnce` (line 86) reloads the model state once when a job ends. `switchNotice` (line 93) explains a summary made by the smaller model after a memory or load failure. `shortenedNotice` (line 163) builds the sentence "This is a long page. To keep it quick on this computer, the opening of each section was read: about N% of the text. Reading all of it would take roughly M minutes." `formatStats` (line 174) adds "read N% of the text" to the stats line. `render` (line 183) draws the job, and for SERVICE_ERROR and MODEL_LOAD_FAILED it fills the "Technical detail" line. `STALE_MS` (line 33) is five minutes.

The Settings section is a closed `<details id="settings">` with a select `#quality`: "Better: Llama 3.2 1B (more accurate, slower)" or "Fast: SmolLM2 360M (about 2 times quicker, but summaries are often muddled or wrong)". The choice is stored as `quality` in `chrome.storage.local`. The button `#read-all` starts a job with `full: true`, so the whole page is read.

**What to say if asked.** "The popup is a display, and it holds no work. The Quality choice and the 'read the whole page' button are the only controls, and the notice always says how much of a long page was read."

**What breaks if removed.** Nothing would show, and the job would still run.

### `src/ui/popup.html` and `src/ui/ui.css`

**Purpose.** The layout and the printed-page style. The popup has no key box. The result notices sit above the summary, and the error-detail line sits under an error message. The stylesheet no longer carries the dead key-box and options rules.

**What breaks if removed.** The popup would show unstyled text. The logic would still work.

### `src/ui/summary-format.js` (reused)

**Purpose.** Turns the summary text into paragraphs and points. The model's words are shown as text, so markup in an answer cannot run.

## 2. The service worker and the page reader

### `src/background/service-worker.js` (changed)

**Purpose.** It owns the job: it starts it, runs the pipeline, writes progress and the result to session storage, and cleans up when a tab closes or the worker restarts. Since 26 October it also preloads the model when the popup asks.

**Main functions.** `estimateFullSeconds` (line 38) gives the rough time for the whole page from the measured decode speed. `writeJob` (line 47) writes a patch to the record, but only if the record still has this job's id. `makeEngine` (line 65) builds the local engine from the settings. A job with `full: true` sets the reading budgets to 0 (line 68). `runJob` (line 78) runs the pipeline. `startJob` (line 126) creates the record. `getModelState` (line 191) answers `GET_MODEL_STATE`. The `PRELOAD_MODEL` listener (line 215) starts `preloadModel` (line 177), which loads and warms the model in the background; it never downloads. The `KEEPALIVE` listener (line 228) refreshes the update time of every running job (line 232). The `tabs.onRemoved` listener (line 238) removes the record after the writes queued for that tab. `sweepOrphans` (line 251) marks an old running job as INTERRUPTED. `STALE_MS` (line 23) is five minutes.

The guard in `writeJob` is the heart of the file:

```js
function writeJob(tabId, jobId, patch) {
  if (closedTabs.has(tabId)) return Promise.resolve();
  const key = jobKey(tabId);
  const prev = queues.get(tabId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      if (closedTabs.has(tabId)) return;
      const current = (await chrome.storage.session.get(key))[key];
      if (!current || current.jobId !== jobId) return; // replaced by a newer job, or removed
      await chrome.storage.session.set({ [key]: { ...current, ...patch, updatedAt: Date.now() } });
```

*Source: `src/background/service-worker.js`, lines 47 to 57.*

**What to say if asked.** "Every write is queued per tab and checked against the job id, so a late write from an old job cannot bring back a record. A closed tab's record is removed after its queued writes."

**What breaks if removed.** No job would start, and the popup would never get a result.

### `src/background/extract-tab.js` (reused)

**Purpose.** It refuses addresses Chrome does not let extensions read, then places Readability and the page reader into the tab.

### `src/content/extract.js` and `src/lib/readability.js` (reused)

**Purpose.** The page reader runs inside the page. It copies the page, runs Readability on the copy, and returns plain text. If the result is under 200 characters, it uses the visible text of the page when that is longer. `readability.js` is the Readability library, Apache-2.0, as in Version 1.

**What breaks if removed.** No text would be found, and every page would be refused as too little text.

## 3. The offscreen page and the model host

### `src/background/offscreen-manager.js` (new)

**Purpose.** It is the only code in the service worker that talks to the offscreen page. It creates the page on first use, sends the messages, and closes the page when it has been idle.

**Main functions.** `pageUrl` (line 20) adds `?mock=` for the test seam. `ensure` (line 32) creates the offscreen page once. `inFlight` (line 18) counts the messages sent and not yet answered. `send` (line 62) counts the message, forwards it and queues generation requests. `scheduleIdleClose` (line 48) starts the countdown. `close` (line 54) returns at once while any message is in flight.

**What to say if asked.** "Chrome allows one offscreen page at a time. The manager keeps it open while a message runs, and it closes it after five minutes with no work. The countdown starts when the last message finishes."

![The messages between the service worker and the offscreen page: LOCAL_STATUS, LOCAL_LOAD with MODEL_PROGRESS, LOCAL_GENERATE, KEEPALIVE every 10 s, and the idle close](../figures/V05_offscreen_messages.png)

Reading the figure: the service worker sends LOCAL_STATUS and gets back the card, whether the model is stored, and its size. It sends LOCAL_LOAD, and the offscreen page reports MODEL_PROGRESS many times. It sends LOCAL_GENERATE and gets back the text and the stats. KEEPALIVE comes back every 10 seconds while work runs. Since 24 October each one also refreshes the running job records, which the figure does not show.

**Note on figure V05.** The figure's idle box says that each message restarts the five-minute timer. The code clears the timer on every send and starts the countdown only when the in-flight count returns to zero.

**What breaks if removed.** The service worker would have no way to reach the model.

### `src/offscreen/offscreen.html` and `offscreen.js` (new)

**Purpose.** `offscreen.html` is the page Chrome opens for the offscreen document, and it loads `offscreen.js`. `offscreen.js` owns the model. It has the real engine and the message router. It sends `KEEPALIVE` every ten seconds while busy, and `MODEL_PROGRESS` while it downloads or loads. It unloads a loaded model before it loads a different one.

**Main functions.** `realEngine.status` (line 77) checks the card, whether the model is stored (`hasModelInCache`, line 81), and the download size. `realEngine.load` (line 97) checks the stored copy again (line 109), creates the web worker, loads WebLLM and warms the model. `realEngine.generate` (line 132) sends one prompt, times it out after `generateTimeoutMs` and returns the text, the stats and the `finishReason` (line 153). Line 20 sets the cache to IndexedDB.

Figure V04 shows the steps around this page.

![The steps of prepare(): card check, model choice, load with download when needed, warm-up, and the error branch with its single retry](../figures/V04_model_preparation.png)

Reading the figure: prepare() is called by the pipeline and asks the offscreen page for the card's status. If WebGPU or shader-f16 is missing, the job stops and the popup says why. Otherwise the model is chosen. The figure shows Llama 3.2 1B, and SmolLM2 360M only when Quality: Fast is chosen, a memory failure happened, or the browser reports under 8 GB. The load downloads the model if it is not stored. A GPU_MEMORY or MODEL_LOAD_FAILED error saves the fallback and retries once with SmolLM2. The figure predates three changes: the built-in graphics no longer switch to SmolLM2 by themselves, a part refused for size is cut in half inside `summarizeChunk`, and CONTEXT_TOO_LONG exists. The footnote gives the sizes: Llama about 695 MB, SmolLM2 about 204 MB.

**What to say if asked.** "Cache Storage failed inside this page during the spike, and IndexedDB worked. That is why the model is in IndexedDB."

**What breaks if removed.** No model would load or run.

### `src/offscreen/engine-worker.js` (new)

**Purpose.** Seven lines. It starts WebLLM's handler inside a web worker and passes messages to it, so the heavy arithmetic does not block the page that holds the model.

### `src/offscreen/mock-engine.js` (new)

**Purpose.** A pretend model for the browser tests. It answers from fixed text and can fail on purpose. The twelve modes are `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html`, `slow`, `longprompt` (refuses a prompt over 3,500 characters, as WebLLM refuses an oversized prompt) and `crash` (every answer fails with SERVICE_ERROR and a technical detail). Its download sizes (664 MB and 300 MB) are fixed numbers, not measurements.

**What breaks if removed.** The 31 browser scenarios could not run.

## 4. The engine and the graphics-card checks

### `src/engines/local.js` (new)

**Purpose.** The engine the pipeline calls. It has the same contract as Version 1's cloud engine, `summarizeChunk` and `mergeSummaries`, plus `prepare`, and it now also gives the reading budget. It does not touch the model itself. It sends messages to the offscreen page.

**Main functions.** `call` (line 26) sends one message and turns a failed reply into an `AppError`. `generate` (line 38) sends `LOCAL_GENERATE`, removes copied markers (`stripPageMarkers`, line 46), ends an answer that stopped at the length limit at its last full stop (`endAtSentence`, line 47), and rejects an empty answer (EMPTY_ANSWER). `checkStatus` (line 63) asks for the card's status. The `brief` getter (line 70) is true on built-in graphics, where writing is slow, so the answers are kept short. `prepare` (line 75) checks, downloads and loads. If the load fails with GPU_MEMORY or MODEL_LOAD_FAILED, it saves the fallback and tries once with SmolLM2 (`RETRY_WITH_FALLBACK`, line 19). `readBudgetChars` (line 96) is the reading budget. `summarizeChunk` (line 101) summarizes a part, with short prompts and limits when `brief` is true, and halves a part when WebLLM refuses it for size.

The reading budget is the rule that makes a long page quick on built-in graphics:

```js
    /** How many characters of a page this computer should read: less on built-in graphics, which read slowly. */
    async readBudgetChars() {
      const status = engine.status ?? (await engine.checkStatus());
      return status.gpu?.integrated ? settings.readBudgetIntegrated : settings.readBudgetOther;
    },
```

*Source: `src/engines/local.js`, lines 95 to 99.*

The budget is 6,000 characters on built-in graphics and 0 elsewhere, which means read everything. The pipeline asks for it before the page is cut.

Halving was added on 24 October, after the real-Chrome failure. When a part raises CONTEXT_TOO_LONG, `summarizeChunk` cuts it in half at a break and summarizes each half, up to `MAX_HALVING_DEPTH` (3, line 15) levels deep, and never for text under `MIN_HALVING_CHARS` (600, line 16). The cuts are counted in `halvedParts`.

**What to say if asked.** "The engine keeps the same contract as the cloud engine. On built-in graphics it asks for a small reading budget and writes short answers, because the chip reads and writes slowly."

**What breaks if removed.** The pipeline would have no engine, and no summary could be made.

### `src/core/gpu-check.js` (new)

**Purpose.** Pure functions. `evaluateGpu` (line 10) turns the card's facts into "usable" or NO_WEBGPU or NO_SHADER_F16. `chooseModel` (line 25) picks the model. `mapInitProgress(report, {cached})` (line 36) turns WebLLM's progress text into a phase. A stored model is always "loading".

```js
export function chooseModel({ deviceMemoryGB, override, quality } = {}) {
  if (override === 'fallback' || quality === 'fast') return MODELS.fallback;
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB < 8) return MODELS.fallback;
  return MODELS.primary;
}
```

*Source: `src/core/gpu-check.js`, lines 25 to 29.*

The main model is used by default, on every chip. The fallback is used for Quality: Fast, after a memory or load failure (saved as `modelOverride`), or when the browser reports under 8 GB. The built-in chip no longer selects SmolLM2 by itself.

**Limit to state honestly.** The memory rule reads `navigator.deviceMemory` in the service worker. The unit tests call `chooseModel` with a number. Nothing in the repository shows the rule working on a real low-memory laptop.

**What breaks if removed.** The extension could not tell a usable card from an unusable one, nor choose a model.

### `src/core/engine-errors.js` (new)

**Purpose.** WebLLM throws plain errors with free text. `classifyEngineError` (line 10) reads that text and returns one of our codes. The out-of-memory test matches `oom` only as a whole word (line 16). WebLLM's text "Prompt tokens exceed context window size" maps to CONTEXT_TOO_LONG (line 13).

**Limit to state honestly.** At the load stage, any error text containing "cache" is counted as a download failure.

## 5. The shortening, the trimming and the pipeline

### `src/core/trim-text.js` (new)

**Purpose.** `cleanPageText` (line 23) removes the back matter and the markers before anything is read. The back matter is a heading such as See also, References, Notes, Bibliography or External links, when it starts after 40 percent of the page and at least 800 characters in. The markers are things like [12], [a], [edit] and [citation needed]. On the Lighthouse page this removed 8,788 of 36,752 characters, 24 percent. The stats record it as `trimmedChars`. Six unit tests cover it.

**What breaks if removed.** The model would read references and edit links, and a long page would use up more of its reading budget on text that is not worth reading.

### `src/core/condense.js` (new)

**Purpose.** It shortens a long page before the model reads it, on a computer where reading is slow. `condenseText(text, budgetChars)` (line 42) returns the text, whether it was shortened, the page's length and the length read. A budget of 0 keeps everything.

The rule, in page order: the opening of the page in full, up to 35 percent of the budget (`LEAD_SHARE`, line 16); then from the rest, the first sentences of each paragraph, spread evenly over the page (`firstSentences`, line 28), with the headings of the sections kept (`isHeading`, line 19, for lines of at most 70 characters with no final stop). The result is at most one part of 6,000 characters, so there is no merge request.

Why the rule: the developer's Intel chip reads about 26 to 29 tokens a second for SmolLM2 and 15.6 for Llama 3.2 1B, and reading takes about 80 percent of a part's time. The only real way to make a long page quick there is to read less of it. The shortened run read about a fifth of the Lighthouse page (21 percent) and summarized it in 124.6 s.

**What to say if asked.** "The page is cut to what the chip can read in about two minutes, and the popup says how much was read. The rest is not summarized unless the person chooses the whole page."

**What breaks if removed.** A long page would be read in full on built-in graphics, and it would take about 10 minutes.

### `src/core/pipeline.js` (changed)

**Purpose.** It runs one job in order: extract, clean the back matter, check the length, ask for the reading budget, shorten, cut into parts, check the number of parts, prepare the model, summarize each part, merge, and build the result.

**Main functions.** `runPipeline` (line 30). The text is cleaned (line 36). Text under `minTextChars` throws TOO_LITTLE_TEXT (line 38). The reading budget is asked of the engine and `condenseText` applies it (lines 44 and 45). More than `maxChunks` parts throws TOO_LONG (line 49). The prepare step follows (line 56).

Figure V16 shows the order for a long page, from before the shortening was added.

![A long page cut into parts, each summarized, then merged in one request, with the measured timeline of 74.1 seconds](../figures/V16_chunking_v2.png)

Reading the figure: a page of 36,752 characters becomes seven parts of at most 6,000 characters on a fast card. Each part is summarized, and the seven summaries go into one merge request. The timeline is the clean NVIDIA run: 74.1 s and eight requests. On built-in graphics the shortened page is one part, and no merge is needed.

**What breaks if removed.** Nothing would run.

### `src/core/chunker.js` and `merger.js` (reused)

**Purpose.** `chunkText` cuts text into parts of at most `maxChars`, at paragraphs, then sentences, then spaces, and cuts a word in the middle only as a last resort. `mergeAll` joins part summaries, in groups if they do not fit, until one is left.

**What breaks if removed.** Long pages could not be split, and a multi-part page would have no final summary.

### `src/core/prompts.js` (changed)

**Purpose.** The instructions and the answer cleaners. The page text comes first, between the markers `<<<PAGE TEXT START>>>` and `<<<PAGE TEXT END>>>`, and one instruction follows it.

**Main functions.** `stripPageMarkers` (line 15) removes the markers from an answer. Since 26 October it also removes a repeated copy of the prompt's own safety sentence and an empty "Summary:" label. An answer that is left empty becomes EMPTY_ANSWER, not a summary. `endAtSentence` (line 90) cuts an answer that stopped at the length limit back to its last full stop. The brief prompts are used on built-in graphics: 3 short sentences for a single part, 2 for a part of a longer page, and 4 or 5 for the merge, in plain text. The richer prompts are kept for a fast card.

**What to say if asked.** "The markers say the page text is material, not orders. A small model sometimes copies them or the instruction into its answer, and the cleaners remove that."

**What breaks if removed.** The model would have no instruction, the markers would show, and answers would run to the length limit without a full stop.

### `src/core/url.js` (reused)

**Purpose.** `samePage` ignores the part of an address after `#`, so a link inside the same article counts as the same page.

### `src/core/config.js` (changed)

**Purpose.** Every number that can be tuned, in one place. `MODELS` names the primary model `Llama-3.2-1B-Instruct-q4f16_1-MLC` (`vramMB` 879) and the fallback `SmolLM2-360M-Instruct-q4f16_1-MLC` (`vramMB` 376). `DEFAULTS` gives `chunkChars` 6,000, `minTextChars` 200, `maxChunks` 12, `maxTokensPart` 300, `maxTokensFinal` 320, `briefTokensSingle` 130, `briefTokensPart` 90, `briefTokensMerge` 180, `readBudgetIntegrated` 6,000, `readBudgetOther` 0, `temperature` 0.2, `generateTimeoutMs` 600,000 (10 minutes), `idleCloseMs` 300,000 and `engineMode` `real`. `loadSettings` merges stored overrides, including `quality`, but only for the keys in `STORAGE_KEYS`.

**What breaks if removed.** Nothing would have a value to read.

### `src/core/errors.js` (changed)

**Purpose.** The fifteen error codes and their plain messages. `AppError` carries a code, a technical detail and a message. `describeError` gives the popup the code and the message. CONTEXT_TOO_LONG, added on 24 October, says "A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page."

**What breaks if removed.** Every failure would show as a raw technical string.

## 6. The manifest, the set-up files and the scripts

### `manifest.json` (changed)

**Purpose.** Names the extension, its version 2.0.0, its popup and service worker, and its permissions: `activeTab`, `scripting`, `storage`, `offscreen` and `unlimitedStorage`. The host permissions are Hugging Face (`huggingface.co`, `*.huggingface.co`, `*.hf.co`) and `raw.githubusercontent.com`. The content security policy allows `'wasm-unsafe-eval'`, which lets the extension page run WebAssembly code.

```json
  "permissions": ["activeTab", "scripting", "storage", "offscreen", "unlimitedStorage"],
  "host_permissions": [
```

*Source: `manifest.json`, lines 19 and 20.*

**What breaks if removed.** Without `offscreen`, no model host could be created. Without `unlimitedStorage`, Chrome could delete the model under disk pressure.

### `package.json` (changed)

**Purpose.** `npm test` runs the unit tests with `node --test "tests/unit/*.test.js"`. `npm run test:e2e` runs the browser scenarios one at a time. The only development dependency is Playwright, `^1.64.1`.

### `setup.bat` (changed)

**Purpose.** Checks the computer and the files, then says "SETUP COMPLETE." and "Next step: double-click run.bat". Its switches are `--dev` (install the test tools), `--gpu` (set Chrome to the separate card) and `--reset`. It runs `check-extension.ps1` and `check-computer.ps1`. With `--gpu` it calls `set-chrome-gpu.ps1` and prints "The graphics setting was NOT changed" if that fails. On the client's laptop `--gpu` has nothing to switch on, because there is one graphics chip.

**What breaks if removed.** The client would have no guided install.

### `run.bat` (changed)

**Purpose.** Refuses to run unless `setup.bat` has finished. It copies the folder path to the clipboard, opens `chrome://extensions` and prints four steps. After new code is pulled, the extension must be reloaded on that page (chapter 03).

### `scripts/check-computer.ps1` (new)

**Purpose.** Prints the Windows version, the processor, the memory, the graphics chips (ignoring basic and virtual display adapters) and "Free space on drive C:". It warns below 3 GB, the default `MinFreeGB`.

### `scripts/set-chrome-gpu.ps1` (new)

**Purpose.** Writes one value under `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`, named after Chrome's path, with `GpuPreference=2;`. `-ChromePath` is optional, so `-Remove` works on its own. `-RegistryPath` lets the test setup use a throw-away key.

### `scripts/local-run.mjs` (new)

**Purpose.** The measurement script. Its modes are `nvidia`, `nvidia-offline`, `intel`, `intel-wikipedia`, `intel-short`, `intel-better` (Llama 3.2 1B on built-in graphics, the short fixture, the Lighthouse page and the long fixture) and `intel-fast` (Quality: Fast). Before a run it deletes the profile's `Service Worker` and `Code Cache` folders, because a persistent profile had kept an old service-worker script. The downloaded model is not touched. It writes `docs/test-runs/v2-local-<mode>` files and screenshots, and its header says the first run downloads about 660 MB.

### `scripts/bench-models.mjs` (new)

**Purpose.** Measures, in a hidden Chromium, how fast each model reads and writes on the chip and how long one realistic part takes. It writes `docs/test-runs/bench-models.json` and `.md`. The default list has eight models. A second run does not download again. The results are the ones in chapter 01 and decision D7.

### `scripts/dump-page-text.mjs` (new)

**Purpose.** Prints the text the extension would read from a page, after cleanup and before shortening, so the reading budget can be checked by eye. The usage is `node scripts/dump-page-text.mjs <url> [out.txt]`.

### `scripts/check-extension.ps1` and `scripts/secret-scan.mjs`

`check-extension.ps1` is run by `setup.bat`. `secret-scan.mjs` looks through the repository for the Gemini key from Version 1 before a push. Version 2 has no key, so this is a leftover guard.

## 7. The tests

**Unit tests (`tests/unit`, eight files, 93 tests).** `chunker.test.js` (10), `gpu-and-errors.test.js` (13), `local-engine.test.js` (28), `merger.test.js` (8), `pipeline.test.js` (7), `small.test.js` (15), `condense.test.js` (6) and `trim-text.test.js` (6).

**Browser scenarios (`tests/e2e`, 31 scenarios).** `smoke.test.js` has the smoke scenario. `pipeline.test.js` has 30: V01 to V29, with V18b. V25 covers the cut part, V26 the heartbeat, V27 the technical-detail line, V28 a shortened long page with the whole-page button, and V29 Quality: Fast, which switches to SmolLM2 and is remembered. Scenario V09 now expects the main model with the Intel note.

**Script checks (`tests/bat/test-bat-scripts.ps1`).** Fifteen checks, B1 to B10c.

## What this means in plain words

Each file does one job. The popup shows and offers two choices, the service worker owns the job, the offscreen page holds the model, and the engine asks it for answers. Before the model reads a long page on built-in graphics, the page is cleaned and shortened to one part. The engine then writes short answers with the main model. A tutor who asks about a file should hear one sentence about its job, one file name with a line number, and one limit.


<div style="page-break-after: always"></div>

# How to run the extension and give the demo (Version 2)

*Purpose: this chapter takes you from a clean Windows computer to a working local summary, covers the client's laptop and its known specs, gives the demo script (including what to say about a shortened long page), the timing run in a visible Chrome, the offline demo, the messages you may see with what to do, and how to run the tests.*

Do the first model download at least a day before the demo, because it downloads about 695 MB and takes minutes. The developer's Intel chip took 118 s for the download alone, and 200.6 s for the whole first use of the short fixture.

## What you need

| Item | What is needed | How to check |
|---|---|---|
| Windows | Windows 10 or 11 | `scripts\check-computer.ps1` prints the version |
| Chrome | Google Chrome 116 or newer | `setup.bat` reads the version |
| Graphics | A chip that WebGPU can use, with `shader-f16` | `chrome://gpu` shows WebGPU. The popup says the card lacks 16-bit math if the feature is missing |
| Memory | Under 8 GB uses the smaller model by rule | `check-computer.ps1` prints the memory |
| Disk | About 3 GB free (the model is about 695 MB) | `check-computer.ps1` prints the free space on drive C and warns below 3 GB |
| Internet | Only for the first model download | The popup's model line says "Downloaded" when it is done |

Built-in graphics is the normal case now. The extension uses the main model, Llama 3.2 1B, on every chip, and it keeps answers short and shortens long pages on built-in graphics.

## The client's laptop

The client sent photos of the laptop. The facts below are read from the photos (`finalsem/docs/CLIENT_LAPTOP.md`).

| Item | Value |
|---|---|
| Model | HP Laptop 15 |
| Processor | Intel Core i7-1355U, 15-watt, with 2 fast cores and 8 efficient cores |
| Memory | 16 GB (15.7 GB usable) |
| Graphics | Intel Iris Xe, built into the processor. No separate card. The "128 MB" is reserved memory that shares the main memory |
| Disk | 477 GB, Windows (C:) with 363 GB free |
| Chrome | 156.0.8078.48 |
| WebGPU | Hardware accelerated |

Three things are not known. The photos do not show whether the Iris Xe chip has the `shader-f16` feature. If it does not, the popup shows the NO_SHADER_F16 message and Version 2 cannot run there. The speed of this chip has not been measured on that laptop, and the processor is a 15-watt part whose sustained speed is not known. And the extension has not been run on that laptop, nor in a visible Chrome window. The developer's Intel chip is of the same generation (Gen 12), and its numbers are the nearest guide, not a promise. `setup.bat --gpu` has nothing to switch on there, because the laptop has one graphics chip.

## Step by step on a fresh computer

1. **Get the project.** Clone or copy the whole folder. Do not copy only some files.
2. **Check the computer (recommended).** Open PowerShell in `finalsem\project` and run `powershell -File scripts\check-computer.ps1`.
3. **Run setup.** Double-click `setup.bat`. It checks the Chrome version and the files, and ends with "SETUP COMPLETE." and "Next step: double-click run.bat". If it says "SETUP FAILED.", the window says what is missing, and the details are in `setup.log`.
4. **Run the launcher.** Double-click `run.bat`. It copies the folder path to the clipboard, opens `chrome://extensions`, and prints four steps.
5. **Load the extension.** Turn on Developer mode, click Load unpacked, press Ctrl+V to paste the path, and click Select Folder. Pin Page Summarizer from the puzzle-piece menu.
6. **Reload after any update.** When you pull new code, click the reload arrow on the Page Summarizer card on `chrome://extensions` before you test. Until you do, Chrome keeps running the code it loaded before, so the new behaviour does not appear.
7. **Check the graphics card.** Open `chrome://gpu`. WebGPU should say "Hardware accelerated".
8. **Make the first summary.** Open an article and click the icon. The popup says "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." Press "Download model and summarize" and wait. Later, the button says "Summarize this page".

![Screenshot, pretend model: the popup before the first download, with the button "Download model and summarize" and the model line "Not downloaded yet"](../screenshots/ui-01-not-downloaded.png)

Caption: pretend model, not the real one. This is the first-use state. The model line's "about 664 MB" is the fake model's number. The real popup reports about 695 MB for Llama 3.2 1B.

### Quality: Better or Fast

The popup has a closed Settings section with one choice, Quality. "Better: Llama 3.2 1B (more accurate, slower)" is the default. "Fast: SmolLM2 360M (about 2 times quicker, but summaries are often muddled or wrong)" is the other. The choice is stored in this browser. The model line follows it. Fast is kept as a visible choice, not a default, because its summaries were often wrong. The Fast Lighthouse run in the saved records, made before a fix, gave an answer that was only the prompt's own safety sentence. A fix now reports that as "The model returned no summary for this page."

### Preloading

When the popup opens on a normal web page and the model is already stored, the popup asks the service worker to load and warm the model. This costs nothing on the page and never downloads anything. The warm-up, about 28 to 37 seconds on the developer's Intel chip, then happens while you read the popup, not after you press the button. If the first download has not happened yet, nothing is preloaded.

### Two graphics chips (the developer's laptop only)

Some laptops have a built-in chip and a separate card, and Chrome may pick the built-in one. On the developer's NVIDIA laptop, `setup.bat --gpu` or the Windows Graphics setting (Settings, System, Display, Graphics, add Chrome, Options, High performance) makes Chrome use the card, which wrote 34 to 53 tokens a second with Llama 3.2 1B in the saved runs. Undo with `powershell -File scripts\set-chrome-gpu.ps1 -Remove`, which finds Chrome by itself. The client's laptop has one chip, so none of this applies there.

## The viva demo

Run this with the model downloaded, on the developer's laptop, with the chip it was measured on. The timings are from saved runs. Your times will differ.

| Step | What to open or press | What to say |
|---|---|---|
| 1 | `chrome://extensions` with the card loaded | "Chrome loads this folder. There is no key, and nothing is sent to a cloud service." |
| 2 | An article, then the icon | "The model line says the model is downloaded. The button says Summarize this page. The model is preloaded while the popup is open." |
| 3 | The Wikipedia Lighthouse article, then press the button | "The page is cut to its opening and the first sentences of each section, about one part. The popup says how much was read. On this chip it took 124.6 s with the model loaded, in one part." |
| 4 | Point at the notice above the summary | "This is a long page. The notice says about a fifth of the text was read, and that reading all of it would take roughly 12 minutes. The button 'Read the whole page (slower)' does that." |
| 5 | Click the button only if there is time | "This reads the whole page. It is the slow choice, and the popup says so first." |
| 6 | Close the popup, reopen it, and point at the stats line | "The job kept running, and the stats line shows the parts, the requests, the seconds, the model and how much was read." |
| 7 | `chrome://version`, then press Summarize | "Chrome does not let extensions read its own pages, so the job stops before any model step. The code is RESTRICTED_PAGE." |
| 8 | A page with only a sentence or two | "Under 200 characters of readable text, so the model is not called. The code is TOO_LITTLE_TEXT." |

![Screenshot, real model, NVIDIA card, Lighthouse article: the finished summary with the stats line "7 parts · 8 requests · 101.2 s · Llama 3.2 1B"](../screenshots/v2-nvidia-wikipedia-popup.png)

Caption: real model, NVIDIA card, the Wikipedia Lighthouse article, from a run before 26 October, made while other programs were using the processor. Use it only to show the stats line, and say that the same article on the built-in chip now takes about two minutes.

Cautions. Do not demo the first download on stage. Do not quote the 616 s or 704 s runs as current; they used the SmolLM2 default before 26 October. Do not quote the 15.3 s offline figure as a current measurement of the built-in chip; it was made on the NVIDIA card before a label fix. The Lighthouse summary on built-in graphics is short and checked for accuracy, but its text is not the same as the whole article's.

## The timing run in a visible Chrome (on mains power)

No timing has yet been made in a visible Chrome window on mains power, which was the first step an outside adviser (Opus) recommended on 26 October. The run below is what to do, and what to write down, for both the developer's laptop and the client's.

1. Plug the laptop into mains power. Close other programs, and keep the same window open.
2. Open Chrome in the normal window (not the test browser). Load the folder, and reload it if the code changed.
3. Confirm the model line says "Downloaded, runs on this computer". If not, do the first download and wait.
4. Open the Lighthouse article. Open the popup and wait about one minute, so the preload warm-up finishes.
5. Press "Summarize this page". When the summary appears, write down the stats line.
6. Close the popup, wait one minute, open it again on the same page, and press Summarize. Write down the stats line.
7. Repeat once more. You now have three summaries in a row, with their times.
8. Repeat steps 4 to 7 with Settings > Quality set to Fast. Use the same page. Write the times and say which summary was accurate.

Keep the three times and the chip name, the power state and the Chrome version in one place. Those are the numbers the viva should quote for the client's laptop. Until they exist, say `[to be measured]`. The target from the adviser was about 2 minutes warm, and about 3 minutes with the first-answer warm-up.

## The offline demo

1. Make sure the model is downloaded. The popup must say "Downloaded, runs on this computer."
2. Turn off Wi-Fi or unplug the network cable.
3. Open an article and press "Summarize this page".
4. Note the time and the line under the summary. The saved offline run on the NVIDIA card before a label fix took 15.3 s for the short article.
5. Turn the network back on.

The saved offline runs block the outside websites with the Chromium flag `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`, which keeps the local test server reachable. That is not the same as a laptop with no network, so say which you did.

## If something goes wrong

Every message below comes from `src/core/errors.js`, from the popup, or from the setup scripts. The code in capitals is what the job record stores.

| What you see | Code | What it means | What to do |
|---|---|---|---|
| Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check. | NO_WEBGPU | Chrome has no WebGPU for this page | Open `chrome://gpu` and check WebGPU |
| Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2. | NO_SHADER_F16 | The card lacks the `shader-f16` feature | Nothing in this version fixes it. Say so |
| The graphics card ran out of memory. Close other heavy tabs or programs and try again. | GPU_MEMORY | The card ran out of memory, and the smaller model also failed, or the smaller model was the one that failed | Close other tabs and try again |
| The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept. | MODEL_DOWNLOAD_FAILED | The download failed | Reconnect and press the button again |
| The model could not be started. Press the button to try again. | MODEL_LOAD_FAILED | The model did not load | Press again. The extension had already tried the smaller model once if the main model was the one that failed |
| The model took too long to answer. Try again, or use a shorter page. | TIMEOUT | No answer within 10 minutes (`generateTimeoutMs`) | Wait, or use a shorter page |
| The model returned no summary for this page. | EMPTY_ANSWER | The answer was empty, or only the prompt's own wording | Press again, or try another page |
| This page has too little readable text to summarize. | TOO_LITTLE_TEXT | Under 200 characters after cleanup | Use a page with more text |
| This page is too long for the local model on this computer. Try a shorter page. | TOO_LONG | More than 12 parts (not on built-in graphics, where the page is shortened first) | Use a shorter page |
| A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page. | CONTEXT_TOO_LONG | A part still did not fit the window after halving | Use a shorter page |
| Chrome does not allow extensions to read this page. | RESTRICTED_PAGE | Chrome's own page, a local file or the Web Store | Use a normal web page |
| Could not read the text of this page. | EXTRACT_FAILED | The page reader could not run | Reload the page and try again |
| Something went wrong inside the extension. Try again. | SERVICE_ERROR | An unexpected failure | Read the "Technical detail" line. For more, use the console (below) |
| The summary was interrupted. Press Summarize to try again. | INTERRUPTED | Chrome stopped the worker, or the job had no update for 5 minutes | Press Summarize again |
| The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed. | (notice) | A summary written by SmolLM2 after a memory or load failure | Explain it. It is shown above the summary |
| This is a long page. To keep it quick on this computer, the opening of each section was read: about N% of the text. | (notice) | The page was shortened before reading, on built-in graphics | Explain it. The button reads the whole page |

Vague messages. When the popup shows SERVICE_ERROR or MODEL_LOAD_FAILED, it also shows a "Technical detail: ..." line with the first 240 characters of the cause. That is the first thing to read, and it is enough for a bug report. For more, open `chrome://extensions`, find Page Summarizer, click the "service worker" link, and read the Console tab. The line that starts with `[PageSummarizer] failed` gives the code and the full detail.

The code CANCELLED is not shown to the user.

Setup and launcher messages are these.

- **"SETUP COMPLETE."** followed by "Next step: double-click run.bat". Setup finished.
- **"SETUP FAILED."**. Setup stopped. The details are in `setup.log`.
- **"The graphics setting was NOT changed (see the message above). Setup goes on..."** from `setup.bat --gpu`.
- **"Setup has not been completed yet. Please double-click setup.bat first..."** from `run.bat`.
- **"Not enough free disk space"** from `check-computer.ps1`. Free at least 3 GB.

## How to run the tests

Setup with `setup.bat --dev` installs Playwright and its browser, and it needs Node.js 20 or newer. Run these in `finalsem\project`.

| Command | What it does | What you should see |
|---|---|---|
| `npm test` | Runs the unit tests in Node. No browser, no network | 93 tests across eight files, all passing |
| `npm run test:e2e` | Runs the browser scenarios in hidden Chromium with the pretend model | 31 scenarios (smoke, V01 to V29, V18b), all passing |
| `powershell -File tests\bat\test-bat-scripts.ps1` | Checks the setup and launcher scripts | 15 checks (B1 to B10c), all passing |
| `node scripts/bench-models.mjs` | Measures reading and writing speed for each model on the chip (downloads several models; slow) | Writes `docs/test-runs/bench-models.json` and `.md` |
| `node scripts/dump-page-text.mjs <url>` | Prints the text the extension would read from a page | Use it to check what is cut before reading |
| `node scripts/local-run.mjs intel-better` | Real model on built-in graphics: the short fixture, the Lighthouse page and the long fixture | Writes `v2-local-intel-better` files. Slow |
| `node scripts/local-run.mjs intel-fast` | The same cases with Quality: Fast | Writes `v2-local-intel-fast` files |
| `node scripts/local-run.mjs nvidia` | Real model on the NVIDIA card, a cold start then repeats. Downloads about 660 MB once | Writes `v2-local-nvidia` files |
| `node scripts/secret-scan.mjs` | Checks the repository for the Version 1 key before a push | Exit code 1 if a key is found |

The browser scenarios run hidden. Set `HEADED=1` to watch them. Each scenario uses the pretend model, selected with `?mock=<mode>` on the offscreen page. There are twelve modes: `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html`, `slow`, `longprompt` and `crash`.

Do not run the real-model scripts in the days before the viva unless you want new numbers. They download the model and write files into `docs/test-runs`.

## The checklist for the client's laptop

Use this list on the day, and write the results down.

1. Run `check-computer.ps1`. Record the Windows version, the processor, the memory, the graphics chip and the free space on drive C. The known values are in the table above.
2. Confirm Chrome is 156 or newer, or at least 116. Run `setup.bat`, then `run.bat`, then load the folder.
3. Open `chrome://gpu`. WebGPU should say "Hardware accelerated". The repository does not say whether that page lists `shader-f16`, and the photos did not show it. The popup's NO_SHADER_F16 message is the real check.
4. Plug in the mains power. Download the model once while connected, and wait until the popup says "Downloaded, runs on this computer."
5. Run the timing run described above, in a visible Chrome window, with three summaries in a row on the Lighthouse page, first with Better and then with Fast.
6. Turn off the network and summarize one short article. Write the time down.
7. Turn the network back on. `setup.bat --gpu` is not needed on this laptop.

## Not verified yet

- The extension has not been run on the client's laptop, and it has not been run in a visible Chrome window on mains power.
- The client's Iris Xe chip has not been checked for `shader-f16`.
- A second runtime (Transformers.js) has not been tried. The adviser said to try it only if reading is still slow after the visible-window run, and to switch only if it is at least two times faster.
- Qwen2.5-1.5B was not measured (the benchmark run stopped), and gemma3-1b did not load with this WebLLM version.
- Languages other than English.

## What this means in plain words

Setup checks the computer and the files. The launcher opens the extensions page. The first summary downloads about 695 MB, and that takes minutes. Later summaries run on the card with the network off. On built-in graphics a long page is shortened and answered briefly, the popup says how much was read, and the Quality choice is there for anyone who wants speed over accuracy. The client's laptop is the one that matters, and the numbers for it are still to be measured.


<div style="page-break-after: always"></div>

# The big decisions, in your own words

*Purpose: this chapter explains the twelve decisions in `finalsem/docs/DECISIONS.md` the way you would say them out loud at the viva, with the reason, the alternatives, the cost, and one sentence to learn.*

Each decision follows the same five parts. The first says what was decided. The second gives the reason. The third lists what else was considered. The fourth states the trade-off. The last is one sentence to say aloud. Learn the last sentence for each, then say it without the notes.

Where a number appears, it comes from `DECISIONS.md`, `DEVLOG.md`, the saved test-run files or the code. Numbers from an unsaved speed test are labelled that way. The repository does not score summary quality. Decisions 2, 4, 5, 7 and 9 were revised after the code review, the failure in the real Chrome, or the speed work, and each one says how.

## 1. The library is WebLLM, copied in as one file

**What was decided.** The model runs with WebLLM, version 0.2.86 according to the README and the decision record. Its single file is copied into `src/lib/web-llm.js`, and no bundler is used. Transformers.js was kept as a second plan.

**Why.** WebLLM runs small models on WebGPU and lists the models the project uses. Copying the file keeps setup as simple as Version 1.

**What else was considered.** Transformers.js. The first spike worked, so the second plan was not needed then. Decision 12 explains why it is still a possible option.

**The trade-off.** An update means copying a new file and testing it again.

**What you can say.** "The project uses WebLLM, copied into the folder as one file, so the setup stays as simple as Version 1."

## 2. The model runs in a hidden page, not in the service worker

**What was decided.** The model is held by an offscreen page, which is a hidden page Chrome lets an extension open. Inside it, a web worker runs WebLLM's handler. The job itself stays in the service worker.

**Why.** Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load.

**What else was considered.** Keeping the model in the service worker. The decision record does not list any other place.

**The trade-off.** The page is one more part to start, message and close, and it holds the model in graphics memory until the idle countdown ends.

**Revised.** The page is never closed while a message runs (review). Each keepalive also refreshes the running job records, so a long answer is not shown as dead (24 October). The page unloads a loaded model before it loads a different one, so a change of Quality does not keep two models (26 October).

**What you can say.** "The model runs in a hidden page because Chrome can stop the background worker when it is idle. The page is only closed when no work is running."

## 3. Local only, with no key

**What was decided.** Version 2 runs only on the computer. The key box is gone. The first use shows one button, "Download model and summarize". Version 1 stays as the cloud version.

**Why.** The summary should need no account, no key and no network after the download, and the page text should never leave the computer.

**What else was considered.** A cloud fallback for computers without WebGPU. The record says the choice would change if the client's laptop had no WebGPU. The client's laptop has WebGPU hardware acceleration, so that condition does not apply. The `shader-f16` feature is not yet confirmed on that laptop.

**The trade-off.** A computer without WebGPU or without `shader-f16` cannot run Version 2. The popup says so, and nothing is sent to the cloud instead.

**What you can say.** "Version 2 is local only, so no key is needed and the page text never leaves the computer. The cost is that a computer without the right graphics support cannot run it."

## 4. The model: Llama 3.2 1B by default, SmolLM2 360M as a choice

**What was decided.** The main model is Llama 3.2 1B, id `Llama-3.2-1B-Instruct-q4f16_1-MLC`. It is the default on every chip. SmolLM2 360M is used only in three cases: when the person chooses Quality: Fast in the popup's Settings, after a memory or load failure of the main model (saved as `modelOverride`), or on a computer that reports under 8 GB of memory.

**Why.** The 1B model was the one whose summary of a realistic part had no invented details in the benchmark. On the built-in chip it takes about 2.4 times as long per part as SmolLM2 (162 s against 66 s), and the speed work of 26 October made that time acceptable (decision 12).

**What else was considered.** Qwen2.5 0.5B and 1.5B, gemma3-1b. Qwen2.5 0.5B was measured and its summaries were less accurate. Qwen2.5 1.5B was not measured because the benchmark run stopped. gemma3-1b did not load with this WebLLM version.

**The trade-off.** The main model is slower. The Fast choice is quicker, and its summaries are often muddled or wrong.

**Revised.** Until 26 October the built-in graphics switched to SmolLM2 by themselves (decision 7). That automatic switch is removed. The records made before 26 October are labelled "SmolLM2 default".

**What you can say.** "The project uses Llama 3.2 1B on every chip. SmolLM2 is there for a person who chooses speed over accuracy, and for a computer that cannot hold the big model."

## 5. Part size, the reading budget, the short prompts and the temperature

**What was decided.** A part holds at most 6,000 characters, about 1,500 tokens, so one part fits the 4,096-token window with room for the answer. On built-in graphics the page is cut before it is read: the back matter and markers are removed, and then the text is shortened to a reading budget of 6,000 characters (decision 12). The answers on built-in graphics are short: 3 sentences for a single part, 2 per part of a longer page, and 4 or 5 for the merge. The temperature is 0.2. A page that needs more than 12 parts is refused.

**Why.** The window limits what one prompt can hold. The chip reads slowly, so reading less and writing less are the only ways to keep the time down.

**What else was considered.** Halving a part when it does not fit the window. The record listed this as part of the plan and it was not built at first. It was built on 24 October, after the real-Chrome failure. When WebLLM refuses a part for size, the part is cut in half at a break and each half is summarized, up to three levels deep and never for text under 600 characters.

**The trade-off.** The reading budget covers only about a fifth of a long page. The rest is not summarized unless the person chooses "Read the whole page (slower)". The repository does not show that 6,000 characters gives better summaries than another size.

**Revised.** A small model copied the start marker into its answer, so the markers are removed from every answer. The cleaners also now remove a repeated copy of the prompt's own safety sentence and an empty "Summary:" label, which become EMPTY_ANSWER (26 October).

**What you can say.** "Each part is about 1,500 tokens, so it fits the model's window. On the slow chip the page is cut to about one part and the answers are short, and the popup says how much was read."

## 6. The model files are kept in IndexedDB, not Cache Storage

**What was decided.** WebLLM stores the model in IndexedDB, with `cacheBackend: 'indexeddb'` in `offscreen.js`. The page checks whether the model is stored before it loads, so a stored model is shown as loading and never as a download.

**Why.** WebLLM's default store, Cache Storage, failed inside the extension's hidden page with `UnknownError: Failed to execute 'open' on 'CacheStorage'`. IndexedDB worked, with about 10.7 GB of quota in the test.

**What else was considered.** The default Cache Storage, which failed.

**The trade-off.** The extension needs `unlimitedStorage`, so Chrome does not delete the 695 MB model when disk space is low.

**What you can say.** "The model is kept in IndexedDB, because the default store failed inside the hidden page, and the extension asks for unlimited storage so the model is not deleted."

## 7. On built-in graphics: no automatic switch to the small model

**What was decided at first.** When WebGPU reports an Intel built-in chip, the extension chose SmolLM2 360M by itself and showed a note that a separate card is much faster.

**Why it was decided.** On the Intel chip the 1B model wrote about 2 tokens a second, in an unsaved speed test (DEVLOG, 21 October), and its first answer took 36 seconds to prepare. The record set a warning line of about 60 seconds for one part.

**What changed.** On 24 October the real Chrome failed on the Wikipedia article, and a hidden run of the same case timed out at 180 s. With the new code the article took 616 s with SmolLM2 on the whole page, and its summary was not reliable. On 26 October the owner said that 10 minutes is far too long and asked for speed, with a bigger model accepted if it fits. The automatic switch was removed (decision 12). The note on built-in graphics stays.

**The trade-off.** The main model is slower per part, but the page is shortened, so the total time is about two minutes instead of ten.

**What you can say.** "On built-in graphics the extension used to switch to the small model by itself. Now it keeps the accurate model and makes the job smaller instead, and the person can still choose the small model."

## 8. Making Chrome use the separate card is opt-in only

**What was decided.** The script `setup.bat --gpu` sets one per-user Windows value, `GpuPreference=2`, that asks Chrome to use the high-performance card. It is never run by default. Undo is `scripts\set-chrome-gpu.ps1 -Remove`.

**Why.** On a laptop with two chips Chrome often starts on the weak one. The project owner does not want Windows settings changed without asking.

**What else was considered.** Changing the setting automatically, or leaving it to the user with no help.

**The trade-off.** The script was tested only against a throw-away registry key, not against a real Chrome.

**Revised.** The script finds Chrome by itself, so the undo command works as written. If the setting cannot be changed, `setup.bat --gpu` says so and carries on. The client's laptop has one chip, so the option does not apply there.

**What you can say.** "The separate card is used only when the user asks for it, because it changes a Windows setting, and one command undoes it."

## 9. A pretend model for most tests, and one real run for proof

**What was decided.** Most browser scenarios use a pretend model, selected with `?mock=<mode>`, which now has twelve modes. Real-model runs are separate, through `scripts/local-run.mjs`.

**Why.** A real model cannot be made to fail on demand. The pretend model can produce a download failure, an out-of-memory error, no WebGPU, a prompt that is too long, or a crash. The real-model runs prove that the real thing works.

**What else was considered.** Testing only with the real model, which would be slow and could not force the failures.

**The trade-off.** The pretend model proves the extension's logic, not the model's quality. The scenarios run in hidden Chromium, not in the daily Chrome.

**Revised.** The browser scenarios now number 31 and the unit tests 93. The scenario for the shortened page and the whole-page button (V28) and the Quality choice (V29) use the pretend model too.

**What you can say.** "The browser scenarios use a pretend model so that failures can be forced. The real model was run separately, and those runs are the proof that it works."

## 10. Version 1 stays untouched

**What was decided.** Version 2 lives in `finalsem/`. Nothing under `midsem/` was edited. Shared parts, such as the chunker, the merger and the pipeline, were copied, not linked.

**Why.** The midterm submission must stay as it was. Copies let each version run by itself from its own folder.

**The trade-off.** A bug fixed in one copy must be fixed in the other by hand. The DEVLOG records a case: a closed-tab bug fixed in Version 1 (B4) came back in a different form in Version 2 and was fixed again there.

**What you can say.** "Version 1 is untouched, and the shared code was copied, so each version runs on its own."

## 11. A spike before building, and the risk tested first

**What was decided.** Before any code was written, the core choices were put as a written question to a second, stronger model (recorded as "Opus" in `DECISIONS.md`). The biggest risk, running WebLLM without a bundler inside an offscreen page and a worker at a usable speed, was tested first with a throw-away extension in a hidden browser.

**Why.** Running a model in a browser extension was new to the project. The spike found problems, and the Cache Storage failure is one of them (decision 6).

**What else was considered.** Building the full extension first and testing later.

**The trade-off.** The spike did not test a long, dense page on the slowest chip. The first real-Chrome run on that case, on 24 October, found the gap. The same method was used again on 26 October, with the same kind of question put to Opus (decision 12).

**What you can say.** "The biggest risk was tested first with a throw-away extension, and the real runs later found what the spike had missed."

## 12. Speed on the client's laptop: read less, keep the accurate model (26 October)

**Why it came up.** The client's laptop has only built-in graphics: an Intel Iris Xe chip on a 15-watt processor, with 16 GB of memory and 363 GB free (`finalsem/docs/CLIENT_LAPTOP.md`). On the developer's Intel chip a long Wikipedia page took about 10 minutes with the small model, and the owner asked for it to be as fast as possible, with a bigger model accepted if it fits.

**What was measured** (`docs/test-runs/bench-models.md`, `scripts/bench-models.mjs`). On the built-in chip the model reads only 15 to 40 tokens a second whatever its size, and reading takes about 80 percent of the time of one part. Llama 3.2 1B reads at 15.6 and writes at 2 tokens a second, and one realistic part takes 162 s. SmolLM2 360M reads at 26 to 29 and writes at 4.8, and takes 66 s for the same part. The 4-bit versions with 32-bit math were no faster at reading and slower at writing.

**The question put to Opus** (a second, stronger model, as a written brief with these numbers) and its answer:

| # | Question | Answer | What was done |
|---|---|---|---|
| 1 | Default model on built-in graphics | Llama 3.2 1B, accurate and 2.4 times slower per part. Do not show a model choice on the main screen; put Quality under Settings. | Done. The automatic switch to SmolLM2 is removed. Quality: Better or Fast is under Settings. |
| 2 | How much of a page to read | Keep 6,000 characters, exactly one part, so no merge request. Aim for about 2 minutes warm and 3 with the first-answer warm-up. | Done. `readBudgetIntegrated` is 6,000, and the page is shortened in `condense.js`. |
| 3 | Shorter answers | 3 sentences for a single part (130 tokens), 2 per part (90), 4 or 5 for the merge (180), and every cut answer ends at its last full stop. | Done for built-in graphics only. |
| 4 | A different runtime | Not now. First run the same benchmark in a visible Chrome window on mains power, because reading at 15.6 tokens a second is far below what the chip should do. Only if reading is still slow, try Transformers.js on one page, half a day at most, and switch only if reading is at least two times faster. | Not done. Everything measured so far ran in a hidden Chromium. |
| 5 | Biggest risk | None of the numbers is from the client's chip or a visible Chrome window. First action: run the extension on the client's laptop with a timing log for both models on the same page, which also downloads the 695 MB model in advance. | Open. See the timing run in chapter 03. |

**Also built, from the same advice:** the model is loaded and warmed while the popup is open, when it is already stored; back matter and markers are cut before reading; the popup says when a page was shortened and offers "Read the whole page (slower)" with a rough time estimate; the Quality choice is in Settings.

**Result on the developer's Intel chip** (`docs/test-runs/v2-local-intel-better.md`). The Wikipedia Lighthouse page took 124.6 s, against about 616 s with the small model on the whole page. The popup stated that 21 percent of the text was read, and that reading all of it would take roughly 692 s. The long fixture took 103.8 s, with half its text read. The short fixture took 200.6 s with the first use, including the 118 s download. The records say the three summaries were accurate and fluent. Fast, with SmolLM2, took 39.5 s for the short fixture and 64.7 s for the Lighthouse page, but its Lighthouse answer was a failed summary, made before the cleanup fix.

**The trade-off.** The shortened summary covers about a fifth of a long page, and the whole page takes 5 to 12 minutes on built-in graphics. The estimate for the whole page is a rough guess from the measured speed.

**What is still open.** The client's laptop has not been timed, and the visible-window run on mains power has not been made. Transformers.js has not been tried.

**What you can say.** "The slow chip reads about 15 tokens a second, so the project reads less of a long page and writes short answers. The main model stays, and the person decides whether to trade accuracy for speed."

## What this means in plain words

The decisions came from four needs: the page text should stay on the computer, the extension should work on the laptop the client has, the model should load without a build step, and each claim should be backed by a measurement. Each choice costs something. The model's quality on the slow chip is not measured across many pages, the reading budget covers only part of a long page, and the client's laptop is untested. Learn the cost as well as the choice, because a tutor will often ask about the cost first.


<div style="page-break-after: always"></div>

# Glossary

*Purpose: this glossary gives the plain meaning of each technical word in Version 2, in one to three sentences, with this project's number where the repository has one.*

The entries are in alphabetical order. Where a number comes from the repository, the entry names the file. Where the entry is general background about how models work, it says so.

**Attention.** Attention is the part of a language model that lets each word piece look back at the others in the text while it chooses the next, and this project neither changes nor measures it.

**Brief answers.** Short answers, written on built-in graphics because writing is slow there: 3 sentences for a single part, 2 per part of a longer page, and 4 or 5 for the merge. A fast card keeps the richer format.

**Cache Storage.** The browser's default store for files that a web page or extension keeps, which WebLLM uses by default. It failed inside this project's offscreen page with an "UnknownError", so the project stores the model in IndexedDB instead.

**Chunk (part).** A piece of the page text of at most 6,000 characters (`chunkChars` in `config.js`), sent to the model as one request. The screens call it a part. A page that needs more than 12 parts is refused with TOO_LONG (`maxChunks`).

**Condense.** The step that shortens a long page before it is read, on built-in graphics. It keeps the opening of the page in full, up to 35 percent of the reading budget, then the first sentences of each paragraph, spread evenly over the page, with the headings of the kept sections. The result is one part. On the Lighthouse page about a fifth of the text was read.

**Context window.** The number of tokens a model can look at in one go, including the prompt and the answer. The decision record gives the window of Llama 3.2 1B as 4,096 tokens, and the part size is set to fit inside it. A dense part can still exceed it. WebLLM then refuses the prompt with "Prompt tokens exceed context window size", and the extension halves the part (see Halving).

**Decode.** The step in which the model writes its answer, one token at a time. Each token needs a full pass through the model, so decode is slower than prefill. The saved clean NVIDIA runs decoded at 34 to 53 tokens a second. An unsaved speed test, recorded in the DEVLOG, gave about 63. On the built-in chip Llama 3.2 1B writes 2 tokens a second, which is why answers are kept short there.

**fp16 and shader-f16.** fp16 means a number stored in 16 bits, instead of 32, which is faster and smaller. `shader-f16` is the graphics feature that lets the card's small programs use those 16-bit numbers. The models in this project need it, and a card without it gets the NO_SHADER_F16 message.

**Graphics card (GPU).** The chip that does many small calculations at the same time, built for pictures and games. This project runs the model on it, through WebGPU. The developer's laptop has an NVIDIA RTX 3050 with 6 GB.

**Halving (halve and retry).** When WebLLM refuses a part because it does not fit the context window, the extension cuts the part in half at a paragraph or sentence break and summarizes each half. This is repeated up to three levels deep, and never for text under 600 characters. It was added on 24 October, after a dense Wikipedia part was refused in the real Chrome.

**IndexedDB.** A store inside the browser where a web page or extension keeps larger data by name. The model files are kept here, and the project asks for unlimited storage so the browser does not delete them. In the test, the quota was about 10.7 GB.

**Integrated graphics.** A graphics chip built into the processor, instead of a separate card. The client's laptop has only this kind of chip, and the developer's Intel chip is the nearest guide. The 1B model wrote about 2 tokens a second on it. The extension keeps the main model there and shortens long pages and keeps answers short. It no longer switches to the small model by itself; that was removed on 26 October.

**Job record.** The data stored for one summary, under the key `job:<tab id>` in session storage. It holds the status, the phase, the progress, the summary, any error and the stats. The popup redraws from it.

**Keepalive.** A message the offscreen page sends to the service worker every 10 seconds while it is busy. It keeps the service worker from being stopped in the middle of a job. The interval is set in `offscreen.js`. Since 24 October, each keepalive also refreshes the update time of every running job record, so a long answer is not shown as dead.

**Llama 3.2 1B.** The main model, the default on every chip, with the id `Llama-3.2-1B-Instruct-q4f16_1-MLC`. "1B" means about one billion parameters. The popup says the download is about 695 MB, and WebLLM's list gives 879 MB of graphics memory for it.

**Manifest.** The file `manifest.json` that tells Chrome the extension's name, files and permissions. Version 2's manifest has version 2.0.0, and it allows Hugging Face as the model's host.

**Merge.** The step that joins several part summaries into one, with one more model call, which may write at most 320 tokens. The Lighthouse article's seven parts used one merge level, so eight requests in all.

**MLC.** The name in the model ids (for example `-MLC` at the end) marks the compiled form that WebLLM's model list uses. The name comes from the MLC project, on which WebLLM is built. This is background; the repository does not measure it.

**Mock (pretend model).** A stand-in model that answers from fixed text and can fail on purpose. It is selected with `?mock=<mode>` on the offscreen page. The browser tests use it, and its twelve modes include `nowebgpu`, `oom`, `downloadfail`, `longprompt` and `crash`.

**Model weights.** The numbers a model learned, stored in a file. The 1B model's weights are about 695 MB in this project, because they are stored in 4-bit form.

**Offscreen document.** A hidden page that Chrome lets an extension open for a task that needs a page, such as holding a model. This project's offscreen page has no window, can only send messages, and is closed after five minutes idle (`idleCloseMs`), and never while a message is running.

**Parameter.** One of the numbers inside a model that was set during learning. "1B" means about one billion of them. More parameters usually need more memory and time, which is why the project offers a smaller model.

**Pipeline.** The fixed order of steps for one job: read the page, check the length, cut into parts, prepare the model, summarize each part, merge. The same pipeline code is used in Version 1 and Version 2, with a prepare step added in Version 2.

**Prefill.** The step in which the model reads the whole prompt before it writes anything. An unsaved speed test, recorded in the DEVLOG on 21 October, gave about 600 tokens a second on the NVIDIA card, and about 1.5 seconds for a 250-token prompt. The record does not say which text was used. On the built-in chip reading is the slow part: Llama 3.2 1B reads at 15.6 tokens a second, and reading takes about 80 percent of the time of one part.

**Preload.** Loading and warming the model before the first answer, when the popup opens on a normal page and the model is already stored. The popup asks for it with `PRELOAD_MODEL`. It never downloads anything, so nothing happens if the model is not stored yet.

**Prompt.** The text sent to the model in one request: the page text between markers, followed by one fixed instruction. Version 2's prompt layout is `PROMPT_VERSION` `v2.0`. The model reads the prompt and then writes the answer.

**Quality.** The Settings choice in the popup. Better is Llama 3.2 1B, more accurate and slower, and it is the default. Fast is SmolLM2 360M, about two times quicker, but its summaries are often muddled or wrong. The choice is stored in this browser as `quality`.

**Quantization (4-bit, q4f16_1).** A way of storing the weights in fewer bits, so the file and the memory need are smaller. `q4f16_1` in a model id names a 4-bit form that uses 16-bit numbers for the arithmetic. The cost is a small loss of accuracy, which the project does not measure.

**Readability.** A library that finds the main article in a web page and leaves out the menus and adverts. It is the same file as in Version 1, with an Apache-2.0 licence.

**Reading budget.** The number of characters of a page the model may read for one summary. It is 6,000 characters on built-in graphics and 0 elsewhere, which means read everything (`readBudgetIntegrated` and `readBudgetOther`). A longer page is shortened first, in the condense step, and the popup says how much was read.

**Service worker.** A background script that Chrome runs for an extension. In this project it owns the job and keeps the job record. Chrome can stop it when it is idle, and a job left running at that moment is marked INTERRUPTED. A job with no update for five minutes counts as dead.

**Session storage.** Chrome's storage for an extension that is cleared when the browser closes. The job records are kept here (`chrome.storage.session`).

**Shader and warm-up.** A shader is a small program that runs on the graphics card. Before the first answer, the card must compile its shaders for the model, which is the warm-up. The cold NVIDIA run's warm-up took about 30.5 seconds, the first Intel run's about 39 seconds, and a later run on the same profile about half a second.

**SmolLM2 360M.** The fallback model, with the id `SmolLM2-360M-Instruct-q4f16_1-MLC`. It needs 376 MB of graphics memory and its download is about 204 MB. The extension uses it only when the person chooses Quality: Fast, on a computer that reports under 8 GB of memory, or after the main model fails with a memory or load error.

**Stale job.** A job whose record has had no update for five minutes. The popup and the service worker both treat it as dead. The answer timeout is a separate limit, now 10 minutes. Version 1 used three minutes for its own dead-job limit. A running job stays alive while the keepalive refreshes it.

**Temperature.** A setting that controls how much a model varies its choice of next word. The project uses 0.2, so the answer stays close to the most likely words and to the text.

**Timeout (answer limit).** The longest time the extension waits for one model answer. It is 10 minutes (`generateTimeoutMs`, 600,000 ms). It was 180 seconds until 24 October, when answers on the Intel chip ran past three minutes. When it passes, the job stops with TIMEOUT.

**Token.** The piece of text a model reads and writes: a word, part of a word, or a punctuation mark. A page of 6,000 characters is about 1,500 tokens, according to the comment in `config.js`. The repository does not store how many tokens each answer had.

**Tokenizer.** The part that turns text into token numbers for the model, and turns the model's numbers back into text. WebLLM loads it with the model. This is background; the project does not change it.

**Tokens per second.** The speed of decode, written as tokens a second. It is recorded as `decodeTps` in the stats and in the test-run files. Saved clean NVIDIA runs: 34 to 53, each the last request of its job. The repeat run after the label fix gave 65 for the short article and 45 for the two-part article. Saved clean Intel runs with SmolLM2: 4 to 5. The saved built-in run with Llama 3.2 1B wrote 2 tokens a second.

**WebGPU.** A browser feature that lets a web page or extension use the graphics card for calculation. Chrome's `chrome://gpu` page shows whether WebGPU is "Hardware accelerated". The extension asks for an adapter and checks it.

**WebLLM.** The open-source library, version 0.2.86 according to the README, that loads a model and runs it on WebGPU in the browser. It is copied into `src/lib/web-llm.js` with its Apache-2.0 licence.

**Web worker.** A background thread that a web page can start, so heavy work does not block the page. In this project, `engine-worker.js` starts WebLLM's handler in a web worker inside the offscreen page.


<div style="page-break-after: always"></div>

# Viva questions and honest answers (Version 2)

*Purpose: this chapter gives thirty likely viva questions in eight groups, each with a direct answer of two to five sentences that uses the real numbers in the repository, including the awkward questions.*

Say each answer in your own words, in under a minute. Where the repository has no evidence, the answer says so. Where a number comes from the DEVLOG or from an unsaved speed test rather than a saved run, the answer says so. Numbers from before 26 October used the small model on built-in graphics; the answers say so when they matter.

## The idea and the need

**1. What does Version 2 do, in one sentence?**

Page Summarizer Version 2 summarizes the page you are reading with a language model that runs inside Chrome, on your computer's graphics card. It needs no key and no account, and the page text does not leave the computer. Only the first download of the model needs the internet, which the popup reports as about 695 MB for Llama 3.2 1B.

**2. What problem does it solve that Version 1 did not?**

Version 1 sends each page to Google, so every summary needs a key, an internet connection and trust in a cloud service. Version 2 removes all three from the summary itself, after the first download. The Version 1 quota probe also showed the limits of Google's free tier: the chosen model allowed 15 requests a minute, and the bigger model 20 a day.

**3. Why not keep Gemini? It was fast, and it worked.**

Gemini was fast. The model Version 1 chose answered in about 1.6 to 2.0 seconds per request. But every page went to Google, and the bigger model's free allowance stopped at 20 requests a day. The project chose local-only instead (decision 3 in chapter 04), and it kept Version 1 as the cloud version. The cost is that a computer without the right graphics support cannot run Version 2.

## AI basics

**4. What is a language model, and what does "1B" mean?**

A language model is a program that has learned, from a large amount of text, which piece of text is likely to come next. It writes an answer by making that guess again and again. "1B" means the model has about one billion parameters, which are learned numbers stored in its file. The repository does not describe how the model was trained, so that part is general background.

**5. What is a token, and why is speed counted in tokens?**

A token is the piece of text that the model reads and writes. It is often a word, or part of a word, or a punctuation mark. A part of 6,000 characters is about 1,500 tokens, according to the comment in `config.js`. Speed is counted in tokens a second because each token needs one full pass through the model. The saved clean NVIDIA runs wrote 34 to 53 tokens a second. On the built-in chip Llama 3.2 1B wrote 2 tokens a second in the saved run.

**6. What is the context window, and why are the parts 6,000 characters?**

The context window is how much text the model can take in one request, including the instructions and the answer. The decision record gives 4,096 tokens for Llama 3.2 1B. A part of about 1,500 tokens leaves room for the instructions and a short answer. A part that still does not fit is cut in half, and each half is summarized.

**7. What is quantization, and why is the file about 695 MB?**

Quantization stores each weight in fewer bits, so the file and the memory it needs are smaller. This model is 4-bit, as the name `q4f16_1` says, and its files add up to about 695 MB, which is what the popup reports. The cost is a small loss of accuracy, which the project does not measure. A copy with 16-bit weights would be several times larger, which is general background and not a measured figure here.

## Design

**8. Why does the popup not run the model?**

A popup closes when the user clicks elsewhere, and that would stop a long job. The service worker owns the job, and the model is held in a hidden offscreen page. The popup only redraws from the job record in session storage, so closing it does not lose the summary.

**9. Why use an offscreen page, and not the service worker, for the model?**

The offscreen page's own comment gives the reason. Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load. The offscreen page has no window and works only by messages. It is never closed while a message is running, and it closes after five minutes with no work, which gives the card's memory back.

**10. Why is the model kept in IndexedDB and not in Cache Storage?**

WebLLM's default store, Cache Storage, failed inside the hidden page with "UnknownError: Failed to execute 'open' on 'CacheStorage'". IndexedDB worked there, with about 10.7 GB of quota in the test. The extension also asks for the `unlimitedStorage` permission, so Chrome does not delete the model when disk space runs low.

**11. Why not a smaller model on the built-in chip?**

Until 26 October the extension did switch to SmolLM2 by itself on built-in graphics. That was the wrong default. Its summaries were often muddled or wrong, and on the Wikipedia article its summary contained invented facts. The 1B model was the only one whose summary of the same part had no invented details in the benchmark. So the default is Llama 3.2 1B on every chip. SmolLM2 remains a visible choice in Settings > Quality, labelled Fast, and it is used after a memory failure or on a computer with under 8 GB of memory.

**12. Why not a different runtime, such as Transformers.js?**

Nothing measured so far says the runtime is the cause. The adviser's advice was to measure in a visible Chrome window on mains power first, because reading at 15.6 tokens a second is far below what the chip should do. Only if reading is still slow, one page with Transformers.js, half a day at most, and switch only if it reads at least two times faster. That test has not been made. Switching runtimes now would also mean new code and new tests, which the project has not budgeted for.

## Privacy

**13. Does the page text leave the computer?**

No. The model runs on the laptop, and the page text goes only to the model inside the same browser. The offline run is the evidence. With the outside websites blocked, the short article still summarized from the stored copy of the model, in the run made before a label fix.

**14. What does the extension contact on the internet?**

The manifest lists the only hosts it may reach: `huggingface.co`, `*.huggingface.co`, `*.hf.co` and `raw.githubusercontent.com`. The first download uses them. The summary of a page does not use the network, and the Gemini address is no longer in the manifest.

**15. What happens with no internet?**

After the first download, a summary needs no internet. The saved offline run on the NVIDIA card summarized a short article in 15.3 s and a two-part article in 16.5 s, with outside websites blocked. The repeat after the label fix took 17.7 s and 16 s. Before the first download, the download cannot start, and the popup reports MODEL_DOWNLOAD_FAILED. The offline runs block outside sites with a Chromium flag, not with a cut network cable, so say that if you are asked.

## Performance

**16. Why is the first run slow?**

On the NVIDIA card the clean first run took 196.8 s. The download of the 695 MB model took 158.3 s, the load into the card 3.8 s, the warm-up 30.5 s, when the card compiles its programs, and the summary 3.7 s. On the developer's Intel chip the first use of the short fixture took 200.6 s, including a 118 s download. The download happens once. Preloading moves the warm-up to the moment the popup opens, when the model is already stored.

**17. Why is the built-in chip slow, and why is it fast now?**

The built-in chip reads about 15 tokens a second and writes about 2 with Llama 3.2 1B. Reading takes about 80 percent of the time of one part, so the time is set mostly by how much is read. The project now reads less. On built-in graphics a long page is cut to its opening and the first sentences of each section, which fits in one part of 6,000 characters. The answers are short, three sentences for a single part and two per part, so writing is brief too. The Lighthouse page took 124.6 s this way, against about 616 s before, when the small model read the whole page. The user can still choose "Read the whole page (slower)".

**18. How fast is it on your laptop?**

On the developer's Intel chip, the Lighthouse page took 124.6 s with the model loaded, in one part, with 21 percent of the text read. The long fixture took 103.8 s. On the developer's NVIDIA card, the saved clean runs gave 74.1 s for the seven-part Lighthouse article, 16.5 s for a two-part article offline, and 15.3 s for a short article offline. The client's laptop has a built-in Iris Xe chip and has not been timed, so its figure is `[to be measured]`.

**19. What is the cost in coverage?**

The shortened summary covers about a fifth of a long page. The popup says so, with the percentage, and it gives a rough time for reading all of it. For the Lighthouse run the popup estimated about 12 minutes. The summary is then of the opening and the first sentences of the sections, not of the whole article. The user can press "Read the whole page (slower)", and on built-in graphics that takes 5 to 12 minutes, depending on the article. Before 26 October, the whole page took about 10 minutes with the small model, and its summary was unreliable, so the trade is a smaller coverage for a usable answer in about two minutes.

**20. Why does the second summary start faster than the first?**

The model stays loaded in the hidden page for five minutes after its last message, and the page is never closed while a message runs. The saved Intel long article started six seconds after the short one ended, so its timeline has no load or warm-up lines. After the idle time, the page closes, and the next summary loads the model again from IndexedDB without a download. The load took about 7 seconds in the saved offline run on the NVIDIA card. The warm-up was about half a second there, against about 30.5 seconds in the cold run. The repository does not explain that difference, so the likely reason, that the card already had its programs compiled, should be given as an inference.

## Errors

**21. What if the laptop has no graphics card support?**

The popup says so in plain words. A card without WebGPU shows NO_WEBGPU, and a card without the `shader-f16` feature shows NO_SHADER_F16. In both cases the model line says so and the button is disabled, which scenarios V07 and V08 check. Version 2 cannot run on that computer, and nothing is sent to the cloud instead. The client's laptop has WebGPU hardware acceleration, but the photos did not show `shader-f16`, so this has not been confirmed there.

**22. What happens if the graphics card runs out of memory?**

The extension tries the smaller model once, when the main model is the one that failed. If that loads, it saves the choice in local storage (`modelOverride`), and the popup shows the notice "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." If every model fails, the popup shows the GPU_MEMORY message and asks the user to close other programs. Scenario V10 checks the notice, and scenario V11 checks the failure with every model out of memory.

**23. What if the model download stops halfway?**

The popup shows MODEL_DOWNLOAD_FAILED: "The model download stopped. Check your internet connection and press the button again." The message also says that what was downloaded is kept. Scenario V12 checks that nothing is saved and that a later press succeeds once the download works. The repository does not measure how much of a partial download is kept.

**24. What if Chrome stops the service worker during a job?**

The job record still says "running", so the next start of the worker marks it INTERRUPTED. The popup then tells the user to press Summarize again, which scenario V20 checks. A job with no update for five minutes counts as dead in the popup and the service worker. Since 24 October each keepalive also refreshes the update time of every running job, so one long answer is not shown as dead. The repository does not measure how often Chrome stops the worker in practice.

## Testing

**25. How did you test it?**

There are three layers. The 93 unit tests run in Node, in eight files. The 31 browser scenarios run in hidden Chromium with the pretend model, which has twelve modes. The 15 script checks (B1 to B10c) test the setup and launcher files. The test setup passes all of them. The real model was run separately with `scripts/local-run.mjs`, and that produced the saved runs. The run-1 record in the test-run folder predates the later changes, so run the commands again before you quote the counts.

**26. Why use a pretend model in the tests?**

A real model cannot be made to fail on demand, and it is slow and needs a graphics card. The pretend model can produce no WebGPU, no shader-f16, out-of-memory errors, a failed download, an empty answer, markup in the answer, an oversized prompt and a crash. The real-model runs prove that the real model works, and the scenarios prove the extension's logic.

**27. Did the tests and the review find real bugs? What failed in the real Chrome?**

Yes. The real Chrome failed on 24 October. On the Wikipedia Lighthouse article, on the developer's laptop with the Intel chip, the popup said "Something went wrong inside the extension. Try again." with no reason. A hidden run of the same case failed with TIMEOUT, because one answer ran past the 180-second limit. WebLLM's refusal of an oversized prompt also fell through to that vague message, because the extension did not know its text. The fixes were a 10-minute limit, halving of parts that do not fit, a heartbeat for running jobs, and a "Technical detail" line in the popup. Earlier, scenario V09 found that the popup printed "intel" in lowercase, and `vendorName` in `popup.js` fixed it. A code review found more: a stored model was labelled "Downloading" for about 0.8 s, the small model's answers copied the page marker, and the fallback was silent. The DEVLOG rows dated 21 and 24 October tell those stories.

## Honesty about the limits

**28. How good is a 1B model, really?**

The repository does not score summary quality, so the honest answer is that it is not measured. The saved records say that the three summaries of the built-in run were accurate and fluent. Earlier outputs show faults. The Intel summary began with the page's own marker text, "<<<PAGE TEXT START>>>", in a run recorded before the marker fix. The NVIDIA long-article summary said "These are summaries of consecutive parts of one web page", which describes the process, and that line still appears in some answers. The old-code second try of the Wikipedia article, with the small model, invented facts; those are not repeated here and must not be quoted as facts. The current run of that article with the small model gave three short, generic points whose counts were not checked against the page. A person should compare each summary with its page before any quality claim is made.

**29. What was not measured?**

Several things. The client's laptop has not been run, and the chip's `shader-f16` support is not confirmed. The extension has not been timed in a visible Chrome window on mains power, which the adviser recommended first, and the timing of three summaries in a row has not been taken. The Transformers.js runtime has not been tried. Qwen2.5 1.5B was not measured, because the benchmark run stopped, and gemma3-1b did not load with this WebLLM version. The estimate for the whole page is a rough guess. Summary quality beyond three pages was not compared with any other model. Closing the tab during a download does not stop the download. No automated scenario covers the 10-minute timeout path, because the pretend model has no timeout. Only English text was tried.

**30. Why do the decode speeds differ between documents? The DEVLOG says 63 tokens a second, the saved runs say 34 to 53.**

The 63 tokens a second, and the 600 for reading the prompt, come from an earlier speed test on the NVIDIA chip. The DEVLOG records them, but the test was not saved as a run file, and the record does not say which text was used. The saved clean NVIDIA runs gave 34, 40, 42, 47 and 53 tokens a second, each the last request of its job. On the built-in chip the saved run with Llama 3.2 1B wrote 2 tokens a second, and the saved SmolLM2 runs wrote 4 and 5. The runs done while other programs were busy are not used for ranges. So say the saved figures, and say that 63 and 600 came from a speed test that was not saved.

## What this means in plain words

The answers come back to three points. The model runs on the laptop, so the page stays private and the summary needs no network after the download. The built-in chip is slow at reading and writing, so the project reads less of a long page and writes short answers, and the popup says what was left out. What is not yet known is the client's laptop, so the timing run in a visible Chrome window comes first, and until it is done you should say so.

