# Graphics card check and model choice

## What this part does and why it exists

The model runs on the graphics card through WebGPU. Two conditions stop it from running at all: the browser has no WebGPU, or the card lacks the 16-bit math that the model's shader programs need (`shader-f16`). The check looks for both before any download starts. The popup can then explain the problem, instead of downloading about 695 MB and failing at the end. Chapter 3 explains WebGPU and `shader-f16` in plain terms.

The check also chooses the model. The project uses two 4-bit models from WebLLM's list: Llama 3.2 1B as the primary, and SmolLM2 360M as the fallback. Three inputs decide between them: a saved answer from an earlier failure, the memory the browser reports, and whether the card is built into the processor.

The check runs in the offscreen page (`src/offscreen/offscreen.js`), where the model runs. Its pure functions live in `src/core/gpu-check.js`, and the engine that makes the choice is `src/engines/local.js`.

## What the check looks at

The check asks four questions in order: is `navigator.gpu` there, does the browser return an adapter (the card Chrome will use), does that adapter list `shader-f16`, and what are its vendor and architecture labels?

`src/core/gpu-check.js`
```js
export function evaluateGpu({ hasGpuApi, adapter }) {
  if (!hasGpuApi) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'navigator.gpu is missing' };
  if (!adapter) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'requestAdapter() returned nothing' };
  if (!adapter.features.has('shader-f16')) {
    return { ok: false, code: ERROR_CODES.NO_SHADER_F16, detail: 'adapter has no shader-f16 feature' };
  }
```

The offscreen page asks for the adapter with the high-performance preference. The code comment says this is the same request WebLLM makes, so the check describes the card WebLLM will use. The built-in test is one line:

`src/offscreen/offscreen.js`
```js
        // Intel "gen-*" parts are the processor's built-in graphics: usable, but much slower.
        integrated: gpu.vendor.toLowerCase() === 'intel' && /gen/i.test(gpu.architecture),
```

Chrome reported the built-in chip as `intel` with architecture `gen-12lp`, and the separate chip as `nvidia` with `ampere` (`v2-local-intel.json` and `v2-local-nvidia-offline.json`). The rule recognises Intel by name only.

**What this means in plain words.** The check asks Chrome three yes-or-no questions and reads two labels. The labels decide whether the card is built into the processor.

## How the model is chosen

Table: The rules that choose the model, in the order they run

| Order | Rule | Where it is | Result |
|---|---|---|---|
| 1 | The saved override is `fallback` | `modelOverride` in `chrome.storage.local`, read by `loadSettings` | SmolLM2 360M |
| 2 | `navigator.deviceMemory` is below 8 | `chooseModel` | SmolLM2 360M |
| 3 | Anything else | `chooseModel` | Llama 3.2 1B |
| 4 | Primary chosen, card is built-in Intel, no override saved | `checkStatus` in `src/engines/local.js` | SmolLM2 360M, reason `integrated-graphics` |

`src/core/gpu-check.js`
```js
export function chooseModel({ deviceMemoryGB, override } = {}) {
  if (override === 'fallback') return MODELS.fallback;
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB < 8) return MODELS.fallback;
  return MODELS.primary;
}
```

Chrome rounds `navigator.deviceMemory` and caps it at 8, as the comment in `gpu-check.js` says. The developer laptop, with 15.7 GB, reports 8 and passes. The threshold comes from the decision record (DECISIONS D1, item 3). The 879 MB and 376 MB figures in `config.js` are graphics memory, not download sizes.

**What this means in plain words.** The choice uses an earlier failure, the memory the browser reports, and whether the card is built into the processor. The memory input cannot tell an 8 GB laptop from a 16 GB one.

## The check inside the engine

The engine asks the page first, and only then decides what to download.

`src/engines/local.js`
```js
      let status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      if (status.gpu?.integrated && engine.model.id === MODELS.primary.id && !settings.modelOverride) {
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = 'integrated-graphics';
        status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      }
```

On the Intel path the page is asked twice, because the stored flag and the size depend on the model named. The rule does not run when an override is already saved. `prepare()` calls `checkStatus()` before any download. An error from the page becomes an `AppError` with the same code (`fromWire`), so the job stops before a download is requested. Chapter 9 explains the messages between the engine and the page.

**What this means in plain words.** The engine asks what the card can do before it decides what to download. A failed check stops the job before anything is downloaded.

## What the popup says for each outcome

Table: What the reader sees for each outcome

