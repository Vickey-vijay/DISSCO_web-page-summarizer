# Getting the model onto the laptop

## What this part does and why it exists

The first time a reader presses the button, the model has to arrive on the laptop. The 1B model is about 695 MB of weights, and it also needs a graphics library and a tokenizer. The download and the load take most of the waiting. After that the model stays in the browser, so later summaries start in seconds.

The work is split between two pages. The offscreen page (`src/offscreen/offscreen.js`) asks WebLLM to download and load the model, and it sends progress messages. The service worker writes those messages into the job record that the popup reads. WebLLM is the library copied into `src/lib/web-llm.js`. Nothing in the project makes a cloud call, so the only outside traffic is the first download.

## The first-use steps, one by one

The table lists the steps of a first summary. Its timings come from the clean cold run on the NVIDIA chip (`v2-local-nvidia-cold-first-attempt.md`).

Table: The first-use steps with the timings from the clean cold run

| Step | What happens in the code | Seconds in the run |
|---|---|---|
| 1. Read the page | The page text is extracted and checked for length | 0.0 to 0.1 |
| 2. Check the card | `LOCAL_STATUS` asks the page about the card and whether the model is stored | Under 0.5 (the script's sampling did not catch the label) |
| 3. Download | WebLLM fetches the weights and the graphics library, and reports progress | 0.5 to 158 |
| 4. Load | The model is put into the graphics card | 158.8 to 162.2 |
| 5. Warm up | One token is written, so the graphics programs compile before the first real part | 162.6 to 193.1 |
| 6. Summarize | The one part is summarized and the result is shown | 193.1 to 196.8 |

The engine also reports its own load time: 192,580 ms from the start of the load to the end of the warm-up. That is the `Load (ms)` value in the run file.

**What this means in plain words.** A first summary has six steps. The download is about 80 percent of the wait on this laptop, so most of the time goes to the network and the disk.

![Horizontal timeline of the first-use run: download, loading into the card, warm-up and summary, with seconds from the clean cold run](../figures/V09_cold_timeline.png)
<!-- check against figure -->

Reading the figure: as planned, one horizontal timeline of about 197 seconds. The download is the widest block, about 158 seconds. The load (about 3 seconds), the warm-up (about 30 seconds) and the summary (about 4 seconds) follow, each labelled with its seconds from the clean run.

## How download progress becomes the percentages the reader sees

WebLLM reports its progress through a callback. The code turns each report into a phase and a whole percentage before sending it on.

`src/offscreen/offscreen.js`
```js
        engine = await CreateWebWorkerMLCEngine(worker, modelId, {
          appConfig: APP_CONFIG,
          initProgressCallback: (report) => emitProgress(mapInitProgress(report)),
        });
```

`src/core/gpu-check.js`
```js
export function mapInitProgress(report) {
  const text = String(report?.text ?? '');
  const fraction = Math.max(0, Math.min(1, Number(report?.progress) || 0));
  // "Start to fetch params" and "Fetching param cache[...]" both mean the download is happening.
  const phase = /fetch/i.test(text) ? 'downloading' : 'loading';
  return { phase, percent: Math.round(fraction * 100), text };
}
```

The path has five steps. `mapInitProgress` clamps WebLLM's fraction to the range 0 to 1 and rounds it to a whole percentage. It sets the phase to "downloading" when the text contains "fetch", and to "loading" otherwise. The offscreen page sends the result as a `MODEL_PROGRESS` message. The service worker writes the phase, the percentage and the text into the job record in `chrome.storage.session`. The popup re-renders on that change and shows a label such as "Downloading the model (first time only): 32%".

The phase depends on WebLLM's wording, which the project does not control. The comment in `gpu-check.js` expects a download to say "Fetching param cache", and a cached load to say "Loading model from cache". The runs do not match that rule in every case. The table below is the full cold timeline from the run file. The script read the label every 0.4 seconds, so a label that lasted less than that may be missing.

Table: Progress timeline of the clean cold run, in the order the popup showed it

| Seconds | Label shown in the popup | Percent |
|---|---|---|
| 0.1 | Reading the page... | |
| 0.5 | Downloading the model (first time only) | 0 |
| 5.1 | Loading the model into the graphics card | 0 |
| 21.9 | Downloading the model (first time only) | 7 |
| 48.6 | Downloading the model (first time only) | 11 |
| 49.0 | Downloading the model (first time only) | 15 |
| 49.5 | Downloading the model (first time only) | 18 |
| 81.1 | Downloading the model (first time only) | 23 |
| 82.4 | Downloading the model (first time only) | 32 |
| 106.7 | Downloading the model (first time only) | 36 |
| 107.5 | Downloading the model (first time only) | 45 |
| 109.2 | Downloading the model (first time only) | 64 |
| 124.6 | Downloading the model (first time only) | 67 |
| 129.2 | Downloading the model (first time only) | 71 |
| 131.7 | Downloading the model (first time only) | 76 |
| 133.0 | Downloading the model (first time only) | 80 |
| 139.2 | Downloading the model (first time only) | 85 |
| 139.6 | Downloading the model (first time only) | 87 |
| 150.4 | Downloading the model (first time only) | 91 |
| 150.8 | Downloading the model (first time only) | 95 |
| 158.0 | Downloading the model (first time only) | 100 |
| 158.8 | Loading the model into the graphics card | 21 |
| 159.2 | Loading the model into the graphics card | 30 |
| 159.6 | Loading the model into the graphics card | 41 |
| 160.1 | Loading the model into the graphics card | 50 |
| 160.5 | Loading the model into the graphics card | 61 |
| 160.9 | Loading the model into the graphics card | 70 |
| 161.3 | Loading the model into the graphics card | 85 |
| 161.7 | Loading the model into the graphics card | 96 |
| 162.2 | Loading the model into the graphics card | 100 |
| 162.6 | Warming up the model (first time can take about 30 seconds) | |
| 193.1 | Summarizing... | |

The percentage rises inside each phase, and the phase changes at 100 percent. The run files do not say whether WebLLM's fraction counts bytes or files, so what the percentage measures is [to be measured].

The label can be wrong. In the offline run, which read a model already stored in the browser, the popup showed "Downloading the model (first time only): 0%" at 3.9 seconds, between two "Loading" lines. In the cold run, "Loading ... 0%" appeared at 5.1 seconds, between the first download label at 0.5 seconds and the next download percentage at 21.9 seconds. The repository does not record WebLLM's full text for these reports. One likely cause, an inference from the timeline, is that WebLLM uses the same "Fetching param cache" wording when it reads parameters that are already stored, so the word cannot separate a download from a cache read. The exact text is [to be measured].

**What this means in plain words.** The percentages are WebLLM's own fraction, turned into whole numbers. The label depends on one word in WebLLM's message, so a stored model can briefly be labelled as a download.

## The size shown before the download

The popup states the download size before the reader presses the button. The size comes from the model's own file list.

`src/offscreen/offscreen.js`
```js
async function estimateDownloadMB(modelId) {
  const record = APP_CONFIG.model_list.find((m) => m.model_id === modelId);
  if (!record) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${record.model}/resolve/main/ndarray-cache.json`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const bytes = (json.records ?? []).reduce((sum, r) => sum + (Number(r.nbytes) || 0), 0);
    return bytes > 0 ? Math.round(bytes / 1e6) : null;
  } catch {
    return null;
  }
}
```

The function fetches `ndarray-cache.json` from the model's page on Hugging Face and adds up the byte counts of its records, in decimal megabytes. The request stops after 8 seconds, and any failure returns null. The popup then writes "about several hundred MB".

The file lists only the weights. The library and the tokenizer are not in the sum, and their sizes are not recorded in the repository. The popup's 695 MB matches the first-use runs. The spike recorded 664 MB (DEVLOG, 2026-10-21). The 879 in `config.js` is graphics memory, so the reader should not expect a 879 MB download.

**What this means in plain words.** The size shown is the total of the weight files, read from the model's own list. It leaves out the small library and tokenizer files.

## Storage in IndexedDB, and how the stored model is found

The model is kept in IndexedDB, the browser's built-in database for web apps. WebLLM's default store, Cache Storage, failed inside the offscreen page, so the project switched stores.

`src/offscreen/offscreen.js`
```js
// Cache Storage fails inside an offscreen page ("Unexpected internal error"), IndexedDB works,
// so the model is stored in IndexedDB. (Found by a spike; see DEVLOG.md.)
const APP_CONFIG = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' };
```

The developer log records the failure: the first try stopped with `UnknownError: Failed to execute 'open' on 'CacheStorage'`, while IndexedDB had about 10.7 GB of quota (DEVLOG, 2026-10-21). DECISIONS D2 adds that the extension asks for `unlimitedStorage`, so the browser does not delete the model when disk space runs low.

The status call checks whether the model is stored.

`src/offscreen/offscreen.js`
```js
    const cached = await hasModelInCache(modelId, APP_CONFIG).catch(() => false);
