# Getting the model onto the laptop

## What this part does and why it exists

The first time a reader presses the button, the model has to arrive on the laptop. The 1B model is about 695 MB of weights, and it also needs a graphics library and a tokenizer. The download and the load take most of the waiting. After that the model stays in the browser, so later summaries start in seconds.

The work is split between two pages. The offscreen page (`src/offscreen/offscreen.js`) asks WebLLM to download and load the model, and it sends progress messages. The service worker writes those messages into the job record that the popup reads. WebLLM is the library copied into `src/lib/web-llm.js`. Nothing in the project makes a cloud call, so the only outside traffic is the first download.

## The first-use steps, one by one

The table lists the steps of a first summary. Its timings come from the clean cold run on the NVIDIA chip (`v2-local-nvidia-cold-first-attempt.md`). The segment times follow the timeline stamps used in the figure.

Table: The first-use steps with the timings from the clean cold run

| Step | What happens in the code | Seconds in the run |
|---|---|---|
| 1. Read and check | The page text is extracted, and `LOCAL_STATUS` asks the page about the card and whether the model is stored | 0 to 0.5 (0.5 s) |
| 2. Download | WebLLM fetches the weights and the graphics library, and reports progress | 0.5 to 158.8 (158.3 s) |
| 3. Load | The model is put into the graphics card | 158.8 to 162.6 (3.8 s) |
| 4. Warm up | One token is written, so the graphics programs compile before the first real part | 162.6 to 193.1 (30.5 s) |
| 5. Summarize | The one part is summarized and the result is shown | 193.1 to 196.8 (3.7 s) |

The engine also reports its own load time: 192,580 ms from the start of the load to the end of the warm-up. That is the `Load (ms)` value in the run file. The load starts right after the card check, so the figure is the download, the load and the warm-up together.

**What this means in plain words.** A first summary has five steps. The download is about 80 percent of the wait on this laptop, so most of the time goes to the network and the disk.

Figure: the first-use run as one timeline.

![Horizontal timeline of the first-use run: download, loading into the card, warm-up and summary, with seconds from the clean cold run](../figures/V09_cold_timeline.png)

Reading the figure: the drawing is one horizontal timeline of 196.8 seconds. The first 0.5 seconds are the read and check. The download is the widest block, labelled 158.3 seconds from 0 to 100 percent. The load is labelled 3.8 seconds, the warm-up 30.5 seconds, and the summary 3.7 seconds. Four stamps are written under the bar: the button press, the download done at 158.8 seconds with loading running from 21 to 100 percent, the warm-up starting at 162.6 seconds, and the summary shown at 196.8 seconds. A footnote says that a "Loading 0%" line at 5.1 seconds, during the download, is not drawn.

## How download progress becomes the percentages the reader sees

WebLLM reports its progress through a callback. The code turns each report into a phase and a whole percentage before sending it on. Since the label fix, the offscreen page also checks whether the model is stored before the load starts, and it passes that answer to the mapping.

`src/offscreen/offscreen.js`
```js
        const wasCached = await hasModelInCache(modelId, APP_CONFIG).catch(() => false);
        const worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
        engine = await CreateWebWorkerMLCEngine(worker, modelId, {
          appConfig: APP_CONFIG,
          initProgressCallback: (report) => emitProgress(mapInitProgress(report, { cached: wasCached })),
        });
```

`src/core/gpu-check.js`
```js
export function mapInitProgress(report, { cached = false } = {}) {
  const text = String(report?.text ?? '');
  const fraction = Math.max(0, Math.min(1, Number(report?.progress) || 0));
  // "Start to fetch params" and "Fetching param cache[...]" both mean the download is happening.
  // But WebLLM also says "fetch" at the start of a load from the browser's own storage; when the
  // model is already stored, nothing is downloaded, so it is always "loading".
  const phase = !cached && /fetch/i.test(text) ? 'downloading' : 'loading';
  return { phase, percent: Math.round(fraction * 100), text };
}
```

