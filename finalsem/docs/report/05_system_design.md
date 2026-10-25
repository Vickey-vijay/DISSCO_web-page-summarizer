# System design of Version 2

This chapter describes how Version 2 is built, as the code is now, including the changes made after the first draft and the changes of 26 October 2026. It covers the layers, the job record that lets the popup close during a job, the first-use and later-use sequences, what runs on the client's laptop, which Version 1 parts were reused, and where the model plugs in.

A **service worker** is the extension's background script, which Chrome may stop when idle. An **offscreen page** is a hidden extension page that Chrome keeps open for a task such as running the model. A **web worker** is a background thread that keeps heavy work from freezing a page. **WebLLM** is the open-source library that loads and runs the model. **WebGPU** is the browser's route to the graphics card.

## The layers

Table: The layers of Version 2, what each owns, and what it talks to

| Layer | Files | Owns | Talks to |
|---|---|---|---|
| Popup | `src/ui/popup.html`, `popup.js` | The button, the model line, Settings (Quality), the notice for a shortened page, the "Read the whole page" button, the progress bar, the technical-detail line and the summary | The service worker, by message (START_SUMMARY, PRELOAD_MODEL, GET_MODEL_STATE); reads the job record |
| Service worker | `src/background/service-worker.js` | The job: id, phases, record, stop and cancel; the preload; the estimate for the whole page | Popup, offscreen manager, pipeline, Chrome tabs |
| Pipeline | `src/core/pipeline.js`, with `trim-text.js` and `condense.js` | Cleaning the text, shortening it on built-in graphics, cutting it into parts, preparing, summarizing and merging | The engine (through its contract) and the extractor |
| Offscreen manager | `src/background/offscreen-manager.js` | Opening and closing the hidden page, its idle timer, a count of messages in flight | Chrome's offscreen API, the offscreen page |
| Offscreen page | `src/offscreen/offscreen.js` | The loaded model, the download, the warm-up, unloading one model before loading another, one answer at a time | The service worker, by message; the web worker |
| Web worker | `src/offscreen/engine-worker.js` | Splitting text into tokens and running the model | The offscreen page, through WebLLM |
| WebLLM | `src/lib/web-llm.js` (version 0.2.86) | Model files, the cache, the runtime | The web worker, IndexedDB, WebGPU |
| Graphics card | Reached through WebGPU | The model's arithmetic | WebLLM |

Three stores sit beside these layers. The job record lives in `chrome.storage.session` under `job:<tabId>` until the browser restarts or the tab closes. The model files live in IndexedDB and no code deletes them. Settings live in `chrome.storage.local`: the Quality choice (`quality`, Better or Fast), the reading budgets (`readBudgetIntegrated`, `readBudgetOther`) and the fallback choice (`modelOverride`).

![Layers of Version 2: popup, service worker, offscreen page, web worker, WebLLM and the graphics card, with the three stores beside them](../figures/V02_layers.png)

Reading the figure: The figure stacks the layers from the popup down to WebGPU on the card, with `chrome.storage.local`, `chrome.storage.session` and IndexedDB beside them. The web page is read by an injected script. The figure does not show the pipeline or the Settings choice, which were added on 26 October.

**What this means in plain words.** The popup is only a window. The service worker owns the job, the offscreen page owns the model, and the browser owns the files and the card.

## The job record, and why the popup can close

The service worker creates one job record per tab. It holds the job id, status, phase, percentage, summary, error, statistics and page address. Every change goes through `writeJob`, which runs the writes for one tab in order. A write is applied only if the stored record still has the same job id, so a replaced job cannot overwrite the newer one.

`finalsem/project/src/background/service-worker.js`, lines 47 to 63

```
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
      // The tab may have closed while this write was in flight: do not leave the record behind.
      if (closedTabs.has(tabId)) await chrome.storage.session.remove(key);
    });
  queues.set(tabId, next);
  return next;
}
```

The popup sends one `START_SUMMARY` message and gets `{ok: true}` back at once. The job then runs in the service worker, so closing the popup changes nothing. Reopening it shows the same job (scenario V15), and a finished job is shown without a new run (scenario V16). The "Read the whole page (slower)" button starts a job with `full: true`, which reads every character of the page instead of the shortened text.