```

WebLLM's `hasModelInCache` looks at the weights only. In `src/lib/web-llm.js` it calls `hasTensorInCache` with the scope `"webllm/model"` on the same backend. The library is kept in a separate scope, `"webllm/wasm"`, through `fetchWithCache`.

`src/lib/web-llm.js`
```js
            const wasmCache = libExports$2.createArtifactCache("webllm/wasm", getCacheOptions(this.appConfig));
```

`src/lib/web-llm.js`
```js
            return yield wasmCache.fetchWithCache(wasmUrl, "arraybuffer", (_a = this.reloadController) === null || _a === void 0 ? void 0 : _a.signal);
```

This explains the offline result: the weights and the library are both in IndexedDB, so a load with no network succeeds. If the check throws, the `catch` treats the model as not stored, and the popup offers the download again. The stored copy lives in the browser profile. The test runs keep that profile in a fixed folder (`.model-profile` in `scripts/local-run.mjs`).

Figure: what is stored, where, and for how long.

![What is stored where and for how long: model files in IndexedDB, the job record in session storage, settings in local storage, and the loaded model in graphics memory](../figures/V10_storage.png)
<!-- check against figure -->

Reading the figure: as planned, the figure shows four stores. The model files stay in IndexedDB until the reader or the browser removes them. The job record lives in session storage until the browser closes. The settings live in local storage. The loaded model sits in graphics memory and is freed when the offscreen page closes after five minutes idle.

**What this means in plain words.** The model is kept in the browser's own database, and the library sits beside it. The stored check reads only the weights, and a failed check reads as "not stored".

## The warm-up after loading, and why it is there

After the load, the page writes one token before it reports success. The code comment gives the reason.

`src/offscreen/offscreen.js`
```js
        // The first answer compiles the graphics-card programs (about half a minute on a slow
        // card). Do it now, with a message, so the first real part does not look frozen.
        emitProgress({ phase: 'loading', percent: 100, text: 'Warming up the model (first time only)' });
        await engine.chat.completions.create({ messages: [{ role: 'user', content: 'Say ok.' }], max_tokens: 1, temperature: 0 });