The path has five steps. `mapInitProgress` clamps WebLLM's fraction to the range 0 to 1 and rounds it to a whole percentage. For a model that is not stored, the phase is "downloading" when the text contains "fetch", and "loading" otherwise. For a stored model the phase is always "loading". The offscreen page sends the result as a `MODEL_PROGRESS` message. The service worker writes the phase, the percentage and the text into the job record in `chrome.storage.session`. The popup re-renders on that change and shows a label such as "Downloading the model (first time only): 32%".

The timeline table below is the full cold run. That run had no stored model, so the mapping it shows is the same before and after the label fix. The script read the label every 0.4 seconds, so a label shown for less than that may be missing.

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

**Before the label fix.** In the clean offline run, which read a model already stored in the browser, the popup showed "Downloading the model (first time only): 0%" at 3.9 seconds, between two "Loading" lines, for about 0.8 seconds. The cause was that any WebLLM text containing "fetch" counted as a download, and WebLLM also uses that word when it reads a stored model. The fix is the cached check above, with a unit test named "mapInitProgress never says downloading when the model is already stored". The developer log records the finding (DEVLOG, 2026-10-21, "V2 popup wording").

**Still true after the fix.** For a model that is not stored, the phase still depends on WebLLM's words. The cold run shows a "Loading ... 0%" line at 5.1 seconds, during the download, and the label stays "loading" for that sample. The repository does not record WebLLM's full text for that report, so the reason is [to be measured].

**What this means in plain words.** The percentages are WebLLM's own fraction, turned into whole numbers. The label is now chosen by checking the store first, so a stored model is never shown as a download. A model that is not stored still relies on WebLLM's wording.

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

The file lists only the weights. The library and the tokenizer are not in the sum, and their sizes are not recorded in the repository. The popup showed about 695 MB for the main model and about 204 MB for SmolLM2 in the real runs. The 879 in `config.js` is graphics memory, so the reader should not expect a 879 MB download.

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

Reading the figure: the drawing is a table with four stores. The model files are in IndexedDB, about 695 MB for Llama 3.2 1B and about 204 MB for SmolLM2. They are kept between runs, no code deletes them, and `unlimitedStorage` asks the browser not to delete them when disk space runs low. The job record is in `chrome.storage.session` under a key per tab, and it lasts until the browser closes or its tab closes. The settings are in `chrome.storage.local`, kept across restarts, and `modelOverride` becomes `fallback` after a failed load. The loaded model is in graphics memory inside the offscreen page, and it is freed when the page closes, which is five minutes after the last message or when the browser closes. The drawing's memory figures, 879 MB and 376 MB, are WebLLM's graphics memory needs, not download sizes. The footnote says that Version 2 stores no API key.

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

The code comment and the message say "first time only", but the code runs the warm-up on every load into a fresh offscreen page. The timings differ by case: about 30.5 seconds on the cold NVIDIA run, about 39.4 seconds on the Intel run, about 0.5 seconds on the clean offline run, and about 0.4 seconds on the after-fix offline run. The offline runs use the same profile as the cold run (`scripts/local-run.mjs`). The repository does not say where the compiled programs are kept between sessions, so the reason for the short offline warm-up is [to be measured].

**What this means in plain words.** The extension runs one tiny answer right after loading, so the slow first answer happens while the popup is still explaining what it is doing. The short warm-ups later are measured, and their cause is not.

## Why the second use is fast, and the two offline runs

After the first use, the model is in IndexedDB. A later summary runs three short steps: the card check, a load from the stored copy, and the warm-up. Two clean offline runs show this. The first (`v2-local-nvidia-offline.md`) was made before the label fix and has the wrong "Downloading" line. The second (`v2-local-nvidia-offline-after-label-fix.md`) was made after the fix, with nothing else running, and has no such line. The two runs are otherwise the same case: the same laptop, outside websites blocked, and the same two fixture articles.

Table: First use and later use, measured in the test runs

