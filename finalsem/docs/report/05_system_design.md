# System design of Version 2

This chapter describes how Version 2 is built: the layers and who owns each one, the job record that lets the popup close during a job, the first-use and later-use sequences, what runs on the client's laptop, which Version 1 parts were reused, and where the model plugs into the code.

Some terms are used throughout. A **service worker** is the extension's background script, which Chrome may stop when idle. An **offscreen page** is a hidden extension page that Chrome keeps open for a task such as running the model. A **web worker** is a background thread that a page starts, so heavy work does not freeze the page. **WebLLM** is the open-source library that loads the model and runs it. **WebGPU** is the browser's route to the graphics card.

## The layers

Table: The layers of Version 2, what each owns, and what it talks to

| Layer | Files | Owns | Talks to |
|---|---|---|---|
| Popup | `src/ui/popup.html`, `popup.js` | The button, model line, progress bar and summary | Service worker, by message; reads the job record |
| Service worker | `src/background/service-worker.js` | The job: its id, phases, record, stop and cancel | Popup, offscreen manager, pipeline, Chrome tabs |
| Offscreen manager | `src/background/offscreen-manager.js` | Opening and closing the hidden page, and its idle timer | Chrome's offscreen API, the offscreen page |
| Offscreen page | `src/offscreen/offscreen.js` | The loaded model, the download, the warm-up, one answer at a time | Service worker, by message; the web worker |
| Web worker | `src/offscreen/engine-worker.js` | Splitting text into tokens and running the model | The offscreen page, through WebLLM |
| WebLLM | `src/lib/web-llm.js` (version 0.2.86) | Model files, the cache, the model runtime | Web worker, IndexedDB, WebGPU |
| Graphics card | Reached through WebGPU | The model's arithmetic | WebLLM |

Three stores sit beside these layers. The job record lives in `chrome.storage.session` under the key `job:<tabId>` and lasts until the browser restarts. The model files live in IndexedDB inside the browser profile and stay until removed. Settings and the saved fallback choice (`modelOverride`) live in `chrome.storage.local`.

![Layers of Version 2: popup, service worker, offscreen page, web worker, WebLLM and the graphics card, with the three stores beside them](../figures/V02_layers.png)
<!-- check against figure -->

Reading the figure: The figure stacks the layers from the popup down to the graphics card, with the three stores beside them. Its order matches the table, so one summary can be traced from the button to the card.

**What this means in plain words.** The popup is only a window. The service worker owns the job, the offscreen page owns the model, and the browser owns the files and the card. Each layer can stop or restart without losing the others' data.

## The job record, and why the popup can close

Each tab has at most one job record. The service worker creates it when the popup asks for a summary. It holds the job id, status, phase, percentage, summary, error, statistics and page address. Every change goes through `writeJob`, which runs the writes for one tab in order. A write is applied only if the stored record still has the same job id, so a replaced job cannot overwrite the newer one.

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

The popup sends one `START_SUMMARY` message and gets `{ok: true}` back at once. The job then runs in the service worker, and closing the popup changes nothing in it. Reopening the popup shows the same job (browser test V15), and a finished job is shown without a new run (V16).

A dead worker writes nothing, so the popup re-checks its last job every five seconds. A running job not updated for three minutes (`STALE_MS`) shows as interrupted. A new service worker marks any job left "running" as INTERRUPTED (V20), and a closed tab has its job aborted (V22).

![Job phases in order: extracting, checking, downloading, loading, warming up, summarizing, merging, done or error](../figures/V06_job_phases.png)
<!-- check against figure -->

Reading the figure: The figure lists the phases the popup can show, in order. In the code a stored model skips the downloading phase. The real runs show one short exception, described in the later-use section.

**What this means in plain words.** The summary keeps going when the popup closes, because the record holds the job. Chrome can stop the service worker at any time, so progress is written as it goes, and a job that has stopped is marked interrupted.

## The offscreen page and the keepalive

The model takes seconds to load, and a stopped service worker would lose it. The model therefore lives in an offscreen page, which stays alive and has only the `chrome.runtime` API. The service worker asks, and the page answers by message. While it works, the page sends `KEEPALIVE` every 10 seconds. The service worker's comment says that receiving it keeps the worker awake. The design does not rely on this alone, because a stopped worker still leads to the INTERRUPTED path (V20).

