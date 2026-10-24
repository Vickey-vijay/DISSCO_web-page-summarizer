# Read me first: the knowledge transfer guide for Page Summarizer, Version 2

*Purpose: this page says what Version 2 is, how it differs from Version 1, how to use the seven-file KT pack, and the five things to remember before the viva.*

## What this document is

This is the knowledge transfer (KT) guide for Page Summarizer, Version 2. It is for the student who explains the project at the viva, and for whoever maintains the extension later. Every number in it comes from the repository: the code in `finalsem/project`, the saved runs in `finalsem/docs/test-runs`, `finalsem/docs/DECISIONS.md` and `DEVLOG.md`. Where a number is missing, the pack says `[to be measured]`. The pack was revised after a code review and again after a failure in the real Chrome on 24 October 2026. Chapter 01 has a section "What changed after review" and the limits that still hold. Chapters 02 to 04 name each change where it applies. Chapter 06 tells the real-Chrome story.

## What the project is

Page Summarizer is a Chrome extension. You click its icon on an article, press a button, and a short summary appears in the popup. Version 2 makes the summary with a small language model that runs inside Chrome, on your computer's graphics card. There is no account and no API key, and the page text does not leave the computer.

## How Version 2 differs from Version 1

| Item | Version 1 (`midsem`) | Version 2 (`finalsem`) |
|---|---|---|
| Where the summary is written | Google's Gemini service | Your computer's graphics card |
| What you need to start | A free Gemini key | Nothing to paste. The first use downloads the model |
| Internet | Needed for every summary | Needed once, for the download |
| Part size and limit | 8,000 characters, at most 30 parts | 6,000 characters, at most 12 parts |
| Automated tests | 65 unit and 28 browser (its run 3) | 76 unit, 29 browser scenarios, 15 script checks |

Version 1 is untouched in its own folder, so the midterm submission stays as it was.

## How to use this KT pack

| File | Read it when |
|---|---|
| `01_how_it_works.md` | Day 1: the walk from the button press to the summary |
| `02_module_by_module.md` | Day 2: every source file and what breaks without it |
| `03_how_to_run_and_demo.md` | Day 3, and the day before the viva: setup, demo, errors, tests |
| `04_decisions_in_your_words.md` | Day 4: the eleven decisions, each with a sentence to say |
| `05_glossary.md` | Day 5: plain definitions |
| `06_viva_questions.md` | Days 6 and 7: thirty questions with answers |

## A ten-minute reading path

1. **Two minutes.** Read "What the project is" above, then the first section of chapter 01.
2. **Three minutes.** Read the phase steps in chapter 01 under "One summary, from the click to the screen".
3. **Three minutes.** Read decisions 2, 4 and 7 in chapter 04 and say each one aloud.
4. **Two minutes.** Read the questions on the first run, the missing graphics support, Gemini, the 1B model's quality and what was not tested, in chapter 06.

## The five things to remember

1. **The model runs on the laptop.** The page text stays on the computer. The network is used only for the first download, which the popup reports as about 695 MB for Llama 3.2 1B (about 204 MB for SmolLM2 360M).
2. **Speed depends on the graphics chip.** In the saved clean runs the NVIDIA RTX 3050 wrote 34 to 53 tokens a second. The built-in Intel chip uses a smaller model, writes 4 to 5 tokens a second, and took 199.2 s for a short article on first use. A long Wikipedia article takes 10 to 12 minutes there (616.4 s in the saved run with the current code), and the summaries from that article are not reliable.
3. **The first use is slow.** In the clean NVIDIA run the download took 158.3 s, the load 3.8 s and the warm-up 30.5 s. Later, the same short article took 15.3 s with the outside websites blocked.
4. **Summary quality was not scored.** Some saved outputs show faults, such as a summary that starts with the page's marker text. That output was recorded before the marker fix. Say that the quality was read, not measured.
5. **Some things are not verified.** The client's laptop, the visible daily Chrome, `setup.bat --gpu` on a real Chrome, and any language other than English.

*If asked about evidence, say: "The numbers come from the saved clean runs and the pretend-model scenarios. The repository does not score summary quality."*


<div style="page-break-after: always"></div>

# How Version 2 works, step by step

*Purpose: this chapter follows one summary from the button press to the text on the screen, for the first use and for later use, and explains in plain terms what the graphics card does.*

This chapter names the file that does each step, so you can find the code when a tutor asks. Read it once slowly, then say the walkthrough aloud without notes.

## The parts

The extension has seven parts. Each one has a single job.

- **The popup** is the small window that opens when you click the toolbar icon. It shows the button, the model line, the progress and the summary. It does not run the model.
- **The service worker** is a background script that Chrome runs for the extension. It owns the job, and it keeps running when the popup closes.
- **The offscreen page** is a hidden page that Chrome lets an extension open for a heavy task. It holds the loaded model. It has no window, so you never see it.
- **The web worker** is a second background thread, started by the offscreen page. The model's heavy work runs there, so the offscreen page stays responsive.
- **WebLLM** is the open-source library, copied into the project as one file (`src/lib/web-llm.js`), that loads the model and runs it.
- **The graphics card** does the arithmetic. The extension reaches it through WebGPU, a browser feature.
- **Storage** holds three kinds of data: the job record (session storage, cleared when the browser closes), the settings and the model choice (local storage), and the model files (IndexedDB, which stays).

![Layers of Version 2: the popup and service worker at the top, the offscreen page and its web worker holding WebLLM, WebGPU on the graphics card at the bottom, and the three stores beside them](../figures/V02_layers.png)

Reading the figure: read it from the top. The popup starts a job with START_SUMMARY, and the service worker owns the job. It sends LOCAL_* messages to the offscreen page, which keeps the model loaded and closes after five minutes idle. The offscreen page passes work to the web worker, which calls WebLLM, which sends shader programs to WebGPU on the card. The web page is read by an injected script. On the right, chrome.storage.local holds the settings, chrome.storage.session holds the job record, and IndexedDB holds the model files (about 695 MB).

## First use: the model is not on the computer yet

The first time, the popup says "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." and the button says "Download model and summarize". Pressing it runs these steps.

1. **The page is read.** The popup sends `START_SUMMARY`. The service worker writes a job record and starts the pipeline, which reads the page text (`extractFromTab`).
2. **The graphics card is checked.** The service worker asks the offscreen page for the card's status (`LOCAL_STATUS`). The page asks Chrome for a WebGPU adapter and checks that it has the `shader-f16` feature. It also checks whether the model is already stored. If the card is built into the processor (Intel), the engine chooses the smaller model, SmolLM2 360M, and the popup shows a one-line note.
3. **The model is downloaded.** The offscreen page asks WebLLM to load the model (`LOCAL_LOAD`). The model is not stored, so WebLLM downloads its files and saves them in IndexedDB. The popup shows "Downloading the model (first time only): n%".
4. **The model is loaded into the graphics card.** WebLLM copies the model's numbers into the card's memory. The popup shows "Loading the model into the graphics card: n%".
5. **The model is warmed up.** The first answer makes the card compile its small programs, which is slow. The extension does this with one short prompt before any real page is sent, and shows "Warming up the model (first time can take about 30 seconds)...".
6. **The parts are summarized, one by one.** See the walkthrough below.

The clean first-use run on the NVIDIA card (`v2-local-nvidia-cold-first-attempt.md`) has these phases for a short article of 1,711 characters.

| Phase | Start (s) | End (s) | About |
|---|---|---|---|
| Read and check | 0 | 0.5 | 0.5 s |
| Download | 0.5 | 158.8 | 158.3 s |
| Loading into the card | 158.8 | 162.6 | 3.8 s |
| Warm-up | 162.6 | 193.1 | 30.5 s |
| Writing the summary | 193.1 | 196.8 | 3.7 s |

The total was 196.8 s. Figure V09 below draws the same segments.

![First use as one timeline: a 158.3 s download, a 3.8 s load into the card, a 30.5 s warm-up and a 3.7 s summary, total 196.8 s](../figures/V09_cold_timeline.png)

Reading the figure: the bar runs from 0 to about 197 seconds. The long box is the download, from 0.5 s to 158.8 s, and it is most of the wait. The load, the warm-up and the summary follow in order at the right. The footnote says that a "Loading 0%" line at 5.1 s, during the download, is not drawn, because the repository does not explain it.

## Later use: the model is already stored

Later, the popup says "Model: Llama 3.2 1B. Downloaded, runs on this computer." and the button says "Summarize this page". There is no download, and the job starts the same way. The clean offline run (`v2-local-nvidia-offline.md`) has these phases for the same short article, with the outside websites blocked.

| Phase | Start (s) | End (s) | About |
|---|---|---|---|
| Loading from the browser's stored copy | 1.3 | 7.6 | 6.3 s |
| Warm-up | 8.1 | 8.6 | 0.5 s |
| Writing the summary | 8.6 | 15.3 | 6.7 s |

The total was 15.3 s. The saved load time, 6,890 ms, runs from the start of the load to the end of the warm-up, as the code measures it. This run was made before a label fix, described under "What changed after review". It has a "Downloading the model (first time only): 0%" line at 3.9 s, although the model was stored. The repeat run after the fix (`v2-local-nvidia-offline-after-label-fix.md`) has no such line. It gave 17.7 s for the short article, a load of 11.6 s, and a first answer written at 65 tokens a second. Use the 15.3 s figure for timings, and say that it was measured before the fix.

The warm-up took half a second here, against about 30 s on first use. The repository does not say why. Treat "the card had already compiled its programs" as a likely reason, not a measured one.

![First use and later use as two sequence diagrams, with the measured times as labels](../figures/V03_first_run_vs_cached.png)

Reading the figure: the upper sequence is the first use. The popup presses the button, the service worker asks the offscreen page for the status ("not stored"), the download and save take 158.3 s, the load into the card 3.8 s, the warm-up about 30 s, and the summary 3.7 s. The lower sequence is later use. The status is "stored", the page reads the model files, the load and warm-up take 6.9 s and the summary 6.7 s. The footnote states that the warm-up was 30.5 s on first use and 0.5 s in the later run, and that the reason is not measured.

![Screenshot, real model, NVIDIA card, first use: the popup in the middle of the download at 32 percent](../screenshots/v2-nvidia-short-downloading.png)

Caption: real model, NVIDIA card, first use. The popup shows the title "How a Lighthouse Lens Works", the button "Download model and summarize" greyed out while the job runs, the model line "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only).", and the progress line "Downloading the model (first time only): 32%".

## One summary, from the click to the screen

This walkthrough is the same for first use and later use. The download and warm-up steps are used only when they apply.

1. **You open the popup.** The popup asks the service worker for the model state (`GET_MODEL_STATE`). The service worker checks the card and the stored copy, and the popup shows the model line and the button text (`popup.js`).
2. **You press the button.** The popup sends `START_SUMMARY` with the tab number and waits for the reply. It does not call the model itself.
3. **The service worker starts a job.** `startJob` in `src/background/service-worker.js` checks that no job for this tab is starting. It writes the record `job:<tab id>` into session storage with the phase "extracting", then answers "ok".
4. **The page is read.** `extractFromTab` in `src/background/extract-tab.js` places Readability and the page reader into the tab. Chrome's own pages and local files are refused with RESTRICTED_PAGE.
5. **The text is checked and cut.** `runPipeline` in `src/core/pipeline.js` refuses text under 200 characters (TOO_LITTLE_TEXT). `chunkText` cuts the text into parts of at most 6,000 characters. A page that needs more than 12 parts is refused (TOO_LONG). Both refusals happen before any model step, so no download starts.
6. **The model is prepared.** The pipeline calls `engine.prepare()`. The steps are the ones under "First use", or the shorter ones under "Later use".
7. **Each part is summarized.** For a page of one part, the engine writes a summary of at most 320 tokens. For a longer page, each part gets a short summary of at most 300 tokens, and the popup shows "Summarizing part 3 of 7...". If WebLLM refuses a part because it does not fit the 4,096-token window, the part is cut in half at a paragraph or sentence break and each half is summarized, up to three levels deep. A page that was one part then becomes two parts and one merge request.
8. **The parts are merged.** If there was more than one part, the summaries are joined with one more model call, the merge step, which writes at most 320 tokens. The popup shows "Combining 7 summaries...".
9. **The job is marked done.** The service worker writes the summary, the title and the stats into the job record. The stats are the number of parts and requests, the model's name, the graphics card's vendor, the load time and the decode speed.
10. **The popup shows the result.** `popup.js` redraws when the record changes. It formats the summary with `summary-format.js`, which builds the text with `textContent`, so the model's words are shown as text and never run as HTML. If the smaller model wrote the summary after the main one failed, a notice appears above the summary (described below). The line under the summary reads, for example, "7 parts · 8 requests · 101.2 s · Llama 3.2 1B".
11. **You close the popup.** The job keeps going. Reopening the popup on the same page reads the same record.