| Run (test-run file) | Model stored at start | Download | Load in the page (ms) | Warm-up | Short article, total | Writing speed |
|---|---|---|---|---|---|---|
| NVIDIA, cold first attempt (clean) | No | 0.5 to 158.8 s (158.3 s) | 192,580 | About 30.5 s | 196.8 s | 47 tokens a second |
| NVIDIA, offline, before the label fix (clean) | Yes | None | 6,890 | About 0.5 s | 15.3 s | 40 tokens a second |
| NVIDIA, offline, after the label fix | Yes | None | 11,621 | About 0.4 s | 17.7 s | 65 tokens a second |
| Intel, SmolLM2 360M (clean) | No | 0.9 to 81.2 s | 122,438 | About 39.4 s | 199.2 s | 4 to 5 tokens a second |
| NVIDIA, first use (other programs running) | No | 1.8 to 138.7 s | 200,316 | About 56 s | 207 s | 38 tokens a second |

The writing speeds are the decode speed of each run's last request. The clean NVIDIA runs record 34 to 53 tokens a second. The after-fix run records 65 tokens a second for the single request of the short article and 45 for the two-part article. The run file does not explain why that value is above the clean range. The first-use row marked "other programs running" is a disturbed run, so its times are slower than the clean runs. The files `v2-local-nvidia.md` and `v2-local-nvidia-cold-second-attempt-with-load.md` hold that same run.

Table: The two clean offline runs, side by side

| Offline run | Label on the popup | Load in the page | Warm-up | Summary step | Short article, total | Long article, total |
|---|---|---|---|---|---|---|
| Before the label fix (`v2-local-nvidia-offline.md`) | "Downloading the model (first time only): 0%" at 3.9 s, for about 0.8 s | 6,890 ms | 8.1 to 8.6 s | About 6.7 s | 15.3 s | 16.5 s |
| After the label fix (`v2-local-nvidia-offline-after-label-fix.md`) | No "Downloading" line; loading from 0% at 1.9 s | 11,621 ms | 13.1 to 13.5 s | About 4.2 s | 17.7 s | 16 s |

The after-fix run's load took longer (11.6 seconds against 6.9 seconds). Its own note says that differences of this size are normal on this laptop, and the cause is not measured here. The summary-step times are shown for reference only, because the length of each answer differs between the runs.

Figure: first use and later use as two sequences.

![First use and later use as two sequences: the first use checks the card, downloads, loads, warms up and summarizes; the later use checks the stored model, loads and summarizes](../figures/V03_first_run_vs_cached.png)

Reading the figure: the top sequence is the first use. The popup presses the button, the service worker asks whether the model is stored, and the offscreen page downloads and saves it in 158.3 seconds. The load takes 3.8 seconds and the warm-up about 30 seconds, and the summary takes 3.7 seconds, for a total of 196.8 seconds. The lower sequence is the later use with outside sites blocked. The model files are read from IndexedDB, the load and warm-up take 6.9 seconds, and the summary takes 6.7 seconds, for a total of 15.3 seconds. A footnote says the warm-up was 30.5 seconds on first use and 0.5 seconds in the later run, and that the reason is not measured.

**What this means in plain words.** Once the model is stored, the same article takes about 15 to 18 seconds, not about 200 seconds. The stored copy is what makes the second use fast, and the two clean offline runs agree on that.

## The offline proof: what was blocked and what was not

The offline runs are meant to show that a stored model works without a network. The measurement script starts Chrome with a host resolver rule, `MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`. The rule maps every host name to "not found", except the address 127.0.0.1, where the fixture pages are served (`tests/helpers/fixtures-server.mjs`). Both offline runs used this rule.

Table: What the offline runs blocked, and what they did not

| Item | Blocked? | Why, and what the run shows |
|---|---|---|
| Outside host names (Hugging Face, GitHub raw files, any other name) | Yes | Each name maps to "not found", so a download cannot start |
| Fixture pages at 127.0.0.1 | No | The rule excludes 127.0.0.1, where the short and long fixtures are served |
| The extension's own pages | No | The browser loads them from the extension folder. The developer log says Playwright's offline switch blocked them, which is why a host rule was used |
| Weights, library and tokenizer | Not needed | Read from IndexedDB; the load took 6.9 s before the label fix and 11.6 s after it |
| Requests made by IP address | Not covered | The rule matches host names, and the code requests host names only |
| Whether any blocked request was tried | Not recorded | The script records outcomes and a timeline, not requests. No probe checks that a blocked name fails |
| The Wikipedia page | Not run | The offline plan lists only the short and long fixtures |