| Outcome | Code | Model line (exact text) | Button |
|---|---|---|---|
| Card usable, model not stored | none | `Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only).` | Download model and summarize (enabled) |
| Card usable, model stored | none | `Model: Llama 3.2 1B. Downloaded, runs on this computer.` | Summarize this page (enabled) |
| Built-in Intel graphics | none, the rule applies | The SmolLM2 line, with the note below | As in the two rows above |
| No WebGPU | NO_WEBGPU | `Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check.` | Disabled |
| No 16-bit math | NO_SHADER_F16 | `Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2.` | Disabled |
| Check fails for another reason | SERVICE_ERROR | `Something went wrong inside the extension. Try again.` | Enabled |
| Answer not yet received | none | `Checking this computer...` | No change |

If the size cannot be read, the first row says "about several hundred MB". The built-in note reads: `Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.` Only the two blocking codes disable the button, because the code comment says other failures may be temporary. For `SERVICE_ERROR` and `MODEL_LOAD_FAILED` the popup also shows a line that starts "Technical detail:" with the first 240 characters of the error. After every job ends, success or error, the popup asks for the model state once more, so the model line follows the saved choice.

**What this means in plain words.** Two messages stop the button. Every other failure leaves it open, and the model line is brought up to date when a job ends.

## The retry with the small model, and why the choice is saved

Only two codes trigger the retry: `GPU_MEMORY` and `MODEL_LOAD_FAILED`. The catch block in `prepare()` makes the switch and records it.

`src/engines/local.js`
```js
        if (!(err instanceof AppError) || !RETRY_WITH_FALLBACK.has(err.code) || engine.model.id !== MODELS.primary.id) throw err;
        // The primary model did not fit or would not start: remember that and try the small one.
        await onFallback();
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = err.code;
```

The service worker's `onFallback` writes `modelOverride: 'fallback'` to `chrome.storage.local`. The retry happens at most once: a failure of the small model is thrown, and no third try follows. A download failure is not in the list, so a dropped connection never switches the model. The unit test "a download failure is not retried with another model" checks this.

The choice is saved for three reasons. The save happens before the small model is tried, so the choice stays even if SmolLM2 also fails (browser test V11). Local storage lasts across restarts. And every later popup and job reads the override in `loadSettings`, so the big model is not tried again.

**What the reader sees after a switch.** A finished summary made by the small model after a `GPU_MEMORY` or `MODEL_LOAD_FAILED` error shows a notice under the result. The notice reads: "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The popup works this out from the job's stats. A switch caused by built-in graphics shows no notice, because that case already has the graphics note.

**Before the fix.** Earlier builds showed no notice. The only sign of the switch was the model's name in the stats line, and after two failed models the model line still showed the main model as "Not downloaded yet" (DEVLOG, 2026-10-21, "V2 popup: silent fallback"; chapter 15 tells this story).

**Still true after the fix.** No code path clears `modelOverride`, so the only way back is to clear the stored settings. A `MODEL_LOAD_FAILED` with no link to memory also saves the choice, and the notice then says the model "did not fit" even when memory may not be the cause.

**What this means in plain words.** When the big model does not fit, the extension switches once, remembers the switch, and tells the reader. The memory lasts until the stored settings are cleared.

## Design decisions

Table: Design decisions for the card check and the model choice

| Decision | Options considered | Choice | Why the others were rejected | Trade-off accepted |
|---|---|---|---|---|
| Built-in Intel graphics | Refuse; the 1B model anyway; the small model with a note | Small model with a note | The 1B model wrote about 2 tokens a second on Intel in a speed test (DEVLOG only). A refusal leaves the reader with nothing (DECISIONS D3) | Weaker answers on Intel; the rule covers Intel only |
| Memory | Always the 1B model; `navigator.deviceMemory` below 8 | Below 8 uses the small model | The browser caps the value at 8, so 16 GB looks like 8 GB | Machines with 8 GB or more are not separated |
| Failure during load | Fail at once; retry once and save | Retry once, save and show a notice | The decision record asks for one more try and a memory of it (DECISIONS D1, item 3) | The saved choice has no undo |
| Where the choice is kept | Session storage; local storage | `chrome.storage.local` | Session storage ends with the browser, so the failure would repeat | Lasts until the stored settings are cleared |

**What this means in plain words.** Each choice trades simplicity or speed for a clear limit. The clearest trade is on Intel: a weaker model that finishes beats a refusal.

## Worked example: the developer laptop

The developer laptop is an Acer Aspire Lite with an Intel Core i5-12450H, 15.7 GB of memory, Intel built-in graphics, an NVIDIA RTX 3050 with 6 GB, and Chrome 155 (DECISIONS D1). Chrome chooses the chip. The check reports the chip Chrome gave, and the model follows from that report.