Each model call uses the same route. The service worker calls `send` in `src/background/offscreen-manager.js`. The manager creates the offscreen page on first use and forwards the message. The offscreen page (`src/offscreen/offscreen.js`) answers through its engine, which sends the work to the web worker (`engine-worker.js`) and returns the text. Model calls are queued, so only one generation runs at a time, because the card does one job at a time.

![The phases of a job in order, as the popup shows them: reading, checking, the skipped download, loading, warm-up, summarizing, combining, and done or error](../figures/V06_job_phases.png)

Reading the figure: the phases run from top to bottom. The dashed "Downloading (first time only)" box is skipped on later use, with an arrow that goes straight to "Loading into the graphics card". The footnote says that later use is meant to skip the dashed step, that one offline run showed its line for about 1 s before the label fix, and that TOO_LITTLE_TEXT and TOO_LONG stop the job before the model is used.

![Screenshot, real model, a result: the finished summary and the stats line](../screenshots/ui-07-result.png)

Caption: pretend model, not the real one. The popup shows a summary with three numbered points and the stats line "1 part · 1 request · 0.2 s · Llama 3.2 1B". The points and the 0.2 s are the fake model's output. The popup code and the layout are the real ones.

## What the offscreen page keeps alive

The model takes seconds to load, so it should not be lost when the service worker sleeps. Three rules do this.

- **Keepalive.** While the offscreen page is working, it sends `KEEPALIVE` to the service worker every 10 seconds (`beginWork` in `offscreen.js`). The interval stops when the work ends. Each message also refreshes the update time of every running job record (the `KEEPALIVE` listener in `service-worker.js`), so one long answer is not shown as dead.
- **In-flight count.** The manager counts the messages that have been sent and not answered (`inFlight`). The page is never closed while that count is above zero, so a quick status check cannot cut off a running load.
- **Idle close.** When the last message finishes, the manager starts a five-minute countdown (`idleCloseMs`, 300,000 ms in `config.js`). If no work arrives in that time, the page closes and the model leaves the card's memory. The stored files stay in IndexedDB, so the next use loads the model again without a download.

The clean Intel runs show the rule working. The long article started about six seconds after the short one ended. Its timeline has no loading or warm-up lines, because the model was still in memory.

## The graphics card in simple terms

A language model is a large set of numbers, called weights. The 1B model stores about one billion of them, in 4-bit form, in files of about 695 MB. A summary is made one token at a time, and each step multiplies the new token against the weights. The graphics card is built to do many multiplications at once, so the work runs there and not on the processor.

Two phases make up each answer. The first is **prefill**: the model reads the whole prompt. The DEVLOG records about 600 tokens a second for this, from an early speed test that was not saved as a run file. The second is **decode**: the model writes its answer one token at a time, and each token needs another pass through the model. The saved clean runs wrote 34 to 53 tokens a second on the NVIDIA card. The same speed test recorded about 63 tokens a second for writing, which is above the saved range, and the record does not say which text was used.

![How the model writes: the prompt is read in one pass, then one token is written per step, with the measured speeds labelled](../figures/V15_how_a_model_writes.png)

Reading the figure: the boxes run from the page text, to the prompt, to reading (prefill), to writing (decode), to the summary. The row of small squares is one square per token written. The panel at the bottom gives the saved clean values (34 to 53 tokens a second, each the last request of its job), and labels the 63 and 600 figures as the DEVLOG speed test, with no saved file.

The card runs small programs called shaders. Before the first answer, those programs must be compiled for this model. That is the warm-up, which took 30.5 s in the cold NVIDIA run and about 39 s in the first Intel run.

The same model can behave very differently on two chips. Before Chrome was started with the flag for the separate card, the built-in Intel graphics wrote about 2 tokens a second with the 1B model, in the speed test. That is why the extension checks the chip first and switches to the smaller model when it finds the built-in chip.

## The numbers from the clean runs

Only three runs were done on a quiet laptop, and they are the basis for the timings in this chapter. The other runs were done while other programs were using the processor, and the test-run files label them that way. A later offline repeat, made after the label fix, is also listed.

| Case | Chip | Model | Total (s) | Parts and requests | Writing speed (tokens/s) |
|---|---|---|---|---|---|
| Short article, first use | NVIDIA RTX 3050 | Llama 3.2 1B | 196.8 | 1 part, 1 request | 47 |
| Long article, stored, offline | NVIDIA RTX 3050 | Llama 3.2 1B | 16.5 | 2 parts, 3 requests | 42 |
| Wikipedia Lighthouse, stored | NVIDIA RTX 3050 | Llama 3.2 1B | 74.1 | 7 parts, 8 requests | 34 |
| Short article, first use | Intel built-in | SmolLM2 360M | 199.2 | 1 part, 1 request | 4 |
| Long article, stored | Intel built-in | SmolLM2 360M | 149.1 | 2 parts, 3 requests | 5 |
| Wikipedia Lighthouse, current code | Intel built-in | SmolLM2 360M | 616.4 | 7 parts, 8 requests | 4 |

The Lighthouse article is cut into seven parts of at most 6,000 characters. Its parts start at 3.2, 7.8, 17.0, 22.5, 30.1, 38.1 and 54.7 seconds, the merge starts at 60.2 seconds, and the total is 74.1 seconds.

![Seven-part example: the Lighthouse article cut into parts, each summarized, then merged in one request, with the measured timeline of 74.1 seconds](../figures/V16_chunking_v2.png)

Reading the figure: the article of 36,752 characters becomes seven parts, each at most 6,000 characters. Each part is summarized, and the seven summaries go into one merge request. The timeline beneath is from the clean NVIDIA run: the start 3.2 s, the parts from 4.6 s to 5.5 s each, the longest part 16.6 s, and the merge 13.9 s. The total is 74.1 s, with eight requests in all.

## When something fails

Every failure becomes a code, defined in `src/core/errors.js`, with a plain message for the popup. The technical detail goes to the console. For the two vague messages, SERVICE_ERROR and MODEL_LOAD_FAILED, the popup also shows a "Technical detail" line with the first 240 characters of the detail, so the message is not a dead end. Some failures stop before any model step (too little text, too long, restricted page). Others happen inside the model step. Figure V11 lists each code with its message, and chapter 03 gives the messages as the popup shows them.

![Error codes with what causes them and the exact message, coloured by what the extension does next](../figures/V11_error_flow.png)

Reading the figure: the yellow rows (GPU_MEMORY and MODEL_LOAD_FAILED) are retried once with SmolLM2 360M before the message is shown. The red rows stop the job and show their message. The grey rows are refused early or are not shown. CANCELLED is never shown to the user. The figure predates two changes of 24 October: it has no CONTEXT_TOO_LONG row, and its TIMEOUT row says 3 minutes, while the limit is now 10 minutes.

If Chrome stops the service worker in the middle of a job, the next worker start marks the old record as INTERRUPTED (`sweepOrphans`). A job counts as dead after five minutes without an update, in both the service worker and the popup. If the tab moves to another page, the old job is aborted and its later writes are dropped.

## What changed after review

A code review found the faults below. Each one is fixed in the code, and the DEVLOG rows dated 21 October tell the story.

- **Wrong label for a stored model.** The popup said "Downloading the model: 0%" for about 0.8 s on a stored model, because any WebLLM text containing "fetch" was treated as a download. The offscreen page now checks the stored copy first, so a stored model is always "loading". A unit test covers it.
- **Copied markers.** A small model copied the page's start marker into its answer on the Intel chip. `stripPageMarkers` in `prompts.js` removes the markers from every answer. The recorded Intel output and its screenshot were made before this fix, so they still show the marker.
- **Silent fallback.** When the main model ran out of memory, the small model wrote the summary and nothing on the screen said so. Now a finished summary made by the smaller model after a memory or load failure shows the notice "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The model line is also refreshed once when any job ends, so it no longer shows a stale "Not downloaded yet" after both models fail.

![Screenshot, pretend model: the popup after the main model ran out of memory, with the smaller-model notice above the summary](../screenshots/ui-12-fallback-after-out-of-memory.png)

Caption: pretend model, not the real one. The main model is set to run out of memory, so the small one answers. The popup shows the notice, the model line "Model: SmolLM2 360M. Downloaded, runs on this computer.", and the stats line. The 2.3 s is the fake's timing. The popup shows the notice only after a memory or load failure, not for the built-in graphics case, which has its own note.

- **Idle close during a message.** The page could be closed while a load was still running. It is now closed only when no message is in flight.
- **Stale limit.** A job was marked dead after three minutes, the same as the 180-second answer limit, so a slow answer could look interrupted while still running. The dead-job limit is now five minutes in the service worker and the popup. The answer limit was changed on 24 October (see the next section).

## What changed after the real-Chrome failure (24 October 2026)

The project owner ran the extension in the real Chrome on the developer's laptop, which has the Intel chip, so SmolLM2 was in use. On the Wikipedia "Lighthouse" page the popup said "Something went wrong inside the extension. Try again." with no reason. A hidden run of the same case failed with TIMEOUT: part 6 of 7 had not answered 180 seconds after it started. The DEVLOG row dated 2026-10-24 tells the story. The changes were these.

- **Answer limit 10 minutes.** `generateTimeoutMs` is now 600,000 ms in `config.js`. On the Intel chip the parts of that article took 76 s, 127 s, and then more than 180 s. The TIMEOUT message is unchanged.
- **Halving.** WebLLM refuses a prompt that does not fit its 4,096-token window with the text "Prompt tokens exceed context window size". That text is now mapped to a new code, CONTEXT_TOO_LONG (15 codes in all). `summarizeChunk` in `local.js` cuts the part in half and summarizes each half, up to three levels deep and never for text under 600 characters. `stats.halvedParts` counts the cut parts. In the saved real run with the current code no part overflowed, so halving did not trigger there. It is covered by four unit tests and browser scenario V25.
- **Heartbeat.** KEEPALIVE now also refreshes the update time of every running job. A single answer longer than five minutes therefore does not show as interrupted.
- **Technical detail.** For SERVICE_ERROR and MODEL_LOAD_FAILED the popup shows the first 240 characters of the technical detail, so the vague message says something. Scenario V27 checks it.
- **Real-run script.** `scripts/local-run.mjs` now deletes the profile's Service Worker and Code Cache folders before launching. A persistent profile had kept an old service-worker script, so the new `halvedParts` stat was missing from one real run.

Timings on the Intel chip for the Lighthouse article, with the model stored, were these. The first try with the old code failed at 615.6 s. A second try with the same old code, after the stale script was cleared, finished in 704.5 s. The run with the current code finished in 616.4 s, with part times of about 66 to 121 seconds. Answer times on this chip vary a lot. The old-code second try, which finished in 704.5 s, produced a summary with invented facts. Those facts are not repeated here and must not be quoted as facts. The summary of the current run is three short, generic points. Its counts (14,700 lighthouses, 54 diagrams and 651 photographs) were not checked against the page, so it is not a reliable summary either.

## What still holds (limits, not fixed)

- `modelOverride` is never cleared. Once the small model is saved, it stays until the stored settings are cleared.
- Closing the tab during a download does not stop the download, because `prepare()` ignores the abort signal.
- The model line is not refreshed while a download or warm-up is running.
- Built-in graphics detection recognises Intel only.
- The warm-up was about 30 s on first use and 0.5 s in the stored offline run, and the cause is not measured.
- The TIMEOUT path has no automated scenario, because the pretend model has no timeout.
- A long page on the Intel chip takes 10 to 12 minutes, and its summaries are not reliable. The old-code run invented facts, and the current run's counts were not checked.

## What this means in plain words

The popup only shows. The service worker owns the job and keeps the notes in storage. The offscreen page holds the model, and its hidden web worker does the heavy arithmetic on the graphics card. A model is a large set of numbers. The first use is slow because the file has to be downloaded, copied to the card and compiled. Later use is faster, because the file is kept and the card is only asked to write the answer.


<div style="page-break-after: always"></div>

# The modules, one by one (Version 2)

*Purpose: this chapter lists every source file in `finalsem/project/src`, the scripts and the main root files, says what each one is for, names its main functions, gives the answer to give if a tutor asks, and says what breaks if the file is removed.*

The line numbers quoted here are the numbers in the files as they are now. If you edit a file, the numbers move. Each file carries one of three labels, from a comparison with the Version 1 folder (`midsem/project`):

- **Reused** means the file is byte-for-byte the same as in Version 1.
- **Changed** means the file exists in both versions, with edits.
- **New** means the file has no Version 1 counterpart.

## The map