The runs prove one thing: a summary completes when the model and the library are in the browser's storage and the outside names do not resolve. Both offline runs show that. They do not prove that no request was attempted, because requests are not logged. They do not prove that the page text never leaves the computer, because no traffic was captured.

The result also depends on the test setup. The helper `tests/helpers/extension.mjs` rewrites the manifest of the staged copy, adding `http://127.0.0.1/*`. The measurement script adds `https://*/*` for that copy (`extraHostPermissions`). The shipped manifest lists four hosts, and no run in the repository used it alone.

The first offline attempt failed for a reason the developer log records (DEVLOG, 2026-10-21, "V2 offline check"). Playwright's offline switch stopped the extension's own page from loading. A second run then said "Not downloaded yet", although the model was stored. The test script had copied the extension to a new temporary folder on each launch, so Chrome gave it a new extension ID and it could not see the earlier storage. The fix had two parts: the host rule, and a fixed extension folder. The script names that folder in a comment: "fixed folder: same extension id on every run" (`scripts/local-run.mjs`, line 43).

**What this means in plain words.** The offline runs show that the stored model works with the outside names switched off, both before and after the label fix. They do not show that nothing tried to reach the internet, and Wikipedia was not run offline.

## Design decisions

The decisions below come from the code and the decision record. Where the repository does not record an alternative, the options column says so.

Table: Design decisions for storing and loading the model

| Decision | Options considered | Choice | Why | Trade-off accepted |
|---|---|---|---|---|
| Where the model is kept | Cache Storage (WebLLM default); IndexedDB | IndexedDB | Cache Storage failed inside the offscreen page (DEVLOG spike) | Needs the `unlimitedStorage` permission so the model is kept |
| Where the warm-up runs | Inside the load; on the first answer | Inside the load, with a message | The first answer would otherwise look frozen (code comment) | The load time includes the warm-up; the cold NVIDIA load took about 192 s |
| Size before download | A fixed size; the model's own file list | The file list (`ndarray-cache.json`) | The size follows the model's own record | Needs Hugging Face to answer within 8 s; falls back to "several hundred MB" |
| Stored check | Load and see; ask the store | `hasModelInCache` on the weights, before the load | Fast, avoids a download attempt, and lets the label say "loading" for a stored model | A failed check reads as "not stored" |

**What this means in plain words.** The main choices are IndexedDB for storage and a warm-up inside the load. Both make the reader wait less, and the cost is a larger permission and a longer load.

## Screenshots of the first use and the offline runs

The first five screenshots are real model screenshots. The first two come from the cold NVIDIA run, and the last three from the two offline runs.

![Real model: the popup while the model downloads on the NVIDIA chip, at 32 percent](../screenshots/v2-nvidia-short-downloading.png)

Reading the screenshot: the progress line reads "Downloading the model (first time only): 32%", and the bar is filled about one third of its width. The model line reads "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." The button is greyed out, because a job is running.

![Real model: the popup in the warm-up step on the NVIDIA chip, with an empty bar](../screenshots/v2-nvidia-short-warming.png)

Reading the screenshot: the progress line reads "Warming up the model (first time can take about 30 seconds)...", and the bar is empty. The model line still reads "Not downloaded yet". That line is refreshed when a job ends, so it is out of date during the job. The button is greyed out.

![Real model, before the label fix: the popup after a short article with the outside names blocked, showing the stored model](../screenshots/v2-nvidia-offline-short-popup.png)

Reading the screenshot: the picture comes from the clean offline run, before the label fix. The model line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer.", and the button reads "Summarize this page". The summary appears as numbered points. The line under it reads "1 part · 1 request · 14.8 s · Llama 3.2 1B", which matches the 14,844 ms in that run's file.

![Real model, after the label fix: the popup after a short article with the outside names blocked, showing the stored model and the result in 17.5 seconds](../screenshots/v2-nvidia-offline-short-popup-after-label-fix.png)

Reading the screenshot: the model line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer.", and the button reads "Summarize this page". The summary appears as numbered points, and the line under it reads "1 part · 1 request · 17.5 s · Llama 3.2 1B". No "Downloading" line appears at any point in that run.

