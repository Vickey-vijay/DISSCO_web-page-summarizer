# System design of Version 2

This chapter describes how Version 2 is built, as the code is now, including the changes made after a review of the code. It covers the layers, the job record that lets the popup close during a job, the first-use and later-use sequences, what runs on the client's laptop, what was reused from Version 1, and where the model plugs in.

A **service worker** is the extension's background script, which Chrome may stop when idle. An **offscreen page** is a hidden extension page that Chrome keeps open for a task such as running the model. A **web worker** is a background thread that keeps heavy work from freezing a page. **WebLLM** is the open-source library that loads and runs the model. **WebGPU** is the browser's route to the graphics card.

## The layers

Table: The layers of Version 2, what each owns, and what it talks to

| Layer | Files | Owns | Talks to |
|---|---|---|---|
| Popup | `src/ui/popup.html`, `popup.js` | The button, model line, progress bar, notice and summary | Service worker, by message; reads the job record |
| Service worker | `src/background/service-worker.js` | The job: id, phases, record, stop and cancel | Popup, offscreen manager, pipeline, Chrome tabs |
| Offscreen manager | `src/background/offscreen-manager.js` | Opening and closing the hidden page, its idle timer, a count of messages in flight | Chrome's offscreen API, the offscreen page |
| Offscreen page | `src/offscreen/offscreen.js` | The loaded model, the download, the warm-up, one answer at a time | Service worker, by message; the web worker |
| Web worker | `src/offscreen/engine-worker.js` | Splitting text into tokens and running the model | The offscreen page, through WebLLM |
| WebLLM | `src/lib/web-llm.js` (version 0.2.86) | Model files, the cache, the runtime | The web worker, IndexedDB, WebGPU |
| Graphics card | Reached through WebGPU | The model's arithmetic | WebLLM |

The job record lives in `chrome.storage.session` under `job:<tabId>` until the browser restarts or the tab closes. The model files live in IndexedDB and no code deletes them. Settings and the fallback choice (`modelOverride`) live in `chrome.storage.local`.

![Layers of Version 2: popup, service worker, offscreen page, web worker, WebLLM and the graphics card, with the three stores beside them](../figures/V02_layers.png)

Reading the figure: The figure stacks the layers from the popup down to WebGPU on the card, with `chrome.storage.local`, `chrome.storage.session` and IndexedDB beside them. The web page is read by an injected script.

**What this means in plain words.** The popup is only a window. The service worker owns the job, the offscreen page owns the model, and the browser owns the files and the card.

## The job record, and why the popup can close

The service worker creates one job record per tab. It holds the job id, status, phase, percentage, summary, error, statistics and page address. Every change goes through `writeJob`, which runs the writes for one tab in order. A write is applied only if the stored record still has the same job id, so a replaced job cannot overwrite the newer one.

`finalsem/project/src/background/service-worker.js`, lines 34 to 50

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

The popup sends one `START_SUMMARY` message and gets `{ok: true}` back at once. The job then runs in the service worker, so closing the popup changes nothing. Reopening it shows the same job (scenario V15), and a finished job is shown without a new run (scenario V16). A running job with no update for five minutes (`STALE_MS`, the same in the popup) is shown as interrupted; Version 1 used three minutes. The 180-second limit on one answer is unchanged. A new service worker marks a job left "running" as INTERRUPTED (scenario V20), and a closed tab has its job aborted (scenario V22).

![Job phases in order: extracting, checking, downloading, loading, warming up, summarizing, merging, done or error](../figures/V06_job_phases.png)

Reading the figure: The figure lists the phases the popup shows, in order. The Downloading box is dashed, because a stored model skips it.

**What this means in plain words.** The summary keeps going when the popup closes, because the record holds the job. Chrome can stop the service worker at any time, so progress is written as it goes.

## The offscreen page and the keepalive

The model takes seconds to load, and a stopped service worker would lose it. The model therefore lives in an offscreen page, which has only the `chrome.runtime` API, so the service worker asks and the page answers by message. While work runs, the page sends `KEEPALIVE` every 10 seconds. The service worker's comment says receiving it keeps the worker awake. The design does not rely on that alone, because a stopped worker still leads to the INTERRUPTED path.

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

![Messages between the service worker and the offscreen page, with the idle close](../figures/V05_offscreen_messages.png)

Reading the figure: The figure shows the requests (`LOCAL_STATUS`, `LOCAL_LOAD`, `LOCAL_GENERATE`) and the replies (`MODEL_PROGRESS`, the answer, `KEEPALIVE` every 10 seconds while work runs). Its idle-close box says each message restarts the timer. The code now starts the countdown only after the last message, so that box is slightly out of date.

**What this means in plain words.** The model sits in a hidden page that stays alive while there is work, and it closes after five quiet minutes.

