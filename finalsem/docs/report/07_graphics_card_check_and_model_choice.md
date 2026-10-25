# Graphics card check and model choice

## What this part does and why it exists

The model runs on the graphics card through WebGPU. Two conditions stop it from running at all: the browser has no WebGPU, or the card lacks the 16-bit math that the model's shader programs need (`shader-f16`). The check looks for both before any download starts. The popup can then explain the problem, instead of downloading about 695 MB and failing at the end. Chapter 3 explains WebGPU and `shader-f16` in plain terms.

The check also gives the graphics note and the reading budget. The model itself is chosen by three things: the Quality setting, a memory or load failure with the main model, and the memory the browser reports. The main model is Llama 3.2 1B, and SmolLM2 360M is the smaller one. Both are 4-bit models from WebLLM's list.

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

The offscreen page asks for the adapter with the high-performance preference, the same request WebLLM makes. The built-in test is one line in the same file.

`src/offscreen/offscreen.js`
```js
        // Intel "gen-*" parts are the processor's built-in graphics: usable, but much slower.
        integrated: gpu.vendor.toLowerCase() === 'intel' && /gen/i.test(gpu.architecture),
```

Chrome reports the built-in chip as `intel` with architecture `gen-12lp`, and the separate chip as `nvidia` with `ampere` (`v2-local-intel-better.md` and `v2-local-nvidia-offline.json`). The test recognises Intel by name only. Its result now sets two things: the built-in note under the model line, and the reading budget of 6,000 characters (see the engine section). It no longer changes the model.

**What this means in plain words.** The check asks Chrome three yes-or-no questions and reads two labels. On an Intel built-in chip the labels add a note and a shorter reading budget, and the model stays the same.

## How the model is chosen

Until 26 October, an Intel built-in chip switched the extension to SmolLM2 by itself. That automatic switch is removed. Llama 3.2 1B is now the default everywhere, including built-in graphics. SmolLM2 is used only when the person chooses it, or in the two cases below.

Table: The rules that choose the model, in the order they run

| Order | Rule | Where it is | Result |
|---|---|---|---|
| 1 | The saved override is `fallback`, or Settings > Quality is Fast | `chooseModel`; `modelOverride` and `quality` in `chrome.storage.local` | SmolLM2 360M |
| 2 | `navigator.deviceMemory` is below 8 | `chooseModel` | SmolLM2 360M |
| 3 | Anything else | `chooseModel` | Llama 3.2 1B (default) |

`src/core/gpu-check.js`
```js
export function chooseModel({ deviceMemoryGB, override, quality } = {}) {
  if (override === 'fallback' || quality === 'fast') return MODELS.fallback;
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB < 8) return MODELS.fallback;
  return MODELS.primary;
}
```

The popup's Settings section holds the Quality choice. "Better: Llama 3.2 1B" is the default, and "Fast: SmolLM2 360M" is the other. The popup describes Fast as about two times quicker, with summaries that are often muddled or wrong. Choosing Fast records the reason `quality-fast` for the model switch, and the choice is stored in the browser.

Chrome rounds `navigator.deviceMemory` and caps it at 8, as the comment in `gpu-check.js` says. A laptop with 15.7 GB of memory reports 8 and passes the memory rule. The threshold comes from the decision record (DECISIONS D1, item 3). The decision to make Llama 3.2 1B the default is DECISIONS D7, which records the question put to a second model and its answer.

**What this means in plain words.** The reader chooses between a more accurate, slower model and a quicker, less reliable one. A saved failure or a small memory still moves the extension to the smaller model.

## The check inside the engine

The engine asks the page for the card status, and it does not switch models on the result. Each part is then read within a budget that depends on the card.

`src/engines/local.js`
```js
    async checkStatus() {
      const status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      engine.status = status;
      return status;
    },
```

`src/engines/local.js`
```js
    async readBudgetChars() {
      const status = engine.status ?? (await engine.checkStatus());
      return status.gpu?.integrated ? settings.readBudgetIntegrated : settings.readBudgetOther;
    },
```

On built-in graphics the budget is 6,000 characters, which is exactly one part of the model's window, so no merge request is needed. Other cards read the whole page. The same built-in flag also makes answers shorter, as chapter 10 explains.

`prepare()` uses the status already asked for the budget, and it sends the load request. If the page returns an error, `call()` turns it into an `AppError` with the same code (`fromWire`), so the job stops before a download is requested.

**What this means in plain words.** The graphics check now controls how much of a page is read, not which model is used. A failed check still stops the job before any download.

## What the popup says for each outcome

The popup shows the result of the check in the model line under the title, and it enables or disables the button.

