# Errors and fallbacks

Every failure in Version 2 ends in one code and one short plain message. The sentences are in `src/core/errors.js`, and the codes travel from the hidden page to the service worker and then to the popup. The extension never shows the reader a raw message from WebLLM or from Chrome. Some codes also trigger a change of plan, such as a retry with the smaller model. This chapter lists every code, shows how the engine's free-text errors become codes, and says what is saved after each outcome.

The raw detail of an error goes to the console. It is also stored in the job record, under the key `job:<tabId>` in session storage, although the popup never shows it. The comment at the top of `errors.js` says the detail "only goes to the console", which is true for the screen but not for the storage.

## The codes the reader can see

Table: Errors that come from the model, from `src/core/errors.js` and `src/offscreen/offscreen.js`

| Code | When it happens | Exact message | What the extension does next | What the reader can do |
|---|---|---|---|---|
| `NO_WEBGPU` | Chrome has no WebGPU or no graphics adapter | Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check. | The model line shows it and the button is disabled. No job starts. | Open chrome://gpu and check WebGPU. |
| `NO_SHADER_F16` | The adapter lacks the 16-bit math feature | Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2. | The same as above. | Nothing in the extension changes this. |
| `GPU_MEMORY` | Out of memory while loading, or during an answer | The graphics card ran out of memory. Close other heavy tabs or programs and try again. | While loading, retries once with the small model. During an answer, the job ends. | Close other tabs or programs, then press the button again. |
| `MODEL_DOWNLOAD_FAILED` | The download stops (see the classifier below) | The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept. | The job ends. Nothing is saved as a choice. | Check the connection and press again. |
| `MODEL_LOAD_FAILED` | Loading fails for another reason | The model could not be started. Press the button to try again. | While loading the primary model, retries once with the small model. Otherwise the job ends. | Press again. |
| `TIMEOUT` | One answer takes longer than 180 seconds | The model took too long to answer. Try again, or use a shorter page. | The answer is interrupted, and the job ends with its finished parts dropped. | Try again, or use a shorter page. |
| `EMPTY_ANSWER` | The model returns only spaces | The model returned no summary for this page. | The job ends. | Press again. |

Table: Errors from the page and the job, from `src/core/errors.js`, `pipeline.js` and `extract-tab.js`

| Code | When it happens | Exact message | What the extension does next | What the reader can do |
|---|---|---|---|---|
| `TOO_LITTLE_TEXT` | Less than 200 readable characters | This page has too little readable text to summarize. | Refused before any model step. Nothing is downloaded. | Use a page with more text. |
| `TOO_LONG` | More than 12 parts are needed | This page is too long for the local model on this computer. Try a shorter page. | Refused before any download. | Use a shorter page. |
| `RESTRICTED_PAGE` | Chrome internal, extension, file, data or blob pages, and the Chrome Web Store | Chrome does not allow extensions to read this page. | Refused before any model step. | Use another page. |
| `EXTRACT_FAILED` | Injecting the reader script fails for another reason, or the script returns nothing | Could not read the text of this page. | The job ends. | Press again. The popup offers no other step. |
| `SERVICE_ERROR` | The hidden page cannot be reached, sends no answer or an unknown message, or an unexpected error occurs during an answer | Something went wrong inside the extension. Try again. | The job ends. | Try again. |
| `INTERRUPTED` | Chrome stopped the service worker during a job, or an open popup sees no update for three minutes | The summary was interrupted. Press Summarize to try again. | The record is marked as an error when the worker next starts. An open popup shows the message after three silent minutes. | Press Summarize. |
| `CANCELLED` | The tab closed or moved to another page | Cancelled. | The job stops without writing an error. The message is never shown. | Nothing to do. |

Table: Messages the popup writes itself, which are not in `errors.js`

| Where | Message |
|---|---|
| Before the model state arrives | Checking this computer... |
| If the state cannot be read | Could not check this computer. |
| If no tab is open | No page is open in this window. |
| If the start message fails | Could not start the summary. Try again. |
| If an error has no text | Something went wrong. |