![Real model, after the label fix: the popup in the warm-up step for a stored model, with the model line already saying downloaded](../screenshots/v2-nvidia-offline-short-warming-after-label-fix.png)

Reading the screenshot: the progress line reads "Warming up the model (first time can take about 30 seconds)...", with an empty bar. The model line already reads "Model: Llama 3.2 1B. Downloaded, runs on this computer." because the popup read the stored state when it opened. The button is greyed out.

The next five screenshots are pretend model screenshots. They come from the mock engine, which uses fixed download sizes and steps.

![Pretend model: the first state, model not stored, before the reader presses the button](../screenshots/ui-01-not-downloaded.png)

Reading the screenshot: the button reads "Download model and summarize", and the model line reads "Model: Llama 3.2 1B. Not downloaded yet (about 664 MB, first use only)." The 664 MB is the pretend model's fixed figure (`mock-engine.js`). The real popup showed about 695 MB.

![Pretend model: the downloading state at 25 percent](../screenshots/ui-02-downloading.png)

Reading the screenshot: the progress line reads "Downloading the model (first time only): 25%", and the bar is filled a quarter of its width. The button is greyed out.

![Pretend model: the loading state at 45 percent. The job record was written by hand, because the pretend model never sends this message](../screenshots/ui-03-loading.png)

Reading the screenshot: the progress line reads "Loading the model into the graphics card: 45%", and the bar is filled a little under half. The model line still says "Not downloaded yet". The picture was made by writing this job record by hand into session storage, because the pretend model never sends the loading message at this point.

![Pretend model: the warm-up state with the indeterminate bar](../screenshots/ui-04-warming.png)

Reading the screenshot: the line reads "Warming up the model (first time can take about 30 seconds)...", on two lines in the narrow popup. The bar is empty, and the button is greyed out.

![Pretend model: the state after the model is stored, on a different page titled Fleet Dashboard](../screenshots/ui-08-ready-to-use.png)

Reading the screenshot: the page title is "Fleet Dashboard", a different page from the lighthouse article. The model line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer.", and the button reads "Summarize this page". No summary is shown yet.

## Failure cases and how each is handled

Table: Failures during the first use and later use

| Failure | Code or result | What the reader sees | Handling in the code |
|---|---|---|---|
| Download stops | `MODEL_DOWNLOAD_FAILED` | "The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept." | Not retried with the small model, and nothing is saved (browser test V12). The claim that the partial download is kept is not tested with a real network break |
| Model will not start, and not for memory | `MODEL_LOAD_FAILED` | "The model could not be started. Press the button to try again." | Retried once with the small model, and the choice is saved (see the card check chapter) |
| Stored check throws | Counted as not stored | "Not downloaded yet" | Falls back to the download path, so a stored model may be offered again |
| Size estimate fails or takes more than 8 s | Null | "about several hundred MB" | The download continues normally |
| The tab moves to another page | New job replaces the old one | The old job's writes are dropped | `startJob` in `service-worker.js` aborts the old job |
| The tab closes during the download | Job aborted, record removed | No record is left (browser test V22) | `closedTabs` and the queued writes in `service-worker.js` |
| The popup closes during the download | Job keeps running | A reopened popup shows the same progress (browser test V15) | The job record lives in session storage |
| The service worker stops | `INTERRUPTED` after restart | "The summary was interrupted. Press Summarize to try again." (browser test V20) | `sweepOrphans` marks the old running jobs |
| The load or warm-up is silent for more than 5 minutes | Shown as interrupted | "The summary was interrupted", while the page may still work | The load has no timeout. The stale limit is now 5 minutes in the service worker and the popup |

The stale limit was 3 minutes before the fix. That was the same length as the 180-second answer timeout, so a slow answer could look interrupted while still running. The limit is now 5 minutes, which is longer than the answer timeout, so the timeout fires first (DEVLOG, 2026-10-21, "V2 review while writing the report", item 2). The load still has no timeout of its own. The warm-up writes only one progress message, so a warm-up silent for more than 5 minutes is still shown as interrupted. No run in the repository reached that length.

**What this means in plain words.** Most failures show a clear message and leave the stored model alone. The one remaining gap is a very long silent wait, which the popup reports as an interruption.

