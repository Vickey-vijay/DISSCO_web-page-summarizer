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
