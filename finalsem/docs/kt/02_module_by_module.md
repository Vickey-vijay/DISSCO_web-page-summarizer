# The modules, one by one (Version 2)

*Purpose: this chapter lists every source file in `finalsem/project/src`, the scripts and the main root files, says what each one is for, names its main functions, gives the answer to give if a tutor asks, and says what breaks if the file is removed.*

The line numbers quoted here are the numbers in the files as they are now. If you edit a file, the numbers move. Each file carries one label, from a comparison with the Version 1 folder (`midsem/project`):

- **Reused** means the file is byte-for-byte the same as in Version 1.
- **Changed** means the file exists in both versions, with edits.
- **New** means the file has no Version 1 counterpart.

## The map

| File | Label | One-line purpose |
|---|---|---|
| `src/ui/popup.html` | Changed | Layout: button, model line, Settings (Quality), notices, "Read the whole page", summary |
| `src/ui/popup.js` | Changed | Shows the job, starts jobs, preloads the model, reads the Quality choice |
| `src/ui/ui.css` | Changed | The printed-page style, with the old key-box rules removed |
| `src/ui/summary-format.js` | Reused | Turns the summary text into paragraphs and points |
| `src/background/service-worker.js` | Changed | Owns the job, preloads the model, refreshes running jobs |
| `src/background/extract-tab.js` | Reused | Checks the tab's address and places the page reader |
| `src/background/offscreen-manager.js` | New | Creates, talks to and closes the offscreen page |
| `src/offscreen/offscreen.html` | New | The page Chrome opens to hold the model; loads `offscreen.js` |
| `src/offscreen/offscreen.js` | New | Answers status, load and generate requests with WebLLM |
| `src/offscreen/engine-worker.js` | New | Starts WebLLM's handler inside a web worker |
| `src/offscreen/mock-engine.js` | New | The pretend model for the browser tests (12 modes) |
| `src/engines/local.js` | New | The engine the pipeline calls: reading budget, short answers, halving |
| `src/core/condense.js` | New | Shortens a long page to the opening and the first sentences of each section |
| `src/core/trim-text.js` | New | Cuts the back matter and markers before reading |
| `src/core/gpu-check.js` | New | Decides whether the card is usable and which model to use |
| `src/core/engine-errors.js` | New | Turns WebLLM's error text into one of our codes |
| `src/core/pipeline.js` | Changed | Runs the steps of one job in order |
| `src/core/chunker.js` | Reused | Cuts the text into parts at natural breaks |
| `src/core/merger.js` | Reused | Joins part summaries, in groups if needed |
| `src/core/prompts.js` | Changed | The instructions, the short ("brief") prompts and the answer cleaners |
| `src/core/url.js` | Reused | Decides whether two addresses are the same page |
| `src/core/config.js` | Changed | Models, sizes, limits, reading budgets, answer lengths, stored settings |
| `src/core/errors.js` | Changed | The fifteen error codes and their plain messages |
| `src/content/extract.js` | Reused | Copies the page's main text inside the page |
| `src/lib/readability.js` | Reused | The Readability library, one file, Apache-2.0 |
| `src/lib/web-llm.js` | New | The WebLLM library, one file, Apache-2.0 |
| `manifest.json` | Changed | Names the extension, its files and its permissions |
| `setup.bat`, `run.bat` | Changed | Check the computer, then open Chrome's extension page |
| `scripts/*` | New or changed | Checks, the graphics-card setting, the measurement, the benchmark, the page-text dump |

Three Version 1 files are gone: `src/engines/gemini.js`, `src/ui/options.html` and `src/ui/options.js`.

## 1. The popup

### `src/ui/popup.js` and `popup.html` (changed)

**Purpose.** The popup shows what the job record says and starts jobs. It never runs the model. On 26 October it also got a Settings section, a shortened-page notice and a "Read the whole page (slower)" button.