**What this means in plain words.** Every failure shows one short message that says what happened and, where possible, what to do. Some failures also change the plan without asking the reader.

## How a thrown error becomes a code

`describeError` turns any thrown value into the three fields the popup needs: the code, the message and the detail. An error that is already an `AppError` keeps its code. Any other error becomes `SERVICE_ERROR`, and an abort becomes `CANCELLED`. When a code crosses a message channel as `{code, detail}`, `fromWire` rebuilds it, and an unknown code becomes `SERVICE_ERROR`. This keeps the list of codes closed. The popup shows one of the fourteen messages in `errors.js`, or one of the few it writes itself (listed above).

**What this means in plain words.** Whatever goes wrong, the popup only ever gets a known code, so it cannot show a raw error text by accident.

## Turning the engine's errors into codes

WebLLM throws plain errors with free text. The function `classifyEngineError` in `src/core/engine-errors.js` reads the text and picks a code:

`src/core/engine-errors.js`

```js
export function classifyEngineError(err, stage) {
  const text = String(err?.message ?? err ?? '').toLowerCase();
  if (/shader-f16|f16/.test(text) && /(support|feature|require)/.test(text)) return ERROR_CODES.NO_SHADER_F16;
  if (/webgpu|gpu adapter|navigator\.gpu/.test(text) && /(not\s+|un)(supported|available)|no (gpu )?adapter|unavailable/.test(text)) {
    return ERROR_CODES.NO_WEBGPU;
  }
  if (/out of memory|oom|device (was )?lost|maxbuffersize|exceeds the max|too large|allocation/.test(text)) {
    return ERROR_CODES.GPU_MEMORY;
  }
  if (stage === 'load' && /(fetch|network|failed to fetch|net::|timeout|offline|http \d{3}|cache)/.test(text)) {
    return ERROR_CODES.MODEL_DOWNLOAD_FAILED;
  }
  if (stage === 'load') return ERROR_CODES.MODEL_LOAD_FAILED;
  return ERROR_CODES.SERVICE_ERROR;
}
```

The rules run in order, and the first match wins. The `stage` argument separates the loading step from the answer step. The unit tests in `tests/unit/gpu-and-errors.test.js` and `tests/unit/local-engine.test.js` check these examples:

Table: Examples from the unit tests, and the code each one gives

| Message | Stage | Code |
|---|---|---|
| Failed to fetch | load | MODEL_DOWNLOAD_FAILED |
| net::ERR_INTERNET_DISCONNECTED while fetching | load | MODEL_DOWNLOAD_FAILED |
| GPUOutOfMemory: out of memory | load | GPU_MEMORY |
| Device was lost | generate | GPU_MEMORY |
| shader-f16 feature is not supported by this adapter | load | NO_SHADER_F16 |
| WebGPU is not supported in this environment | load | NO_WEBGPU |
| something strange | load | MODEL_LOAD_FAILED |
| something strange | generate | SERVICE_ERROR |
| network exploded | generate | SERVICE_ERROR |

Two weaknesses follow from the text matching. First, the memory pattern matches the letters "oom" anywhere in a message, so a word such as "room" or "zoom" would be read as a memory error. No test covers this, and no run shows it happening. Second, at the loading step any message containing "cache" counts as a download failure. The spike error recorded in the DEVLOG, "Failed to execute 'open' on 'CacheStorage': Unexpected internal error", contains "cache". Under these rules it would show the download message, which is wrong for that cause. The real WebLLM error texts are known only from that one spike message. The other patterns were written from expected wording and checked with sample strings.

**What this means in plain words.** The engine's free-text errors are sorted into the codes by looking for key words. The sorting is only as good as those words, and two of the patterns are loose.

## The fallback to the small model

The extension has three routes to the smaller model, SmolLM2 360M. The first two are decided before anything loads, and the third only after a failed load.