```

The first answer on a graphics card compiles the programs the model runs. Running a one-token answer during the load moves that wait to a point where the popup can explain it. The popup shows "Warming up the model (first time can take about 30 seconds)...", with an empty bar, because no measured progress exists during the compile.

The code comment and the message say "first time only", but the code runs the warm-up on every load into a fresh offscreen page. The timings differ by case: about 30.5 seconds on the cold NVIDIA run, about 39.4 seconds on the Intel run, and about 0.5 seconds on the offline run. The offline plan uses the same profile as the cold run (`scripts/local-run.mjs`). The repository does not say where the compiled programs are kept between sessions, so the reason for the short offline warm-up is [to be measured].

**What this means in plain words.** The extension runs one tiny answer right after loading, so the slow first answer happens while the popup is still explaining what it is doing.

## Why the second use is fast

After the first use, the model is in IndexedDB. A later summary runs three short steps: the card check, the load from the stored copy, and the warm-up. The clean offline run is the example (`v2-local-nvidia-offline.md`). The load took 6,890 ms, the warm-up about 0.5 seconds, and the short article finished in 15.3 seconds. The summary step took about 6.7 seconds there, against 3.7 seconds in the cold run. The offline answer had eight bullet points, against five in the cold run, which fits the longer output.

Table: First use and later use, measured in the test runs

| Run (test-run file) | Model stored at start | Download | Load in the page (ms) | Warm-up | Short article, total |
|---|---|---|---|---|---|
| NVIDIA, cold first attempt (clean) | No | About 0.5 s to 158 s | 192,580 | About 30.5 s | 196.8 s |
| NVIDIA, offline, cache only (clean) | Yes | None | 6,890 | About 0.5 s | 15.3 s |
| Intel, SmolLM2 360M (clean) | No | 0.9 s to 81.2 s | 122,438 | About 39.4 s | 199.2 s |
| NVIDIA, offline, cache only (other programs running) | Yes | None | 7,749 | About 0.6 s | 13.4 s |
| NVIDIA, first use (other programs running) | No | 1.8 s to 138.7 s | 200,316 | About 56 s | 207 s |

The last two rows are labelled as runs done while other programs were using the processor, so they are slower than the clean runs. The files `v2-local-nvidia.md` and `v2-local-nvidia-cold-second-attempt-with-load.md` hold the same busy run.

Figure: first use and later use as two sequences.

![First use and later use as two sequences: the first use checks the card, downloads, loads, warms up and summarizes; the later use checks the stored model, loads and summarizes](../figures/V03_first_run_vs_cached.png)
<!-- check against figure -->

Reading the figure: as planned, two sequences, one above the other. The top one includes the download, labelled 197 seconds for the clean cold NVIDIA run. The lower one has no download and is labelled 15.3 seconds for the offline short article. Both start with the card check and end with the summary.

**What this means in plain words.** Once the model is stored, the same article takes about 15 seconds, not about 200 seconds. The stored copy is what makes the second use fast.

## The offline proof: what was blocked and what was not

The offline run is meant to show that a stored model works without a network. The measurement script starts Chrome with a host resolver rule, `MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`. The rule maps every host name to "not found", except the address 127.0.0.1, where the fixture pages are served (`tests/helpers/fixtures-server.mjs`).

Table: What the offline run blocked, and what it did not

| Item | Blocked? | Why, and what the run shows |
|---|---|---|
| Outside host names (Hugging Face, GitHub raw files, any other name) | Yes | Each name maps to "not found", so a download cannot start |
| Fixture pages at 127.0.0.1 | No | The rule excludes 127.0.0.1, where the short and long fixtures are served |
| The extension's own pages | No | The browser loads them from the extension folder. The developer log says Playwright's offline switch blocked them, which is why a host rule was used |
| Weights, library and tokenizer | Not needed | Read from IndexedDB; the load took 6.9 s |
| Requests made by IP address | Not covered | The rule matches host names, and the code requests host names only |
| Whether any blocked request was tried | Not recorded | The script records outcomes and a timeline, not requests. No probe checks that a blocked name fails |
| The Wikipedia page | Not run | The offline plan lists only the short and long fixtures |

The run proves one thing: a summary completes when the model and the library are in the browser's storage and the outside names do not resolve. It does not prove that no request was attempted, because requests are not logged. It does not prove that the page text never leaves the computer, because no traffic was captured.

The result also depends on the test copy. The helper `tests/helpers/extension.mjs` rewrites the manifest of the staged copy, adding `http://127.0.0.1/*`. The measurement script adds `https://*/*` for that copy (`extraHostPermissions`). The shipped manifest lists four hosts, and no run in the repository used it alone.