Table: What the reader sees for each outcome

| Outcome | Code | Model line (exact text) | Button |
|---|---|---|---|
| Card usable, Llama 3.2 1B not stored | none | `Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only).` | Download model and summarize (enabled) |
| Card usable, Llama 3.2 1B stored | none | `Model: Llama 3.2 1B. Downloaded, runs on this computer.` | Summarize this page (enabled) |
| Built-in Intel graphics | none | The same model line as above, with the note below | As in the two rows above |
| Quality set to Fast | none | `Model: SmolLM2 360M...` in the same form | As in the two rows above |
| No WebGPU | NO_WEBGPU | `Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check.` | Disabled |
| No 16-bit math | NO_SHADER_F16 | `Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2.` | Disabled |
| Check fails for another reason | SERVICE_ERROR | `Something went wrong inside the extension. Try again.` | Enabled, with a "Technical detail:" line |
| Answer not yet received | none | `Checking this computer...` | No change |

If the size cannot be read, the first row says "about several hundred MB". The built-in note reads: `Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.` Only the two blocking codes disable the button. For `SERVICE_ERROR` and `MODEL_LOAD_FAILED` the popup also shows the first 240 characters of the technical detail. After every job ends, the popup asks for the model state once more, so the model line follows the saved choice.

**What this means in plain words.** Two messages stop the button. Every other failure leaves it open, and the model line is brought up to date when a job ends.

## The retry with the small model, and why the choice is saved

If the main model fails with an out-of-memory error or a load error, the engine tries the small model once. Only two codes trigger the retry.

`src/engines/local.js`
```js
        if (!(err instanceof AppError) || !RETRY_WITH_FALLBACK.has(err.code) || engine.model.id !== MODELS.primary.id) throw err;
        // The primary model did not fit or would not start: remember that and try the small one.
        await onFallback();
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = err.code;
```

The service worker's `onFallback` writes `modelOverride: 'fallback'` to `chrome.storage.local`. The retry happens at most once, and a download failure is not in the list, so a dropped connection never switches the model. The unit test "a download failure is not retried with another model" checks this.

The choice is saved for three reasons. The save happens before the small model is tried, so the choice stays even if SmolLM2 also fails (browser test V11). Local storage lasts across restarts. And every later popup and job reads the override in `loadSettings`, so the big model is not tried again.

A finished summary made by the small model after a `GPU_MEMORY` or `MODEL_LOAD_FAILED` error shows a notice under the result. The notice reads: "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." A summary made with Quality set to Fast shows no notice, because the person chose it.

**Before the fix.** Earlier builds showed no notice, and after two failed models the model line still showed the main model as "Not downloaded yet" (DEVLOG, 2026-10-21, "V2 popup: silent fallback"; chapter 15 tells this story).

**Still true.** No code path clears `modelOverride`, so the only way back is to clear the stored settings. A `MODEL_LOAD_FAILED` with no link to memory also saves the choice, and the notice then says the model "did not fit" even when memory may not be the cause.

**What this means in plain words.** When the big model does not fit, the extension switches once, remembers the switch, and tells the reader. The memory lasts until the stored settings are cleared.

## Design decisions

Table: Design decisions for the card check and the model choice

| Decision | Options considered | Choice | Why the others were rejected | Trade-off accepted |
|---|---|---|---|---|
| Model on built-in graphics | Smaller model automatically (until 26 October); the main model with a choice in Settings | Llama 3.2 1B by default; Quality: Fast for SmolLM2 | The 1B model is the accurate one (DECISIONS D7, question 1). The small model invented details in the same part (`bench-models.md`) | Slower answers; the reading budget and shorter answers keep them usable |
| Memory | The main model always; `navigator.deviceMemory` below 8 | Below 8 uses the small model | The browser caps the value at 8, so 16 GB looks like 8 GB | Machines with 8 GB or more are not separated |
| Failure during load | Fail at once; retry once and save | Retry once, save and show a notice | The decision record asks for one more try and a memory of it (DECISIONS D1, item 3) | The saved choice has no undo |
| Where the choice is kept | Session storage; local storage | `chrome.storage.local` | Session storage ends with the browser, so the failure would repeat | Lasts until the stored settings are cleared |

**What this means in plain words.** The accurate model is the default, and the quicker one is a visible choice. The cost is slower answers on the built-in chip, which the reading budget and shorter answers reduce.

## Worked example: the two laptops