**Main functions.** `renderModelState` (line 61) writes the model line and the button text. `loadModelState` (line 109) asks the service worker for the model state. `preloadIfPossible` (line 102) sends `PRELOAD_MODEL` when the popup opens on a normal page and the model is stored, once per model. `refreshModelLineOnce` (line 86) reloads the model state once when a job ends. `switchNotice` (line 93) explains a summary made by the smaller model after a memory or load failure. `shortenedNotice` (line 163) builds the sentence "This is a long page. To keep it quick on this computer, the opening of each section was read: about N% of the text. Reading all of it would take roughly M minutes." `formatStats` (line 174) adds "read N% of the text" to the stats line. `render` (line 183) draws the job, and for SERVICE_ERROR and MODEL_LOAD_FAILED it fills the "Technical detail" line. `STALE_MS` (line 33) is five minutes.

The Settings section is a closed `<details id="settings">` with a select `#quality`: "Better: Llama 3.2 1B (more accurate, slower)" or "Fast: SmolLM2 360M (about 2 times quicker, but summaries are often muddled or wrong)". The choice is stored as `quality` in `chrome.storage.local`. The button `#read-all` starts a job with `full: true`, so the whole page is read.

**What to say if asked.** "The popup is a display, and it holds no work. The Quality choice and the 'read the whole page' button are the only controls, and the notice always says how much of a long page was read."

**What breaks if removed.** Nothing would show, and the job would still run.

### `src/ui/popup.html` and `src/ui/ui.css`

**Purpose.** The layout and the printed-page style. The popup has no key box. The result notices sit above the summary, and the error-detail line sits under an error message. The stylesheet no longer carries the dead key-box and options rules.

**What breaks if removed.** The popup would show unstyled text. The logic would still work.

### `src/ui/summary-format.js` (reused)

**Purpose.** Turns the summary text into paragraphs and points. The model's words are shown as text, so markup in an answer cannot run.

## 2. The service worker and the page reader

### `src/background/service-worker.js` (changed)

**Purpose.** It owns the job: it starts it, runs the pipeline, writes progress and the result to session storage, and cleans up when a tab closes or the worker restarts. Since 26 October it also preloads the model when the popup asks.

**Main functions.** `estimateFullSeconds` (line 38) gives the rough time for the whole page from the measured decode speed. `writeJob` (line 47) writes a patch to the record, but only if the record still has this job's id. `makeEngine` (line 65) builds the local engine from the settings. A job with `full: true` sets the reading budgets to 0 (line 68). `runJob` (line 78) runs the pipeline. `startJob` (line 126) creates the record. `getModelState` (line 191) answers `GET_MODEL_STATE`. The `PRELOAD_MODEL` listener (line 215) starts `preloadModel` (line 177), which loads and warms the model in the background; it never downloads. The `KEEPALIVE` listener (line 228) refreshes the update time of every running job (line 232). The `tabs.onRemoved` listener (line 238) removes the record after the writes queued for that tab. `sweepOrphans` (line 251) marks an old running job as INTERRUPTED. `STALE_MS` (line 23) is five minutes.

The guard in `writeJob` is the heart of the file:

```js
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
```

*Source: `src/background/service-worker.js`, lines 47 to 57.*

**What to say if asked.** "Every write is queued per tab and checked against the job id, so a late write from an old job cannot bring back a record. A closed tab's record is removed after its queued writes."

**What breaks if removed.** No job would start, and the popup would never get a result.

### `src/background/extract-tab.js` (reused)

**Purpose.** It refuses addresses Chrome does not let extensions read, then places Readability and the page reader into the tab.

### `src/content/extract.js` and `src/lib/readability.js` (reused)

**Purpose.** The page reader runs inside the page. It copies the page, runs Readability on the copy, and returns plain text. If the result is under 200 characters, it uses the visible text of the page when that is longer. `readability.js` is the Readability library, Apache-2.0, as in Version 1.

**What breaks if removed.** No text would be found, and every page would be refused as too little text.

## 3. The offscreen page and the model host

### `src/background/offscreen-manager.js` (new)