| File | Label | One-line purpose |
|---|---|---|
| `src/ui/popup.html` | Changed | The popup's layout: button, model line, progress, notice, summary |
| `src/ui/popup.js` | Changed | Shows the job record, starts a job, refreshes the model line |
| `src/ui/ui.css` | Changed | The printed-page style, with the old key-box rules removed |
| `src/ui/summary-format.js` | Reused | Turns the summary text into paragraphs and points |
| `src/background/service-worker.js` | Changed | Owns the job, writes the record, handles tab events |
| `src/background/extract-tab.js` | Reused | Checks the tab's address and places the page reader |
| `src/background/offscreen-manager.js` | New | Creates, talks to and closes the offscreen page |
| `src/offscreen/offscreen.html` | New | The page Chrome opens to hold the model; loads `offscreen.js` |
| `src/offscreen/offscreen.js` | New | Answers status, load and generate requests with WebLLM |
| `src/offscreen/engine-worker.js` | New | Starts WebLLM's handler inside a web worker |
| `src/offscreen/mock-engine.js` | New | The pretend model for the browser tests |
| `src/engines/local.js` | New | The engine the pipeline calls, with the same two functions as V1's engine |
| `src/core/gpu-check.js` | New | Decides whether the card is usable, which model fits, and the progress phase |
| `src/core/engine-errors.js` | New | Turns WebLLM's error text into one of our codes |
| `src/core/pipeline.js` | Changed | Runs the steps of one job in order |
| `src/core/chunker.js` | Reused | Cuts the text into parts at natural breaks |
| `src/core/merger.js` | Reused | Joins part summaries, in groups if needed |
| `src/core/prompts.js` | Changed | The instructions sent to the model, and the marker stripper |
| `src/core/url.js` | Reused | Decides whether two addresses are the same page |
| `src/core/config.js` | Changed | Models, sizes, limits, and stored overrides |
| `src/core/errors.js` | Changed | The error codes and their plain messages |
| `src/content/extract.js` | Reused | Copies the page's main text inside the page |
| `src/lib/readability.js` | Reused | The Readability library, one file, Apache-2.0 |
| `src/lib/web-llm.js` | New | The WebLLM library, one file, Apache-2.0 |
| `manifest.json` | Changed | Names the extension, its files and its permissions |
| `setup.bat`, `run.bat` | Changed | Check the computer, then open Chrome's extension page |
| `scripts/*` | New or changed | Checks, the graphics-card setting, the measurement script |

Three Version 1 files are gone: `src/engines/gemini.js`, `src/ui/options.html` and `src/ui/options.js`. The key box and the options page went with the cloud engine.

## 1. The popup

### `src/ui/popup.js` (changed)

**Purpose.** The popup is the window that opens from the toolbar. It shows what the job record says and starts a job. It never runs the model.

**Main functions.** `getTargetTab` (line 36) finds the active tab. `vendorName` (line 53, exported) turns "intel" into "Intel" for the note. `renderModelState` (line 58) writes the model line and sets the button text. `loadModelState` (line 97) asks the service worker for the model state. `refreshModelLineOnce` (line 83) reloads that state once when a job ends. `switchNotice` (line 90) returns the notice text for a summary made by the smaller model after a memory or load failure. `progressLabel` (line 128) turns a job's phase into a sentence. `render` (line 157) draws the job, and for SERVICE_ERROR and MODEL_LOAD_FAILED it fills the "Technical detail" line with the first 240 characters of the detail (line 195). `init` (line 211) runs when the popup opens. A `chrome.storage.onChanged` listener redraws when the record changes, and a timer redraws every few seconds, so a job whose worker has died is marked stale. `STALE_MS` (line 30) is five minutes.

**What to say if asked.** "The popup is a display. It does not hold the work, so closing it cannot stop a summary. It redraws from the record in session storage, and it refreshes the model line after every job."

**What breaks if removed.** Nothing would show. The job would still run, but the user would see no button, no progress and no summary.

### `src/ui/popup.html` and `src/ui/ui.css` (changed)

**Purpose.** The layout and the printed-page style that Version 1 used. The popup has no key box in Version 2. A result notice element, `#result-notice`, sits above the summary, and an error-detail element, `#error-detail`, sits under the error message. The stylesheet no longer carries the key-box and options-page rules, which were dead code.

**What breaks if removed.** The popup would show unstyled text. The logic would still work.

### `src/ui/summary-format.js` (reused)

**Purpose.** Turns the summary text into paragraphs and points. A line that starts with a dash becomes a point.

**What to say if asked.** "The model's words are shown as text. The formatter never builds HTML from them, so markup in an answer cannot run."

**What breaks if removed.** The summary would show as one block of plain text.

## 2. The service worker and the page reader

### `src/background/service-worker.js` (changed)

**Purpose.** It owns the job. It starts the job when the popup asks, runs the pipeline, writes progress and the result to session storage, and cleans up when a tab closes or the worker restarts.

**Main functions.** `writeJob` (line 34) writes a patch to the record, but only if the record still has this job's id. `makeEngine` (line 52) builds the local engine from the settings. `runJob` (line 63) runs the pipeline. `startJob` (line 110) creates the record and answers the popup. `getModelState` (line 156) answers `GET_MODEL_STATE`. The `KEEPALIVE` listener (line 188) refreshes the update time of every running job (line 192), so one long answer is not shown as dead. The `tabs.onRemoved` listener (line 198) removes the record after the writes queued for that tab. `sweepOrphans` (line 211) marks an old running job as INTERRUPTED. `STALE_MS` (line 23) is five minutes.

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

*Source: `src/background/service-worker.js`, lines 34 to 44.*

**What to say if asked.** "Every write is queued per tab and checked against the job id, so a late write from an old job cannot bring back a record. A closed tab's record is removed after its queued writes. That is what scenario V22 tests."

**What breaks if removed.** No job would start, and the popup would never get a result.

### `src/background/extract-tab.js` (reused)

**Purpose.** It refuses addresses Chrome does not let extensions read, then places Readability and the page reader into the tab.

**What to say if asked.** "Chrome's own pages, the Web Store and local files are refused with RESTRICTED_PAGE before any model step."

**What breaks if removed.** The job could not read any page, so every summary would fail.

## 3. The offscreen page and the model host

### `src/background/offscreen-manager.js` (new)

**Purpose.** It is the only code in the service worker that talks to the offscreen page. It creates the page on first use, sends the messages, and closes the page when it has been idle.

**Main functions.** `pageUrl` (line 20) adds `?mock=` for the test seam. `ensure` (line 32) creates the offscreen page once. `inFlight` (line 18) counts the messages sent and not yet answered. `send` (line 62) counts the message, forwards it and queues generation requests in `generateChain`. `scheduleIdleClose` (line 48) starts the countdown. `close` (line 54) returns at once while any message is in flight. `onProgress` and `emitProgress` pass the download and loading progress to the job.

**What to say if asked.** "Chrome allows one offscreen page at a time. The manager keeps it open while a message is running, and it closes it after five minutes with no work. The countdown starts when the last message finishes."

Figure V05 shows the messages between the two pages.

![The messages between the service worker and the offscreen page: LOCAL_STATUS, LOCAL_LOAD with MODEL_PROGRESS, LOCAL_GENERATE, KEEPALIVE every 10 s, and the idle close](../figures/V05_offscreen_messages.png)

Reading the figure: the service worker sends LOCAL_STATUS and gets back the card, whether the model is stored, and its size. It sends LOCAL_LOAD, and the offscreen page reports MODEL_PROGRESS many times. It sends LOCAL_GENERATE and gets back the text and the stats. KEEPALIVE comes back every 10 seconds while work runs. Since 24 October each KEEPALIVE also refreshes the update time of the running job records in the service worker, which the figure does not show. The footnote names the two files.

**Note on the figure's idle box.** The box says that each message restarts the five-minute timer. The code clears the timer on every send and starts the countdown only when the in-flight count returns to zero, so the sentence to use is the code's version.

**What breaks if removed.** The service worker would have no way to reach the model. Every call would fail with SERVICE_ERROR.

### `src/offscreen/offscreen.html` and `offscreen.js` (new)

**Purpose.** `offscreen.html` is the page Chrome opens for the offscreen document. It loads `offscreen.js`. `offscreen.js` owns the model. It has the real engine (`realEngine`) and the message router. It sends `KEEPALIVE` every ten seconds while it is busy, and `MODEL_PROGRESS` while it downloads or loads.

**Main functions.** `realEngine.status` (line 77) checks the card, whether the model is stored (`hasModelInCache`, line 81), and the download size. `realEngine.load` (line 97) checks the stored copy again (line 103), creates the web worker, loads WebLLM, and warms the model up with one short prompt. `realEngine.generate` (line 125) sends one prompt and times it out after `generateTimeoutMs`. `beginWork` and `endWork` (lines 28 and 34) run the keepalive. Line 20 sets the cache to IndexedDB: `const APP_CONFIG = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' };`.

Figure V04 shows the steps the engine takes around this page.

![The steps of prepare(): card check, model choice, load with download when needed, warm-up, and the error branch with its single retry](../figures/V04_model_preparation.png)

Reading the figure: prepare() is called by the pipeline. It asks the offscreen page for the card's status. If WebGPU or shader-f16 is missing, the job stops and the popup says why. Otherwise the model is chosen: Llama 3.2 1B, unless integrated graphics, under 8 GB of memory, or a saved fallback picks SmolLM2 360M. The load downloads the model if it is not stored. A GPU_MEMORY or MODEL_LOAD_FAILED error saves the fallback and retries once with SmolLM2. Any other error stops with its message. The warm-up is a one-token answer, about 30 s the first time. The footnote gives the sizes: Llama about 695 MB, SmolLM2 about 204 MB. The figure predates the halving step (a part that is refused for size is cut in half inside `summarizeChunk`, not here) and the new code CONTEXT_TOO_LONG. Its warm-up note still holds.

**What to say if asked.** "Cache Storage failed inside this page during the spike, and IndexedDB worked. That is why the model is in IndexedDB. The page checks the stored copy before the load, so a stored model is never labelled as a download."

**What breaks if removed.** No model would load or run. The pretend model in `mock-engine.js` would be the only thing left.

### `src/offscreen/engine-worker.js` (new)

**Purpose.** Seven lines. It creates WebLLM's handler inside a web worker and passes messages to it.

**What to say if asked.** "The heavy arithmetic runs in a web worker, so the page that holds the model stays free to answer messages."

**What breaks if removed.** WebLLM would run on the offscreen page itself, which could block its message handling during a long answer.

### `src/offscreen/mock-engine.js` (new)

**Purpose.** A pretend model for the browser tests. It answers from fixed text and can fail on purpose. The modes are `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html`, `slow`, `longprompt` (refuses a prompt over 3,500 characters the way WebLLM refuses an oversized prompt) and `crash` (every answer fails with SERVICE_ERROR and a technical detail). That is twelve modes. Its download sizes (664 MB and 300 MB) are fixed numbers, not measurements.

**What to say if asked.** "The browser scenarios use it so that failures can be forced on purpose. A real model cannot be made to fail on demand. The pretend model proves the extension's logic, and the real-model runs prove the real thing."

**What breaks if removed.** The 29 browser scenarios could not run. The real extension would be unchanged.

## 4. The engine and the graphics-card checks

### `src/engines/local.js` (new)

**Purpose.** The engine the pipeline calls. It has the same two functions as Version 1's cloud engine, `summarizeChunk` and `mergeSummaries`, and one more, `prepare`. It does not touch the model itself. It sends messages to the offscreen page.

**Main functions.** `call` (line 26) sends one message and turns a failed reply into an `AppError`. `generate` (line 38) sends `LOCAL_GENERATE`, rejects an empty answer (EMPTY_ANSWER), and removes any copied page markers from the answer (`stripPageMarkers`, line 46). `checkStatus` (line 65) asks for the card's status and switches to the small model on integrated graphics. `prepare` (line 77) checks, downloads and loads. If the load fails with GPU_MEMORY or MODEL_LOAD_FAILED, it saves the fallback choice and tries once with SmolLM2 (`RETRY_WITH_FALLBACK`, line 19). `summarizeChunk` (line 97) summarizes a part, and halves it when WebLLM refuses it for size (see below).

The integrated-graphics switch is the most important few lines:

```js
    async checkStatus() {
      let status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      if (status.gpu?.integrated && engine.model.id === MODELS.primary.id && !settings.modelOverride) {
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = 'integrated-graphics';
        status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      }
      engine.status = status;
      return status;
    },
```

*Source: `src/engines/local.js`, lines 65 to 74.*

Halving was not built at first. It was added on 24 October, after the real-Chrome failure. When a part raises CONTEXT_TOO_LONG, `summarizeChunk` calls `chunkText` on the part with a limit of half its length plus 100 characters. Each half is summarized on its own. The recursion stops at `MAX_HALVING_DEPTH` (3 levels, line 15) and never applies to text under `MIN_HALVING_CHARS` (600 characters, line 16). A page that was one part therefore becomes two parts, and its pieces go into one merge request. A page with several parts keeps its pieces in order without a merge. Each cut increments `halvedParts`, which the job record keeps in its stats.

**What to say if asked.** "The engine keeps the same contract as the cloud engine, so the pipeline did not change. Its only extra step is `prepare`, which the pipeline calls once before the first part."

**What breaks if removed.** The pipeline would have no engine, and no summary could be made.

### `src/core/gpu-check.js` (new)

**Purpose.** Three pure functions. `evaluateGpu` (line 10) turns the card's facts into "usable" or one of two codes. `chooseModel` (line 25) picks the primary model unless the computer has less than 8 GB of memory, or an earlier load failed. `mapInitProgress(report, {cached})` (line 36) turns WebLLM's progress text into the phase "downloading" or "loading". A stored model is always "loading" (line 42).