The client's laptop is an HP Laptop with a 13th Gen Intel Core i7-1355U (a 15-watt processor), 16 GB of memory, Intel Iris Xe graphics built into the processor and no separate card, 363 GB free, and Chrome 156 with WebGPU hardware accelerated (`docs/CLIENT_LAPTOP.md`, from the client's photos). It has only the built-in path. The developer laptop has the same Intel generation of built-in chip and an NVIDIA RTX 3050, and Chrome chooses between them (DECISIONS D1).

Table: The Intel numbers on the developer laptop, by model and date

| Run (test-run file) | Model | Result | Writing speed |
|---|---|---|---|
| Short article, first use with the 695 MB download (`v2-local-intel-better.md`) | Llama 3.2 1B (default) | 200.6 s: download and load 149 s, warm-up about 28 s, summary about 51 s | 1.8 to 2.0 tokens a second |
| Lighthouse page (`v2-local-intel-better.md`) | Llama 3.2 1B | 124.6 s. Of 27,964 characters, 8,788 were cut as back matter and 5,968 were read (21 percent), in one part | 1.8 to 2.0 tokens a second |
| Long fixture article (`v2-local-intel-better.md`) | Llama 3.2 1B | 103.8 s. 5,302 of 10,532 characters were read | 1.8 to 2.0 tokens a second |
| Short article (`v2-local-intel.md`), before 26 October | SmolLM2 360M, automatic | 199.2 s | 4 to 5 tokens a second |
| Whole Lighthouse page, 7 parts (Intel Wikipedia runs of 24 October), before 26 October | SmolLM2 360M, automatic | 616.4 s with the new code; 704.5 s on the second try of the old code; the first old-code try timed out after 615.6 s | about 4 tokens a second |
| Quality: Fast (`v2-local-intel-fast.md`), made before the cleanup fix | SmolLM2 360M, chosen | Short article 39.5 s (model stored); Lighthouse 64.7 s | 4 tokens a second |

On this chip the 1B model reads at 15.6 tokens a second and writes at 2.0. One realistic part of 6,000 characters took 161.6 seconds, against 66.2 seconds for SmolLM2 (`bench-models.md`). Reading the text is about 80 percent of the time of a part. The first use downloads the 695 MB model once, and it also includes the warm-up. The Lighthouse page reads about a fifth of its text, and the popup says so.

The Fast Lighthouse answer in its record only repeated the prompt's safety sentence and an empty "Summary:" label. The cleanup fix now reports such an answer as an empty answer ("The model returned no summary for this page."). Its record predates that fix, which is why Fast is a visible choice and not the default.

The client's laptop has a related but different chip: Iris Xe, with more execution units, in a 15-watt processor. No number in this chapter is from the client's laptop, and the extension has not been run there or in a visible Chrome window.

**What this means in plain words.** On the developer laptop's Intel chip, the accurate model now takes about two minutes for the Lighthouse page, against about ten minutes before. The client's own speed is still to be measured.

## Figures

![Flow of prepare(): check the card, pick the model, download if not stored, load, warm up, and retry once with the small model after a memory or load error](../figures/V04_model_preparation.png)

Reading the figure: the flow runs from top to bottom. A "no" on WebGPU or 16-bit math stops at a message and a disabled button. A "yes" leads to the model choice. This drawing still shows the old rule that chose SmolLM2 on Intel built-in graphics, which was removed on 26 October. Settings > Quality now chooses SmolLM2 instead. The retry branch for memory and load errors is unchanged.