The first offline attempt failed, and the developer log records why (DEVLOG, 2026-10-21, "V2 offline check"). Playwright's offline switch stopped the extension's own page from loading. A second run then said "Not downloaded yet", although the model was stored. The test script had copied the extension to a new temporary folder on each launch, so Chrome gave it a new extension ID and it could not see the earlier storage. The fix had two parts: the host rule, and a fixed extension folder. The script names that folder in a comment: "fixed folder: same extension id on every run" (`scripts/local-run.mjs`, line 43).

**What this means in plain words.** The offline run shows that the stored model works with the outside names switched off. It does not show that nothing tried to reach the internet, and Wikipedia was not run offline.

## Design decisions

Table: Design decisions for storing and loading the model

| Decision | Options considered | Choice | Why | Trade-off accepted |
|---|---|---|---|---|
| Where the model is kept | Cache Storage (WebLLM default); IndexedDB | IndexedDB | Cache Storage failed inside the offscreen page (DEVLOG spike) | Needs the `unlimitedStorage` permission so the model is kept |
| Where the warm-up runs | Inside the load; on the first answer | Inside the load, with a message | The first answer would otherwise look frozen (code comment) | The load time includes the warm-up; the cold NVIDIA load took about 192 s |
| Size before download | A fixed size; the model's own file list | The file list (`ndarray-cache.json`) | The size follows the model's own record | Needs Hugging Face to answer within 8 s; falls back to "several hundred MB" |
| Stored check | Load and see; ask the store | `hasModelInCache` on the weights | Fast, and it avoids a download attempt | A failed check reads as "not stored" |