**What to say if asked.** "The card rules are pure functions, so the Node tests can feed any case. A card without shader-f16 gives NO_SHADER_F16. A stored model is never labelled as a download."

**Limit to state honestly.** The memory rule reads `navigator.deviceMemory` in the service worker. The unit tests call `chooseModel` with a number. Nothing in the repository shows the rule working on a real low-memory laptop.

**What breaks if removed.** The extension could not tell a usable card from an unusable one, nor choose the smaller model.

### `src/core/engine-errors.js` (new)

**Purpose.** WebLLM throws plain errors with free text. `classifyEngineError` (line 10) reads that text and returns one of our codes: NO_SHADER_F16, NO_WEBGPU, GPU_MEMORY, MODEL_DOWNLOAD_FAILED, MODEL_LOAD_FAILED, SERVICE_ERROR or CONTEXT_TOO_LONG. The last one is matched from WebLLM's text "Prompt tokens exceed context window size" (line 13), so a part that is too big is no longer reported as a vague service error. The out-of-memory test matches `oom` only as a whole word (line 16), so a word such as "room" is not read as a memory error.

**Limit to state honestly.** At the load stage, any error text containing "cache" is counted as a download failure.

**What to say if asked.** "The library's errors are free text, so this file reads the words and maps them. It is a pure function, so it is tested in Node."

**What breaks if removed.** A real failure would show the generic message, not the specific one the user can act on.

## 5. The pipeline and its parts

### `src/core/pipeline.js` (changed, +6 lines)

**Purpose.** It runs one job in order: extract, check the length, cut, check the number of parts, prepare the model, summarize each part, merge, and build the result.

**Main functions.** `runPipeline` (line 28). Text under `settings.minTextChars` throws TOO_LITTLE_TEXT (line 34). `chunkText` cuts the text (line 38). More than `maxChunks` parts throws TOO_LONG (lines 40 and 41). The new block at lines 45 to 49 calls `engine.prepare` when the engine has one.

Figure V16 shows the order for a long page.

![A long page cut into parts, each summarized, then merged in one request, with the measured timeline of 74.1 seconds](../figures/V16_chunking_v2.png)

Reading the figure: a page of 36,752 characters is cut into seven parts of at most 6,000 characters. Each part is summarized, and the seven summaries go into one merge request. The timeline is the clean NVIDIA run: 3.2 s for the start, the parts from 4.6 s to 16.6 s each, and the merge 13.9 s, for 74.1 s in all and eight requests.

**What to say if asked.** "The two refusals come before the prepare step, so a page that is too short or too long never starts a download. Those are scenarios V04 and V06."

**What breaks if removed.** Nothing would run.

### `src/core/chunker.js` (reused)

**Purpose.** Cuts the text into parts of at most `maxChars`. In Version 2 the value is 6,000. It packs whole paragraphs first, cuts long paragraphs at sentence ends, then at spaces, and only cuts a word in the middle as a last resort.

**What to say if asked.** "Cutting at natural breaks keeps the sense of each part. The sizes are counted in characters, not in tokens."

**What breaks if removed.** Long pages could not be split, so they would exceed the model's window.

### `src/core/merger.js` (reused)

**Purpose.** Joins the part summaries. If they all fit, one call merges them. If not, the summaries are grouped, each group is merged, and this repeats until one is left.

**What to say if asked.** "The Lighthouse article's seven parts were merged in one level: eight requests in total, seven for the parts and one for the merge."

**What breaks if removed.** A multi-part page would have no final summary.

### `src/core/prompts.js` (changed)

**Purpose.** The instructions sent to the model. The page text comes first, between the markers `<<<PAGE TEXT START>>>` and `<<<PAGE TEXT END>>>`, and one fixed instruction follows it. `PROMPT_VERSION` is `v2.0`.

**Main functions.** `stripPageMarkers` (line 15) removes the two markers from an answer and tidies the blank lines, and `local.js` runs it on every answer. `buildSinglePrompt`, `buildChunkPrompt` and `buildMergePrompt` build the three prompts. The part prompt asks for 3 to 5 short sentences with no bullets. The merge prompt has no markers, because its input is the model's own text.

**What to say if asked.** "The markers say the page text is material, not orders. A small model sometimes copies them into its answer. The stripper removes them, and the instructions still cannot stop every factual slip."

**What breaks if removed.** The model would receive no instruction, or the wrong one, and every summary would be poor. Without the stripper, the markers would show in the popup again.

### `src/core/url.js` (reused)

**Purpose.** `samePage` ignores the part of an address after `#`. A link inside the same article counts as the same page.

**What breaks if removed.** A job would be dropped whenever the page's link changed slightly.

### `src/core/config.js` (changed)

**Purpose.** Every number that can be tuned, in one place. `MODELS` names the primary model `Llama-3.2-1B-Instruct-q4f16_1-MLC` with `vramMB: 879`, and the fallback `SmolLM2-360M-Instruct-q4f16_1-MLC` with `vramMB: 376`. `DEFAULTS` gives `chunkChars` 6,000, `minTextChars` 200, `maxChunks` 12, `maxTokensPart` 300, `maxTokensFinal` 320, `temperature` 0.2, `generateTimeoutMs` 600,000 (10 minutes, changed from 180,000 on 24 October), `idleCloseMs` 300,000 and `engineMode` `real`. `loadSettings` (line 45) merges stored overrides, but only for the keys in `STORAGE_KEYS`.

**What to say if asked.** "A 4,096-token window cannot take a long page at once, so each part is about 1,500 tokens of text. The temperature of 0.2 keeps answers close to the text."

**What breaks if removed.** Nothing would have a value to read. The whole extension depends on these settings.

### `src/core/errors.js` (changed)

**Purpose.** The fifteen error codes and their plain messages. CONTEXT_TOO_LONG was added on 24 October, with the message "A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page." It is shown only when halving also fails. `AppError` carries a code, a technical detail and a message. `describeError` gives the popup the code and the message, and the detail goes to the console.

**What to say if asked.** "The popup only sees codes and sentences, never a raw library error. A unit test checks that each code has a message."

**What breaks if removed.** Every failure would show as a raw technical string.

## 6. The page reader and the library

### `src/content/extract.js` (reused)

**Purpose.** It runs inside the page. It makes a copy of the page, runs Readability on the copy to find the article, and turns it into plain text. If the result is under 200 characters, it uses the visible text of the page when that is longer.

**What breaks if removed.** No text would be found, and every page would be refused as too little text.

### `src/lib/readability.js` and `READABILITY_LICENSE.md` (reused)

**Purpose.** Mozilla's Readability library, copied in as one file. The licence is Apache-2.0, as in Version 1.

### `src/lib/web-llm.js` and `WEBLLM_LICENSE` (new)

**Purpose.** The WebLLM library, copied in as one file with no bundler. The README and the decision record name version 0.2.86. The file's default `cacheBackend` is `"cache"`, and `offscreen.js` overrides it with `"indexeddb"`. The licence is Apache-2.0.

**What breaks if removed.** No model could be loaded or run.

## 7. The manifest, the set-up files and the scripts

### `manifest.json` (changed)

**Purpose.** Names the extension (Page Summarizer), its version 2.0.0, its popup and service worker, and its permissions. The permissions are `activeTab`, `scripting`, `storage`, `offscreen` and `unlimitedStorage`. The host permissions are Hugging Face (`huggingface.co`, `*.huggingface.co`, `*.hf.co`) and `raw.githubusercontent.com`. The content security policy allows `'wasm-unsafe-eval'`, which lets the extension page run WebAssembly code.

```json
  "permissions": ["activeTab", "scripting", "storage", "offscreen", "unlimitedStorage"],
  "host_permissions": [
```

*Source: `manifest.json`, lines 19 and 20.*

**What to say if asked.** "`unlimitedStorage` stops Chrome from deleting the model when disk space runs low. The Gemini address is no longer in the manifest."

**What breaks if removed.** Without `offscreen`, no model host could be created. Without `unlimitedStorage`, Chrome could delete the model under disk pressure.

### `package.json` (changed)

**Purpose.** Two test scripts: `npm test` runs the unit tests with `node --test "tests/unit/*.test.js"`, and `npm run test:e2e` runs the browser scenarios one at a time. The only development dependency is Playwright, `^1.64.1`.

### `setup.bat` (changed)

**Purpose.** Checks the computer and the files, then says "SETUP COMPLETE." and "Next step: double-click run.bat". Its switches are `--dev` (install the test tools), `--gpu` (set Chrome to the separate card) and `--reset` (delete `node_modules` and the setup marker). It runs `scripts/check-extension.ps1` and `scripts/check-computer.ps1`.

With `--gpu`, the script calls `set-chrome-gpu.ps1`. If that fails, setup prints "The graphics setting was NOT changed (see the message above). Setup goes on; the extension works without it, only slower." and carries on.

**What to say if asked.** "`--gpu` changes a Windows setting, so the script never does it unless the user types the switch. It can be undone with `set-chrome-gpu.ps1 -Remove`."

**What breaks if removed.** The client would have no guided install.

### `run.bat` (changed)

**Purpose.** Refuses to run unless `setup.bat` has finished. It copies the folder path to the clipboard, opens `chrome://extensions` and prints four steps. Chrome no longer loads an extension from a command-line flag on branded builds, so the Load unpacked step stays manual.

### `scripts/check-computer.ps1` (new)

**Purpose.** Prints the Windows version, the processor, the memory, the graphics chips (ignoring basic and virtual display adapters) and the free space on the system drive, as "Free space on drive C: ... GB". It warns when the free space is below 3 GB, the default `MinFreeGB`.

### `scripts/set-chrome-gpu.ps1` (new)

**Purpose.** Writes one value under `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`, named after Chrome's path, with the value `GpuPreference=2;`. That is the same setting as the Windows Graphics page, and it affects only the current user. `-ChromePath` is optional: the script looks for Chrome in the three usual install folders and in the App Paths registry key. So `powershell -File scripts\set-chrome-gpu.ps1 -Remove` works as the README shows. `-RegistryPath` lets the test setup use a throw-away key.

**What to say if asked.** "It is opt-in, it needs no administrator rights, and it can be undone with one command."

### `scripts/local-run.mjs` (new)

**Purpose.** The measurement script. The modes are `nvidia` (cold start on the separate card), `nvidia-offline` (outside sites blocked), `intel` (both Intel cases), `intel-wikipedia` (the long Wikipedia article, slow) and `intel-short`. Before launching, it deletes the profile's `Service Worker` and `Code Cache` folders, because a persistent profile had kept an old service-worker script. The downloaded model is not touched, since it lives in IndexedDB. It writes `docs/test-runs/v2-local-<mode>.json` and `.md`, and screenshots into `docs/screenshots`. Its header says the first run downloads about 660 MB.

**What to say if asked.** "Every real-model number in the test-run folder came from this script. It is slow and uses about 660 MB, so it is run on purpose, not in the tests."

### `scripts/check-extension.ps1` and `scripts/secret-scan.mjs`

`check-extension.ps1` is run by `setup.bat`. The Version 2 copy differs from the Version 1 copy. `secret-scan.mjs` looks through the repository for the Gemini key from Version 1 before a push. Version 2 has no key, so this is a leftover guard.

## 8. The tests

**Unit tests (`tests/unit`, six files, 76 tests).** `chunker.test.js` (10), `gpu-and-errors.test.js` (12), `local-engine.test.js` (25), `merger.test.js` (8), `pipeline.test.js` (7) and `small.test.js` (14). The chunker and merger tests are the same as in Version 1.

**Browser scenarios (`tests/e2e`, 29 scenarios).** `smoke.test.js` has the smoke scenario. `pipeline.test.js` has 28 scenarios: V01 to V27, with V18b. V25 covers the cut part, V26 the heartbeat and V27 the technical-detail line. They use the pretend model and run hidden. The helpers in `tests/helpers` start the fixture server and the extension. `tests/helpers/key.mjs` is a helper whose role was not read for this chapter, so it is not described here.

**Script checks (`tests/bat/test-bat-scripts.ps1`).** Fifteen checks, B1 to B10c, including the check that plain `-Remove` finds Chrome and undoes the setting, and that the setting stays on the throw-away key.

## What this means in plain words

Each file does one job. The popup shows, the service worker runs, the offscreen page holds the model, the engine asks the page, and the pipeline calls the engine in order. Eight files were changed from Version 1, nine are new, seven are the same as before, and three were removed with the cloud engine. A tutor who asks about a file should hear one sentence about its job, one file name with a line number, and one limit.


<div style="page-break-after: always"></div>

# How to run the extension and give the demo (Version 2)

*Purpose: this chapter takes you from a clean Windows computer to a working local summary, gives the demo script and the offline demo, lists the messages you may see with what to do, and shows how to run the tests and check the client's laptop.*

Do the steps yourself at least twice before the viva. Do the first model download at least a day before you need it, because it takes about three minutes on the developer's connection.

## What you need