## First use, step by step

A first use has eight steps. The times come from the clean NVIDIA run of a one-part short article (`docs/test-runs/v2-local-nvidia-cold-first-attempt.md`).

![First use and later use compared: the checks, the download, the load, the warm-up and the summary](../figures/V03_first_run_vs_cached.png)

Reading the figure: The figure shows first use with the download (158.3 s), the load (3.8 s), the warm-up (about 30 s) and the summary (3.7 s), 196.8 s in all. Later use is drawn with the stored model and 15.3 s in all. Those later-use timings come from the offline run recorded before the label fix.

1. **Opening the popup.** The service worker asks the offscreen page for the card and the cache. The page checks `navigator.gpu`, the adapter and the `shader-f16` feature, looks for the model in IndexedDB, and reads the download size (about 695 MB) from the model's file list. On an Intel built-in chip (vendor `intel`, architecture containing `gen`) the service worker switches to SmolLM2. Other integrated chips are not detected.
2. **Pressing the button (0 s).** The service worker writes the job record and replies at once.
3. **Reading the page (0.1 s).** `extractFromTab` refuses browser pages Chrome does not allow, then injects Readability and the extractor.
4. **Checking the card (under a second).** The pipeline calls `engine.prepare`.
5. **Downloading (0.5 s to 158.8 s).** WebLLM runs in a web worker with its cache in IndexedDB. Progress arrives as `MODEL_PROGRESS` messages.
6. **Loading into the card (158.8 s to 162.6 s).**
7. **Warming up (162.6 s to 193.1 s).** One request of one token ("Say ok.") makes the card compile its programs.
8. **Summarizing (193.1 s to 196.8 s).** One part and one request.

The download and load labels follow one rule, changed after a review of the real runs. A model that is not stored is labelled "downloading" when WebLLM's report contains "fetch". A stored model is always labelled "loading", because WebLLM also says "fetch" when it reads a stored model from the browser's own storage. Before the change, the offline run showed "Downloading" for about a second on a stored model.

![Real model, second NVIDIA run: the popup while the model downloads at 32%](../screenshots/v2-nvidia-short-downloading.png)

Real model, second NVIDIA run, done while other programs were using the processor. The download label is correct here, because the model was not stored.

The result of the same run, `v2-nvidia-short-popup.png`, was recorded before the model line was refreshed after a job. Its model line still reads "Not downloaded yet". The popup now refreshes that line once when a job ends, successful or not. It is still not refreshed while the download or warm-up runs.

**What this means in plain words.** The first use is slow mainly because of the download, about 158 s of the 197 s. The card then needs about 30 s more before the first answer.

## Later use, step by step

A later use has the same screens with the long steps removed. The reference is the offline run made after the label fix, with outside websites blocked (`docs/test-runs/v2-local-nvidia-offline-after-label-fix.md`).

1. **Opening the popup.** The line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer.", and the button reads "Summarize this page".
2. **Pressing the button (0 s).** The page is read in 0.1 s, and the card is checked at 0.6 s.
3. **Loading from the cache (1.9 s to 12.7 s).** The load took 11.6 s in this run, against 6.9 s in the earlier offline run, so the time varies.
4. **Warming up (13.1 s to 13.5 s).** Under half a second, against about 30 s on first use. The reason is not measured.
5. **Summarizing.** The short article took 17.7 s in all, and the two-part article 16 s.

![Real model, offline run after the label fix: warm-up on a stored model, with no Downloading line](../screenshots/v2-nvidia-offline-short-warming-after-label-fix.png)

The picture shows the warm-up on a stored model, with no "Downloading" line. The finished popup of the same run (`v2-nvidia-offline-short-popup-after-label-fix.png`) shows the model line "Downloaded, runs on this computer." and its own clock reads 17.5 s. The test setup, which starts its clock at the click, recorded 17.7 s.

The earlier offline run, recorded before the label fix, gave 15.3 s and 16.5 s. Those timings are still cited, because the same test setup measured them. That run shows the "Downloading" line for about a second at 3.9 s, which the fix removed.

**What this means in plain words.** Once the model is stored, a short article takes about 15 to 18 seconds on the NVIDIA chip, with no internet needed.

## What runs where on the client's laptop

Table: What runs where on the client's laptop

| Place | What runs there | What it uses | Notes |
|---|---|---|---|
| The page being read | The text the extractor reads | Nothing extra | Read in place by an injected script |
| Popup window | The button and the view of the job | A little memory | Can be closed at any time |
| Service worker | The job and its record | Memory while a job runs | Chrome can stop it when idle |
| Offscreen page and web worker | The loaded model and WebLLM | Memory and the graphics card | Closed five minutes after the last message |
| Graphics card | The model's arithmetic | 879 MB (1B model), 376 MB (SmolLM2), from `config.js` | Freed when the offscreen page closes |
| Browser profile on disk | Model files in IndexedDB | About 695 MB (1B), 204 MB (SmolLM2), as the popup reports | Kept by `unlimitedStorage` |