## What went wrong while building it

The developer log records these problems on the first-use path (DEVLOG, 2026-10-21).

- WebLLM's default store did not work inside the offscreen page. The fix was IndexedDB. The spike then loaded the model from the cache in about 8 to 13 seconds, and the clean run measured 6.9 seconds.
- The first offline check showed "Not downloaded yet" for a stored model. The extension ID had changed because the test copy was made in a new folder on each launch. The fix was a fixed folder.
- The popup said "Downloading" for a stored model for about 0.8 seconds in the clean offline run. The cause was a word in WebLLM's message. The fix checks the store before the load ("V2 popup wording (found while writing the report)").
- The first answer on either chip took about 30 seconds to compile graphics programs. The warm-up was added to the load for that reason.

**What this means in plain words.** Two of the problems came from the browser, and one came from trusting a library's wording. Each was found by a run of the real path, and each fix is in the code.

## How it was tested

The unit tests in `tests/unit/gpu-and-errors.test.js` cover the label rule, including "mapInitProgress never says downloading when the model is already stored". The unit tests in `tests/unit/local-engine.test.js` cover the engine, including "prepare reports checking, then downloading when the model is not cached, then loads it" and "prepare reports loading, not downloading, when the model is already cached". The unit suite has 70 tests in total.

The browser tests in `tests/e2e/pipeline.test.js` use the pretend model for the first-use path. Scenario V01 runs the whole first use: the model line, a download with percentages that never go down, a warm-up, a summary, and then the model shown as downloaded. V02 checks the order of the job phases, V12 covers a failed download, V15 a closed popup, V16 a finished job that persists, V20 a stopped service worker, and V22 a closed tab. The browser suite has 26 tests in total.

The real-model runs are the clean cold NVIDIA run, the two clean offline runs (before and after the label fix) and the clean Intel run. The busy runs are labelled in the table above.

**What this means in plain words.** The pretend model tests the logic of the first use many times. The real model ran in clean conditions for each case listed here, and the two offline runs show the effect of the label fix.

## Limitations

- The timeline is a sample taken every 0.4 seconds, so a short label can be missing.
- The meaning of WebLLM's download percentage is not recorded. For a model that is not stored, the label still depends on WebLLM's wording (the 5.1-second "Loading" line in the cold run).
- The size shown before the download leaves out the library and the tokenizer.
- The claim that a partial download is kept has not been tested with a real network break.
- The first-use runs used the test setup's copy, which has a wider host permission than the shipped extension.
- The offline runs do not log requests, and they cover only the short and long fixtures.
- The after-fix offline run's load took 11.6 seconds against 6.9 seconds, and the cause is not measured.
- The warm-up label still says "first time only" in the code while it runs on every load.
- The client's laptop has not been tested, so every time here is from the developer laptop.

## Questions this chapter answers

**How long does the first use take?**
On the developer laptop with the NVIDIA chip, the clean cold run took 196.8 seconds for a short article. The download took 158.3 seconds, the load 3.8 seconds, the warm-up 30.5 seconds and the summary 3.7 seconds. The client's laptop has not been measured.

**Why is a later use fast?**
The model and its library are stored in IndexedDB, so the load reads them from the browser instead of the network. The clean offline run loaded in 6.9 seconds and finished the short article in 15.3 seconds. The after-fix offline run loaded in 11.6 seconds and finished in 17.7 seconds. Both warm-ups were under a second.

**Does the summary still work with no internet?**
Yes, in both offline runs, with the outside host names switched off and the model stored. The runs do not log requests, so they cannot show that none was tried. Wikipedia was not run offline.

**Did the popup ever say "Downloading" for a stored model?**
Yes, before the label fix. The clean offline run showed that line for about 0.8 seconds. The fix checks the store before the load and reports "loading" for a stored model, and the after-fix run shows no such line. A model that is not stored still relies on WebLLM's wording.

**Where is the model kept, and why not in Cache Storage?**
The weights and the library are kept in IndexedDB. Cache Storage failed inside the offscreen page in the first spike, while IndexedDB worked, with about 10.7 GB of quota in the test. The extension asks for `unlimitedStorage` so the browser does not delete the model.
