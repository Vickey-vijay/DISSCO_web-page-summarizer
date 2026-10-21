# Graphics card check and model choice

## What this part does and why it exists

The model runs on the graphics card through WebGPU, a browser feature that lets web code run calculations on the card instead of the processor. Two conditions stop the model from running at all. The browser may have no WebGPU, or the card may lack the 16-bit math that the model's shader programs need (the feature is called `shader-f16`). The check looks for both before any download starts. The popup can then explain the problem, instead of downloading about 695 MB and failing at the end.

The check also picks the model. The project uses two 4-bit models from WebLLM's list: Llama 3.2 1B as the primary, and SmolLM2 360M as the fallback. Three inputs decide between them: a saved answer from an earlier failure, the memory the browser reports, and whether the card is built into the processor.

Three files hold this logic. `src/core/gpu-check.js` contains pure functions that the Node tests can call with any input. `src/core/config.js` lists the two models. `src/engines/local.js` runs the check and the choice. The check itself runs in the offscreen page (`src/offscreen/offscreen.js`), because the model will run there too.

## What the check looks at

The check asks four questions in order. Does the browser have `navigator.gpu`? Does it return an adapter, which is the card Chrome will use? Does that adapter list `shader-f16`? And what are the vendor and architecture labels?

`src/core/gpu-check.js`
```js
export function evaluateGpu({ hasGpuApi, adapter }) {
  if (!hasGpuApi) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'navigator.gpu is missing' };
  if (!adapter) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'requestAdapter() returned nothing' };
  if (!adapter.features.has('shader-f16')) {
    return { ok: false, code: ERROR_CODES.NO_SHADER_F16, detail: 'adapter has no shader-f16 feature' };
  }
  const info = adapter.info ?? {};
  return { ok: true, f16: true, vendor: String(info.vendor ?? ''), architecture: String(info.architecture ?? '') };
}
```

The offscreen page makes the adapter request with the high-performance preference. The code comment says this is the same request WebLLM makes, so the check describes the card that WebLLM will use.

`src/offscreen/offscreen.js`
```js
async function requestAdapter() {
  if (!navigator.gpu) return null;
  // The same request WebLLM makes, so we report the card WebLLM will actually use.
  return navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
}
```

The built-in test is one line in the same file.

`src/offscreen/offscreen.js`
```js
        // Intel "gen-*" parts are the processor's built-in graphics: usable, but much slower.
        integrated: gpu.vendor.toLowerCase() === 'intel' && /gen/i.test(gpu.architecture),
```

The clean runs show Chrome reporting the built-in chip as `intel` with architecture `gen-12lp`, and the separate chip as `nvidia` with `ampere` (`v2-local-intel.json` and `v2-local-nvidia-offline.json`). The test separates them on those labels. It recognises only Intel by name, so a built-in AMD or Apple chip would count as a full card.

**What this means in plain words.** The check asks Chrome three yes-or-no questions and reads two labels. The labels decide whether the card counts as built into the processor.

## How the model is chosen

`src/core/config.js` lists the two models. The figures are WebLLM's `vram_required_MB` values, which are graphics memory, not download size.

`src/core/config.js`
```js
export const MODELS = Object.freeze({
  primary: Object.freeze({ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', vramMB: 879 }),
  fallback: Object.freeze({ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', vramMB: 376 }),
});
```

`src/core/gpu-check.js`
```js
export function chooseModel({ deviceMemoryGB, override } = {}) {
  if (override === 'fallback') return MODELS.fallback;
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB < 8) return MODELS.fallback;
  return MODELS.primary;
}
```

The rules run in the order below. The fourth is applied inside the engine, because it needs the answer from the card check.

Table: The rules that choose the model, in the order they run

| Order | Rule | Where it is | Result |
|---|---|---|---|
| 1 | The saved override is `fallback` | `modelOverride` in `chrome.storage.local`, read by `loadSettings` | SmolLM2 360M |
| 2 | `navigator.deviceMemory` is below 8 | `chooseModel` | SmolLM2 360M |
| 3 | Anything else | `chooseModel` | Llama 3.2 1B |
| 4 | Primary chosen, card is built-in Intel, no override saved | `checkStatus` in `src/engines/local.js` | SmolLM2 360M, reason `integrated-graphics` |