`finalsem/project/src/background/offscreen-manager.js`, lines 60 to 71

```
  async function send(message) {
    await ensure();
    clearTimeout(closeTimer);
    const run = () => api.runtime.sendMessage(message);
    try {
      // Answers are generated one at a time, in the order they were asked.
      const result = message.type === 'LOCAL_GENERATE' ? (generateChain = generateChain.then(run, run)) : run();
      return await result;
    } finally {
      void scheduleIdleClose();
    }
  }
```

Each message restarts an idle timer. After five minutes with no message (`idleCloseMs`), the page closes. The model stays in IndexedDB, so the next use loads it again instead of downloading it (V23). Answers are chained, so two parts are never sent to the card at once.

![Messages between the service worker and the offscreen page](../figures/V05_offscreen_messages.png)
<!-- check against figure -->

Reading the figure: The figure shows requests going from the service worker to the page (`LOCAL_STATUS`, `LOCAL_LOAD`, `LOCAL_GENERATE`) and the replies coming back (`MODEL_PROGRESS`, `KEEPALIVE`). The idle close after five minutes is the last step.

**What this means in plain words.** The model sits in a hidden page that stays alive while there is work. The page closes after five minutes of quiet, and the downloaded model stays on disk.

## First use, step by step

A first use goes through eight steps. The times come from the clean NVIDIA run of a one-part short article (`docs/test-runs/v2-local-nvidia-cold-first-attempt.md`).

![First use and later use compared: the checks, the download, the load, the warm-up and the summary](../figures/V03_first_run_vs_cached.png)
<!-- check against figure -->

Reading the figure: The figure sets the two sequences side by side. The first use has the download and the warm-up. The later use goes straight to the load from the cache. The times in the figure are the measured ones given here.

1. **Opening the popup.** The popup asks for the model state. The service worker asks the offscreen page for the card and the cache. The page checks `navigator.gpu`, asks for an adapter, checks for the `shader-f16` feature, looks for the model in IndexedDB, and reads the download size (about 695 MB) from the model's file list. On an Intel built-in chip (the check looks for the vendor `intel` and an architecture containing `gen`) the service worker switches to SmolLM2. Other integrated chips are not detected. The button reads "Download model and summarize".
2. **Pressing the button (0 s).** The popup sends `START_SUMMARY`. The service worker writes the job record and replies at once.
3. **Reading the page (0.1 s).** `extractFromTab` refuses browser pages that Chrome does not allow, then injects Readability and the extractor.
4. **Checking the card (under a second).** The pipeline calls `engine.prepare`, which reports the checking phase.
5. **Downloading (0.5 s to 158 s).** The offscreen page starts WebLLM in a web worker, with the cache set to IndexedDB. Progress arrives as `MODEL_PROGRESS` messages. This is the longest step, about 157 s of the 197 s total.
6. **Loading into the card (158.8 s to 162.2 s).** About 3.4 s.
7. **Warming up (162.6 s to 193.1 s).** The page sends one request, "Say ok.", with one token of output, so the card can compile its programs. The popup warns that this can take about 30 seconds. Here it took about 30.5 s.
8. **Summarizing (193.1 s to 196.8 s).** One part, one request, about 3.7 s.

The labels in steps 5 and 6 alternate during the first 25 seconds. The timeline shows "Loading the model into the graphics card: 0%" at 5.1 s and "Downloading the model (first time only): 7%" at 21.9 s. The label follows WebLLM's wording. `mapInitProgress` in `gpu-check.js` labels any report containing "fetch" as downloading, and everything else as loading.

![Real model, second NVIDIA run: the popup while the model downloads at 32%](../screenshots/v2-nvidia-short-downloading.png)

This picture comes from the second NVIDIA run, the one done while other programs were using the processor. The button is greyed out while the job runs. The model line says "Not downloaded yet (about 695 MB, first use only)", and the progress text reads "Downloading the model (first time only): 32%" with the bar about one third full.