![What runs where on the client's laptop: Chrome processes, the graphics card and the disk cache](../figures/V12_deployment.png)

Reading the figure: The figure places the popup, service worker, offscreen page, web worker, Chrome's GPU process and graphics card on the laptop, with the disk beside them. Only the first download reaches Hugging Face and GitHub, drawn as a dashed arrow. The footnote says the client's laptop has not been tested.

The model cache sits in the client's Chrome profile, not in the project folder. The `.model-profile` folders in `finalsem/project` are test profiles from `scripts/local-run.mjs`, and `.gitignore` excludes them. `setup.bat --gpu` writes one per-user registry value, `GpuPreference=2;`, and runs only when asked for.

**What this means in plain words.** Most of the work happens in the browser on the client's machine. One setup choice decides which graphics chip Chrome uses.

## What was reused from Version 1, what changed, what is new

The comparison used `diff -rq` on `midsem/project/src` and `finalsem/project/src`, then a line-by-line diff of each changed file. Version 1's source folder holds 19 files and Version 2's holds 26.

- **Unchanged, byte for byte (8 files):** `background/extract-tab.js`, `content/extract.js`, `core/chunker.js`, `core/merger.js`, `core/url.js`, `ui/summary-format.js`, `lib/readability.js` and `lib/READABILITY_LICENSE.md`.
- **Changed (8 files), with diff lines (old and new together):** `background/service-worker.js` 85, `core/config.js` 83, `core/errors.js` 56, `core/pipeline.js` 6 (all added), `core/prompts.js` 61, `ui/popup.html` 16, `ui/popup.js` 172, `ui/ui.css` 38 (key-box and options rules removed, six lines added).
- **Removed (3 files):** `engines/gemini.js`, `ui/options.html`, `ui/options.js`.
- **New (10 files):** `background/offscreen-manager.js`, `core/engine-errors.js`, `core/gpu-check.js`, `engines/local.js`, `lib/web-llm.js`, `lib/WEBLLM_LICENSE`, and four files in `offscreen/`.

The counts agree: 8 unchanged, 8 changed and 3 removed make the 19 Version 1 files, and 8 unchanged, 8 changed and 10 new make the 26 Version 2 files. The diff line counts show the size of each change, not how many edits were made.

In the changed files, the largest changes are these. Service worker: the job logic is Version 1's, the Gemini engine is replaced by `makeEngine`, and the progress listener, the model-state message and the fallback save are added. Config: the part size goes from 8,000 to 6,000 characters and the part limit from 30 to 12. Errors: the five key, rate and network codes go, and the model codes come in.

![Reuse from Version 1 to Version 2: unchanged, changed and new files](../figures/V14_reuse_v1_v2.png)

Reading the figure: The figure sorts the files into the groups above. Its line counts do not match a fresh diff of the current code (for example, `ui/ui.css` shows 5 where the fresh diff gives 38), so this chapter uses the fresh counts. The groups match.

**What this means in plain words.** Eight of the 19 Version 1 files carry over unchanged. They are the part of the product that reads and summarizes text, while the engine, the key and the messages differ.

## The engine seam: how the model plugs in

The pipeline runs the whole job through one engine object. Its contract, in the header of `pipeline.js`, needs `summarizeChunk` for one part and `mergeSummaries` for a merge. Version 2 adds an optional `prepare` step, which the pipeline calls once before the first part. A cloud-style engine has no such step, so the pipeline checks for it first.

`finalsem/project/src/core/pipeline.js`, lines 45 to 49

```
  // The local engine needs its model ready (graphics card checked, model downloaded and loaded)
  // before the first part. A cloud-style engine simply has no prepare() step.
  if (typeof engine.prepare === 'function') {
    await engine.prepare({ signal, onProgress });
  }
```

`prepare` in `local.js` checks the card and loads the model. If the load fails for lack of graphics memory or a start failure, it retries once with the small model and saves that choice, so later jobs also start with the small model.

`finalsem/project/src/engines/local.js`, lines 70 to 89

```
    /** Checks the graphics card, downloads the model if needed, and loads it. Throws AppError. */
    async prepare({ onProgress = () => {} } = {}) {
      onProgress({ phase: 'checking' });
      const status = await engine.checkStatus();
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

Both generation methods pass through one `generate` function, which removes copied page markers from the answer. The page prompts put a safety line and the title first, then the page text between two markers, then one fixed instruction. Parts are cut at about 6,000 characters (`chunkChars`), and a page needing more than 12 parts is refused (`maxChunks`). The seven-part Wikipedia article made eight requests, seven for parts and one merge, and its clean run took 74.1 s.

![Flow of prepare: check the status, pick the small model on integrated graphics, download if needed, load, warm up, and retry once on a memory failure](../figures/V04_model_preparation.png)

Reading the figure: The figure follows `prepare`. NO_WEBGPU or NO_SHADER_F16 stops the job. SmolLM2 is chosen for integrated graphics, for memory under 8 GB, or when a fallback is saved. A GPU_MEMORY or MODEL_LOAD_FAILED error with Llama 3.2 1B saves the fallback and retries once. Any other error stops with its message.

![A long page cut into parts of about 6,000 characters, each summarized and then merged](../figures/V16_chunking_v2.png)

Reading the figure: The figure cuts the Lighthouse article (36,752 characters) into seven parts and merges the seven summaries in one request. Its clean-run timeline gives parts of 4.6 to 16.6 s, a merge of 13.9 s and 74.1 s in all.

The Intel summary shows why the marker step matters. The model copied the start marker into its answer, so the saved summary begins with `<<<PAGE TEXT START>>>`. That run was recorded before `stripPageMarkers` existed, and the saved summary and its screenshot still show the marker. The current code removes copied markers from every answer, and two unit tests check it.

![Real model, Intel built-in graphics, first use, recorded before the marker fix: the popup with the Intel note and the marker text](../screenshots/v2-intel-short-popup.png)

The graphics note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The result begins with the marker line.

**What this means in plain words.** The pipeline does not need to know which model runs. A small model can still copy markers into its answer, so the code cleans the answer before the reader sees it.

## How a failure reaches the reader

Every failure becomes one of the codes in `src/core/errors.js`, with a plain message for the popup. The technical detail goes to the console only.

Table: How a failure reaches the reader (selected codes)

| Code | Raised where | What the reader sees | Test |
|---|---|---|---|
| NO_WEBGPU, NO_SHADER_F16 | `evaluateGpu` in `gpu-check.js`, at the status check | The model line gives the reason; the button is disabled | Scenarios V07, V08 |
| GPU_MEMORY, MODEL_LOAD_FAILED | `classifyEngineError`, during the load | The small model is tried once, the choice is saved, and the result carries a notice | Scenario V10 (notice); V11 when both fail |
| MODEL_DOWNLOAD_FAILED | `classifyEngineError`, when the message mentions the network | A message; nothing is saved, and a later press works | Scenario V12 |
| TOO_LONG | `runPipeline`, above 12 parts | Refused before any download | Scenario V06 |
| EMPTY_ANSWER | `generate` in `local.js` | A message saying no summary was returned | Scenario V13 |
| TIMEOUT | Timer in the offscreen page, 180 s | A message | Unit test of the code only; no automated test runs the timer |
| INTERRUPTED | `sweepOrphans` after a worker restart, or no update for five minutes | A message, and the popup says so | Scenario V20 |

![Pretend model screenshot: the result after the main model ran out of memory, with the notice that the smaller model wrote the summary](../screenshots/ui-12-fallback-after-out-of-memory.png)

This is a pretend-model picture. The notice reads "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The numbers in the picture, such as 2.3 s, belong to the pretend model and are not measurements.

![How the errors flow from the code to the popup](../figures/V11_error_flow.png)

Reading the figure: Each error code is one row, with when it happens and the message the reader sees. Yellow rows retry once with SmolLM2 360M, red rows stop the job and show a message, and grey rows are refused early or not shown. TIMEOUT is drawn as no answer within 3 minutes, which matches the 180-second limit.

**What this means in plain words.** Each failure has one name in the code and one message on the screen. The gap is the timeout, which has a message but no automated test.

## Questions this chapter answers

**Why does the popup not run the model itself?**
The popup can be closed at any moment, and a first model load takes minutes. The service worker owns the job and the offscreen page owns the model, so the popup only starts a job and reads its record.

**Why can the popup be closed during a job?**
The job's progress is written to `chrome.storage.session` under the tab's key. Reopening the popup reads that record, so the same job is shown (scenario V15).

**How long does each step take?**
On the clean NVIDIA first use, the download took 158.3 s, the load 3.8 s, the warm-up 30.5 s and the summary 3.7 s, for 196.8 s in total. With the model stored, the run after the label fix took 17.7 s, with a load of 11.6 s and a warm-up of 0.4 s.

**What did Version 2 reuse from Version 1?**
Eight files are byte-for-byte the same, eight changed, three were removed and ten are new. The reading, cutting, merging and formatting code is unchanged, and `pipeline.js` gained only six lines.

**How would a different engine plug in?**
An engine needs `summarizeChunk` and `mergeSummaries`, plus `prepare` if it has a setup step. The pipeline, the job record and the popup do not change, and both the Version 2 model and the Version 1 cloud engine fit this contract.