**What this means in plain words.** The main choices are IndexedDB for storage and a warm-up inside the load. Both make the reader wait less, and the cost is a larger permission and a longer load.

## Screenshots of the first use

The first three screenshots are real model screenshots. Each shows a state that the first-use timeline passes through.

![Real model: the popup while the model downloads on the NVIDIA chip, at 32 percent](../screenshots/v2-nvidia-short-downloading.png)

Reading the screenshot: the progress line reads "Downloading the model (first time only): 32%", and the bar is filled about one third of its width. The model line still reads "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." The button is greyed out, because a job is running.

![Real model: the popup in the warm-up step on the NVIDIA chip, with an empty bar](../screenshots/v2-nvidia-short-warming.png)

Reading the screenshot: the progress line reads "Warming up the model (first time can take about 30 seconds)...", and the bar is empty. The model line still says "Not downloaded yet", because that line is refreshed only when the job ends. The button is greyed out.

![Real model, cache only: the popup after a short article with the outside names blocked, showing the stored model](../screenshots/v2-nvidia-offline-short-popup.png)

Reading the screenshot: the model line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer.", and the button reads "Summarize this page". The summary appears as numbered points. The line under it reads "1 part · 1 request · 14.8 s · Llama 3.2 1B", which matches the 14,844 ms in the offline run file.

The next five screenshots are pretend model screenshots. They come from the mock engine, which offers fixed download sizes and steps.

![Pretend model: the first state, model not stored, before the reader presses the button](../screenshots/ui-01-not-downloaded.png)

Reading the screenshot: the button reads "Download model and summarize", and the model line reads "Model: Llama 3.2 1B. Not downloaded yet (about 664 MB, first use only)." The 664 MB is the pretend model's own figure (`mock-engine.js`). The real popup showed about 695 MB.

![Pretend model: the downloading state at 25 percent](../screenshots/ui-02-downloading.png)

Reading the screenshot: the progress line reads "Downloading the model (first time only): 25%", and the bar is filled a quarter of its width. The button is greyed out.

![Pretend model: the loading state while the model is put into the graphics card at 45 percent](../screenshots/ui-03-loading.png)

Reading the screenshot: the progress line reads "Loading the model into the graphics card: 45%", and the bar is filled a little under half. The model line still says "Not downloaded yet".

![Pretend model: the warm-up state with the indeterminate bar](../screenshots/ui-04-warming.png)

Reading the screenshot: the line reads "Warming up the model (first time can take about 30 seconds)...", on two lines in the narrow popup. The bar is empty, and the button is greyed out.

![Pretend model: the state after the model is stored, on a different test page titled Fleet Dashboard](../screenshots/ui-08-ready-to-use.png)

Reading the screenshot: the page title is "Fleet Dashboard", a different page from the lighthouse article. The model line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer.", and the button reads "Summarize this page". No summary is shown yet.

## Failure cases and how each is handled

Table: Failures during the first use and later use

| Failure | Code or result | What the reader sees | Handling in the code |
|---|---|---|---|
| Download stops | `MODEL_DOWNLOAD_FAILED` | "The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept." | Not retried with the small model, and nothing is saved (browser test V12). The claim that the partial download is kept is not tested with a real network break |
| Model will not start, and not for memory | `MODEL_LOAD_FAILED` | "The model could not be started. Press the button to try again." | Retried once with the small model, and the choice is saved (see the card check chapter) |
| Stored check throws | Counted as not stored | "Not downloaded yet" | Falls back to the download path, so a stored model may be offered again |
| Size estimate fails or takes more than 8 s | Null | "about several hundred MB" | The download continues normally |
| The tab moves to another page | New job replaces the old one | Old job's writes are dropped | `startJob` in `service-worker.js` aborts the old job |
| The tab closes during the download | Job aborted, record removed | No record is left (browser test V22) | `closedTabs` and the queued writes in `service-worker.js` |
| The popup closes during the download | Job keeps running | A reopened popup shows the same progress (browser test V15) | The job record lives in session storage |
| The service worker stops | `INTERRUPTED` after restart | "The summary was interrupted. Press Summarize to try again." (browser test V20) | `sweepOrphans` marks the old running jobs |
| The load or warm-up runs past 3 minutes | Shown as interrupted | "The summary was interrupted", while the page still works | The load has no timeout, and the popup's 3-minute stale rule applies |