The memory rule is coarse. Chrome rounds `navigator.deviceMemory` and caps it at 8, as the comment in `gpu-check.js` says. A laptop with 15.7 GB, such as the developer laptop, reports 8 and passes. The threshold comes from the decision record (DECISIONS D1, item 3).

**What this means in plain words.** The choice uses an earlier failure, the memory the browser reports, and whether the card is built into the processor. The memory input cannot tell an 8 GB laptop from a 16 GB one.

## The check inside the engine

The engine asks the page first and only then decides what to download. The built-in rule lives in `checkStatus`.

`src/engines/local.js`
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

On the Intel path the page is asked twice, because the stored flag and the size depend on which model is named. If the reader's override is already saved, the model is already the small one, and the rule does not run.

`prepare()` calls `checkStatus()` before any download. If the page returns an error, `call()` turns it into an `AppError` with the same code, through `fromWire` in `src/core/errors.js`. The job stops before a download is requested.

**What this means in plain words.** The engine asks the page what the card can do before it decides what to download. A failed check stops the job before anything is downloaded.

## What the popup says for each outcome

The popup shows the result of the check in the model line under the title, and it enables or disables the button.

Table: What the reader sees for each outcome of the check

| Outcome | Code | Model line (exact text) | Button |
|---|---|---|---|
| Card usable, model not stored | none | `Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only).` | Download model and summarize (enabled) |
| Card usable, model stored | none | `Model: Llama 3.2 1B. Downloaded, runs on this computer.` | Summarize this page (enabled) |
| Built-in Intel graphics | none, the rule applies | The SmolLM2 line, with the note below | As in the two rows above |
| No WebGPU | NO_WEBGPU | `Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check.` | Disabled |
| No 16-bit math | NO_SHADER_F16 | `Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2.` | Disabled |
| Check fails for another reason | SERVICE_ERROR | `Something went wrong inside the extension. Try again.` | Enabled |
| Answer not yet received | none | `Checking this computer...` | No change |

The size in the first row is an estimate. If it cannot be read, the popup writes "about several hundred MB" instead. The note for built-in graphics reads: `Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.`

Only the two blocking codes disable the button. The code comment in `popup.js` gives the reason: a computer without WebGPU or 16-bit math cannot run the model at all, while other failures may be temporary.

After every job ends, success or error, the popup asks for the model state once more. The model line and the button then follow the saved choice.

`src/ui/popup.js`
```js
/** After a job ends the model line may be out of date (downloaded now, or switched to the smaller model). */
function refreshModelLineOnce(job) {
  if (refreshedFor === job.jobId) return;
  refreshedFor = job.jobId;
  void loadModelState();
}
```

**What this means in plain words.** Two messages stop the button. Every other failure leaves it open, and the model line is brought up to date when a job ends.

## The retry with the small model, and why the choice is saved

If the primary model fails with an out-of-memory error or a load error, the engine tries the small model once. One line lists the codes that trigger this.

`src/engines/local.js`
```js
// A failed load with the primary model is retried once with the smaller one.
const RETRY_WITH_FALLBACK = new Set([ERROR_CODES.GPU_MEMORY, ERROR_CODES.MODEL_LOAD_FAILED]);
```

The catch block in `prepare()` makes the switch and records it.

`src/engines/local.js`
```js
      } catch (err) {
        if (!(err instanceof AppError) || !RETRY_WITH_FALLBACK.has(err.code) || engine.model.id !== MODELS.primary.id) throw err;
        // The primary model did not fit or would not start: remember that and try the small one.
        await onFallback();
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = err.code;
```

The service worker supplies `onFallback`, which writes the override to `chrome.storage.local`.

`src/background/service-worker.js`
```js
    onFallback: () => chrome.storage.local.set({ modelOverride: 'fallback' }),
```