The warm-up picture (`v2-nvidia-short-warming.png`) shows the text "Warming up the model (first time can take about 30 seconds)..." with an empty bar, because a step with no measure is shown as indeterminate.

The result of the same run (`v2-nvidia-short-popup.png`) shows four numbered points and the line "1 part · 1 request · 206.5 s · Llama 3.2 1B". Its model line still says "Not downloaded yet". The popup refreshes that line after the result appears, and this picture was taken before the refresh. The repository does not confirm the explanation, so it is listed as unverified.

**What this means in plain words.** The first use is slow mainly because of the download, about 157 s of the 197 s. The card then needs about 30 s more to prepare its programs. The summary itself takes a few seconds.

## Later use, step by step

A later use has the same screens with the long steps removed. The reference is the clean offline run, with outside websites blocked (`docs/test-runs/v2-local-nvidia-offline.md`).

1. **Opening the popup.** The line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer." and the button reads "Summarize this page".
2. **Pressing the button (0 s).** The page is read in 0.1 s, and the card is checked at 0.6 s.
3. **Loading from the cache (1.3 s to 7.6 s).** The model is read from IndexedDB into the card. The run recorded a load time of 6.9 s.
4. **Warming up (8.1 s to 8.6 s).** Half a second, against about 30 s on the first use. The repository does not say why the compile cost is not repeated, so the reason is not recorded.
5. **Summarizing.** The short article took 15.3 s in total. The two-part article took 16.5 s: part 1 started at 2.4 s, part 2 at 7.4 s, and combining at 12.3 s.

The offline timeline also shows "Downloading the model (first time only): 0%" at 3.9 s, before the loading label returns at 4.7 s. A stored model therefore shows the download label for about a second. The probable cause is that WebLLM's wording for reading the cache contains "fetch". The repository does not confirm this, and no test checks the label.

![Real model, clean offline run with outside websites blocked: the popup on a stored model](../screenshots/v2-nvidia-offline-short-popup.png)

The model line says "Downloaded, runs on this computer.", and the button reads "Summarize this page". The result shows four numbered points and the line "1 part · 1 request · 14.8 s · Llama 3.2 1B". The extension's timer reads 14.8 s, and the test harness, which starts its clock at the click, recorded 15.3 s for the run.

**What this means in plain words.** Once the model is stored, a short article takes about 15 seconds on the NVIDIA chip, with no internet needed.

## What runs where on the client's laptop

Table: What runs where on the client's laptop

| Place | What runs there | What it uses | Notes |
|---|---|---|---|
| The page being read | The text the extractor reads | Nothing extra | Read in place by an injected script |
| Popup window | The button and the view of the job | A little memory | Can be closed at any time |
| Service worker | The job and its record | Memory while a job runs | Chrome can stop it when idle |
| Offscreen page and web worker | The loaded model and WebLLM | Memory and the graphics card | Closed after five minutes with no messages |
| Graphics card | The model's arithmetic | 879 MB for the 1B model, 376 MB for SmolLM2 (`config.js`) | Freed when the offscreen page closes |
| Browser profile on disk | The model files in IndexedDB | About 695 MB (1B model), 204 MB (SmolLM2), as the popup reports | Kept by `unlimitedStorage` |