| Item | What is needed | How to check |
|---|---|---|
| Windows | Windows 10 or 11 | `scripts\check-computer.ps1` prints the version |
| Chrome | Google Chrome 116 or newer | `setup.bat` reads the version |
| Graphics | A graphics chip that WebGPU can use, with `shader-f16` | `chrome://gpu` shows WebGPU; the popup says the card lacks 16-bit math if the feature is missing |
| Memory | Under 8 GB of memory uses the smaller model by rule | `check-computer.ps1` prints the memory |
| Disk | About 3 GB free (the model is about 695 MB) | `check-computer.ps1` prints the free space on drive C and warns below 3 GB |
| Internet | Only for the first model download | The popup's model line says "Downloaded" when it is done |

The developer's laptop is an Acer Aspire Lite with an Intel i5-12450H processor, 15.7 GB of memory, a built-in Intel graphics chip and an NVIDIA RTX 3050 with 6 GB. The clean real-model timings in this pack come from that laptop.

## Step by step on a fresh computer

1. **Get the project.** Clone or copy the whole folder. The README names the repository. Do not copy only some files.
2. **Check the computer (optional, recommended).** Open PowerShell in `finalsem\project` and run `powershell -File scripts\check-computer.ps1`. It prints the Windows version, the processor, the memory, the graphics chips and the free space, and says what to change.
3. **Run setup.** Double-click `setup.bat`. It looks for Chrome, checks the version, runs `scripts\check-extension.ps1` and `scripts\check-computer.ps1`, and ends with "SETUP COMPLETE." and "Next step: double-click run.bat". If it says "SETUP FAILED.", the window says what is missing, and the details are in `setup.log`.
4. **Run the launcher.** Double-click `run.bat`. It checks the setup record, copies the folder path to the clipboard, opens `chrome://extensions`, and prints four steps.
5. **Load the extension.** Turn on Developer mode, click Load unpacked, press Ctrl+V to paste the path, and click Select Folder. Pin Page Summarizer from the puzzle-piece menu.
5a. **Reload after any update.** When you pull new code, click the reload arrow on the Page Summarizer card on `chrome://extensions` before you test. Until you do, Chrome keeps running the code it loaded before, so the new behaviour does not appear.
6. **Check the graphics card.** Open `chrome://gpu`. The line WebGPU should say "Hardware accelerated". If the computer has two chips, see the next section.
7. **Make the first summary.** Open an article and click the icon. The popup says "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." and the button says "Download model and summarize". Press it. On the developer's laptop the first run took about 197 s. Later, the button says "Summarize this page".

![Screenshot, pretend model: the popup before the first download, with the button "Download model and summarize" and the model line "Not downloaded yet"](../screenshots/ui-01-not-downloaded.png)

Caption: pretend model, not the real one. The popup is the first-use state. The model line's "about 664 MB" is the fake model's number. The real popup reports about 695 MB for Llama 3.2 1B.

### If the computer has two graphics chips

Chrome often uses the built-in chip on a laptop with two. The extension then switches to the smaller model on its own, and the popup shows the note "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster."

![A laptop with two graphics chips: the built-in chip is the default and slow, and the Windows setting or setup.bat --gpu moves Chrome to the NVIDIA card](../figures/V17_two_graphics_chips.png)

Reading the figure: Chrome starts on the built-in Intel chip by default on this laptop, where SmolLM2 writes 4 to 5 tokens a second and a short article took 199.2 s on first use. The Windows setting or `setup.bat --gpu` moves it to the NVIDIA RTX 3050, where the saved clean runs wrote 34 to 53 tokens a second. The footnote says that the flag used in the test setup is not what a user gets.

To make Chrome use the stronger chip, do one of these.

- Run `setup.bat --gpu`. The script writes one value under `HKEY_CURRENT_USER` that affects only this Windows user. It is never run by default. If the script cannot change the setting, setup prints "The graphics setting was NOT changed" and carries on.
- Or do it by hand: Windows Settings, System, Display, Graphics, add Chrome, Options, High performance.

Then restart Chrome and check `chrome://gpu` again. To undo the script, run `powershell -File scripts\set-chrome-gpu.ps1 -Remove`. The script finds Chrome itself, so the plain command works.

## The viva demo

Run this once in the order shown, with the model already downloaded and an article open. The timings are from the saved clean runs. Your times will differ.

| Step | What to open or press | What to say |
|---|---|---|
| 1 | `chrome://extensions` with the card loaded | "Chrome loads this folder as an extension. There is no key to paste, and nothing is sent to a cloud service." |
| 2 | An article, then the icon | "The popup says the model is downloaded and runs on this computer. The button now says Summarize this page." |
| 3 | Press the button | "The popup only asks the service worker to start. The progress lines show the parts as they are done. The Lighthouse article took 74.1 s on the clean run, in seven parts." |
| 4 | Click on the article so the popup closes, wait five seconds, then open the icon again | "The job keeps running in the background. The popup reads the same stored record, so the progress is still there." |
| 5 | Point at the line under the summary | "It shows the parts, the requests, the seconds and the model. That is the evidence the popup can give." |
| 6 | Turn off Wi-Fi, then summarize a short article | "The summary is made from the copy on this computer. On the developer's NVIDIA card the short article took 15.3 s with the outside websites blocked." |
| 7 | `chrome://version`, then press Summarize | "Chrome does not let extensions read its own pages, so the job stops before any model step. The code is RESTRICTED_PAGE." |
| 8 | A page with only a sentence or two | "Under 200 characters of readable text, so the model is not called. The code is TOO_LITTLE_TEXT." |

Four cautions. First, the popup for the Lighthouse article in the saved screenshot says 101.2 s, because that run was made while other programs were using the processor. If you show that screenshot, say so. Second, do not show the first download on stage unless you have time to wait. The download took 158.3 s on the developer's connection. Third, the 15.3 s offline figure was measured before a label fix. A repeat after the fix took 17.7 s, so say which run you quote. Fourth, do not demo the Wikipedia article on the Intel chip. With the current code it took 616.4 s, about 10 minutes, and its summaries are not reliable. Use the short article for that laptop.

![Screenshot, pretend model: the popup while the model is being prepared, with the grey button and the text "Warming up the model (first time can take about 30 seconds)..."](../screenshots/ui-04-warming.png)

Caption: pretend model, not the real one. This is the state to describe during the first use, while the popup shows the warm-up. The text is the real popup's wording. The pretend model keeps the text for only a moment, so the picture was taken with the popup's script paused. The real warm-up takes about 30 s on first use.

The Lighthouse summary from the real model is shown below, with the stats line, for step 5.

![Screenshot, real model, NVIDIA card, Lighthouse article: the finished summary with the stats line "7 parts · 8 requests · 101.2 s · Llama 3.2 1B"](../screenshots/v2-nvidia-wikipedia-popup.png)

Caption: real model, NVIDIA card, Wikipedia Lighthouse article, from a run done while other programs were using the processor. The popup shows the title "Lighthouse - Wikipedia", the model line "Model: Llama 3.2 1B. Downloaded, runs on this computer.", the numbered points, and the stats line.

## The offline demo

The offline claim is proven in two ways. The repository has measured runs with the outside websites blocked, and you can show the same thing by hand.

1. Make sure the model is downloaded. The popup must say "Downloaded, runs on this computer."
2. Turn off Wi-Fi or unplug the network cable.
3. Open an article and press "Summarize this page".
4. Note the time and the line under the summary. The developer's laptop took 15.3 s for the short article and 16.5 s for the two-part article, in the run before the label fix. The run after the fix took 17.7 s and 16 s.
5. Turn the network back on.

The repository's measured runs block the outside websites with the Chromium flag `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`. The flag keeps the local test server reachable. It is the way `scripts/local-run.mjs nvidia-offline` runs. It is not the same as a laptop with no network, so say which you did.

## If something goes wrong

Every message below comes from `src/core/errors.js`, from the popup, or from the setup scripts. The code in capitals is what the job record stores. The popup shows the message, and the technical detail goes to the console.

| What you see | Code | What it means | What to do |
|---|---|---|---|
| Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check. | NO_WEBGPU | Chrome has no WebGPU for this page | Open `chrome://gpu`, check WebGPU, and use the separate card (see above) |
| Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2. | NO_SHADER_F16 | The card lacks the `shader-f16` feature | Nothing in this version fixes it. Say so, and show Version 1 if the client needs a summary |
| The graphics card ran out of memory. Close other heavy tabs or programs and try again. | GPU_MEMORY | The graphics card ran out of memory, and the smaller model also failed, or the smaller model was the one that failed | Close other tabs and try again. If the main model was the one that failed, the extension has already tried the smaller model once |
| The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept. | MODEL_DOWNLOAD_FAILED | The download failed | Reconnect and press the button again |
| The model could not be started. Press the button to try again. | MODEL_LOAD_FAILED | The model did not load | Press again. If the main model was the one that failed, the extension had already tried the smaller model once |
| The model took too long to answer. Try again, or use a shorter page. | TIMEOUT | No answer within 10 minutes (`generateTimeoutMs`, 600,000 ms) | Wait, or use a shorter page. On the Intel chip a long article can take that long |
| The model returned no summary for this page. | EMPTY_ANSWER | The answer was empty | Press again, or try another page |
| This page has too little readable text to summarize. | TOO_LITTLE_TEXT | Under 200 characters | Use a page with more text |
| This page is too long for the local model on this computer. Try a shorter page. | TOO_LONG | More than 12 parts | Use a shorter page |
| A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page. | CONTEXT_TOO_LONG | WebLLM refused a part that does not fit the 4,096-token window, and the halving steps did not fix it | Use a shorter page. Dense pages (tables, numbers, references) use more tokens per character |
| Chrome does not allow extensions to read this page. | RESTRICTED_PAGE | Chrome's own page, a local file or the Web Store | Use a normal web page |
| Could not read the text of this page. | EXTRACT_FAILED | The page reader could not run | Reload the page and try again |
| Something went wrong inside the extension. Try again. | SERVICE_ERROR | An unexpected failure, such as the offscreen page not answering | Read the "Technical detail" line under the message. For more, use the console (below) |
| The summary was interrupted. Press Summarize to try again. | INTERRUPTED | Chrome stopped the worker, or the job had no update for 5 minutes | Press Summarize again |
| The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed. | (notice) | A finished summary was written by SmolLM2 after a memory or load failure | Explain it. This is shown above the summary, not as an error |
| Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster. | (note) | The built-in chip was found and the smaller model is used | Explain it, and offer the separate card |

When the popup shows a vague message (SERVICE_ERROR, or MODEL_LOAD_FAILED), the popup also shows a "Technical detail: ..." line with the first 240 characters of the cause. That is the first thing to read, and it is enough for a bug report. For more, open `chrome://extensions`, find Page Summarizer, click the "service worker" link, and read the Console tab. The line that starts with `[PageSummarizer] failed` gives the code and the full detail. In the 24 October real-Chrome failure the popup showed only the vague message. The detail was added to the popup after that, and so this line was not there then.

The code CANCELLED is not shown to the user. It marks a job stopped because the page changed or the tab closed.

After GPU_MEMORY, the model line may show the smaller model's status rather than the main model's. The picture below is from the pretend model, with both models set to run out of memory. Its model line now shows the smaller model.

![Screenshot, pretend model: the popup after every model ran out of memory, with the error text and the model line showing the smaller model](../screenshots/ui-13-out-of-memory-all.png)

Caption: pretend model, not the real one. The popup shows "The graphics card ran out of memory. Close other heavy tabs or programs and try again." The model line reads "Model: SmolLM2 360M. Not downloaded yet (about 300 MB, first use only)." The 300 MB is the fake's number.

Setup and launcher messages are these.

- **"SETUP COMPLETE."** followed by "Next step: double-click run.bat". Setup finished.
- **"SETUP FAILED."**. Setup stopped. The window says what failed and how to fix it. The details are in `setup.log`.
- **"The graphics setting was NOT changed (see the message above). Setup goes on..."** from `setup.bat --gpu`. The Windows setting did not change. The extension still works, only more slowly.
- **"Setup has not been completed yet. Please double-click setup.bat first..."** from `run.bat`. Run `setup.bat` first.
- **"manifest.json is missing from this folder..."** from `run.bat`. Copy the whole folder again.
- **"Not enough free disk space"** from `check-computer.ps1`. Free at least 3 GB.

## How to run the tests

The test setup is the set of scripts and checks in the project. `setup.bat --dev` installs Playwright and its browser, and it needs Node.js 20 or newer. Run these in `finalsem\project`.

