# How Version 2 works, step by step

*Purpose: this chapter follows one summary from the button press to the text on the screen, for the first use and for later use, and explains in plain terms what the graphics card does.*

This chapter names the file that does each step, so you can find the code when a tutor asks. Read it once slowly, then say the walkthrough aloud without notes.

## The parts

The extension has seven parts. Each one has a single job.

- **The popup** is the small window that opens when you click the toolbar icon. It shows the button, the model line, the progress and the summary. It does not run the model.
- **The service worker** is a background script that Chrome runs for the extension. It owns the job. It keeps running when the popup closes.
- **The offscreen page** is a hidden page that Chrome lets an extension open for a heavy task. It holds the loaded model. It has no window, so the user never sees it.
- **The web worker** is a second background thread, started by the offscreen page. The model's heavy work runs there, so the offscreen page stays responsive.
- **WebLLM** is the open-source library, copied into the project as one file (`src/lib/web-llm.js`), that loads the model and runs it.
- **The graphics card** does the arithmetic. The extension reaches it through WebGPU, a browser feature.
- **Storage** holds three kinds of data: the job record (Chrome's session storage, cleared when the browser closes), the settings (Chrome's local storage), and the model files (the browser's IndexedDB, which stays).

![Layers of Version 2, from the popup at the top to the graphics card at the bottom, with the three stores beside them](../figures/V02_layers.png)
<!-- check against figure -->

Reading the figure: read it from the top. The popup and the service worker are the control layer. The offscreen page and its web worker are the model layer, and WebLLM runs there. WebGPU then reaches the graphics card. The side boxes are the three stores. The job record lives in session storage, the model files in IndexedDB, and the settings in local storage.

## First use: the model is not on the computer yet

The first time, the popup says "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." and the button says "Download model and summarize". Pressing it runs these steps.

1. **The page is read.** The popup sends `START_SUMMARY`. The service worker writes a job record and starts the pipeline, which reads the page text (`extractFromTab`).
2. **The graphics card is checked.** The service worker asks the offscreen page for the card's status (`LOCAL_STATUS`). The page asks Chrome for a WebGPU adapter and checks that it has the `shader-f16` feature. If the card says it is built into the processor (Intel), the engine switches to the smaller model, SmolLM2 360M, and the popup shows a one-line note.
3. **The model is downloaded.** The offscreen page asks WebLLM to load the model (`LOCAL_LOAD`). Because the model is not cached, WebLLM downloads its files and stores them in IndexedDB. The popup shows "Downloading the model (first time only): n%".
4. **The model is loaded into the graphics card.** WebLLM copies the model's numbers into the card's memory. The popup shows "Loading the model into the graphics card: n%".
5. **The model is warmed up.** The first answer makes the card compile its small programs, which is slow. The extension does this with one short prompt before any real page is sent, and shows "Warming up the model (first time can take about 30 seconds)...".
6. **The parts are summarized, one by one.** See the walkthrough below.

The clean first-use run on the NVIDIA card (`v2-local-nvidia-cold-first-attempt.md`) gives these phases for a short article of 1,711 characters.

| Phase | Start (s) | End (s) | About |
|---|---|---|---|
| Download | 0.5 | 158.0 | 157 s |
| Loading into the card | 158.8 | 162.2 | 3 s |
| Warm-up | 162.6 | 193.1 | 30 s |
| Writing the summary | 193.1 | 196.8 | 4 s |

The total was 196.8 s. The timeline also shows one loading line, "Loading the model into the graphics card: 0%", at 5.1 s, between a download line at 0.5 s and the next download line at 21.9 s. The repository does not explain that line, so this chapter does not interpret it.

## Later use: the model is already on the computer

Later, the popup says "Model: Llama 3.2 1B. Downloaded, runs on this computer." and the button says "Summarize this page". There is no download, and the job starts the same way. The clean run with the network blocked (`v2-local-nvidia-offline.md`) gives these phases for the same short article.

| Phase | Start (s) | End (s) | About |
|---|---|---|---|
| Loading from the browser's stored copy | 1.3 | 7.6 | 6.9 s (the saved load time is 6,890 ms) |
| Warm-up | 8.1 | 8.6 | 0.5 s |
| Writing the summary | 8.6 | 15.3 | 6.7 s |

The total was 15.3 s. The timeline also has a download line, "Downloading the model (first time only): 0%", at 3.9 s, even though the model was already stored. The repository does not explain that line. The warm-up took half a second here, against about 30 s on first use. The repository does not say why, but the most likely reason is that the card had already compiled its programs during the earlier run on the same profile. Treat that as an inference.

![First use and later use as two sequence diagrams, with the measured times as labels](../figures/V03_first_run_vs_cached.png)
<!-- check against figure -->

Reading the figure: the upper sequence is the first use. It checks the card, downloads, loads, warms up and then summarizes. The lower sequence is later use. It checks the stored copy, loads, and summarizes. The labels use the measured times, 197 s for the cold run and 15.3 s for the offline short article.

![Screenshot, real model, NVIDIA card, first use: the popup in the middle of the download at 32 percent](../screenshots/v2-nvidia-short-downloading.png)

Caption for the screenshot above: real model, NVIDIA card, first use. The popup shows the title "How a Lighthouse Lens Works", the button "Download model and summarize" greyed out while the job runs, the line "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only).", and the progress line "Downloading the model (first time only): 32%" with a red bar at about a third of its width.

## One summary, from the click to the screen

This walkthrough is the same for first use and later use. The extra steps for the download and the warm-up are inserted where they occur.

1. **You open the popup.** The popup asks the service worker for the model state (`GET_MODEL_STATE`). The service worker checks the card and the cache, and the popup shows the model line and the button text (`popup.js`).
2. **You press the button.** The popup sends `START_SUMMARY` with the tab number and waits for the reply. It does not call the model itself.
3. **The service worker starts a job.** `startJob` in `src/background/service-worker.js` checks that no job for this tab is starting. It writes the record `job:<tab id>` into session storage with the phase "extracting", then answers "ok".
4. **The page is read.** `extractFromTab` in `src/background/extract-tab.js` places Readability and the page reader into the tab. Chrome's own pages and local files are refused with RESTRICTED_PAGE.
5. **The text is checked and cut.** `runPipeline` in `src/core/pipeline.js` refuses text under 200 characters (TOO_LITTLE_TEXT). `chunkText` then cuts the text into parts of at most 6,000 characters. A page that needs more than 12 parts is refused (TOO_LONG). Both refusals happen before any model step, so no download starts.
6. **The model is prepared.** The pipeline calls `engine.prepare()`. The steps are the ones listed under "First use", or the shorter later steps.
7. **Each part is summarized.** For a page of one part, the engine writes a summary of at most 320 tokens. For a longer page, each part gets a short summary of at most 300 tokens, and the popup shows "Summarizing part 3 of 7...".
8. **The parts are merged.** If there was more than one part, the summaries are joined with one more model call, the merge step, which writes at most 320 tokens. The popup shows "Combining 7 summaries...".
9. **The job is marked done.** The service worker writes the summary, the title and the stats into the job record. The stats are the number of parts and requests, the model's name, the graphics card's vendor, the load time and the decode speed.
10. **The popup shows the result.** `popup.js` listens for changes to the record (`chrome.storage.onChanged`). It formats the summary with `summary-format.js`, which builds the text with `textContent`, so the model's words are shown as text and never run as HTML. The line under the summary reads, for example, "7 parts · 8 requests · 101.2 s · Llama 3.2 1B".
11. **You close the popup.** The job keeps going. Reopening the popup on the same page reads the same record.

Each model call uses the same route. The service worker calls `manager.send` in `src/background/offscreen-manager.js`. The manager creates the offscreen page on first use and forwards the message to it. The offscreen page (`src/offscreen/offscreen.js`) answers through its engine, which sends the work to the web worker (`engine-worker.js`) and returns the text. Model calls are queued so that only one runs at a time, because the card does one job at a time.

![The phases of a job, in order, as the popup shows them, with skipped phases marked](../figures/V06_job_phases.png)
<!-- check against figure -->

Reading the figure: the phases run from left to right. Extracting, checking, downloading, loading, warming up, summarizing (part n of m), merging, and done or error. The downloading and loading phases are shown as skipped when the model is already on the computer. The figure is drawn from `progressLabel` in the popup and from the order of steps in `pipeline.js`.

## What the offscreen page keeps alive

The model takes seconds to load, so it should not be lost when the service worker sleeps. Two rules do this.

- **Keepalive.** While the offscreen page is working, it sends `KEEPALIVE` to the service worker every 10 seconds (`beginWork` in `offscreen.js`). The interval stops when the work ends.
- **Idle close.** After each call, the manager starts a five-minute timer (`idleCloseMs`, 300,000 ms in `config.js`). If no work arrives in that time, the manager closes the offscreen page and the model leaves the card's memory. The stored files stay in IndexedDB, so the next use loads the model again without a download.

The clean Intel runs show the rule working. The long article started about six seconds after the short one ended. Its timeline has no loading or warm-up lines, because the model was still in memory.

## The graphics card in simple terms

A language model is a large set of numbers, called weights. The 1B model stores about one billion of them, in 4-bit form, in a file of about 695 MB. A summary is produced one word piece at a time, and each step multiplies the piece against the weights. The graphics card is built to do many multiplications at once, which is why the work is run there and not on the processor.

Two phases make up each answer. The first is **prefill**: the model reads the whole prompt. The card does this in parallel, and the DEVLOG records about 600 tokens a second on the NVIDIA card. The second is **decode**: the model writes its answer one token at a time, and each token needs the whole pass again. The clean runs measured 34 to 53 tokens a second on the NVIDIA card. The DEVLOG also records about 63 tokens a second in an early spike, which is above the clean range. Chapter 06 explains why the two figures differ.

The card runs small programs called shaders. Before the first answer, those programs must be compiled for this card. That is the warm-up, which took about 30 s in the cold NVIDIA run and about 39 s in the first Intel run.

The same model can be very different on two chips. The DEVLOG records that, before Chrome was started with the flag for the separate card, the built-in Intel graphics wrote about 2 tokens a second with the 1B model. With the separate card, the same model wrote about 63 tokens a second in that spike. That is why the extension checks the chip first.

## The numbers from the three clean runs

Only three runs were done on a quiet laptop: the cold NVIDIA run, the offline NVIDIA run, and the Intel run. The other runs were done while other programs were using the processor, and they are labelled that way in `docs/test-runs`.

| Case | Chip | Model | Total (s) | Parts and requests | Writing speed (tokens/s) |
|---|---|---|---|---|---|
| Short article, first use | NVIDIA RTX 3050 | Llama 3.2 1B | 196.8 | 1 part, 1 request | 47 |
| Long article, cached, offline | NVIDIA RTX 3050 | Llama 3.2 1B | 16.5 | 2 parts, 3 requests | 42 |
| Wikipedia Lighthouse, cached | NVIDIA RTX 3050 | Llama 3.2 1B | 74.1 | 7 parts, 8 requests | 34 |
| Short article, first use | Intel built-in | SmolLM2 360M | 199.2 | 1 part, 1 request | 4 |
| Long article, cached | Intel built-in | SmolLM2 360M | 149.1 | 2 parts, 3 requests | 5 |

The Lighthouse article is cut into seven parts of at most 6,000 characters, and the timeline shows the parts starting at 3.2, 7.8, 17.0, 22.5, 30.1, 38.1 and 54.7 seconds. The combining step starts at 60.2 seconds, and the total is 74.1 seconds.

## When something fails

Every failure becomes a code, defined in `src/core/errors.js`, with a plain message for the popup. The technical detail goes to the console. Some failures stop before any model step (too little text, too long, restricted page). Others happen inside the model step (no WebGPU, out of memory, a download that stops). The chapter 03 table lists each message exactly as the popup shows it.

If Chrome stops the service worker in the middle of a job, the next worker start marks the old record as INTERRUPTED (`sweepOrphans`). If the tab moves to another page, the old job is aborted and its later writes are dropped.

## What this means in plain words

The popup only shows. The service worker owns the job and keeps the notes in storage. The offscreen page holds the model, and its hidden web worker does the heavy arithmetic on the graphics card. A model is a large set of numbers. The first use is slow because the file has to be downloaded, copied to the card and compiled. Later use is much faster, because the file is kept and the card is only asked to write the answer.