![Two graphics chips in one laptop: Chrome's default choice and the forced choice, with the speed measured for each](../figures/V17_two_graphics_chips.png)

Reading the figure: the default path goes to the built-in Intel chip, and the separate path goes to the NVIDIA RTX 3050. This drawing still shows the older SmolLM2 numbers and the rule that chose SmolLM2 on the built-in chip. Since 26 October the default there is Llama 3.2 1B, and the numbers in this chapter's table replace the drawing's. The undo line lists `-ChromePath`, which the script no longer needs.

## Screenshots

![Real model, before 26 October and before the marker fix: the popup after a short article on the built-in Intel chip, with the Intel note and the marker at the start of the summary](../screenshots/v2-intel-short-popup.png)

Reading the screenshot: the model line names SmolLM2, because the automatic rule chose it at the time. The Intel note sits under the model line. The summary begins with the prompt marker `<<<PAGE TEXT START>>>`, which the later fix removes. The long-article summary from the same run had no markers. Under the current code this chip defaults to Llama 3.2 1B.

![Pretend model: the popup after the primary model ran out of memory, with the summary finished on SmolLM2 360M and the switch notice under the result](../screenshots/ui-12-fallback-after-out-of-memory.png)

Reading the screenshot: under the result, the notice tells the reader that the smaller model wrote the summary. The model line reads "Model: SmolLM2 360M. Downloaded, runs on this computer." The stats line reads "1 part · 1 request · 2.3 s · SmolLM2 360M".

![Pretend model: both models ran out of memory, with the error text and the model line now naming the small model that the saved switch chose](../screenshots/ui-13-out-of-memory-all.png)

Reading the screenshot: the error reads "The graphics card ran out of memory. Close other heavy tabs or programs and try again." The model line names SmolLM2 because the saved switch chooses it, and the button is enabled.

## Failure cases

Table: The failures in this part that the choice depends on

| Failure | What happens to the choice |
|---|---|
| `requestAdapter()` throws | Nothing saved. The code reports `SERVICE_ERROR`, not `NO_WEBGPU` |
| Both models out of memory | Still saved as `fallback` (browser test V11) |
| Download stops | Not retried; nothing saved (browser test V12) |

Chapter 12 explains how each code reaches the reader, including the no-WebGPU and download cases.

**What this means in plain words.** Most failures stop with a message that names the cause. Only two of them change the saved choice, and both move it towards the smaller model.

## What went wrong while building it

The developer log tells the stories behind this part (chapter 15). The main ones are the browser's choice of chip, the lowercase vendor name that the popup printed as it was, the silent fallback, and the copied page markers. On the built-in chip the 1B model's first answer took 36 seconds in an early speed test (DEVLOG, 2026-10-21). A word such as "room" inside an error text once counted as out of memory. Only the whole word "oom" counts now (DEVLOG, 2026-10-21, "V2 review while writing the report", item 3).

**What this means in plain words.** The biggest surprise was that the browser, not the code, chose the slow chip. Once the choice was made visible, the accurate model became the default on that chip.

## How it was tested

The unit tests in `tests/unit/gpu-and-errors.test.js` and `tests/unit/local-engine.test.js` cover the check, the choice and the retry. The browser tests in `tests/e2e/pipeline.test.js` use the pretend model: V07 covers no WebGPU, V08 no 16-bit math, V09 built-in graphics (it now expects Llama 3.2 1B with the Intel note), V10 an out-of-memory primary model (and checks the notice), V11 two out-of-memory models, and V12 a failed download. V29 checks that Settings > Quality: Fast switches to SmolLM2 and is remembered. The unit suite has 93 tests, the browser suite 31, and the Windows script checks 15. The real card was checked on the developer laptop only.

**What this means in plain words.** The rules are checked by unit tests and by the pretend model. The real card was checked on one laptop, and the client's laptop has not been run at all.

## Limitations

- The built-in test recognises Intel by name only. A built-in AMD or Apple chip would get no note and no reading budget.
- The memory rule works only below 8 GB, because the browser caps the value. No run on a 4 GB machine is recorded, so the threshold is not measured [to be measured].
- The small model's answers are weaker, and Fast summaries are often muddled or wrong. Chapter 10 covers how good the summaries are.
- On built-in graphics the 1B model writes about 2 tokens a second. The first use downloads 695 MB, and a long page is read only in part unless the person asks for the whole page.
- No code path clears `modelOverride`, and the notice for `MODEL_LOAD_FAILED` says "did not fit" even when memory is not the cause.
- The client's laptop details are known from the photos, but the extension has not been run there or in a visible Chrome window. The photos do not show whether its Iris Xe chip offers `shader-f16`.
- Halving a part that does not fit the model's window is built, up to three levels deep. The real Wikipedia run did not need it, so it is covered by unit tests and scenario V25 only.

## Questions this chapter answers

**Does the check choose the graphics chip?**
No. The check reports the chip that Chrome gives the page. On the developer laptop Chrome chose the built-in Intel chip by default, and the separate chip only after the browser was started with the flag. The check turns that report into a note, a reading budget and a message.

**Why is the bigger model the default on built-in graphics?**
The owner asked for the most accurate model that fits, and Llama 3.2 1B was the only one tried whose summary of a part had no invented details (DECISIONS D7). It is slower, at about 2 tokens a second writing. The extension therefore reads only 6,000 characters of a long page on this chip, and it writes shorter answers. SmolLM2 is one choice away under Settings > Quality.

**Why is the choice saved after an out-of-memory failure?**
The choice is written to `chrome.storage.local` before the small model is tried. Every later job then starts with the small model instead of failing again with the large one. The reader is told about the switch by a notice, and nothing clears the choice, so it lasts until the stored settings are cleared.

**What does Settings > Quality: Fast change?**
It chooses SmolLM2 360M for every page on this computer. The popup says it is about two times quicker, but its summaries are often muddled or wrong, and the Fast Lighthouse record shows a failed answer. The choice is stored in the browser and is remembered.