**Purpose.** It is the only code in the service worker that talks to the offscreen page. It creates the page on first use, sends the messages, and closes the page when it has been idle.

**Main functions.** `pageUrl` (line 20) adds `?mock=` for the test seam. `ensure` (line 32) creates the offscreen page once. `inFlight` (line 18) counts the messages sent and not yet answered. `send` (line 62) counts the message, forwards it and queues generation requests. `scheduleIdleClose` (line 48) starts the countdown. `close` (line 54) returns at once while any message is in flight.

**What to say if asked.** "Chrome allows one offscreen page at a time. The manager keeps it open while a message runs, and it closes it after five minutes with no work. The countdown starts when the last message finishes."

![The messages between the service worker and the offscreen page: LOCAL_STATUS, LOCAL_LOAD with MODEL_PROGRESS, LOCAL_GENERATE, KEEPALIVE every 10 s, and the idle close](../figures/V05_offscreen_messages.png)

Reading the figure: the service worker sends LOCAL_STATUS and gets back the card, whether the model is stored, and its size. It sends LOCAL_LOAD, and the offscreen page reports MODEL_PROGRESS many times. It sends LOCAL_GENERATE and gets back the text and the stats. KEEPALIVE comes back every 10 seconds while work runs. Since 24 October each one also refreshes the running job records, which the figure does not show.

**Note on figure V05.** The figure's idle box says that each message restarts the five-minute timer. The code clears the timer on every send and starts the countdown only when the in-flight count returns to zero.

**What breaks if removed.** The service worker would have no way to reach the model.

### `src/offscreen/offscreen.html` and `offscreen.js` (new)

**Purpose.** `offscreen.html` is the page Chrome opens for the offscreen document, and it loads `offscreen.js`. `offscreen.js` owns the model. It has the real engine and the message router. It sends `KEEPALIVE` every ten seconds while busy, and `MODEL_PROGRESS` while it downloads or loads. It unloads a loaded model before it loads a different one.

**Main functions.** `realEngine.status` (line 77) checks the card, whether the model is stored (`hasModelInCache`, line 81), and the download size. `realEngine.load` (line 97) checks the stored copy again (line 109), creates the web worker, loads WebLLM and warms the model. `realEngine.generate` (line 132) sends one prompt, times it out after `generateTimeoutMs` and returns the text, the stats and the `finishReason` (line 153). Line 20 sets the cache to IndexedDB.

Figure V04 shows the steps around this page.

![The steps of prepare(): card check, model choice, load with download when needed, warm-up, and the error branch with its single retry](../figures/V04_model_preparation.png)

Reading the figure: prepare() is called by the pipeline and asks the offscreen page for the card's status. If WebGPU or shader-f16 is missing, the job stops and the popup says why. Otherwise the model is chosen. The figure shows Llama 3.2 1B, and SmolLM2 360M only when Quality: Fast is chosen, a memory failure happened, or the browser reports under 8 GB. The load downloads the model if it is not stored. A GPU_MEMORY or MODEL_LOAD_FAILED error saves the fallback and retries once with SmolLM2. The figure now matches the model rule: Llama 3.2 1B on every chip, and SmolLM2 only for Quality: Fast, under 8 GB, or a saved fallback. It does not show the halving step inside `summarizeChunk`, nor the CONTEXT_TOO_LONG code. The footnote gives the sizes: Llama about 695 MB, SmolLM2 about 204 MB.

**What to say if asked.** "Cache Storage failed inside this page during the spike, and IndexedDB worked. That is why the model is in IndexedDB."

**What breaks if removed.** No model would load or run.

### `src/offscreen/engine-worker.js` (new)

**Purpose.** Seven lines. It starts WebLLM's handler inside a web worker and passes messages to it, so the heavy arithmetic does not block the page that holds the model.

### `src/offscreen/mock-engine.js` (new)

**Purpose.** A pretend model for the browser tests. It answers from fixed text and can fail on purpose. The twelve modes are `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html`, `slow`, `longprompt` (refuses a prompt over 3,500 characters, as WebLLM refuses an oversized prompt) and `crash` (every answer fails with SERVICE_ERROR and a technical detail). Its download sizes (664 MB and 300 MB) are fixed numbers, not measurements.