The retry happens at most once. The condition checks that the primary model is in use, so a failure of the small model is thrown and no third try follows. A download failure is not in the list, so a dropped connection never switches the model. The unit test "a download failure is not retried with another model" checks this.

The choice is saved for three reasons visible in the code. The save happens before the small model is tried, so the choice stays even if SmolLM2 also fails (browser test V11). Storage in `chrome.storage.local` lasts across restarts, which session storage would not. And every later popup and job reads the override in `loadSettings`, so the big model is not tried again.

**What the reader sees after a switch.** A finished summary made by the small model after a memory or load failure now carries a notice under the result. The notice is computed in the popup from the job's stats, and it is shown only for `GPU_MEMORY` and `MODEL_LOAD_FAILED`. A switch caused by built-in graphics does not show it, because that case already has the graphics note.

`src/ui/popup.js`
```js
/** Tells the user when the summary was made by the smaller model after the main one failed. */
function switchNotice(reason) {
  if (reason === 'GPU_MEMORY' || reason === 'MODEL_LOAD_FAILED') {
    return 'The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed.';
  }
  return null;
}
```

**Before the fix.** Earlier builds drew no notice. The only sign of the switch was the model's name in the stats line, and the model line after two failed models still showed the main model as "Not downloaded yet". The developer log records both (DEVLOG, 2026-10-21, "V2 popup: silent fallback").

**Still true after the fix.** No code path clears `modelOverride`, so the only way back is to clear the extension's stored settings. A `MODEL_LOAD_FAILED` that has nothing to do with memory also saves the choice, and the notice then says the model "did not fit" even though memory may not be the cause.

**What this means in plain words.** When the big model does not fit, the extension switches once, remembers the switch, and now tells the reader. The memory lasts until the stored settings are cleared, and the notice does not offer a way to undo it.

## Design decisions

Table: Design decisions for the card check and the model choice

| Decision | Options considered | Choice | Why the others were rejected | Trade-off accepted |
|---|---|---|---|---|
| Built-in Intel graphics | Refuse; use the 1B model anyway; use the small model with a note | Small model with a note | The 1B model wrote about 2 tokens a second on Intel in a speed test (DEVLOG only). A refusal leaves the reader with nothing (DECISIONS D3) | Weaker answers on Intel; the rule covers Intel only |
| Memory | Always the 1B model; `navigator.deviceMemory` below 8 | Below 8 uses the small model | The browser caps the value at 8, so a 16 GB machine looks like an 8 GB one | Machines with 8 GB or more are not separated |
| Failure during load | Fail at once; retry once and save | Retry once, save, and show a notice | The decision record asks for one more try with the small model, and a memory of it (DECISIONS D1, item 3) | The saved choice has no undo |
| Where the choice is kept | Session storage; local storage | `chrome.storage.local` | Session storage ends with the browser, so the failure would repeat after a restart | Lasts until the stored settings are cleared |

**What this means in plain words.** Each choice trades simplicity or speed against a clear limit. The clearest trade is on Intel: a weaker model that finishes is better than a refusal.

## Worked example: the developer laptop

The developer laptop is an Acer Aspire Lite with an Intel Core i5-12450H, 15.7 GB of memory, Intel built-in graphics, an NVIDIA RTX 3050 with 6 GB, and Chrome 155 (DECISIONS D1). Chrome chooses which chip a page uses. The check reports the chip that Chrome gave, and the model follows from that report.

Two clean runs on this laptop show both outcomes. The first used Chrome's default. The second started Chrome with `--force_high_performance_gpu`. The numbers come from the files named in the first column.

Table: The same laptop with two graphics chips, and the same short article

| Run (test-run file) | Browser flags | Card reported | Built-in rule | Model | First download | Short article, total | Writing speed |
|---|---|---|---|---|---|---|---|
| Default Chrome (`v2-local-intel.md`) | none | `intel`, `gen-12lp` | applies | SmolLM2 360M | about 204 MB, 81 s | 199.2 s | 4 to 5 tokens a second |
| Forced card (`v2-local-nvidia-cold-first-attempt.md`) | `--force_high_performance_gpu` | `nvidia`, `ampere` | does not apply | Llama 3.2 1B | about 695 MB, 158.3 s | 196.8 s | 47 tokens a second |