1. Integrated graphics. The hidden page reports a built-in Intel chip, and the engine switches to SmolLM2 on this check. Nothing is saved, so the check decides again each time.
2. Small machines. `chooseModel` picks the small model when the browser reports less than 8 GB of memory. Chrome caps that report at 8, so only machines reporting less than 8 are affected.
3. A failed load. If the primary model fails to load with `GPU_MEMORY` or `MODEL_LOAD_FAILED`, the engine retries once with SmolLM2. This is the only route that saves a choice.

`src/engines/local.js`

```js
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
```

The choice is written to `chrome.storage.local` by `onFallback` before the small model is tried. So a saved choice survives even if the small model then fails too. No code path clears it. Every later job, on every page, therefore starts with SmolLM2 until the extension's storage is cleared. Other errors never retry: a download failure, a missing WebGPU, a missing shader feature, a timeout, and an out-of-memory error during an answer all stop the job.

The browser tests show both sides. Test V10 makes the primary model run out of memory: the summary still works on SmolLM2, and the next popup shows the saved choice. Test V11 makes every model run out of memory: the reader sees the memory message, the choice is still saved, and the button is enabled again. The screenshot `ui-12-fallback-after-out-of-memory.png` shows a SmolLM2 result after the fallback (pretend model). The screenshot `ui-13-out-of-memory-all.png` shows the memory message when every model fails (pretend model).

![Pretend model: the fallback result. The primary model ran out of memory and SmolLM2 gave the summary](../screenshots/ui-12-fallback-after-out-of-memory.png)

![Pretend model: every model runs out of memory, so the reader sees the memory message and can press again](../screenshots/ui-13-out-of-memory-all.png)

**What this means in plain words.** A computer that cannot hold the big model is moved to the small one, once. After that the choice is remembered, so the big model is not tried again without a reset.

## Timeouts, empty answers and what is lost

Each answer has 180 seconds. The hidden page starts a race between the answer and a timer. When the timer wins, it calls `interruptGenerate` on the WebLLM engine and reports `TIMEOUT`:

`src/offscreen/offscreen.js`

```js
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          engine.interruptGenerate?.();
          reject(Object.assign(new Error('generation timed out'), { name: 'TimeoutError' }));
        }, timeoutMs);
      });
```

The job then stops. The parts already finished are discarded, because a summary is only saved when every part and the merge are done. The reader sees the timeout message and can press again. The repository has no test that sets the timeout, and the unit test only checks that a `TIMEOUT` code passes through unchanged. Whether `interruptGenerate` stops the earlier answer completely is not tested: [to be measured].

An empty answer is a different case. The engine trims the text, and if nothing is left it reports `EMPTY_ANSWER`. The pretend model mode `empty` shows the message in test V13. Nothing is saved, and the reader can press again.

**What this means in plain words.** A slow answer is stopped at three minutes, and the whole summary is dropped with it. An empty answer is reported as an empty answer, not as a success.

## Interrupted and cancelled jobs

### The service worker was stopped

Chrome can stop the service worker when it is idle, even in the middle of a job. The job record would then still say "running", and nothing would ever update it. The start-up code finds such records and marks them as interrupted:

`src/background/service-worker.js`

```js
async function sweepOrphans() {
  const all = await chrome.storage.session.get(null);
  for (const [key, job] of Object.entries(all)) {
    if (key.startsWith('job:') && job?.status === 'running' && (job.updatedAt ?? 0) < bootTime) {
      console.warn(LOG, 'marking orphaned job as interrupted', key);
      await writeJob(Number(key.slice(4)), job.jobId, {
        status: 'error',
        phase: 'error',
        error: describeError(new AppError(ERROR_CODES.INTERRUPTED)),
      });
    }
  }
}
```

The popup has a second check. A job that has not been updated for three minutes is shown as interrupted, even if the record still says running. The two limits are the same length, so an answer that runs close to the 180-second timeout could show the interrupted message just before the timeout message arrives. This follows from reading the code, and no test covers it. While the hidden page is busy, it sends a keep-alive message to the worker every ten seconds, which is meant to keep the worker awake. Test V20 stops the workers on purpose and checks that the job becomes `INTERRUPTED`. The screenshot `ui-17-interrupted.png` shows the popup (pretend model).