| Command | What it does | What you should see |
|---|---|---|
| `npm test` | Runs the unit tests in Node. No browser, no network | 76 tests across six files, all passing |
| `npm run test:e2e` | Runs the browser scenarios in hidden Chromium with the pretend model | 29 scenarios (smoke, V01 to V27, V18b), all passing |
| `node scripts/local-run.mjs nvidia` | Real model on the NVIDIA card: a cold start, then repeats. Downloads about 660 MB once | Writes `docs/test-runs/v2-local-nvidia` files. Slow, so run it on purpose |
| `node scripts/local-run.mjs nvidia-offline` | Real model with the outside websites blocked | Writes `v2-local-nvidia-offline` files |
| `node scripts/local-run.mjs intel` | Real model on the built-in Intel chip | Writes `v2-local-intel` files. Slow |
| `node scripts/local-run.mjs intel-wikipedia` | Real model on the Intel chip, the long Wikipedia article (7 parts) | Writes `v2-local-intel-wikipedia` files. Takes about 10 minutes |
| `node scripts/local-run.mjs intel-short` | Real model on the Intel chip, the short article | Writes the short Intel run files |
| `node scripts/secret-scan.mjs` | Checks the repository for the Version 1 key before a push | Exit code 1 if a key is found |
| `powershell -File tests\bat\test-bat-scripts.ps1` | Checks the setup and launcher scripts | 15 checks (B1 to B10c), all passing |

The browser scenarios run hidden. Set `HEADED=1` to watch them. Each scenario uses the pretend model, selected with `?mock=<mode>` on the offscreen page, so the tests do not need a graphics card. There are twelve modes: `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html`, `slow`, `longprompt` and `crash`.

Do not run `scripts/local-run.mjs` in the days before the viva unless you want new numbers. It downloads the model and writes files into `docs/test-runs`.

## The checklist for the client's laptop

The client's laptop has not been tested. Its graphics chip, memory and free disk were requested and not returned. Use this list on the day, and write the results down.

1. Run `check-computer.ps1`. Record the Windows version, the processor, the memory, the graphics chips and the free space on drive C.
2. If the memory is under 8 GB, expect the smaller model by rule. Say so before the demo.
3. Confirm Chrome is 116 or newer. Run `setup.bat`, then `run.bat`, then load the folder.
4. Open `chrome://gpu`. WebGPU should say "Hardware accelerated". If it does not, the summary may be very slow or refused. The repository does not test that case.
5. If the computer has two chips, run `setup.bat --gpu` (or set Chrome by hand in Windows Graphics settings), restart Chrome, and check `chrome://gpu` again.
6. Download the model once while connected. The popup must say "Downloaded, runs on this computer."
7. Turn off the network and summarize one short article. Write the time down. The developer's figure was 15.3 s before the label fix, and the client's figure is `[to be measured]`.
8. Turn the network back on. Undo the separate-card setting if you changed it, with `scripts\set-chrome-gpu.ps1 -Remove`.

## Not verified yet

- The client's laptop. Nothing has been run on it.
- `setup.bat --gpu` against a real Chrome. It was tried only against a throw-away registry key.
- A click-through in the visible, daily Chrome. Every browser scenario and every real-model run used hidden Chromium.
- Languages other than English. The model is small and was meant for English text.

## What changed on 24 October 2026

After a failure in the real Chrome, the following changed. The run file above reflects them.

- The answer limit is 10 minutes, not 180 seconds.
- A part that WebLLM refuses for size is cut in half and summarized again, up to three levels deep. The error CONTEXT_TOO_LONG is shown only if that also fails.
- Each KEEPALIVE refreshes the running job records, so a long answer is not shown as dead.
- The popup shows a "Technical detail" line for SERVICE_ERROR and MODEL_LOAD_FAILED.
- `scripts/local-run.mjs` clears the profile's old service-worker scripts before a real run.
- The extension must be reloaded on `chrome://extensions` after new code is pulled (step 5a).

## What this means in plain words

Setup checks the computer and the files. The launcher opens the extensions page. The first summary downloads the model, which takes minutes, and every later summary runs on the card with the network off. If a message appears, the table says what it means and what to do. The browser scenarios prove the extension's logic on a pretend model, and the saved real-model runs prove the real model on one laptop.


<div style="page-break-after: always"></div>

# The big decisions, in your own words

*Purpose: this chapter explains the eleven decisions in `finalsem/docs/DECISIONS.md` the way you would say them out loud at the viva, with the reason, the alternatives, the cost, and one sentence to learn.*

Each decision follows the same five parts. The first says what was decided. The second gives the reason. The third lists what else was considered. The fourth states the trade-off. The last is one sentence to say aloud. Learn the last sentence for each, then say it without the notes.

Where a number appears, it comes from `DECISIONS.md`, from `DEVLOG.md`, from the saved test-run files, or from the code. Numbers that come from an unsaved speed test are labelled that way. The repository does not score summary quality, so any claim about quality is marked as not measured. Decisions 2, 4, 5 and 8 were revised after the code review, and each one says how.

## 1. The library is WebLLM, copied in as one file

**What was decided.** The model runs with WebLLM, version 0.2.86 according to the README and the decision record. Its single file is copied into `src/lib/web-llm.js`, and no bundler is used. Transformers.js was kept as a second plan, in case the first spike failed.

**Why.** WebLLM already runs small models on WebGPU, and it lists the models the project uses. Copying the file keeps setup the same as in Version 1, with no build step.

**What else was considered.** Transformers.js. The first spike worked, so the second plan was not needed.

**The trade-off.** The project depends on one library's file, and an update means copying a new file and testing it again.

**What you can say.** "The project uses WebLLM, copied into the folder as one file, so the setup stays as simple as Version 1."

## 2. The model runs in a hidden page, not in the service worker

**What was decided.** The model is held by an offscreen page, which is a hidden page that Chrome lets an extension open. Inside it, a web worker runs WebLLM's handler. The job itself stays in the service worker.

**Why.** The offscreen page's own comment gives the reason: Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load. The page stays open while the model is needed.

**What else was considered.** Keeping the model in the service worker, which Chrome may stop. The decision record does not list any other place for the model.

**The trade-off.** The offscreen page is one more part to start, message and close. It keeps the model in graphics memory until the five-minute idle countdown ends.

**Revised after review.** The page is never closed while a message is running. The manager counts messages in flight, and the countdown starts only when the last one finishes. On 24 October the 10-second keepalive was also made to refresh the running job records, so one long answer is not shown as dead.

**What you can say.** "The model runs in a hidden page because Chrome can stop the background worker when it is idle, and the page keeps the model ready. It is only closed when no work is running."

## 3. Local only, with no key

**What was decided.** Version 2 runs only on the computer. The key box is gone. The first use shows one button, "Download model and summarize", with a progress bar. Version 1 stays as the cloud version.

**Why.** The decision record gives the purpose: the summary should need no account, no key and no network after the download, and the page text should never leave the computer.

**What else was considered.** Keeping the cloud engine as a fallback for computers without WebGPU. The record says the answer would change if the client's laptop had no WebGPU: the cloud engine would come back. The client's laptop has not been checked, so that condition is still open.

**The trade-off.** A computer without WebGPU or without `shader-f16` cannot run Version 2. The popup says so in plain words, and nothing is sent to the cloud instead.

**What you can say.** "Version 2 is local only, so no key is needed and the page text never leaves the computer. The cost is that a computer without the right graphics support cannot run it."

## 4. The model: Llama 3.2 1B by default, SmolLM2 360M as the fallback

**What was decided.** The primary model is Llama 3.2 1B, id `Llama-3.2-1B-Instruct-q4f16_1-MLC`. The fallback is SmolLM2 360M. The fallback is chosen when the computer reports less than 8 GB of memory, when the graphics card is built into the processor, or when the primary model fails to load with a memory or load error.

**Why.** The 1B model was the one measured at a usable speed on the NVIDIA card, at 34 to 53 tokens a second in the saved clean runs. The 360M model needs about 376 MB of graphics memory against 879 MB for the 1B, and it was the model measured on the Intel chip. No larger model was tried.

**What else was considered.** Qwen2.5 0.5B, which needs 945 MB, and which the record calls weaker. Qwen3 0.6B, which needs 1,403 MB and has a thinking mode.

**The trade-off.** The 1B model's summary quality was not measured. The saved outputs show faults, such as meta-comments and repeated facts, which chapter 06 explains.

**Revised after review.** When the smaller model writes a summary after a memory or load failure, the popup now says so above the summary: "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." Before the review, nothing on the screen said so. The choice is also kept (`modelOverride`) and is never cleared, which is a limit still standing.

**What you can say.** "The project uses Llama 3.2 1B and falls back to SmolLM2 360M when the computer is weak or the big model will not load, and the popup tells the user when the smaller model wrote the summary."

## 5. Part size, answer length, the prompt and temperature

**What was decided.** A part holds at most 6,000 characters, about 1,500 tokens. A part's summary is limited to 300 tokens, and the final summary to 320 tokens. The temperature is 0.2. The prompt puts the page text first, between markers, and one fixed instruction after it. A page that needs more than 12 parts is refused.

**Why.** The model's window is 4,096 tokens, so the part must leave room for the prompt and the answer. A short prompt suits a small model. A low temperature keeps the answer close to the text.

**What else was considered.** Halving the part and trying again if the model reports a window error. The record listed this as part of the plan. It was not built at first, because no run had hit a window error. It was built on 24 October, after the real-Chrome failure (see below).

**The trade-off.** The part size was chosen by reasoning and tested for the path, not tuned for quality. The repository does not show that 6,000 characters gives better summaries than another size.

**Revised after review.** A small model sometimes copied the start marker into its answer, as the saved Intel summary shows. `stripPageMarkers` now removes the markers from every answer. The saved output and its screenshot were recorded before this fix, so they still show the marker. The repeated opening sentence in the 1B model's merged answer is not fixed. It is listed as a limit.

**Revised on 24 October.** Halving is built. When WebLLM refuses a part with CONTEXT_TOO_LONG, the part is cut in half at a paragraph or sentence break, and each half is summarized, up to three levels deep and never for text under 600 characters. The real Wikipedia article showed why: dense text (tables, numbers, references) uses more tokens per character than the 6,000-character limit assumes. The saved real run with the current code did not trigger halving, because no part overflowed the window that day. Page text on Wikipedia changes, so a part that overflows one day may fit the next. The mechanism is covered by four unit tests and scenario V25.

**What you can say.** "Each part is about 1,500 tokens, so the page and the answer fit the model's 4,096-token window. The page markers are removed from the answer, and pages longer than 12 parts are refused."

## 6. The model files are kept in IndexedDB, not Cache Storage

**What was decided.** WebLLM is set to store the model in IndexedDB, with `cacheBackend: 'indexeddb'` in `offscreen.js`. The page checks whether the model is stored before it loads, so a stored model is always shown as loading and never as a download.

**Why.** WebLLM's default store, Cache Storage, failed inside the extension's hidden page with `UnknownError: Failed to execute 'open' on 'CacheStorage'`. IndexedDB worked there, with about 10.7 GB of quota in the test.

**What else was considered.** The default Cache Storage, which failed. The record does not list another store.

**The trade-off.** The extension needs the `unlimitedStorage` permission, so Chrome does not delete the 695 MB model when disk space is low.

**What you can say.** "The model is kept in IndexedDB, because the default store failed inside the hidden page, and the extension asks for unlimited storage so the model is not deleted."

## 7. On the built-in graphics chip, the extension uses the small model by itself

**What was decided.** When WebGPU reports an Intel chip with the `gen` architecture name, the extension chooses SmolLM2 360M and shows a note that a separate card is much faster.

**Why.** On the Intel chip the 1B model wrote about 2 tokens a second, in an unsaved speed test (DEVLOG, 21 October), and its first answer took 36 seconds to prepare. The record set a warning line of about 60 seconds for one part. The small model was chosen to get below that line on this chip. Even with it, the saved Intel run took 76 seconds to write one short summary, which the record names as above the line.

**What else was considered.** Refusing to run on integrated graphics. The record chose a note and a slower answer, because a slow answer is more useful than a refusal.

**The trade-off.** Summaries on the Intel chip take minutes, not seconds. The saved runs took 199.2 s for a short article on first use and 149.1 s for a two-part article. The small model's summaries are weaker than the 1B model's, and no quality test was made. The Wikipedia article took 616.4 s, about 10 minutes, with the current code, and the summaries from it are not reliable. That is why the answer limit went from 180 seconds to 10 minutes on 24 October, and why the Intel demo uses the short article.

**What you can say.** "On the built-in graphics the extension switches to the small model by itself, because the big one was too slow there to be useful. It says so on screen."

## 8. Making Chrome use the separate card is opt-in only

**What was decided.** The script `setup.bat --gpu` sets one per-user Windows value, `GpuPreference=2`, that asks Chrome to use the high-performance card. It is never run by default. Undo is `scripts\set-chrome-gpu.ps1 -Remove`.

**Why.** On a laptop with two chips Chrome often starts on the weak one. The high-performance card gave about 63 tokens a second in the unsaved speed test, against about 2 on the built-in chip. The project owner does not want Windows settings changed without asking.

**What else was considered.** Changing the setting automatically, or leaving it to the user with no help. The record chose the explicit switch and a manual route in the README.

**The trade-off.** The script was tested only against a throw-away registry key, not against a real Chrome. It is not yet proven on the client's laptop.

**Revised after review.** The script finds Chrome by itself, so the undo command in the README works as written. If the setting cannot be changed, `setup.bat --gpu` now says so and carries on.