**What breaks if removed.** The 31 browser scenarios could not run.

## 4. The engine and the graphics-card checks

### `src/engines/local.js` (new)

**Purpose.** The engine the pipeline calls. It has the same contract as Version 1's cloud engine, `summarizeChunk` and `mergeSummaries`, plus `prepare`, and it now also gives the reading budget. It does not touch the model itself. It sends messages to the offscreen page.

**Main functions.** `call` (line 26) sends one message and turns a failed reply into an `AppError`. `generate` (line 38) sends `LOCAL_GENERATE`, removes copied markers (`stripPageMarkers`, line 46), ends an answer that stopped at the length limit at its last full stop (`endAtSentence`, line 47), and rejects an empty answer (EMPTY_ANSWER). `checkStatus` (line 63) asks for the card's status. The `brief` getter (line 70) is true on built-in graphics, where writing is slow, so the answers are kept short. `prepare` (line 75) checks, downloads and loads. If the load fails with GPU_MEMORY or MODEL_LOAD_FAILED, it saves the fallback and tries once with SmolLM2 (`RETRY_WITH_FALLBACK`, line 19). `readBudgetChars` (line 96) is the reading budget. `summarizeChunk` (line 101) summarizes a part, with short prompts and limits when `brief` is true, and halves a part when WebLLM refuses it for size.

The reading budget is the rule that makes a long page quick on built-in graphics:

```js
    /** How many characters of a page this computer should read: less on built-in graphics, which read slowly. */
    async readBudgetChars() {
      const status = engine.status ?? (await engine.checkStatus());
      return status.gpu?.integrated ? settings.readBudgetIntegrated : settings.readBudgetOther;
    },
```

*Source: `src/engines/local.js`, lines 95 to 99.*

The budget is 6,000 characters on built-in graphics and 0 elsewhere, which means read everything. The pipeline asks for it before the page is cut.

Halving was added on 24 October, after the real-Chrome failure. When a part raises CONTEXT_TOO_LONG, `summarizeChunk` cuts it in half at a break and summarizes each half, up to `MAX_HALVING_DEPTH` (3, line 15) levels deep, and never for text under `MIN_HALVING_CHARS` (600, line 16). The cuts are counted in `halvedParts`.

**What to say if asked.** "The engine keeps the same contract as the cloud engine. On built-in graphics it asks for a small reading budget and writes short answers, because the chip reads and writes slowly."

**What breaks if removed.** The pipeline would have no engine, and no summary could be made.

### `src/core/gpu-check.js` (new)

**Purpose.** Pure functions. `evaluateGpu` (line 10) turns the card's facts into "usable" or NO_WEBGPU or NO_SHADER_F16. `chooseModel` (line 25) picks the model. `mapInitProgress(report, {cached})` (line 36) turns WebLLM's progress text into a phase. A stored model is always "loading".

```js
export function chooseModel({ deviceMemoryGB, override, quality } = {}) {
  if (override === 'fallback' || quality === 'fast') return MODELS.fallback;
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB < 8) return MODELS.fallback;
  return MODELS.primary;
}
```

*Source: `src/core/gpu-check.js`, lines 25 to 29.*

The main model is used by default, on every chip. The fallback is used for Quality: Fast, after a memory or load failure (saved as `modelOverride`), or when the browser reports under 8 GB. The built-in chip no longer selects SmolLM2 by itself.

**Limit to state honestly.** The memory rule reads `navigator.deviceMemory` in the service worker. The unit tests call `chooseModel` with a number. Nothing in the repository shows the rule working on a real low-memory laptop.

**What breaks if removed.** The extension could not tell a usable card from an unusable one, nor choose a model.

### `src/core/engine-errors.js` (new)