The offscreen page's KEEPALIVE message, sent every 10 seconds while it works, also refreshes the update time of every running job (scenario V26), so one answer that runs past five minutes does not look dead. A running job with no update for five minutes (`STALE_MS`, the same in the popup) is shown as interrupted; Version 1 used three minutes. One answer may take up to 10 minutes (`generateTimeoutMs`, previously 180 seconds). A new service worker marks a job left "running" as INTERRUPTED (scenario V20), and a closed tab has its job aborted (scenario V22).

The statistics in the finished record include the length of the text after cleaning (`textChars`), the length actually read (`readChars`), whether the page was shortened (`condensed`), the characters of back matter and markers removed (`trimmedChars`), a rough estimate of the whole-page time (`estimateFullSeconds`), the parts cut in half (`halvedParts`) and the reason for a non-default model (`modelSwitchReason`, which is `quality-fast` for Fast).

![Job phases in order: extracting, checking, downloading, loading, warming up, summarizing, merging, done or error](../figures/V06_job_phases.png)

Reading the figure: The figure lists the phases the popup shows, in order. The Downloading box is dashed, because a stored model skips it. The figure does not show the shortening step, which the pipeline runs between extracting and checking.

**What this means in plain words.** The summary keeps going when the popup closes, because the record holds the job. Chrome can stop the service worker at any time, so progress is written as it goes, and a job that stops is marked as interrupted.

## The offscreen page and the keepalive

The model takes seconds to load, and a stopped service worker would lose it. The model therefore lives in an offscreen page, which has only the `chrome.runtime` API, so the service worker asks and the page answers by message. While work runs, the page sends `KEEPALIVE` every 10 seconds. The service worker's comment says receiving it keeps the worker awake, and the same message refreshes the update time of each running job. The design does not rely on that alone, because a stopped worker still leads to the INTERRUPTED path.

`finalsem/project/src/background/offscreen-manager.js`, lines 62 to 76

```
  async function send(message) {
    inFlight += 1;
    clearTimeout(closeTimer);
    try {
      await ensure();
      const run = () => api.runtime.sendMessage(message);
      // Answers are generated one at a time, in the order they were asked.
      const result = message.type === 'LOCAL_GENERATE' ? (generateChain = generateChain.then(run, run)) : run();
      return await result;
    } finally {
      inFlight -= 1;
      // Only the last message to finish starts the idle countdown.
      if (inFlight === 0) void scheduleIdleClose();
    }
  }
```

The page is never closed while a message is running. The five-minute countdown (`idleCloseMs`) starts when the last message finishes. The page then closes, and the model stays in IndexedDB so the next use only loads it again (scenario V23). Answers are chained, so two parts never reach the card at once.

Two further messages were added on 26 October. `PRELOAD_MODEL`, described in the later-use section, starts loading a stored model before the first answer. A loaded model is unloaded before a different one is loaded, which happens when the person changes the Quality choice.

![Messages between the service worker and the offscreen page, with the idle close](../figures/V05_offscreen_messages.png)

Reading the figure: The figure shows the requests (`LOCAL_STATUS`, `LOCAL_LOAD`, `LOCAL_GENERATE`) and the replies (`MODEL_PROGRESS`, the answer, `KEEPALIVE` every 10 seconds while work runs). Its idle-close box says each message restarts the timer. The code now starts the countdown only after the last message, and the figure does not show `PRELOAD_MODEL`, so the box is slightly out of date.

**What this means in plain words.** The model sits in a hidden page that stays alive while there is work, and it closes after five quiet minutes.

## First use, step by step

A first use on the built-in Intel graphics that the client's laptop has is timed in `docs/test-runs/v2-local-intel-better.md`: a short article with the default model Llama 3.2 1B, 200.6 s in all. The NVIDIA first use drawn in figure V03 is the same sequence on a separate card, and it was drawn before the default change of 26 October.

1. **Opening the popup.** The service worker asks the offscreen page for the card and the cache. The page checks WebGPU and the `shader-f16` feature, looks for the model in IndexedDB, and reads the download size (about 695 MB) from the model's file list. The model line reads "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)". Nothing is preloaded, because nothing is stored yet.
2. **Pressing the button (0 s).** The popup sends `START_SUMMARY`. The service worker writes the job record and replies at once.
3. **Reading and cleaning the page (0.1 s).** The text is extracted, then cleaned: back matter and markers such as [12] are removed. This short article has none.
4. **Shortening (no change).** The text is under the 6,000-character reading budget on built-in graphics, so the whole text is read as one part.
5. **Downloading (0.5 s to 118.0 s).** WebLLM runs in a web worker with its cache in IndexedDB. Progress arrives as `MODEL_PROGRESS` messages, and the keepalive refreshes the job record every 10 seconds.
6. **Loading into the card (118.8 s to 121.4 s).**
7. **Warming up (121.8 s to 149.5 s).** One request of one token ("Say ok.") makes the card compile its programs. This took about 28 s here.
8. **Summarizing (149.5 s to 200.6 s).** One part and one request. On built-in graphics the answer is three short sentences, so this step took about 51 s at two tokens a second.