Table: The same laptop with two graphics chips, and the same short article

| Run (test-run file) | Browser flags | Card reported | Built-in rule | Model | First download | Short article, total | Writing speed |
|---|---|---|---|---|---|---|---|
| Default Chrome (`v2-local-intel.md`) | none | `intel`, `gen-12lp` | applies | SmolLM2 360M | about 204 MB, 81 s | 199.2 s | 4 to 5 tokens a second |
| Forced card (`v2-local-nvidia-cold-first-attempt.md`) | `--force_high_performance_gpu` | `nvidia`, `ampere` | does not apply | Llama 3.2 1B | about 695 MB, 158.3 s | 196.8 s | 47 tokens a second |

On the default run the summary started at 123.1 seconds and ended at 199.2 seconds, so the built-in chip took about 76 seconds for one part. On the forced run the same article took about 3.7 seconds. The download was smaller on the built-in path, so the two first-use totals are close. The gap appears after the download.

Chrome picked the built-in chip by default, even when the code asked for the high-performance card. The flag changed the choice (DEVLOG, 2026-10-21; chapter 15 tells this). The opt-in setting `setup.bat --gpu` moves Chrome to the separate card (DECISIONS D4). It prints a plain message if the Windows change fails, and setup carries on. In one speed test the 1B model wrote about 2 tokens a second on the built-in chip (DEVLOG only, no run file). In the saved clean runs the separate card wrote 34 to 53 tokens a second, and each value is the last request of its job.

The Intel chip also ran the 7-part Wikipedia article (36,752 characters). With the new code, which has a 10-minute answer limit and cuts a part that does not fit the window in half, the summary took 616.4 seconds, writing at 4.1 tokens a second. The old code timed out on the first try, after 615.6 seconds: part 6 of 7 had not answered 180 seconds after it started. The same old code finished the second try in 704.5 seconds. Answer times on this chip vary a lot, which is why the limit was raised (DEVLOG, 2026-10-24).

**What this means in plain words.** On this laptop the browser decides which chip runs the model. The same article took about 76 seconds on the built-in chip and about 3.7 seconds on the separate card, once the download was done.

## Figures

![Flow of prepare(): check the card, pick the model, download if not stored, load, warm up, and retry once with the small model after a memory or load error](../figures/V04_model_preparation.png)

Reading the figure: the flow runs from top to bottom. A "no" on WebGPU or 16-bit math stops at a message and a disabled button. A "yes" leads to the model choice, with SmolLM2 chosen for built-in graphics, under 8 GB of memory, or a saved fallback. A `GPU_MEMORY` or `MODEL_LOAD_FAILED` error with the 1B model saves the fallback and retries once. Other errors, such as `MODEL_DOWNLOAD_FAILED`, stop with their message.