On the default run, the rule chose SmolLM2 and the popup showed the note. The summary started at 123.1 seconds and ended at 199.2 seconds, so the built-in chip took about 76 seconds for one part. On the forced run the summary took about 3.7 seconds for the same article. The download was smaller on the built-in path, so the two first-use totals are close, and the gap appears only after the download.

Chrome did not choose the separate card by default. The developer log records that Chromium picked the Intel chip even when the code asked for the high-performance card, and that the flag changed the choice (DEVLOG, 2026-10-21, "V2 speed on the graphics card"). The setup offers an opt-in setting for the separate card (`setup.bat --gpu`, DECISIONS D4). That setting now prints a plain message if the Windows change fails, and setup carries on. The check cannot correct the browser's choice, because it reports only what Chrome selected.

The 1B model wrote about 2 tokens a second on the built-in chip in one speed test (DEVLOG only, no run file). The writing speeds in the saved clean runs are 34 to 53 tokens a second on the separate card, and each value is the last request of its job.

**What this means in plain words.** On this laptop the browser decides which chip runs the model. The same article took about 76 seconds on the built-in chip and about 3.7 seconds on the separate card, once the download was finished.

## Figures

The first figure is the flow of `prepare()`. As drawn, it reads from top to bottom. The card check comes first, then the WebGPU and 16-bit math question, which sends a "no" straight to a stop with the message and a disabled button. A "yes" leads to the model choice. The box lists three reasons for SmolLM2: built-in graphics, under 8 GB of memory, or a saved fallback. The load step downloads if the model is not stored. A `GPU_MEMORY` or `MODEL_LOAD_FAILED` error with the 1B model saves the fallback and retries once with SmolLM2. Any other error, for example `MODEL_DOWNLOAD_FAILED`, stops with its message and no retry. A second failure also stops. The drawing says the warm-up takes about 30 seconds the first time, and the footnote gives the sizes, about 695 MB for the 1B model and about 204 MB for SmolLM2.

![Flow of prepare(): check the card, pick the model, download if not stored, load, warm up, and retry once with the small model after a memory or load error](../figures/V04_model_preparation.png)

The second figure compares the two chips of the developer laptop.