**Purpose.** WebLLM throws plain errors with free text. `classifyEngineError` (line 10) reads that text and returns one of our codes. The out-of-memory test matches `oom` only as a whole word (line 16). WebLLM's text "Prompt tokens exceed context window size" maps to CONTEXT_TOO_LONG (line 13).

**Limit to state honestly.** At the load stage, any error text containing "cache" is counted as a download failure.

## 5. The shortening, the trimming and the pipeline

### `src/core/trim-text.js` (new)

**Purpose.** `cleanPageText` (line 23) removes the back matter and the markers before anything is read. The back matter is a heading such as See also, References, Notes, Bibliography or External links, when it starts after 40 percent of the page and at least 800 characters in. The markers are things like [12], [a], [edit] and [citation needed]. On the Lighthouse page this removed 8,788 of 36,752 characters, 24 percent. The stats record it as `trimmedChars`. Six unit tests cover it.

**What breaks if removed.** The model would read references and edit links, and a long page would use up more of its reading budget on text that is not worth reading.

### `src/core/condense.js` (new)

**Purpose.** It shortens a long page before the model reads it, on a computer where reading is slow. `condenseText(text, budgetChars)` (line 42) returns the text, whether it was shortened, the page's length and the length read. A budget of 0 keeps everything.

The rule, in page order: the opening of the page in full, up to 35 percent of the budget (`LEAD_SHARE`, line 16); then from the rest, the first sentences of each paragraph, spread evenly over the page (`firstSentences`, line 28), with the headings of the sections kept (`isHeading`, line 19, for lines of at most 70 characters with no final stop). The result is at most one part of 6,000 characters, so there is no merge request.

Why the rule: the developer's Intel chip reads about 26 to 29 tokens a second for SmolLM2 and 15.6 for Llama 3.2 1B, and reading takes about 80 percent of a part's time. The only real way to make a long page quick there is to read less of it. The shortened run read about a fifth of the Lighthouse page (21 percent) and summarized it in 124.6 s.

![Built-in graphics read slowly, so a long page is shortened first: the Lighthouse page took 124.6 s with the rule, against 616.4 s before and 74.1 s on the NVIDIA card](../figures/V17_two_graphics_chips.png)

Reading the figure: the client's chip is an Iris Xe in a Core i7-1355U. The speeds in the boxes were measured on the developer's Intel Gen-12 chip, the nearest guide, not on the client's laptop. Llama 3.2 1B reads 15.6 and writes 2 tokens a second there. The whole Lighthouse page took 616.4 s with the small model before 26 October, and 74.1 s on the NVIDIA card. With the rule, the page is cut to 5,968 characters read (21 percent of the text, after 8,788 characters of back matter are removed), one part, with short answers, and it took 124.6 s. The popup then offers the whole page, which the figure estimates at about 12 minutes.

**What to say if asked.** "The page is cut to what the chip can read in about two minutes, and the popup says how much was read. The rest is not summarized unless the person chooses the whole page."

**What breaks if removed.** A long page would be read in full on built-in graphics, and it would take about 10 minutes.

### `src/core/pipeline.js` (changed)

**Purpose.** It runs one job in order: extract, clean the back matter, check the length, ask for the reading budget, shorten, cut into parts, check the number of parts, prepare the model, summarize each part, merge, and build the result.

**Main functions.** `runPipeline` (line 30). The text is cleaned (line 36). Text under `minTextChars` throws TOO_LITTLE_TEXT (line 38). The reading budget is asked of the engine and `condenseText` applies it (lines 44 and 45). More than `maxChunks` parts throws TOO_LONG (line 49). The prepare step follows (line 56).

Figure V16 shows the order for a long page, from before the shortening was added.

![A long page cut into parts, each summarized, then merged in one request, with the measured timeline of 74.1 seconds](../figures/V16_chunking_v2.png)

Reading the figure: a page of 36,752 characters becomes seven parts of at most 6,000 characters on a fast card. Each part is summarized, and the seven summaries go into one merge request. The timeline is the clean NVIDIA run: 74.1 s and eight requests. On built-in graphics the shortened page is one part, and no merge is needed.