![Two graphics chips in one laptop: Chrome's default choice and the forced choice, with the speed measured for each](../figures/V17_two_graphics_chips.png)

Reading the figure: the default path goes to the built-in Intel chip, with the measured 4 to 5 tokens a second for SmolLM2 and 199.2 seconds for the short article. The separate path goes to the NVIDIA RTX 3050, with 34 to 53 tokens a second for the 1B model and 15.3 seconds for the short article when stored and offline. The drawing shows the Windows setting and `setup.bat --gpu` as the two ways to reach the separate card. Its undo line lists `-ChromePath`, which the script no longer needs.

## Screenshots

![Real model, before the marker fix: the popup after a short article on the built-in Intel chip, with the Intel note and the marker at the start of the summary](../screenshots/v2-intel-short-popup.png)

Reading the screenshot: the summary begins with the prompt marker `<<<PAGE TEXT START>>>`, and the Intel note sits under the model line, which reads "Not downloaded yet (about 204 MB)". The picture and the Intel run file were recorded before the fix. The fix, `stripPageMarkers()` in `src/core/prompts.js`, removes the markers from every answer. The long-article summary from the same run had no markers.

![Pretend model: the popup after the primary model ran out of memory, with the summary finished on SmolLM2 360M and the switch notice under the result](../screenshots/ui-12-fallback-after-out-of-memory.png)

Reading the screenshot: the notice under the result tells the reader that the smaller model wrote the summary. The model line reads "Model: SmolLM2 360M. Downloaded, runs on this computer." The stats line reads "1 part · 1 request · 2.3 s · SmolLM2 360M".

![Pretend model: both models ran out of memory, with the error text and the model line now naming the small model that the saved switch chose](../screenshots/ui-13-out-of-memory-all.png)

Reading the screenshot: the error reads "The graphics card ran out of memory. Close other heavy tabs or programs and try again." The model line names SmolLM2 because the saved switch chooses it, and the button is enabled. Before the fix the model line still named the main model.

## Failure cases

Table: Failures in this part that the choice depends on

| Failure | What happens to the choice |
|---|---|
| `requestAdapter()` throws | Nothing saved. The code reports `SERVICE_ERROR`, not `NO_WEBGPU` |
| Both models out of memory | Still saved as `fallback` (browser test V11) |
| Download stops | Not retried; nothing saved (browser test V12) |

Chapter 12 explains how each code reaches the reader, including the no-WebGPU and download cases.

**What this means in plain words.** Most failures stop with a message that names the cause. Only two of them change the saved choice, and both move it towards the smaller model.

## What went wrong while building it

The developer log tells the stories behind this part (chapter 15). The main ones are the browser's choice of chip, the lowercase vendor name that the popup printed as it was, the silent fallback, and the copied page markers. On the built-in chip the 1B model's first answer took 36 seconds (DEVLOG, 2026-10-21), and the Intel run took 199.2 seconds, as the worked example shows. A word such as "room" inside an error text once counted as out of memory. Only the whole word "oom" counts now (DEVLOG, 2026-10-21, "V2 review while writing the report", item 3).

**What this means in plain words.** The biggest surprise was that the browser, not the code, chose the slow chip. The silent switch and the copied markers were visible only to a careful reader, and both now show on screen or are removed from the output.

## How it was tested

The unit tests in `tests/unit/gpu-and-errors.test.js` and `tests/unit/local-engine.test.js` cover the check, the choice and the retry. The browser tests in `tests/e2e/pipeline.test.js` use the pretend model: V07 covers no WebGPU, V08 no 16-bit math, V09 built-in graphics, V10 an out-of-memory primary model (and checks the notice), V11 two out-of-memory models, and V12 a failed download. The unit suite has 76 tests and the browser suite 29. Scenario V25 covers the halving of long parts, and V27 the technical detail line. The real card was checked only on the developer laptop.

**What this means in plain words.** The rules are checked by unit tests and by the pretend model. The real card was checked on one laptop only.

## Limitations

- The built-in rule recognises Intel by name only. A built-in AMD or Apple chip would count as a full card, and the reader would get no warning.
- The memory rule works only below 8 GB, because the browser caps the value. No run on a 4 GB machine is recorded, so the threshold is not measured [to be measured].
- The small model's answers are weaker. The merge step can repeat the prompt's own preamble, and small models make factual slips. Chapter 10 covers how good the summaries are.
- No code path clears `modelOverride`, and the notice for `MODEL_LOAD_FAILED` says "did not fit" even when memory is not the cause.
- Halving is built. A part that does not fit the model's window is cut in half and summarized again, up to three levels deep and for parts of at least 600 characters. The real Wikipedia run did not need it, so the halving is covered by unit tests and by scenario V25 only.
- A long page on the Intel chip is slow. The 7-part Wikipedia article took about 10 to 12 minutes with SmolLM2 (616.4 seconds with the new code). The summary of the old-code second try contains invented facts, which are not quoted here. The new-code run's summary has three short generic points, and its counts were not checked against the page. Chapter 10 covers summary quality. Wikipedia text changes from day to day, so a part that overflows one day may fit the next.
- The client's laptop has not been tested (DECISIONS D1, last paragraph).

## Questions this chapter answers

**Does the check choose the graphics chip?**
No. The check reports the chip that Chrome gives the page. On the developer laptop Chrome chose the built-in Intel chip by default, and the separate chip only after the browser was started with the flag. The check turns that report into a model and a message.

**Why does a built-in Intel chip get the small model instead of an error?**
The 1B model wrote about 2 tokens a second on the Intel chip in a speed test, and SmolLM2 wrote 4 to 5 tokens a second in the clean run. A slow answer that finishes is better than a refusal, so the extension keeps the feature and adds a note.

**Why is the choice saved after an out-of-memory failure?**
The choice is written to `chrome.storage.local` before the small model is tried. Every later job then starts with the small model instead of failing again with the large one. The reader is told about the switch by a notice, and nothing clears the choice, so it lasts until the stored settings are cleared.

**Can a laptop with 4 GB of memory run the 1B model?**
Not under the code's rule. Chrome reports 4, which is below 8, so the small model is chosen. The threshold comes from the decision record, and no run on a 4 GB machine is recorded, so its result is [to be measured].