![What runs where on the client's laptop: Chrome processes, the graphics card and the disk cache](../figures/V12_deployment.png)
<!-- check against figure -->

Reading the figure: The figure places the Chrome processes, the graphics card and the disk cache on the laptop. The table above gives the sizes.

Three points are easy to misread. The model cache sits in the client's Chrome profile, not in the project folder. The `.model-profile` folders in `finalsem/project` are test profiles from `scripts/local-run.mjs`, and `.gitignore` excludes them. `setup.bat --gpu` is opt-in: it writes one per-user registry value, `GpuPreference=2;`, and is never run by default.

**What this means in plain words.** Most of the work happens in the browser on the client's machine. The disk holds the model, the card holds it while it runs, and one setup choice decides which graphics chip Chrome uses.

## What was reused from Version 1, what changed, what is new

The comparison used `diff -rq` on `midsem/project/src` and `finalsem/project/src`, then a line-by-line diff of each changed file. Version 1's source folder holds 19 files and Version 2's holds 26.

- **Unchanged, byte for byte (8 files):** `background/extract-tab.js`, `content/extract.js`, `core/chunker.js`, `core/merger.js`, `core/url.js`, `ui/summary-format.js`, `lib/readability.js` and `lib/READABILITY_LICENSE.md`.
- **Changed (8 files):** `background/service-worker.js`, `core/config.js`, `core/errors.js`, `core/pipeline.js`, `core/prompts.js`, `ui/popup.html`, `ui/popup.js` and `ui/ui.css`.
- **Removed (3 files):** `engines/gemini.js`, `ui/options.html` and `ui/options.js`.
- **New (10 files):** `background/offscreen-manager.js`, `core/engine-errors.js`, `core/gpu-check.js`, `engines/local.js`, `lib/web-llm.js`, `lib/WEBLLM_LICENSE`, and four files in `offscreen/`.

The counts agree: 8 unchanged, 8 changed and 3 removed make the 19 Version 1 files, and 8 unchanged, 8 changed and 10 new make the 26 Version 2 files. The unchanged files do not know which engine runs. They read the page, join text, check URLs and format the summary. The changes in the other files are these:

- **`core/pipeline.js`** gains six lines, the call to `engine.prepare`, and nothing else.
- **`core/config.js`** changes the part size from 8,000 to 6,000 characters and the part limit from 30 to 12. The Gemini model and key settings go.
- **`core/errors.js`** drops the five key, rate and network codes, and adds NO_WEBGPU, NO_SHADER_F16, GPU_MEMORY, MODEL_DOWNLOAD_FAILED and MODEL_LOAD_FAILED.
- **`core/prompts.js`** gets a new version marker (v2.0) and instructions written for a small model. The page markers stay the same.
- **`background/service-worker.js`** keeps Version 1's job logic: the job id, the record, the orphan sweep and the tab cleanup. It swaps the Gemini engine for `makeEngine` and adds the progress listener and the model-state message. Its tab-closed cleanup now waits for queued writes (test V22).
- **`ui/popup.html` and `ui/popup.js`** lose the key button, the key form and the Options link. The model line and the graphics note are new, and the phase labels in `progressLabel` are extended. **`ui/ui.css`** gains five lines, and its older key-box rules are now unused.

![Reuse from Version 1 to Version 2: unchanged, changed and new files](../figures/V14_reuse_v1_v2.png)
<!-- check against figure -->

Reading the figure: The figure sorts the files into the three groups above, under the same names. The labels were checked against the diff.

**What this means in plain words.** Eight of the 19 Version 1 files carry over unchanged. They are the part of the product that reads and summarizes text. The engine, the key handling and the messages are where the two versions differ.

## The engine seam: how the model plugs in

The pipeline runs the whole job through one engine object. The contract, written in the header of `pipeline.js`, needs `summarizeChunk`, which summarizes one part, and `mergeSummaries`, which combines part summaries. Version 2 adds an optional step, `prepare`, which the pipeline calls once before the first part. A cloud-style engine has no such step, so the pipeline checks for it first.

`finalsem/project/src/core/pipeline.js`, lines 45 to 49

```
  // The local engine needs its model ready (graphics card checked, model downloaded and loaded)
  // before the first part. A cloud-style engine simply has no prepare() step.
  if (typeof engine.prepare === 'function') {
    await engine.prepare({ signal, onProgress });
  }
```

`prepare` in `local.js` does the work. It checks the card, loads the model, and retries once with the small model if the load fails for lack of graphics memory or a start failure.

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

The two generation methods share one `generate` function. The page prompts put a safety line and the title first, then the page text between two markers, then one fixed instruction. The safety line tells the model that the text is material and never instructions.

Parts are cut at about 6,000 characters (`chunkChars`), and a page needing more than 12 parts is refused (`maxChunks`). Part summaries are merged in groups that fit the same limit, until one summary remains. The seven-part Wikipedia article made eight requests, seven for parts and one merge, and its clean run took 74.1 s.

![Flow of prepare: check the status, pick the small model on integrated graphics, download if needed, load, warm up, and retry once on a memory failure](../figures/V04_model_preparation.png)
<!-- check against figure -->

Reading the figure: The figure follows `prepare` from top to bottom, with two decisions: the integrated-graphics branch and the single retry. The figure plan names GPU_MEMORY and MODEL_LOAD_FAILED for the retry, which are the codes `local.js` uses.

![A long page cut into parts of about 6,000 characters, each summarized and then merged](../figures/V16_chunking_v2.png)
<!-- check against figure -->

Reading the figure: The figure shows the page cut into parts, each summarized, and then merged. The part size and the limit of 12 are the values in `config.js`, and the example is the seven-part Lighthouse article.

One limit shows in the saved Intel summary. The model copied the start marker into its answer. The short article's summary begins with `<<<PAGE TEXT START>>>`, followed by paragraphs that reuse the article's sentences closely. No code removes the marker from an answer, and no test checks for it.

![Real model, Intel built-in graphics, first use: the popup with the Intel note and the marker text](../screenshots/v2-intel-short-popup.png)

This is the single Intel run, a first use. The graphics note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The model line still says "Not downloaded yet (about 204 MB, first use only)", the same stale line as in the NVIDIA first-use pictures. The result begins with the marker line, and its paragraphs are bold because the stylesheet sets summary paragraphs to bold. The statistics line is outside the frame.

**What this means in plain words.** The pipeline does not need to know which model runs. It asks for a summary of each part, a merge, and an optional setup step. A small model can still carry formatting faults into its answer, and no test catches the marker fault yet.

## How a failure reaches the reader

Every failure becomes one of the codes in `src/core/errors.js`, with a plain message for the popup. The technical detail goes to the console only.

Table: How a failure reaches the reader (selected codes)

| Code | Raised where | What the reader sees | Test |
|---|---|---|---|
| NO_WEBGPU, NO_SHADER_F16 | `evaluateGpu` in `gpu-check.js`, at the status check | The model line says why; the button is disabled | V07; V08 |
| GPU_MEMORY | `classifyEngineError`, during the load | The small model is tried once, and the choice is saved | V10; V11 when both fail |
| MODEL_DOWNLOAD_FAILED | `classifyEngineError`, when the message mentions the network | A message. Nothing is saved, and a later press works | V12 |
| TOO_LONG | `runPipeline`, above 12 parts | Refused before any download | V06 |
| EMPTY_ANSWER | `generate` in `local.js` | A message saying no summary was returned | V13 |
| TIMEOUT | Timer in `offscreen.js`, 180 s | A message | Unit test of the code only; the timer is not tested |
| INTERRUPTED | `sweepOrphans` after a worker restart | A message, and the popup says so | V20 |

![How the errors flow from the code to the popup](../figures/V11_error_flow.png)
<!-- check against figure -->

Reading the figure: Each code is traced from where it is raised to the popup message, as in the table.

**What this means in plain words.** Each failure has one name in the code and one message on the screen. The gap is the timeout, which has a message but a timer with no test.

## Questions this chapter answers

**Why does the popup not run the model itself?**
The popup can be closed at any moment, and a first model load takes minutes. The service worker owns the job and the offscreen page owns the model, so the popup only starts a job and reads its record.

**Why can the popup be closed during a job?**
The job's progress is written to `chrome.storage.session` under the tab's key. Reopening the popup reads that record, so the same job is shown (test V15).

**How long does each step take?**
On the clean NVIDIA first use, the download takes about 157 s, the load 3.4 s, the warm-up about 30.5 s and the summary 3.7 s, for 196.8 s in total. With the model stored, the load takes 6.9 s, the warm-up half a second, and the whole short article 15.3 s.

**What did Version 2 reuse from Version 1?**
Eight files are byte-for-byte the same, eight changed, three were removed and ten are new. The reading, cutting, merging and formatting code is unchanged, and `pipeline.js` gained only six lines.

**How would a different engine plug in?**
An engine needs `summarizeChunk` and `mergeSummaries`, plus `prepare` if it has a setup step. The pipeline, the job record and the popup do not change, and both the Version 2 model and the Version 1 cloud engine fit this contract.