**What breaks if removed.** Nothing would run.

### `src/core/chunker.js` and `merger.js` (reused)

**Purpose.** `chunkText` cuts text into parts of at most `maxChars`, at paragraphs, then sentences, then spaces, and cuts a word in the middle only as a last resort. `mergeAll` joins part summaries, in groups if they do not fit, until one is left.

**What breaks if removed.** Long pages could not be split, and a multi-part page would have no final summary.

### `src/core/prompts.js` (changed)

**Purpose.** The instructions and the answer cleaners. The page text comes first, between the markers `<<<PAGE TEXT START>>>` and `<<<PAGE TEXT END>>>`, and one instruction follows it.

**Main functions.** `stripPageMarkers` (line 15) removes the markers from an answer. Since 26 October it also removes a repeated copy of the prompt's own safety sentence and an empty "Summary:" label. An answer that is left empty becomes EMPTY_ANSWER, not a summary. `endAtSentence` (line 90) cuts an answer that stopped at the length limit back to its last full stop. The brief prompts are used on built-in graphics: 3 short sentences for a single part, 2 for a part of a longer page, and 4 or 5 for the merge, in plain text. The richer prompts are kept for a fast card.

**What to say if asked.** "The markers say the page text is material, not orders. A small model sometimes copies them or the instruction into its answer, and the cleaners remove that."

**What breaks if removed.** The model would have no instruction, the markers would show, and answers would run to the length limit without a full stop.

### `src/core/url.js` (reused)

**Purpose.** `samePage` ignores the part of an address after `#`, so a link inside the same article counts as the same page.

### `src/core/config.js` (changed)

**Purpose.** Every number that can be tuned, in one place. `MODELS` names the primary model `Llama-3.2-1B-Instruct-q4f16_1-MLC` (`vramMB` 879) and the fallback `SmolLM2-360M-Instruct-q4f16_1-MLC` (`vramMB` 376). `DEFAULTS` gives `chunkChars` 6,000, `minTextChars` 200, `maxChunks` 12, `maxTokensPart` 300, `maxTokensFinal` 320, `briefTokensSingle` 130, `briefTokensPart` 90, `briefTokensMerge` 180, `readBudgetIntegrated` 6,000, `readBudgetOther` 0, `temperature` 0.2, `generateTimeoutMs` 600,000 (10 minutes), `idleCloseMs` 300,000 and `engineMode` `real`. `loadSettings` merges stored overrides, including `quality`, but only for the keys in `STORAGE_KEYS`.

**What breaks if removed.** Nothing would have a value to read.

### `src/core/errors.js` (changed)

**Purpose.** The fifteen error codes and their plain messages. `AppError` carries a code, a technical detail and a message. `describeError` gives the popup the code and the message. CONTEXT_TOO_LONG, added on 24 October, says "A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page."

**What breaks if removed.** Every failure would show as a raw technical string.

## 6. The manifest, the set-up files and the scripts

### `manifest.json` (changed)

**Purpose.** Names the extension, its version 2.0.0, its popup and service worker, and its permissions: `activeTab`, `scripting`, `storage`, `offscreen` and `unlimitedStorage`. The host permissions are Hugging Face (`huggingface.co`, `*.huggingface.co`, `*.hf.co`) and `raw.githubusercontent.com`. The content security policy allows `'wasm-unsafe-eval'`, which lets the extension page run WebAssembly code.

```json
  "permissions": ["activeTab", "scripting", "storage", "offscreen", "unlimitedStorage"],
  "host_permissions": [
```

*Source: `manifest.json`, lines 19 and 20.*

**What breaks if removed.** Without `offscreen`, no model host could be created. Without `unlimitedStorage`, Chrome could delete the model under disk pressure.

### `package.json` (changed)

**Purpose.** `npm test` runs the unit tests with `node --test "tests/unit/*.test.js"`. `npm run test:e2e` runs the browser scenarios one at a time. The only development dependency is Playwright, `^1.64.1`.

### `setup.bat` (changed)