The download and load labels follow one rule. A model that is not stored is labelled "downloading" when WebLLM's report contains "fetch". A stored model is always labelled "loading", because WebLLM also says "fetch" when it reads a stored model from the browser's own storage. Before this rule, the offline run showed "Downloading" for about a second on a stored model.

![Real model, second NVIDIA run: the popup while the model downloads at 32%](../screenshots/v2-nvidia-short-downloading.png)

This picture is from the second NVIDIA run, which was done while other programs were using the processor. The download label is correct here, because the model was not stored.

The NVIDIA picture `v2-nvidia-short-popup.png` predates a change to the model line. It still reads "Not downloaded yet" after the result. The popup now refreshes the model line once when a job ends, successful or not, and it is still not refreshed while a download or warm-up runs.

**What this means in plain words.** On built-in graphics the first use is slow for three reasons: the 695 MB download (about 118 s), the warm-up (about 28 s), and the writing of the answer (about 51 s, at two tokens a second).

## Later use, step by step

A later use has the stored model, so the download and the first-answer delay are gone. Two runs show the path: the Lighthouse article on built-in graphics, and the short article on the NVIDIA chip after the label fix.

1. **Opening the popup.** The line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer.", and the button reads "Summarize this page". Because the model is stored, the popup sends `PRELOAD_MODEL`. The service worker loads and warms the model while the person reads the popup, so the first answer does not wait for it. The preload never downloads anything. It is skipped on browser pages and while a job is running.
2. **Pressing the button.** The popup sends `START_SUMMARY`. The page is read in 0.1 s. Cleaning removes 8,788 characters of back matter and markers from the Lighthouse article, leaving 27,964 characters.
3. **Shortening.** On built-in graphics the reading budget is 6,000 characters. The engine reads 5,968 of the 27,964 characters, which is 21 percent. The opening is kept in full, then the first sentences of the paragraphs, spread evenly over the page, with the headings of the kept sections. The result is exactly one part, so no merge is needed.
4. **Summarizing.** The one part is answered in three short sentences. The job finished in 124.6 s, with summarizing starting at 6.6 s.

The popup then says that the page was shortened, and offers "Read the whole page (slower)". For this page it estimates that reading all of it would take about 692 s. That estimate is a rough guess from the measured speed. It has not been measured with Llama 3.2 1B. The long fixture article followed the same path: 5,302 of 10,532 characters were read, and the job took 103.8 s.

The whole-page option starts a job with `full: true`. Both reading budgets are then set to zero, so every cleaned character is read, the text is cut into parts and the parts are merged. The only whole-page run on record used the small model (616.4 s, on 24 October, before the default change), so the whole-page time with Llama 3.2 1B is not yet measured.

For comparison, the short article on the NVIDIA chip after the label fix took 17.7 s with the model stored (`docs/test-runs/v2-local-nvidia-offline-after-label-fix.md`). The picture below shows its warm-up with a stored model and no "Downloading" line.

![Real model, offline run after the label fix: warm-up on a stored model, with no Downloading line](../screenshots/v2-nvidia-offline-short-warming-after-label-fix.png)

**What this means in plain words.** With the model stored, the built-in path still takes about two minutes for a long page, because the extension reads only the opening and the first sentences of each section. The reader is told how much was read and can ask for the whole page, which takes longer.

## What runs where on the client's laptop

Table: What runs where on the client's laptop

| Place | What runs there | What it uses | Notes |
|---|---|---|---|
| The page being read | The text the extractor reads | Nothing extra | Read in place by an injected script |
| Popup window | The button, Settings and the view of the job | A little memory | Can be closed at any time |
| Service worker | The job, its record and the preload | Memory while a job runs | Chrome can stop it when idle |
| Offscreen page and web worker | The loaded model and WebLLM | Memory and the graphics card | Closed five minutes after the last message |
| Graphics card | The model's arithmetic | 879 MB (Llama 3.2 1B), 376 MB (SmolLM2), from `config.js` | Built-in on the client's laptop, sharing its 16 GB of memory |
| Browser profile on disk | Model files in IndexedDB | About 695 MB (Llama 3.2 1B), 204 MB (SmolLM2), as the popup reports | Kept by `unlimitedStorage` |