**What you can say.** "The separate card is used only when the user asks for it, because it changes a Windows setting, and one command undoes it."

## 9. A pretend model for most tests, and one real run for proof

**What was decided.** Most browser scenarios use a pretend model, selected with `?mock=<mode>`. Real-model runs are separate, through `scripts/local-run.mjs`.

**Why.** A real model cannot be made to fail on demand. The pretend model can produce a download failure, an out-of-memory error, or no WebGPU, so each failure path is tested. The real-model runs prove that the real thing works.

**What else was considered.** Testing only with the real model. That would be slow, need a graphics card in every scenario, and could not force the failures.

**The trade-off.** The pretend model proves the extension's logic, not the model's quality. The browser scenarios run in hidden Chromium, not in the daily Chrome.

**What you can say.** "The browser scenarios use a pretend model so that failures can be forced. The real model was run separately, and those runs are the proof that it works."

## 10. Version 1 stays untouched

**What was decided.** Version 2 lives in `finalsem/`. Nothing under `midsem/` was edited. Shared parts, such as the chunker, the merger and the pipeline, were copied, not linked.

**Why.** The midterm submission must stay as it was. Copies let each version run by itself from its own folder.

**What else was considered.** Linking the shared files from one folder. The record does not say why this was rejected, so do not claim more than the copying.

**The trade-off.** A bug fixed in one copy must be fixed in the other by hand. The DEVLOG records a case: a closed-tab bug fixed in Version 1 (B4) came back in a different form in Version 2 and was fixed again there.

**What you can say.** "Version 1 is untouched, and the shared code was copied, so each version runs on its own."

## 11. A spike before building, and the risk tested first

**What was decided.** Before any code was written, the core choices were put as a written question to a second, stronger model (recorded as "Opus" in `DECISIONS.md`). The biggest risk, running WebLLM without a bundler inside an offscreen page and a worker at a usable speed, was tested first with a throw-away extension in a hidden browser.

**Why.** Running a model in a browser extension was new to the project. A spike shows which parts fail before the design depends on them. The spike found problems, and the record describes the Cache Storage failure as one of them (decision 6). The slow Intel chip was measured later, in the real runs (decision 7).

**What else was considered.** Building the full extension first and testing later. The record does not say why it was rejected.

**The trade-off.** The spike was a second piece of work. The answer to the question was given at medium confidence, and the record lists what would have changed it. The spike did not test a long, dense page on the slowest chip. The first real-Chrome run on that case, on 24 October, found the gap, and the halving advice that had been set aside as unlikely became the fix.

**What you can say.** "The biggest risk was tested first with a throw-away extension, and it found the two problems that shaped the design."

## What this means in plain words

The decisions came from four needs: the page text should stay on the computer, the extension should work on the laptop the client has, the model should load without a build step, and each claim should be backed by a measurement. Each choice costs something. The model's quality is not measured, the Intel chip is slow, and the client's laptop is untested. Learn the cost as well as the choice, because a tutor will often ask about the cost first.


<div style="page-break-after: always"></div>

# Glossary

*Purpose: this glossary gives the plain meaning of each technical word in Version 2, in one to three sentences, with this project's number where the repository has one.*

The entries are in alphabetical order. Where a number comes from the repository, the entry names the file. Where the entry is general background about how models work, it says so.

**Attention.** Attention is the part of a language model that lets each word piece look back at the others in the text while it chooses the next, and this project neither changes nor measures it.

**Cache Storage.** The browser's default store for files that a web page or extension keeps, which WebLLM uses by default. It failed inside this project's offscreen page with an "UnknownError", so the project stores the model in IndexedDB instead.

**Chunk (part).** A piece of the page text of at most 6,000 characters (`chunkChars` in `config.js`), sent to the model as one request. The screens call it a part. A page that needs more than 12 parts is refused with TOO_LONG (`maxChunks`).

**Context window.** The number of tokens a model can look at in one go, including the prompt and the answer. The decision record gives the window of Llama 3.2 1B as 4,096 tokens, and the part size is set to fit inside it. A dense part can still exceed it. WebLLM then refuses the prompt with "Prompt tokens exceed context window size", and the extension halves the part (see Halving).

**Decode.** The step in which the model writes its answer, one token at a time. Each token needs a full pass through the model, so decode is slower than prefill. The saved clean NVIDIA runs decoded at 34 to 53 tokens a second. An unsaved speed test, recorded in the DEVLOG, gave about 63.

**fp16 and shader-f16.** fp16 means a number stored in 16 bits, instead of 32, which is faster and smaller. `shader-f16` is the graphics feature that lets the card's small programs use those 16-bit numbers. The models in this project need it, and a card without it gets the NO_SHADER_F16 message.

**Graphics card (GPU).** The chip that does many small calculations at the same time, built for pictures and games. This project runs the model on it, through WebGPU. The developer's laptop has an NVIDIA RTX 3050 with 6 GB.

**Halving (halve and retry).** When WebLLM refuses a part because it does not fit the context window, the extension cuts the part in half at a paragraph or sentence break and summarizes each half. This is repeated up to three levels deep, and never for text under 600 characters. It was added on 24 October, after a dense Wikipedia part was refused in the real Chrome.

**IndexedDB.** A store inside the browser where a web page or extension keeps larger data by name. The model files are kept here, and the project asks for unlimited storage so the browser does not delete them. In the test, the quota was about 10.7 GB.

**Integrated graphics.** A graphics chip built into the processor, instead of a separate card. Intel's built-in chip on the developer's laptop is much slower for this model. The 1B model wrote about 2 tokens a second on it, and the extension chooses the small model there.

**Job record.** The data stored for one summary, under the key `job:<tab id>` in session storage. It holds the status, the phase, the progress, the summary, any error and the stats. The popup redraws from it.

**Keepalive.** A message the offscreen page sends to the service worker every 10 seconds while it is busy. It keeps the service worker from being stopped in the middle of a job. The interval is set in `offscreen.js`. Since 24 October, each keepalive also refreshes the update time of every running job record, so a long answer is not shown as dead.

**Llama 3.2 1B.** The primary model, with the id `Llama-3.2-1B-Instruct-q4f16_1-MLC`. "1B" means about one billion parameters. The popup says the download is about 695 MB, and WebLLM's list gives 879 MB of graphics memory for it.

**Manifest.** The file `manifest.json` that tells Chrome the extension's name, files and permissions. Version 2's manifest has version 2.0.0, and it allows Hugging Face as the model's host.

**Merge.** The step that joins several part summaries into one, with one more model call, which may write at most 320 tokens. The Lighthouse article's seven parts used one merge level, so eight requests in all.

**MLC.** The name in the model ids (for example `-MLC` at the end) marks the compiled form that WebLLM's model list uses. The name comes from the MLC project, on which WebLLM is built. This is background; the repository does not measure it.

**Mock (pretend model).** A stand-in model that answers from fixed text and can fail on purpose. It is selected with `?mock=<mode>` on the offscreen page. The browser tests use it, and its twelve modes include `nowebgpu`, `oom`, `downloadfail`, `longprompt` and `crash`.

**Model weights.** The numbers a model learned, stored in a file. The 1B model's weights are about 695 MB in this project, because they are stored in 4-bit form.

**Offscreen document.** A hidden page that Chrome lets an extension open for a task that needs a page, such as holding a model. This project's offscreen page has no window, can only send messages, and is closed after five minutes idle (`idleCloseMs`), and never while a message is running.

**Parameter.** One of the numbers inside a model that was set during learning. "1B" means about one billion of them. More parameters usually need more memory and time, which is why the project offers a smaller model.

**Pipeline.** The fixed order of steps for one job: read the page, check the length, cut into parts, prepare the model, summarize each part, merge. The same pipeline code is used in Version 1 and Version 2, with a prepare step added in Version 2.

**Prefill.** The step in which the model reads the whole prompt before it writes anything. An unsaved speed test, recorded in the DEVLOG on 21 October, gave about 600 tokens a second on the NVIDIA card, and about 1.5 seconds for a 250-token prompt. The record does not say which text was used. Prefill is faster than decode.

**Prompt.** The text sent to the model in one request: the page text between markers, followed by one fixed instruction. Version 2's prompt layout is `PROMPT_VERSION` `v2.0`. The model reads the prompt and then writes the answer.

**Quantization (4-bit, q4f16_1).** A way of storing the weights in fewer bits, so the file and the memory need are smaller. `q4f16_1` in a model id names a 4-bit form that uses 16-bit numbers for the arithmetic. The cost is a small loss of accuracy, which the project does not measure.

**Readability.** A library that finds the main article in a web page and leaves out the menus and adverts. It is the same file as in Version 1, with an Apache-2.0 licence.

**Service worker.** A background script that Chrome runs for an extension. In this project it owns the job and keeps the job record. Chrome can stop it when it is idle, and a job left running at that moment is marked INTERRUPTED. A job with no update for five minutes counts as dead.

**Session storage.** Chrome's storage for an extension that is cleared when the browser closes. The job records are kept here (`chrome.storage.session`).

**Shader and warm-up.** A shader is a small program that runs on the graphics card. Before the first answer, the card must compile its shaders for the model, which is the warm-up. The cold NVIDIA run's warm-up took about 30.5 seconds, the first Intel run's about 39 seconds, and a later run on the same profile about half a second.

**SmolLM2 360M.** The fallback model, with the id `SmolLM2-360M-Instruct-q4f16_1-MLC`. It needs 376 MB of graphics memory and its download is about 204 MB. The extension chooses it on integrated graphics, on a computer with less than 8 GB of memory, or after the primary model fails to load.

**Stale job.** A job whose record has had no update for five minutes. The popup and the service worker both treat it as dead. The answer timeout is a separate limit, now 10 minutes. Version 1 used three minutes for its own dead-job limit. A running job stays alive while the keepalive refreshes it.

**Temperature.** A setting that controls how much a model varies its choice of next word. The project uses 0.2, so the answer stays close to the most likely words and to the text.

**Timeout (answer limit).** The longest time the extension waits for one model answer. It is 10 minutes (`generateTimeoutMs`, 600,000 ms). It was 180 seconds until 24 October, when answers on the Intel chip ran past three minutes. When it passes, the job stops with TIMEOUT.

**Token.** The piece of text a model reads and writes: a word, part of a word, or a punctuation mark. A page of 6,000 characters is about 1,500 tokens, according to the comment in `config.js`. The repository does not store how many tokens each answer had.

**Tokenizer.** The part that turns text into token numbers for the model, and turns the model's numbers back into text. WebLLM loads it with the model. This is background; the project does not change it.

**Tokens per second.** The speed of decode, written as tokens a second. It is recorded as `decodeTps` in the stats and in the test-run files. Saved clean NVIDIA runs: 34 to 53, each the last request of its job. The repeat run after the label fix gave 65 for the short article and 45 for the two-part article. Saved clean Intel runs with SmolLM2: 4 to 5.

**WebGPU.** A browser feature that lets a web page or extension use the graphics card for calculation. Chrome's `chrome://gpu` page shows whether WebGPU is "Hardware accelerated". The extension asks for an adapter and checks it.

**WebLLM.** The open-source library, version 0.2.86 according to the README, that loads a model and runs it on WebGPU in the browser. It is copied into `src/lib/web-llm.js` with its Apache-2.0 licence.

**Web worker.** A background thread that a web page can start, so heavy work does not block the page. In this project, `engine-worker.js` starts WebLLM's handler in a web worker inside the offscreen page.


<div style="page-break-after: always"></div>

# Viva questions and honest answers (Version 2)

*Purpose: this chapter gives thirty likely viva questions in eight groups, each with a direct answer of two to five sentences that uses the real numbers in the repository, including the awkward questions.*

Say each answer in your own words, in under a minute. Where the repository has no evidence, the answer says so. Where a number comes from the DEVLOG or from an unsaved speed test rather than a saved run, the answer says so.

## The idea and the need

**1. What does Version 2 do, in one sentence?**

Page Summarizer Version 2 summarizes the page you are reading with a small language model that runs inside Chrome, on your computer's graphics card. It needs no key and no account, and the page text does not leave the computer. Only the first download of the model needs the internet, which the popup reports as about 695 MB for Llama 3.2 1B.

**2. What problem does it solve that Version 1 did not?**

Version 1 sends each page to Google, so every summary needs a key, an internet connection and trust in a cloud service. Version 2 removes all three from the summary itself, after the first download. The Version 1 quota probe also showed the limits of Google's free tier: the chosen model allowed 15 requests a minute, and the bigger model 20 a day.

**3. Why not keep Gemini? It was fast, and it worked.**

Gemini was fast. The model Version 1 chose answered in about 1.6 to 2.0 seconds per request. But every page went to Google, and the bigger model's free allowance stopped at 20 requests a day. The project chose local-only instead (decision 3 in chapter 04), and it kept Version 1 as the cloud version. The cost of that choice is that a computer without the right graphics support cannot run Version 2.

## AI basics

**4. What is a language model, and what does "1B" mean?**