The last row is a real gap. The warm-up writes one progress message and then nothing. The stale rule in `popup.js` and `service-worker.js` treats a job as dead after 3 minutes without a write. A very slow card could therefore show an interruption while the model is still loading. No run in the repository reached that length.

**What this means in plain words.** Most failures show a clear message and leave the stored model alone. The one gap is a very long silent wait, which the popup reports as an interruption.

## What went wrong while building it

The developer log records these problems on the first-use path (DEVLOG, 2026-10-21).

- WebLLM's default store did not work inside the offscreen page. The fix was IndexedDB. The spike then loaded the model from the cache in about 8 to 13 seconds, and the clean run measured 6.9 seconds.
- The first offline check showed "Not downloaded yet" for a stored model. The extension ID had changed because the test copy was made in a new folder on each launch. The fix was a fixed folder.
- The first answer on either chip took about 30 seconds to compile graphics programs. The warm-up was added to the load for that reason.

**What this means in plain words.** Both storage problems came from the browser, not the model. Each was found by a run of the real path, and each fix is in the code.

## How it was tested

The browser tests in `tests/e2e/pipeline.test.js` use the pretend model for the first-use path. Scenario V01 runs the whole first use: the model line, a download with percentages that never go down, a warm-up, a summary, and then the model shown as downloaded. V02 checks the order of the job phases, V12 covers a failed download, V15 a closed popup, V16 a finished job that persists, V20 a stopped service worker, and V22 a closed tab.

The unit tests in `tests/unit/local-engine.test.js` check the engine. They include "prepare reports checking, then downloading when the model is not cached, then loads it" and "prepare reports loading, not downloading, when the model is already cached".

The real-model runs are the clean cold NVIDIA run, the clean offline NVIDIA run and the clean Intel run. The busy runs are labelled in the table above.

**What this means in plain words.** The pretend model tests the logic of the first use many times. The real model ran three times in clean conditions, and two of those runs underlie the numbers here.

## Limitations

- The timeline is a sample taken every 0.4 seconds, so a short label can be missing.
- The meaning of WebLLM's download percentage is not recorded, and the label can say "Downloading" for a stored model.
- The size shown before the download leaves out the library and the tokenizer.
- The claim that a partial download is kept has not been tested with a real network break.
- The first-use runs used the test copy, which has a wider host permission than the shipped extension.
- The offline run does not log requests, and it covers only the short and long fixtures.
- The client's laptop has not been tested, so every time here is from the developer laptop.

## Questions this chapter answers

**How long does the first use take?**
On the developer laptop with the NVIDIA chip, the clean cold run took 196.8 seconds for a short article. The download took about 158 seconds, the load about 3.4 seconds, the warm-up about 30.5 seconds and the summary about 3.7 seconds. The client's laptop has not been measured.

**Why is a later use fast?**
The model and its library are stored in IndexedDB, so the load reads them from the browser instead of the network. The clean offline run loaded in 6.9 seconds and finished the short article in 15.3 seconds. The warm-up was about 0.5 seconds on that run.

**Does the summary still work with no internet?**
In the offline run it did, with the outside host names switched off and the model stored. The run does not log requests, so it cannot show that none was tried. Wikipedia was not run offline.

**Why can the popup say "Downloading" for a model that is already stored?**
The label comes from a word in WebLLM's progress message, and the same wording can appear when a stored model is read. The offline run showed the label for one sample, and the exact WebLLM text is [to be measured].

**Where is the model kept, and why not in Cache Storage?**
The weights and the library are kept in IndexedDB. Cache Storage failed inside the offscreen page in the first spike, while IndexedDB worked, with about 10.7 GB of quota in the test. The extension asks for `unlimitedStorage` so the browser does not delete the model.
