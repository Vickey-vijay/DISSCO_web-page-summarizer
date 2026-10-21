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
7. **Each part is summarized.** For a page of one part, the engine writes a summary of at most 320 tokens. For a longer page, each part gets a short summary of at most 300 tokens, and the popup shows "Summarizing part 3 of 7...".
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

- **Keepalive.** While the offscreen page is working, it sends `KEEPALIVE` to the service worker every 10 seconds (`beginWork` in `offscreen.js`). The interval stops when the work ends.
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

The Lighthouse article is cut into seven parts of at most 6,000 characters. Its parts start at 3.2, 7.8, 17.0, 22.5, 30.1, 38.1 and 54.7 seconds, the merge starts at 60.2 seconds, and the total is 74.1 seconds.

![Seven-part example: the Lighthouse article cut into parts, each summarized, then merged in one request, with the measured timeline of 74.1 seconds](../figures/V16_chunking_v2.png)

Reading the figure: the article of 36,752 characters becomes seven parts, each at most 6,000 characters. Each part is summarized, and the seven summaries go into one merge request. The timeline beneath is from the clean NVIDIA run: the start 3.2 s, the parts from 4.6 s to 5.5 s each, the longest part 16.6 s, and the merge 13.9 s. The total is 74.1 s, with eight requests in all.

## When something fails

Every failure becomes a code, defined in `src/core/errors.js`, with a plain message for the popup. The technical detail goes to the console. Some failures stop before any model step (too little text, too long, restricted page). Others happen inside the model step. Figure V11 lists each code with its message, and chapter 03 gives the messages as the popup shows them.

![Error codes with what causes them and the exact message, coloured by what the extension does next](../figures/V11_error_flow.png)

Reading the figure: the yellow rows (GPU_MEMORY and MODEL_LOAD_FAILED) are retried once with SmolLM2 360M before the message is shown. The red rows stop the job and show their message. The grey rows are refused early or are not shown. CANCELLED is never shown to the user.

If Chrome stops the service worker in the middle of a job, the next worker start marks the old record as INTERRUPTED (`sweepOrphans`). A job counts as dead after five minutes without an update, in both the service worker and the popup. If the tab moves to another page, the old job is aborted and its later writes are dropped.

## What changed after review

A code review found the faults below. Each one is fixed in the code, and the DEVLOG rows dated 21 October tell the story.

- **Wrong label for a stored model.** The popup said "Downloading the model: 0%" for about 0.8 s on a stored model, because any WebLLM text containing "fetch" was treated as a download. The offscreen page now checks the stored copy first, so a stored model is always "loading". A unit test covers it.
- **Copied markers.** A small model copied the page's start marker into its answer on the Intel chip. `stripPageMarkers` in `prompts.js` removes the markers from every answer. The recorded Intel output and its screenshot were made before this fix, so they still show the marker.
- **Silent fallback.** When the main model ran out of memory, the small model wrote the summary and nothing on the screen said so. Now a finished summary made by the smaller model after a memory or load failure shows the notice "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The model line is also refreshed once when any job ends, so it no longer shows a stale "Not downloaded yet" after both models fail.

![Screenshot, pretend model: the popup after the main model ran out of memory, with the smaller-model notice above the summary](../screenshots/ui-12-fallback-after-out-of-memory.png)

Caption: pretend model, not the real one. The main model is set to run out of memory, so the small one answers. The popup shows the notice, the model line "Model: SmolLM2 360M. Downloaded, runs on this computer.", and the stats line. The 2.3 s is the fake's timing. The popup shows the notice only after a memory or load failure, not for the built-in graphics case, which has its own note.

- **Idle close during a message.** The page could be closed while a load was still running. It is now closed only when no message is in flight.
- **Stale limit.** A job was marked dead after three minutes, the same as the 180-second answer limit, so a slow answer could look interrupted while still running. The dead limit is now five minutes in the service worker and the popup. The answer timeout (`generateTimeoutMs`, 180 s) is unchanged.

## What still holds (limits, not fixed)

- `modelOverride` is never cleared. Once the small model is saved, it stays until the stored settings are cleared.
- Closing the tab during a download does not stop the download, because `prepare()` ignores the abort signal.
- The model line is not refreshed while a download or warm-up is running.
- Built-in graphics detection recognises Intel only.
- The warm-up was about 30 s on first use and 0.5 s in the stored offline run, and the cause is not measured.

## What this means in plain words

The popup only shows. The service worker owns the job and keeps the notes in storage. The offscreen page holds the model, and its hidden web worker does the heavy arithmetic on the graphics card. A model is a large set of numbers. The first use is slow because the file has to be downloaded, copied to the card and compiled. Later use is faster, because the file is kept and the card is only asked to write the answer.