A language model is a program that has learned, from a large amount of text, which piece of text is likely to come next. It writes an answer by making that guess again and again. "1B" means the model has about one billion parameters, which are learned numbers stored in its file. The repository does not describe how the model was trained, so that part is general background.

**5. What is a token, and why is speed counted in tokens?**

A token is the piece of text that the model reads and writes. It is often a word, or part of a word, or a punctuation mark. A part of 6,000 characters is about 1,500 tokens, according to the comment in `config.js`. Speed is counted in tokens a second because each token needs one full pass through the model. The saved clean NVIDIA runs wrote 34 to 53 tokens a second, each figure the last request of its job.

**6. What is the context window, and why are the parts 6,000 characters?**

The context window is how much text the model can take in one request, including the instructions and the answer. The decision record gives 4,096 tokens for Llama 3.2 1B. A part of about 1,500 tokens leaves room for the instructions and a 300-token answer. A page longer than one part is cut, each part is summarized, and the summaries are merged.

**7. What is quantization, and why is the file about 695 MB?**

Quantization stores each weight in fewer bits, so the file and the memory it needs are smaller. This model is 4-bit, as the name `q4f16_1` says, and its files add up to about 695 MB, which is what the popup reports. The cost is a small loss of accuracy, which the project does not measure. A copy with 16-bit weights would be several times larger, which is general background and not a measured figure here.

## Design

**8. Why does the popup not run the model?**

A popup closes when the user clicks elsewhere, and that would stop a long job. The service worker owns the job, and the model is held in a hidden offscreen page. The popup only redraws from the job record in session storage, so closing it does not lose the summary.

**9. Why use an offscreen page, and not the service worker, for the model?**

The offscreen page's own comment gives the reason. Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load. The offscreen page has no window and works only by messages. It is never closed while a message is running, and it closes after five minutes with no work, which gives the card's memory back.

**10. Why is the model kept in IndexedDB and not in Cache Storage?**

WebLLM's default store, Cache Storage, failed inside the hidden page with "UnknownError: Failed to execute 'open' on 'CacheStorage'". IndexedDB worked there, with about 10.7 GB of quota in the test. The extension also asks for the `unlimitedStorage` permission, so Chrome does not delete the model when disk space runs low.

**11. Why switch to SmolLM2 on the Intel chip?**

On the built-in Intel chip, the 1B model wrote about 2 tokens a second. That figure comes from an unsaved speed test recorded in the DEVLOG, and its first answer took 36 seconds to prepare. The extension detects the built-in chip by itself and uses SmolLM2 360M, which needs about 376 MB of graphics memory, and it shows a note on the popup. The saved Intel runs took 199.2 s for a short article on first use, and 149.1 s for a two-part article. That is slow, but it finishes, and the decision record prefers a slow answer to a refusal.

**12. Why cap a page at 12 parts?**

Each part is one model call, and on the Intel chip each part of the Wikipedia article took about 66 to 122 seconds in the current run, so many parts would take many minutes on a laptop. A page that needs more than 12 parts is refused with TOO_LONG before any download starts. The Lighthouse article, at 36,752 characters, needed seven parts and was accepted.

## Privacy

**13. Does the page text leave the computer?**

No. The model runs on the laptop, and the page text goes only to the model inside the same browser. The offline run is the evidence. With the outside websites blocked, the short article still summarized in 15.3 s from the stored copy of the model, in the run made before the label fix.

**14. What does the extension contact on the internet?**

The manifest lists the only hosts it may reach: `huggingface.co`, `*.huggingface.co`, `*.hf.co`, and `raw.githubusercontent.com`. The first download uses them. The summary of a page does not use the network, and the Gemini address is no longer in the manifest.

**15. What happens with no internet?**

After the first download, a summary needs no internet. The saved offline run on the NVIDIA card summarized a short article in 15.3 s and a two-part article in 16.5 s, with outside websites blocked. The repeat after the label fix took 17.7 s and 16 s. Before the first download, the download cannot start, and the popup reports MODEL_DOWNLOAD_FAILED. The repository's offline runs block outside sites with a Chromium flag, not with a cut network cable, so say that if you are asked.

## Performance

**16. Why is the first run slow?**

The clean NVIDIA first run took 196.8 s. Of that, the download of the 695 MB model took 158.3 s, the load into the card 3.8 s, the warm-up 30.5 s, when the card compiles its programs, and the summary 3.7 s. The download happens once. On the same profile, a later short article took 15.3 s with the outside websites blocked.

**17. Why is the Intel chip so slow, and what can the user do about it?**

The built-in chip wrote 4 to 5 tokens a second with SmolLM2, against 34 to 53 on the separate card, in the saved runs. A short article took 199.2 s on first use: about 81 s of download, about 39 s of warm-up and 76 s of writing. A long Wikipedia article took 616.4 s, about 10 minutes, with the current code, and its summaries are not reliable. The user can run `setup.bat --gpu`, or set Chrome to High performance in the Windows Graphics settings, then restart Chrome.

**18. How fast is it on your laptop?**

On the developer's Acer laptop with the NVIDIA RTX 3050, the saved clean runs gave 74.1 s for the seven-part Lighthouse article, 16.5 s for a two-part article offline, and 15.3 s for a short article offline. A run done while other programs were busy took 101.6 s for the same Lighthouse article. The client's laptop has not been measured, and the figure there is `[to be measured]`.

**19. What happens to a long page on the card?**

Each part is one model call, and the parts run one after another, because the card does one job at a time. The Lighthouse article made eight requests: seven for the parts and one for the merge. Those eight took 74.1 s on the clean run. On the Intel chip the same article took 616.4 s with the current code, and that summary is not reliable. A page of more than 12 parts is refused.

**20. Why does the second summary start faster than the first?**

The model stays loaded in the hidden page for five minutes after its last message, and the page is never closed while a message runs. The saved Intel long article started six seconds after the short one ended, so its timeline has no load or warm-up lines. After the idle time, the page closes, and the next summary loads the model again from IndexedDB without a download. The load took about 7 seconds in the saved offline run, and 11.6 s in the repeat after the label fix. The warm-up was about half a second there, against about 30.5 s in the cold run. The repository does not explain that difference, so the likely reason, that the card already had its programs compiled, should be given as an inference.

## Errors

**21. What if the laptop has no graphics card support?**

The popup says so in plain words. A card without WebGPU shows NO_WEBGPU, and a card without the `shader-f16` feature shows NO_SHADER_F16. In both cases the model line says so and the button is disabled, which scenarios V07 and V08 check. Version 2 cannot run on that computer, and nothing is sent to the cloud instead. The client's laptop has not been tested.

**22. What happens if the graphics card runs out of memory?**

The extension tries the smaller model once, when the main model is the one that failed. If that loads, it saves the choice in local storage (`modelOverride`), and the popup shows the notice "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." If every model fails, the popup shows the GPU_MEMORY message and asks the user to close other programs. Scenario V10 checks the notice, and scenario V11 checks the failure with every model out of memory.

**23. What if the model download stops halfway?**

The popup shows MODEL_DOWNLOAD_FAILED: "The model download stopped. Check your internet connection and press the button again." The message also says that what was downloaded is kept. Scenario V12 checks that nothing is saved and that a later press succeeds once the download works. The repository does not measure how much of a partial download is kept.

**24. What if Chrome stops the service worker during a job?**

The job record still says "running", so the next start of the worker marks it INTERRUPTED. The popup then tells the user to press Summarize again, which scenario V20 checks. A job with no update for five minutes counts as dead in the popup and the service worker. The keepalive message every 10 seconds is meant to keep the worker awake during work. Since 24 October it also refreshes the update time of every running job, so one long answer is not shown as dead. The repository does not measure how often Chrome stops it in practice.

## Testing

**25. How did you test it?**

There are three layers. The 76 unit tests run in Node, in six files. The 29 browser scenarios run in hidden Chromium with the pretend model, which has twelve modes. The 15 script checks (B1 to B10c) test the setup and launcher files. The test setup passes all of them. The real model was run separately with `scripts/local-run.mjs`, and that produced the saved clean runs. The run-1 record in the test-run folder predates the later changes, so run the commands again before you quote the counts.

**26. Why use a pretend model in the tests?**

A real model cannot be made to fail on demand, and it is slow and needs a graphics card. The pretend model can produce no WebGPU, no shader-f16, out-of-memory errors, a failed download, an empty answer, and markup in the answer. The real-model runs prove that the real model works, and the scenarios prove the extension's logic.

**27. Did the tests and the review find real bugs? What failed in the real Chrome?**

Yes. The real Chrome failed on 24 October. On the Wikipedia Lighthouse article, on the developer's laptop with the Intel chip, the popup said "Something went wrong inside the extension. Try again." with no reason. A hidden run of the same case failed with TIMEOUT, because one answer ran past the 180-second limit. WebLLM's refusal of an oversized prompt also fell through to that vague message, because the extension did not know its text. The fixes were a 10-minute limit, halving of parts that do not fit, a heartbeat for running jobs, and a "Technical detail" line in the popup. The first real-Chrome run had found a gap that the spike and the fixtures had missed. Earlier, scenario V09 found that the popup printed "intel" in lowercase, and `vendorName` in `popup.js` fixed it. Scenario V22 found that a job record came back after its tab was closed, because a queued write finished late. A code review found more. A stored model was labelled "Downloading" for about 0.8 s. The small model's answers copied the page marker. The fallback to the small model was silent, and the idle close could cut off a running load. Each is fixed, and the DEVLOG rows dated 21 October tell those stories.

## Honesty about the limits

**28. How good is a 1B model, really?**

The repository does not score summary quality, so the honest answer is that it is not measured. The saved outputs show faults. The Wikipedia article on the Intel chip is the worst case. The old-code second try invented facts, which must not be quoted as facts, and the current run gave three short, generic points whose counts (14,700 lighthouses, 54 diagrams and 651 photographs) were not checked against the page. The Intel summary began with the page's own marker text, "<<<PAGE TEXT START>>>". That output was recorded before the marker fix, and the markers are now removed from every answer. The NVIDIA long-article summary said "These are summaries of consecutive parts of one web page", which describes the process instead of the article. That line still appears in some answers, and it is listed as a limit. The Lighthouse summary named the Sumburgh Head lighthouse twice, for two different firsts. A person should compare each summary with its page before any quality claim is made.

![Screenshot, real model, Intel built-in chip, short article: the popup shows the SmolLM2 model line, the Intel graphics note, and a summary that begins with the marker text, recorded before the marker fix](../screenshots/v2-intel-short-popup.png)

Caption: real model, Intel built-in chip, the short article, recorded before the marker fix. The popup reads "Model: SmolLM2 360M. Not downloaded yet (about 204 MB, first use only)." and shows the Intel note. The summary's first line is the marker "<<<PAGE TEXT START>>>", followed by the answer as plain text. The current code removes that marker from answers.

**29. What was not tested?**

The client's laptop has not been run. The visible daily Chrome has not been used, because every browser scenario and real-model run used hidden Chromium. `setup.bat --gpu` was tried only against a throw-away registry key. Only English text was tried. Summary quality was not compared with any other model. These are also known limits. Closing the tab during a download does not stop the download, because `prepare()` ignores the abort signal. No automated scenario covers the 10-minute timeout path, since the pretend model has no timeout. The dashboard fixture is not used by any Version 2 browser scenario. The halving step was built on 24 October. It is covered by four unit tests and scenario V25, but the saved real run did not trigger it.

**30. Why do the decode speeds differ between documents? The DEVLOG says 63 tokens a second, the saved runs say 34 to 53.**

The 63 tokens a second, and the 600 for reading the prompt, come from an earlier speed test on the NVIDIA chip. The DEVLOG records them, but the test was not saved as a run file, and the record does not say which text was used. The saved clean NVIDIA runs gave 34, 40, 42, 47 and 53 tokens a second, each the last request of its job. The repeat run after the label fix gave 65 for the single request of the short article and 45 for the two-part article. The runs done while other programs were busy are not used for ranges. One of them recorded 29 tokens a second. So say the saved figures, and say that 63 and 600 came from a speed test that was not saved.

![Speed on the two graphics chips, from the saved clean runs: writing speed in tokens a second, and time for the short article](../figures/V08_speed_chart.png)

Reading the figure: the left side shows writing speed in tokens a second. The NVIDIA bars are 47 (short, first use), 53 (two parts, stored), 34 (seven parts, stored), 40 (short, offline) and 42 (two parts, offline). The Intel bars with SmolLM2 are 4 and 5. A dashed bar marks "about 2" for the 1B model on the Intel chip, labelled as the DEVLOG speed test only. The right side shows time for the short article: 196.8 s on NVIDIA's first use, 15.3 s stored and offline, and 199.2 s on Intel's first use. The figure says that no short-article run on Intel with the model stored has been measured.

## What this means in plain words

The answers come back to three points. The model runs on the laptop, so the page stays private and the summary needs no network after the download. The first run is slow because of the download and the warm-up, and the Intel chip is slow because it writes few tokens a second. The quality and the client's laptop are not measured yet, and you should say so before anyone asks.