![Two graphics chips in one laptop: Chrome's default choice and the forced choice, with the speed measured for each](../figures/V17_two_graphics_chips.png)

Reading the figure: the default path goes from Chrome to the built-in Intel graphics, which Chrome used by default on this laptop. Its box gives the measured 4 to 5 tokens a second for SmolLM2 360M, with a short article taking 199.2 seconds on first use. The separate path goes to the NVIDIA RTX 3050 with 6 GB. Its box gives 34 to 53 tokens a second for Llama 3.2 1B, with the short article taking 15.3 seconds stored and offline. The figure shows two ways to reach the separate card: a Windows setting by hand, and `setup.bat --gpu`, which it describes as opt-in and tested only against a test registry key. The undo command in the drawing includes `-ChromePath`. The script now finds Chrome itself, so that option is not needed.

## Screenshots

The first screenshot is a real model screenshot taken before the marker fix.

![Real model, before the marker fix: the popup after a short article on the built-in Intel chip, with the Intel note and the marker at the start of the summary](../screenshots/v2-intel-short-popup.png)

Reading the screenshot: the button reads "Download model and summarize". The model line reads "Model: SmolLM2 360M. Not downloaded yet (about 204 MB, first use only)." The shaded note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The first line of the summary is the prompt marker `<<<PAGE TEXT START>>>`. This screenshot and the Intel run file (`v2-local-intel.json`) were recorded before the fix. The fix strips the markers from every answer (see the next paragraph), so a new run no longer shows them.

The small model copied the markers from the prompt into its answer, and the short-article summary of that run contains both `<<<PAGE TEXT START>>>` and `<<<PAGE TEXT END>>>`. The long-article summary from the same run does not. The fix is `stripPageMarkers()` in `src/core/prompts.js`, called on every answer in `src/engines/local.js`. Two unit tests cover it. The model line in the picture still says "Not downloaded yet". The picture was most likely taken as the summary appeared, before the refresh that follows a finished job had completed.

The next four screenshots are pretend model screenshots, made with the mock engine.

![Pretend model: the note under the model line when the card is built-in Intel. The size shows about 300 MB, the pretend model's own figure](../screenshots/ui-09-intel-note.png)

Reading the screenshot: the model line reads "Model: SmolLM2 360M. Not downloaded yet (about 300 MB, first use only).", and the Intel note sits in its shaded box below it. The 300 MB is the pretend model's fixed value, not the 204 MB of the real run.

![Pretend model: the popup after the card reports no WebGPU, with the button greyed out and the WebGPU message in red](../screenshots/ui-10-no-webgpu.png)

Reading the screenshot: the button is greyed out and reads "Summarize this page". The red text reads "Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check." No model line is shown.

![Pretend model: the popup after the card lacks 16-bit math, with the button greyed out](../screenshots/ui-11-no-shader-f16.png)

Reading the screenshot: the button is greyed out, and the red text reads "Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2."

![Pretend model: the popup after the primary model ran out of memory, with the summary finished on SmolLM2 360M and the switch notice under the result](../screenshots/ui-12-fallback-after-out-of-memory.png)

Reading the screenshot: the model line reads "Model: SmolLM2 360M. Downloaded, runs on this computer." Under the result, the notice reads "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." A summary of three points follows, and the stats line reads "1 part · 1 request · 2.3 s · SmolLM2 360M".

![Pretend model: both models ran out of memory, with the error text and the model line now naming the small model that the saved switch chose](../screenshots/ui-13-out-of-memory-all.png)

Reading the screenshot: the error reads "The graphics card ran out of memory. Close other heavy tabs or programs and try again." The model line reads "Model: SmolLM2 360M. Not downloaded yet (about 300 MB, first use only)." and the button reads "Download model and summarize", enabled. The model line names SmolLM2 because the saved switch chooses it, so the line is current after a failed job. Before the fix it still named the main model.

## Failure cases and how each is handled

Table: Failures in the card check and the model choice

| Failure | Where it is caught | What the reader sees | What happens to the choice |
|---|---|---|---|
| `navigator.gpu` missing, or no adapter | `evaluateGpu` | No WebGPU message; button disabled | Nothing downloaded, nothing saved |
| Adapter without `shader-f16` | `evaluateGpu` | No 16-bit math message; button disabled | Nothing saved |
| `requestAdapter()` throws | Offscreen page catch | Generic message; button enabled | Nothing saved. The code reports `SERVICE_ERROR`, not `NO_WEBGPU` |
| Primary model out of memory | `prepare()` catch | Summary finished by SmolLM2, with the switch notice | Saved as `fallback` |
| Both models out of memory | Second error is thrown | Out-of-memory message; model line names SmolLM2 | Still saved as `fallback` (browser test V11) |
| Primary model fails to load | `prepare()` catch | Summary finished by SmolLM2, with the notice that says "did not fit" | Saved as `fallback` |
| Download stops | Not in the retry list | Download message; button enabled | Nothing saved (browser test V12) |
| Built-in Intel card | Built-in rule | Note under the model line | Not saved; the rule runs again unless the override is already saved |

**What this means in plain words.** Most failures stop with a message that names the cause. Only two of them change the saved choice, and both move it towards the smaller model. A switch now shows a notice.

## What went wrong while building it

The developer log records these problems in this part (DEVLOG, 2026-10-21).

- The 1B model decoded about 2 tokens a second on the built-in chip in a speed test, and the first answer took 36 seconds. The cause was the browser's choice of chip. The fix was the built-in rule and the note, plus the opt-in setting for the separate chip ("V2 speed on the graphics card").
- The popup printed the vendor as `intel`, in lower case, because WebGPU reports vendors in lower case. Browser test V09 found it, and `vendorName()` in `popup.js` now maps the known names ("V2 browser tests: graphics note").
- The Intel run finished the short article in 199.2 seconds. The log says the weak chip "is not an error, so it gets a note and a smaller model, not a refusal" ("V2 real-model runs on Intel graphics").
- The switch was silent. The popup now shows the notice, and the model line is refreshed when a job ends ("V2 popup: silent fallback").
- The copied page markers reached the summary. The fix is in ("V2 summaries", the marker row).
- A word such as "room" inside an engine error text was treated as out of memory. Only the whole word "oom" counts now, with a unit test ("V2 review while writing the report", item 3).

**What this means in plain words.** The largest surprise was that the browser, not the code, chose the slow chip. The silent switch and the copied markers were both visible only to a reader who looked closely, and both now show up on screen or in the output.

## How it was tested

The unit tests in `tests/unit/gpu-and-errors.test.js` cover the check: "no WebGPU API at all is NO_WEBGPU", "an adapter without shader-f16 is NO_SHADER_F16", "a small machine (under 8 GB) or an earlier failure chooses the smaller model", "mapInitProgress never says downloading when the model is already stored", and "the word 'room' is not an out-of-memory error". The unit tests in `tests/unit/local-engine.test.js` cover the engine, including "integrated graphics switches to the small model before loading" and "a primary model that runs out of graphics memory is retried once with the small one, and remembered". The unit tests in `tests/unit/small.test.js` and `tests/unit/local-engine.test.js` cover the marker removal.

The browser tests in `tests/e2e/pipeline.test.js` use the pretend model. Scenario V07 covers no WebGPU, V08 no 16-bit math, V09 built-in graphics, V10 an out-of-memory primary model (and it checks the notice), V11 two out-of-memory models, and V12 a failed download. The unit suite has 70 tests and the browser suite has 26. The real-model runs are the clean runs in `finalsem/docs/test-runs/`, and they show the Intel and NVIDIA outcomes above. The real card was tested only on the developer laptop.

**What this means in plain words.** The rules are tested with unit tests and the pretend model. The real card was checked only on one laptop.

## Limitations

- The built-in rule recognises Intel by name only. A built-in AMD or Apple chip would count as a full card, and the reader would get no warning.
- The memory rule works only below 8 GB, because the browser caps the value. No run on a 4 GB machine is recorded, so the threshold is not measured [to be measured].
- The small model's answers are weaker. The merge step can repeat the prompt's own preamble ("These are summaries of consecutive parts of one web page"), and small models make factual slips. The marker fix does not cover this, and it is listed as a limit of a 1B model (DEVLOG, "V2 summaries").
- The saved choice has no undo, and the notice for `MODEL_LOAD_FAILED` says "did not fit" even when memory is not the cause.
- The client's laptop has not been tested (DECISIONS D1, last paragraph).

## Questions this chapter answers

**Does the check choose the graphics chip?**
No. The check reports the chip that Chrome gives the page. On the developer laptop Chrome chose the built-in Intel chip by default, and the separate NVIDIA chip only after the browser was started with the flag. The check turns that report into a model and a message.

**Why does a built-in Intel chip get the small model instead of an error?**
The 1B model wrote about 2 tokens a second on the Intel chip in a speed test, while SmolLM2 wrote 4 to 5 tokens a second in the clean run. A slow answer that finishes is better than a refusal. The extension keeps the feature and adds a note.

**Why is the choice saved after an out-of-memory failure?**
The choice is written to `chrome.storage.local` before the small model is tried. Every later job then starts with the small model instead of failing again with the large one. The reader is told about the switch by a notice, and no code path clears the choice, so it lasts until the stored settings are cleared.

**What happens on a computer without WebGPU?**
The popup shows the message for `NO_WEBGPU` and disables the button. Nothing is downloaded and nothing is saved, because the check returns before the model is loaded.

**Can a laptop with 4 GB of memory run the 1B model?**
Not under the code's rule. Chrome reports 4, which is below 8, so the small model is chosen. The threshold comes from the decision record, and no run on a 4 GB machine is recorded, so its result is [to be measured].