**Purpose.** Checks the computer and the files, then says "SETUP COMPLETE." and "Next step: double-click run.bat". Its switches are `--dev` (install the test tools), `--gpu` (set Chrome to the separate card) and `--reset`. It runs `check-extension.ps1` and `check-computer.ps1`. With `--gpu` it calls `set-chrome-gpu.ps1` and prints "The graphics setting was NOT changed" if that fails. On the client's laptop `--gpu` has nothing to switch on, because there is one graphics chip.

**What breaks if removed.** The client would have no guided install.

### `run.bat` (changed)

**Purpose.** Refuses to run unless `setup.bat` has finished. It copies the folder path to the clipboard, opens `chrome://extensions` and prints four steps. After new code is pulled, the extension must be reloaded on that page (chapter 03).

### `scripts/check-computer.ps1` (new)

**Purpose.** Prints the Windows version, the processor, the memory, the graphics chips (ignoring basic and virtual display adapters) and "Free space on drive C:". It warns below 3 GB, the default `MinFreeGB`.

### `scripts/set-chrome-gpu.ps1` (new)

**Purpose.** Writes one value under `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`, named after Chrome's path, with `GpuPreference=2;`. `-ChromePath` is optional, so `-Remove` works on its own. `-RegistryPath` lets the test setup use a throw-away key.

### `scripts/local-run.mjs` (new)

**Purpose.** The measurement script. Its modes are `nvidia`, `nvidia-offline`, `intel`, `intel-wikipedia`, `intel-short`, `intel-better` (Llama 3.2 1B on built-in graphics, the short fixture, the Lighthouse page and the long fixture) and `intel-fast` (Quality: Fast). Before a run it deletes the profile's `Service Worker` and `Code Cache` folders, because a persistent profile had kept an old service-worker script. The downloaded model is not touched. It writes `docs/test-runs/v2-local-<mode>` files and screenshots, and its header says the first run downloads about 660 MB.

### `scripts/bench-models.mjs` (new)

**Purpose.** Measures, in a hidden Chromium, how fast each model reads and writes on the chip and how long one realistic part takes. It writes `docs/test-runs/bench-models.json` and `.md`. The default list has eight models. A second run does not download again. The results are the ones in chapter 01 and decision D7.

### `scripts/dump-page-text.mjs` (new)

**Purpose.** Prints the text the extension would read from a page, after cleanup and before shortening, so the reading budget can be checked by eye. The usage is `node scripts/dump-page-text.mjs <url> [out.txt]`.

### `scripts/check-extension.ps1` and `scripts/secret-scan.mjs`

`check-extension.ps1` is run by `setup.bat`. `secret-scan.mjs` looks through the repository for the Gemini key from Version 1 before a push. Version 2 has no key, so this is a leftover guard.

## 7. The tests

**Unit tests (`tests/unit`, eight files, 93 tests).** `chunker.test.js` (10), `gpu-and-errors.test.js` (13), `local-engine.test.js` (28), `merger.test.js` (8), `pipeline.test.js` (7), `small.test.js` (15), `condense.test.js` (6) and `trim-text.test.js` (6).

**Browser scenarios (`tests/e2e`, 31 scenarios).** `smoke.test.js` has the smoke scenario. `pipeline.test.js` has 30: V01 to V29, with V18b. V25 covers the cut part, V26 the heartbeat, V27 the technical-detail line, V28 a shortened long page with the whole-page button, and V29 Quality: Fast, which switches to SmolLM2 and is remembered. Scenario V09 now expects the main model with the Intel note.

**Script checks (`tests/bat/test-bat-scripts.ps1`).** Fifteen checks, B1 to B10c.

## What this means in plain words

Each file does one job. The popup shows and offers two choices, the service worker owns the job, the offscreen page holds the model, and the engine asks it for answers. Before the model reads a long page on built-in graphics, the page is cleaned and shortened to one part. The engine then writes short answers with the main model. A tutor who asks about a file should hear one sentence about its job, one file name with a line number, and one limit.