![Pretend model: the interrupted message, shown after the service worker was stopped mid-job](../screenshots/ui-17-interrupted.png)

### The tab closed or the page changed

Two things cancel a job. When the tab closes, its record is removed and the job is told to stop. When the tab moves to another page and the reader presses again, the old job is stopped and replaced. Writes from the old job are dropped, because each write checks the job id.

The stop signal is checked only between parts and before each merge call. An answer that is already running finishes first. The download is not stopped either. `prepare()` in `src/engines/local.js` does not read the signal, so a download that is in progress when the tab closes runs to the end, the model is kept, and the job stops before its first part. The repository does not test this: [to be measured].

A cancelled job returns without writing anything. The message "Cancelled." exists, but the reader never sees it. Tests V21 and V22 check the two visible results: a press on a new page gets a reply within four seconds, and no record is left for a closed tab.

**What this means in plain words.** When a reader leaves the page, the job stops at the next safe point, and its record is removed or replaced. A download that has already started is not stopped by that.

## Pages that cannot be read

Chrome does not let extensions read some pages. `isRestrictedUrl` in `extract-tab.js` lists the internal, extension, file, data and blob addresses, and the Chrome Web Store. The popup says so and makes no model call. Test V05 checks it with `chrome://version`, and the screenshot `ui-16-restricted-page.png` shows the message (pretend model).

![Pretend model: a Chrome internal page, which the extension is not allowed to read](../screenshots/ui-16-restricted-page.png)

A page with too little text, under 200 readable characters, is refused in the same way (`TOO_LITTLE_TEXT`). Test V04 checks a near-empty page, and test V18b checks a page whose text is still missing when the reader presses. The screenshot `ui-15-too-little-text.png` shows the first case (pretend model).

![Pretend model: a near-empty page is refused as having too little readable text](../screenshots/ui-15-too-little-text.png)

A page that needs more than 12 parts is refused as too long (`TOO_LONG`, test V06). This happens before any download.

**What this means in plain words.** Pages the extension cannot read, or that have nothing to read, are turned away at once with a sentence that says why.

## Downloads and computers that cannot run the model

A failed download is recorded as `MODEL_DOWNLOAD_FAILED`, and the reader sees the message in `ui-14-download-failed.png` (pretend model). Test V12 checks that nothing is saved, that the choice is not changed, that the model is not marked as stored, and that a later press succeeds once the download works. The message says that what was already downloaded is kept. The pretend model cannot show a real partial download, so this claim is untested: [to be measured].

![Pretend model: the download stopped, with the message that says what was already downloaded is kept](../screenshots/ui-14-download-failed.png)

A computer without WebGPU or without the 16-bit feature is blocked from the start. The button is disabled and the message sits in the model line, as in `ui-10-no-webgpu.png` and `ui-11-no-shader-f16.png` (pretend model). Tests V07 and V08 check both. The reader can do nothing inside the extension to change the result.

![Pretend model: a computer without WebGPU. The message sits in the model line and the button is disabled](../screenshots/ui-10-no-webgpu.png)

![Pretend model: a computer without 16-bit shader support, blocked in the same way](../screenshots/ui-11-no-shader-f16.png)

**What this means in plain words.** A failed download is safe to retry, and nothing is kept as if it had worked. A computer that cannot run the model is told so once, and the button stays off.

## Which errors were forced, and which were real

Almost every error above was forced with the pretend model. The offscreen page accepts a `mock` mode in its address, and each mode produces one failure on purpose:

- `nowebgpu` gives `NO_WEBGPU` (V07), and `nof16` gives `NO_SHADER_F16` (V08).
- `oom` gives `GPU_MEMORY` on the primary model only (V10), and `oomall` gives it on every model (V11).
- `downloadfail` gives `MODEL_DOWNLOAD_FAILED` (V12). `empty` gives `EMPTY_ANSWER` (V13).
- `html` shows hostile markup as an answer (V14). The popup prints it as text, and the screenshot `ui-18-hostile-output-as-text.png` shows it (pretend model).
- The service worker was stopped on purpose, which gives `INTERRUPTED` (V20).
- The page choices in the browser tests give `TOO_LITTLE_TEXT` (V04, V18b), `TOO_LONG` (V06) and `RESTRICTED_PAGE` (V05).

![Pretend model: markup in the model's answer is printed as text, so the image tag does not load and the bold tag is not rendered](../screenshots/ui-18-hostile-output-as-text.png)

Five codes have no browser test that asserts them. `TIMEOUT`, `MODEL_LOAD_FAILED` and `SERVICE_ERROR` appear only in unit tests. `EXTRACT_FAILED` appears in no test. `CANCELLED` has a unit test for its conversion, and V21 and V22 exercise the path without asserting the code.

Only one real error is recorded in the repository. The DEVLOG entry of 21 October 2026 records that Cache Storage failed inside the hidden page with `UnknownError: Failed to execute 'open' on 'CacheStorage': Unexpected internal error`. The fix was to store the model in IndexedDB, not a fallback. The real-model runs in `finalsem/docs/test-runs/` all ended with a summary. The slow Intel runs are slow, not failed. The DEVLOG also records that an offline test blocked the extension's own page. That was a fault in the test setup, not an error code.

**What this means in plain words.** Most errors were produced on purpose, so the handling has been checked. Only one real failure was seen, and the real runs have not produced any of the error messages.

## What is kept after each outcome

Table: What survives each outcome

| Outcome | Model files | Saved choice | Job record |
|---|---|---|---|
| Success | Kept in IndexedDB | None | Done, with the summary |
| `MODEL_DOWNLOAD_FAILED` | Partial files may remain (untested) | None | Error |
| `GPU_MEMORY` while loading | Unchanged | `modelOverride` set to `fallback` | Error, or a summary from SmolLM2 |
| `TIMEOUT` or `EMPTY_ANSWER` | Unchanged | None | Error |
| `CANCELLED` | A download in progress runs on | None | Removed or replaced |
| `INTERRUPTED` | Unchanged | None | Error, marked at the next start |

The model files live in IndexedDB, which is why a later job needs no download. The job record lives in session storage until the browser closes. The saved choice lives in extension storage until someone clears it.

![Errors and their routes: which codes stop the job, which retry with the small model, and which only ask the reader to press again](../figures/V11_error_flow.png)
<!-- check against figure -->

Reading the figure: a memory error or a failed load while loading takes the route to the small model, and the other errors end the job with a message. Only that route saves a choice.

**What this means in plain words.** A failure leaves the model files and the job record in a known state. Only a memory failure while loading changes what the extension remembers.

### Questions this chapter answers

**What does the reader see when something fails?**
One short message, from a fixed list of fourteen codes. Sometimes the message sits in the model line, and sometimes in the error block below the progress area. The technical detail is kept in the console and in the job record, and the reader does not see it.

**Why does a memory error sometimes switch the model?**
When the big model fails to load with a memory error, the extension tries the small one once and saves that choice. A memory error during an answer does not switch the model. The saved choice is not undone by the extension.

**What happens if the model answers too slowly?**
After 180 seconds the answer is interrupted, the job ends with a timeout message, and the parts already finished are dropped. The reader can press again. Whether the stopped answer ends completely is not tested.

**What happens if the reader closes the tab during a summary?**
The job is stopped at the next part boundary, and its record is removed. A download that has already started keeps running, and the model is kept when it finishes. The reader sees nothing about the cancelled job.

**Can the extension tell every error apart?**
No. It sorts the engine's free-text errors by key words, and the patterns are loose: "oom" can match inside other words, and "cache" at loading reads as a download failure. Only one real engine error is recorded, so most of the patterns have not been checked against real messages.