![What runs where on the client's laptop: Chrome processes, the graphics card and the disk cache](../figures/V12_deployment.png)

Reading the figure: The figure places the popup, service worker, offscreen page, web worker, Chrome's GPU process and graphics card on the laptop, with the disk beside them. Only the first download reaches Hugging Face and GitHub, drawn as a dashed arrow. The card box reads "NVIDIA or Intel", and the footer says the client's laptop has not been tested yet, that the same parts run there, and that the graphics card decides the speed. The footer also says Chrome's own process layout is not measured, and points to figures V08 and V17 for speed. The client's chip is recorded in `docs/CLIENT_LAPTOP.md`: an Intel Iris Xe built into the processor, with no separate card, and Chrome 156 with WebGPU hardware accelerated. The extension has not yet been run on that laptop.

The model cache sits in the client's Chrome profile, not in the project folder. The `.model-profile` folders in `finalsem/project` are test profiles from `scripts/local-run.mjs`, and `.gitignore` excludes them. `setup.bat --gpu` has nothing to switch on the client's laptop, because it has only one graphics chip.

**What this means in plain words.** Most of the work happens in the browser on the client's machine. The model and the job live in the places the table shows, and on the client's laptop the graphics card is part of the processor.

## What was reused from Version 1, what changed, what is new

The comparison used `diff -rq` on `midsem/project/src` and `finalsem/project/src`, then a line-by-line diff of each changed file. Version 1's source folder holds 19 files and Version 2's now holds 28.

- **Unchanged, byte for byte (8 files):** `background/extract-tab.js`, `content/extract.js`, `core/chunker.js`, `core/merger.js`, `core/url.js`, `ui/summary-format.js`, `lib/readability.js` and `lib/READABILITY_LICENSE.md`.
- **Changed (8 files), with diff lines (old and new together):** `background/service-worker.js` 140 (120 added, 20 removed), `core/config.js` 100 (56 added, 44 removed), `core/errors.js` 58 (27 added, 31 removed), `core/pipeline.js` 22 (20 added, 2 removed), `core/prompts.js` 93 (65 added, 28 removed), `ui/popup.html` 28 (16 added, 12 removed), `ui/popup.js` 231 (147 added, 84 removed) and `ui/ui.css` 46 (14 added, 32 removed).
- **Removed (3 files):** `engines/gemini.js`, `ui/options.html`, `ui/options.js`.
- **New (12 files):** `background/offscreen-manager.js`, `core/condense.js`, `core/engine-errors.js`, `core/gpu-check.js`, `core/trim-text.js`, `engines/local.js`, `lib/web-llm.js`, `lib/WEBLLM_LICENSE`, and four files in `offscreen/`: `engine-worker.js`, `mock-engine.js`, `offscreen.html` and `offscreen.js`.

The counts agree: 8 unchanged, 8 changed and 3 removed make the 19 Version 1 files, and 8 unchanged, 8 changed and 12 new make the 28 Version 2 files. The unchanged files do not know which engine runs. They read the page, join text, check URLs and format the summary. The diff sizes show how large each change is, not how many edits were made.

In the changed files, `pipeline.js` now cleans and shortens the text before chunking, `service-worker.js` adds the preload, the whole-page flag and the estimate, `config.js` sets the 10-minute limit, the reading budgets and the short-answer limits, `errors.js` reaches 15 codes with CONTEXT_TOO_LONG, `prompts.js` adds the short-answer prompts, and the popup gains Settings, the notice, the whole-page button and the preload.

![Reuse from Version 1 to Version 2: unchanged, changed and new files](../figures/V14_reuse_v1_v2.png)

Reading the figure: The groups match the lists above. The figure's line counts are older than the 26 October changes (it shows `ui/ui.css` at 39 lines; the fresh diff gives 46), and the new files `condense.js` and `trim-text.js` are not drawn.

**What this means in plain words.** Eight of the 19 Version 1 files carry over unchanged. They are the part of the product that reads and summarizes text, while the engine, the key and the messages differ.

## The engine seam: how the model plugs in

The pipeline runs the whole job through one engine object. Its contract, in the header of `pipeline.js`, needs `summarizeChunk` for one part and `mergeSummaries` for a merge. Version 2 adds an optional `prepare` step, which the pipeline calls once before the first part. A cloud-style engine has no such step, so the pipeline checks for it first.

`finalsem/project/src/core/pipeline.js`, lines 54 to 58

```
  // The local engine needs its model ready (graphics card checked, model downloaded and loaded)
  // before the first part. A cloud-style engine simply has no prepare() step.
  if (typeof engine.prepare === 'function') {
    await engine.prepare({ signal, onProgress });
  }
```

Before the parts are cut, the engine answers one question: how many characters of a page this computer should read. `readBudgetChars` returns 6,000 on built-in graphics and zero (read everything) elsewhere. The condensing step then shortens a longer page to that budget. The engine also reports whether it is on built-in graphics (`brief`), which selects the short answers: three sentences for one part, two for a part of a long page, and four or five for a merge. An answer stopped by the length limit is cut back to its last full stop.

`prepare` in `local.js` checks the card and loads the model. If the load fails for lack of graphics memory or a start failure, it retries once with the small model and saves that choice, so later jobs also start with the small model.

`finalsem/project/src/engines/local.js`, lines 74 to 93

```
    /** Checks the graphics card, downloads the model if needed, and loads it. Throws AppError. */
    async prepare({ onProgress = () => {} } = {}) {
      onProgress({ phase: 'checking' });
      const status = engine.status ?? (await engine.checkStatus()); // already asked when the reading budget was set
      onProgress(status.cached ? { phase: 'loading', percent: 0 } : { phase: 'downloading', percent: 0 });
      try {
        engine.loadInfo = await call({ type: 'LOCAL_LOAD', modelId: engine.model.id });
      } catch (err) {
        if (!(err instanceof AppError) || !RETRY_WITH_FALLBACK.has(err.code) || engine.model.id !== MODELS.primary.id) throw err;
        // The primary model did not fit or would not start: remember that and try the small one.
        await onFallback();
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = err.code;
        const small = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
        engine.status = small;
        onProgress(small.cached ? { phase: 'loading', percent: 0 } : { phase: 'downloading', percent: 0 });
        engine.loadInfo = await call({ type: 'LOCAL_LOAD', modelId: engine.model.id });
      }
      return { status: engine.status, loaded: engine.loadInfo };
    },
```

`summarizeChunk` in `local.js` handles a part that WebLLM refuses for length. The part is cut in half at a paragraph or sentence break, and each half is summarized, up to three levels deep and not for text under 600 characters. A page that was one part becomes two parts and one merge request, and the job counts the cut parts in `stats.halvedParts`. The seven-part Wikipedia article made eight requests, seven for parts and one merge, and its clean run took 74.1 s.

Copied page markers are removed from every answer. The removal now also drops a repeated copy of the prompt's safety sentence and an empty "Summary:" label, because the small model produced both. Such an answer becomes EMPTY_ANSWER, not a summary that repeats the prompt.

![Flow of prepare: check the card, choose the model, download if needed, load, warm up, and retry once with the small model on a memory failure](../figures/V04_model_preparation.png)

Reading the figure: The figure follows `prepare` from top to bottom. NO_WEBGPU or NO_SHADER_F16 stops the job. The model step chooses Llama 3.2 1B on every chip. SmolLM2 360M is chosen when Settings has Quality: Fast, when memory is under 8 GB, or when a saved fallback applies. A GPU_MEMORY or MODEL_LOAD_FAILED error with Llama 3.2 1B saves the fallback and retries once with SmolLM2. Any other error stops with its message.

![A long page cut into parts of about 6,000 characters, each summarized and then merged](../figures/V16_chunking_v2.png)

Reading the figure: The figure cuts the Lighthouse article (36,752 characters) into seven parts and merges the seven summaries in one request. Its clean-run timeline gives parts of 4.6 to 16.6 s, a merge of 13.9 s and 74.1 s in all. That run used the whole page on the NVIDIA chip, not the shortened path on built-in graphics.

The Intel summary from before the marker fix shows why that step matters. The small model copied the start marker into its answer, so the saved summary begins with `<<<PAGE TEXT START>>>`. That run predates `stripPageMarkers` and the 26 October default change, and the saved summary and its picture still show the marker.

![Real model, Intel built-in graphics, first use, recorded before the marker fix: the popup with the Intel note and the marker text](../screenshots/v2-intel-short-popup.png)

The graphics note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The result begins with the marker line. The picture is from the small model, which was the automatic choice on built-in graphics before 26 October.

**What this means in plain words.** The pipeline does not need to know which model runs. The engine decides how much to read and how long each answer may be, and the pipeline only asks for the summary.

## How a failure reaches the reader

Every failure becomes one of the codes in `src/core/errors.js`, with a plain message for the popup. The technical detail goes to the console. For SERVICE_ERROR and MODEL_LOAD_FAILED the popup also shows the first 240 characters of the detail under the message, labelled "Technical detail:".

Table: How a failure reaches the reader (selected codes)

| Code | Raised where | What the reader sees | Test |
|---|---|---|---|
| NO_WEBGPU, NO_SHADER_F16 | `evaluateGpu` in `gpu-check.js`, at the status check | The model line gives the reason; the button is disabled | Scenarios V07, V08 |
| GPU_MEMORY, MODEL_LOAD_FAILED | `classifyEngineError`, during the load | The small model is tried once, the choice is saved, and the result carries a notice | Scenario V10 (notice); V11 when both fail |
| MODEL_DOWNLOAD_FAILED | `classifyEngineError`, when the message mentions the network | A message; nothing is saved, and a later press works | Scenario V12 |
| TOO_LONG | `runPipeline`, above 12 parts | Refused before any download | Scenario V06 |
| CONTEXT_TOO_LONG | `classifyEngineError` (WebLLM's window message); `summarizeChunk` cuts the part in half | Two halves are summarized and merged. The message appears only if halving also fails | Unit tests; scenario V25 |
| EMPTY_ANSWER | `generate` in `local.js` | A message saying no summary was returned | Scenario V13 |
| TIMEOUT | Timer in the offscreen page, 10 minutes | A message | Unit test of the code only; no automated test runs the timer |
| INTERRUPTED | `sweepOrphans` after a worker restart, or no update for five minutes | A message, and the popup says so | Scenario V20 |
| SERVICE_ERROR, MODEL_LOAD_FAILED | Any unexpected error, or a load that will not start | The message, with the technical detail under it | Scenario V27 |

![Pretend model screenshot: the result after the main model ran out of memory, with the notice that the smaller model wrote the summary](../screenshots/ui-12-fallback-after-out-of-memory.png)

This is a pretend-model picture. The notice reads "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The numbers in the picture, such as 2.3 s, belong to the pretend model and are not measurements.

![How the errors flow from the code to the popup](../figures/V11_error_flow.png)

Reading the figure: Each error code is one row, with when it happens and the message the reader sees. Yellow rows retry once with SmolLM2 360M, red rows stop the job and show a message, and grey rows are refused early or not shown. TIMEOUT is drawn as no answer within 10 minutes, which matches the answer limit. The figure has no CONTEXT_TOO_LONG row. Its footer says the technical detail goes to the console and the job record; the popup line for SERVICE_ERROR and MODEL_LOAD_FAILED is not drawn.

**What this means in plain words.** Each failure has one name in the code and one message on the screen, and the popup shows the cause when the message alone would not help. The gap is the timeout, which has a message but no automated test.

## Questions this chapter answers

**Why does the popup not run the model itself?**
The popup can be closed at any moment, and a first model load takes minutes. The service worker owns the job and the offscreen page owns the model, so the popup only starts a job and reads its record.

**Why can the popup be closed during a job?**
The job's progress is written to `chrome.storage.session` under the tab's key. Reopening the popup reads that record, so the same job is shown (scenario V15).

**How long does each step take?**
On built-in Intel graphics with the default model, a first use of a short article took 200.6 s: a download of about 118 s, a load of 2.6 s, a warm-up of about 28 s and an answer of about 51 s. With the model stored, the Lighthouse article took 124.6 s, because only 21 percent of its text was read. On the NVIDIA chip the stored short article took 17.7 s.

**What did Version 2 reuse from Version 1?**
Eight files are byte-for-byte the same, eight changed, three were removed and twelve are new. The reading, cutting, merging and formatting code is unchanged. `pipeline.js` changed by 22 lines, because cleaning, shortening and the new statistics are now part of the pipeline.

**How would a different engine plug in?**
An engine needs `summarizeChunk` and `mergeSummaries`, plus `prepare` if it has a setup step. It may also say how much of a page to read and whether to write short answers. The pipeline and the popup do not change, and both the Version 2 model and the Version 1 cloud engine fit this contract.
