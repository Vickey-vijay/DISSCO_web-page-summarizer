# The modules, one by one (Version 2)

*Purpose: this chapter lists every source file in `finalsem/project/src`, the scripts and the main root files, says what each one is for, names its main functions, gives the answer to give if a tutor asks, and says what breaks if the file is removed.*

The line numbers quoted here are the numbers in the files as they are now. If you edit a file, the numbers move. Each file carries one of three labels, taken from a comparison with the Version 1 folder (`midsem/project`):

- **Reused** means the file is byte-for-byte the same as in Version 1.
- **Changed** means the file exists in both versions, with edits.
- **New** means the file has no Version 1 counterpart.

## The map

| File | Label | One-line purpose |
|---|---|---|
| `src/ui/popup.html` | Changed | The popup's layout: button, model line, progress, summary |
| `src/ui/popup.js` | Changed | Shows the job record and starts a job |
| `src/ui/ui.css` | Changed | The printed-page style, with 5 lines added |
| `src/ui/summary-format.js` | Reused | Turns the summary text into paragraphs and points |
| `src/background/service-worker.js` | Changed | Owns the job, writes the record, handles tab events |
| `src/background/extract-tab.js` | Reused | Checks the tab's address and places the page reader |
| `src/background/offscreen-manager.js` | New | Creates, talks to and closes the offscreen page |
| `src/offscreen/offscreen.html` | New | The page Chrome opens to hold the model |
| `src/offscreen/offscreen.js` | New | Answers status, load and generate requests with WebLLM |
| `src/offscreen/engine-worker.js` | New | Starts WebLLM's handler inside a web worker |
| `src/offscreen/mock-engine.js` | New | The pretend model for the browser tests |
| `src/engines/local.js` | New | The engine the pipeline calls, with the same two functions as V1's engine |
| `src/core/gpu-check.js` | New | Decides whether the card is usable and which model fits |
| `src/core/engine-errors.js` | New | Turns WebLLM's error text into one of our codes |
| `src/core/pipeline.js` | Changed | Runs the steps of one job in order |
| `src/core/chunker.js` | Reused | Cuts the text into parts at natural breaks |
| `src/core/merger.js` | Reused | Joins part summaries, in groups if needed |
| `src/core/prompts.js` | Changed | The instructions sent to the model |
| `src/core/url.js` | Reused | Decides whether two addresses are the same page |
| `src/core/config.js` | Changed | Models, sizes, limits, and stored overrides |
| `src/core/errors.js` | Changed | The error codes and their plain messages |
| `src/content/extract.js` | Reused | Copies the page's main text inside the page |
| `src/lib/readability.js` | Reused | The Readability library, one file, Apache-2.0 |
| `src/lib/web-llm.js` | New | The WebLLM library, one file, Apache-2.0 |
| `manifest.json` | Changed | Names the extension, its files and its permissions |
| `setup.bat`, `run.bat` | Changed | Check the computer, then open Chrome's extension page |
| `scripts/*` | New or changed | Checks, the graphics-card setting, the measurement script |

Three Version 1 files are gone: `src/engines/gemini.js`, `src/ui/options.html` and `src/ui/options.js`. The key box and the options page were removed with the cloud engine.

## 1. The popup

### `src/ui/popup.js` (changed)

**Purpose.** The popup is the window that opens from the toolbar. It shows what the job record says and starts a job. It never runs the model.

**Main functions.** `getTargetTab` (line 33) finds the active tab. `vendorName` (line 50, exported) turns "intel" into "Intel" for the note. `renderModelState` (line 55) writes the model line and sets the button text. `loadModelState` (line 79) asks the service worker for the model state. `progressLabel` (line 110) turns a job's phase into a sentence. `render` (line 139) draws the job. `init` (line 178) runs when the popup opens. A `chrome.storage.onChanged` listener (line 213) redraws when the record changes, and a five-second timer (line 222) redraws again, so a job whose worker has died is marked as stale and not left spinning. `STALE_MS` (line 28) is three minutes.

**What to say if asked.** "The popup is a display. It does not hold the work, so closing it cannot stop a summary. It redraws from the record in session storage." The fix for the lowercase vendor name lives in `vendorName`, found by test V09.

**What breaks if removed.** Nothing would show. The job would still run, but the user would see no button, no progress and no summary.

### `src/ui/popup.html` and `src/ui/ui.css` (changed)

**Purpose.** The layout and the printed-page style that Version 1 used. The popup has no key box in Version 2. The stylesheet gained five lines compared with Version 1, and the popup's HTML lost twelve lines and gained three.

**What to say if asked.** "The style is the one the owner asked for in Version 1. Version 2 kept it, and the change is small."

**What breaks if removed.** The popup would show unstyled text. The logic would still work.

### `src/ui/summary-format.js` (reused)

**Purpose.** Turns the summary text into paragraphs and points. A line that starts with a dash becomes a point.

**What to say if asked.** "The model's words are shown as text. The formatter never builds HTML from them, so markup in an answer cannot run."

**What breaks if removed.** The summary would show as one block of plain text. Test V14 would still pass only if the text were still shown as text.

## 2. The service worker and the page reader

### `src/background/service-worker.js` (changed)

**Purpose.** It owns the job. It starts the job when the popup asks, runs the pipeline, writes the progress and the result to session storage, and cleans up when a tab closes or the worker restarts.

**Main functions.** `writeJob` (line 34) writes a patch to the record, but only if the record still has this job's id. `makeEngine` (line 52) builds the local engine from the settings. `runJob` (line 63) runs the pipeline. `startJob` (line 109) creates the record and answers the popup. `getModelState` (line 155) answers `GET_MODEL_STATE`. The `tabs.onRemoved` listener (line 191) removes the record after the writes queued for that tab. `sweepOrphans` (line 204) marks an old running job as INTERRUPTED.

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

*Source: `src/background/service-worker.js`, lines 34 to 44.*

**What to say if asked.** "Every write is queued per tab and checked against the job id, so a late write from an old job cannot bring back a record. A closed tab's record is removed after its queued writes, which fixed test V22."

**What breaks if removed.** No job would start, and the popup would never get a result.

### `src/background/extract-tab.js` (reused)

**Purpose.** It refuses addresses Chrome does not let extensions read, then places Readability and the page reader into the tab.

**Main functions.** `isRestrictedUrl` and `extractFromTab`.

**What to say if asked.** "Chrome's own pages, the Web Store and local files are refused with RESTRICTED_PAGE before any model step."

**What breaks if removed.** The job could not read any page, so every summary would fail.

## 3. The offscreen page and the model host

### `src/background/offscreen-manager.js` (new)

**Purpose.** It is the only code in the service worker that talks to the offscreen page. It creates the page on first use, sends messages to it one at a time for generation, and closes it after the idle time.

**Main functions.** `pageUrl` (line 19) adds `?mock=` for the test seam. `ensure` (line 31) creates the offscreen page once. `scheduleIdleClose` (line 47) and `close` (line 53) handle the idle timer. `send` (line 60) forwards a message and queues generation requests in `generateChain`. `onProgress` and `emitProgress` pass the download and loading progress to the job.

**What to say if asked.** "Chrome allows one offscreen page at a time. The manager keeps it alive while it works and closes it after five minutes idle, so the card's memory is returned."

**What breaks if removed.** The service worker would have no way to reach the model. Every call would fail with SERVICE_ERROR.

### `src/offscreen/offscreen.html` (new)

**Purpose.** It is the page that Chrome opens for the offscreen document. The path is `OFFSCREEN_PATH` in `offscreen-manager.js`, and the page loads `offscreen.js`.

**What to say if asked.** "The page has no window and no `chrome.storage` access. It works only by messages."

**What breaks if removed.** Chrome could not open the offscreen document, so no model could load.

### `src/offscreen/offscreen.js` (new)

**Purpose.** It owns the model. It has the real engine (`realEngine`) and the message router. It sends `KEEPALIVE` every ten seconds while it is busy, and `MODEL_PROGRESS` while it downloads or loads.

**Main functions.** `realEngine.status` (line 77) checks the card, whether the model is cached, and the download size. `realEngine.load` (line 97) creates the web worker and loads WebLLM, then warms the model up with one short prompt. `realEngine.generate` (line 125) sends one prompt and times it out after `generateTimeoutMs`. `beginWork` and `endWork` (lines 28 and 34) run the keepalive. Line 20 sets the cache to IndexedDB: `const APP_CONFIG = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' };`.

**What to say if asked.** "Cache Storage failed inside this page during the spike, and IndexedDB worked. That is why the model is in IndexedDB. The spike is in the DEVLOG."

**What breaks if removed.** No model would load or run. The pretend model in `mock-engine.js` would be the only thing left.

### `src/offscreen/engine-worker.js` (new)

**Purpose.** Seven lines. It creates WebLLM's handler inside a web worker and passes messages to it.

**What to say if asked.** "The heavy arithmetic runs in a web worker, so the page that holds the model stays free to answer messages."

**What breaks if removed.** WebLLM would run on the offscreen page itself, which could block its message handling during a long answer.

### `src/offscreen/mock-engine.js` (new)

**Purpose.** A pretend model for the tests. It answers from fixed text and can fail on purpose. The modes are `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html` and `slow`.

**What to say if asked.** "The tests use it so that failures can be forced on purpose. A real model cannot be made to fail on demand. The pretend model proves the extension's logic, and the real-model runs prove the real thing."

**What breaks if removed.** The 26 browser scenarios could not run. The real extension would be unchanged.

## 4. The engine and the graphics-card checks

### `src/engines/local.js` (new)

**Purpose.** The engine the pipeline calls. It has the same two functions as Version 1's cloud engine, `summarizeChunk` and `mergeSummaries`, and one more, `prepare`. It does not touch the model itself. It sends messages to the offscreen page.

**Main functions.** `call` (line 21) sends one message and turns a failed reply into an `AppError`. `generate` (line 33) sends `LOCAL_GENERATE` and rejects an empty answer (EMPTY_ANSWER). `checkStatus` (line 59) asks for the card's status and switches to the small model on integrated graphics. `prepare` (line 71) checks, downloads and loads. If the load fails with GPU_MEMORY or MODEL_LOAD_FAILED, it saves the fallback choice and tries once with SmolLM2 (`RETRY_WITH_FALLBACK`, line 14).

The integrated-graphics switch is the most important few lines:

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

*Source: `src/engines/local.js`, lines 59 to 68.*

**What to say if asked.** "The engine keeps the same contract as the cloud engine, so the pipeline did not change. The engine's only extra step is `prepare`, which the pipeline calls once before the first part."

**What breaks if removed.** The pipeline would have no engine, and no summary could be made. The `prepare` step is what shows the download and warm-up progress.

### `src/core/gpu-check.js` (new)

**Purpose.** Three pure functions. `evaluateGpu` (line 10) turns the card's facts into "usable" or one of two codes. `chooseModel` (line 25) picks the primary model unless the computer has less than 8 GB of memory, or an earlier load failed. `mapInitProgress` (line 36) turns WebLLM's progress text into the phases downloading or loading.

**What to say if asked.** "The card rules are pure functions, so the Node tests can feed any case. For example, a card without shader-f16 gives NO_SHADER_F16."

**Limit to state honestly.** The memory rule reads `navigator.deviceMemory` in the service worker. The unit tests call `chooseModel` with a value. The repository does not show that a real low-memory laptop chooses SmolLM2 by this rule.

**What breaks if removed.** The extension could not tell a usable card from an unusable one, and it could not choose the smaller model.

### `src/core/engine-errors.js` (new)

**Purpose.** WebLLM throws plain errors with free text. `classifyEngineError` (line 10) reads that text and returns one of our codes: NO_SHADER_F16, NO_WEBGPU, GPU_MEMORY, MODEL_DOWNLOAD_FAILED, MODEL_LOAD_FAILED or SERVICE_ERROR.

**What to say if asked.** "The library's errors are free text, so this file reads the words and maps them. It is the only place that does this, and it is a pure function, so it is tested in Node."

**What breaks if removed.** A real failure would show the generic message, not the specific one the user can act on.

## 5. The pipeline and its parts

### `src/core/pipeline.js` (changed, +6 lines)

**Purpose.** It runs one job in order: extract, check the length, cut, check the number of parts, prepare the model, summarize each part, merge, and build the result.

**Main functions.** `runPipeline` (line 28). The order is in the file. The text under `settings.minTextChars` throws TOO_LITTLE_TEXT (line 34). `chunkText` cuts the text (line 38). More than `maxChunks` parts throws TOO_LONG (lines 40 and 41). The new block at lines 45 to 49 calls `engine.prepare` when the engine has one.

**What to say if asked.** "The two refusals come before the prepare step, so a page that is too short or too long never starts a download. That is test V04 and V06."

**What breaks if removed.** Nothing would run.

### `src/core/chunker.js` (reused)

**Purpose.** Cuts the text into parts of at most `maxChars`. In Version 2 the value is 6,000. It packs whole paragraphs first, cuts long paragraphs at sentence ends, then at spaces, and only cuts a word in the middle as a last resort.

**What to say if asked.** "Cutting at natural breaks keeps the sense of each part. The sizes are counted in characters, not in tokens."

**What breaks if removed.** Long pages could not be split, so they would go to the model in one piece and exceed its window.

### `src/core/merger.js` (reused)

**Purpose.** Joins the part summaries. If they all fit, one call merges them. If not, the summaries are grouped, each group is merged, and this repeats until one is left.

**What to say if asked.** "The Lighthouse article's seven parts were merged in one level: eight requests in total, seven for the parts and one for the merge."

**What breaks if removed.** A multi-part page would have no final summary.

### `src/core/prompts.js` (changed)

**Purpose.** The instructions sent to the model. Version 2 uses `PROMPT_VERSION` `v2.0`. Small models follow short, plain instructions best, so the page text comes first, between the markers `<<<PAGE TEXT START>>>` and `<<<PAGE TEXT END>>>`, and one fixed instruction follows it.

**Main functions.** `buildSinglePrompt`, `buildChunkPrompt` and `buildMergePrompt`. The part prompt asks for 3 to 5 short sentences with no bullets. The merge prompt does not use markers, because its input is the model's own text.

**What to say if asked.** "The markers say the page text is material, not orders. The model still copied the start marker into one saved summary, so the markers reduce the risk and do not remove it."

**What breaks if removed.** The model would receive no instruction, or the wrong one, and every summary would be poor.

### `src/core/url.js` (reused)

**Purpose.** `samePage` ignores the part of an address after `#`. A link inside the same article counts as the same page.

**What breaks if removed.** A job would be dropped whenever the page's link changed slightly.

### `src/core/config.js` (changed)

**Purpose.** Every number that can be tuned, in one place. `MODELS` names the primary model `Llama-3.2-1B-Instruct-q4f16_1-MLC` with `vramMB: 879`, and the fallback `SmolLM2-360M-Instruct-q4f16_1-MLC` with `vramMB: 376`. `DEFAULTS` gives `chunkChars` 6,000, `minTextChars` 200, `maxChunks` 12, `maxTokensPart` 300, `maxTokensFinal` 320, `temperature` 0.2, `generateTimeoutMs` 180,000, `idleCloseMs` 300,000 and `engineMode` `real`. `loadSettings` (line 45) merges stored overrides, but only for keys in `STORAGE_KEYS`.

**What to say if asked.** "A 4,096-token window cannot take a long page at once, so each part is about 1,500 tokens of text. The temperature of 0.2 keeps answers close to the text."

**What breaks if removed.** Nothing would have a value to read. The whole extension depends on these settings.

### `src/core/errors.js` (changed)

**Purpose.** The fourteen error codes and their plain messages. `AppError` carries a code, a technical detail and a message. `describeError` gives the popup the code and the message, and the detail goes to the console.

**What to say if asked.** "The popup only sees codes and sentences, never a raw library error. A test checks that each code has a message."

**What breaks if removed.** Every failure would show as a raw technical string.

## 6. The page reader and the library

### `src/content/extract.js` (reused)

**Purpose.** It runs inside the page. It makes a copy of the page, runs Readability on the copy to find the article, and turns it into plain text. If the result is under 200 characters, it uses the visible text of the page when that is longer.

**What to say if asked.** "The reader works on a copy, so the page itself does not change."

**What breaks if removed.** No text would be found, and every page would be refused as too little text.

### `src/lib/readability.js` and `READABILITY_LICENSE.md` (reused)

**Purpose.** Mozilla's Readability library, copied in as one file. The licence is Apache-2.0, as in Version 1.

**What breaks if removed.** The page reader would fall back to the visible text of every page.

### `src/lib/web-llm.js` and `WEBLLM_LICENSE` (new)

**Purpose.** The WebLLM library, copied in as one file with no bundler. The README and the decision record name version 0.2.86. The file's default `cacheBackend` is `"cache"`, and `offscreen.js` overrides it with `"indexeddb"`. The licence is Apache-2.0.

**What to say if asked.** "The library is copied into the project, so the extension needs no build step, which keeps setup the same as in Version 1."

**What breaks if removed.** No model could be loaded or run.

## 7. The manifest, the set-up files and the scripts

### `manifest.json` (changed)

**Purpose.** Names the extension (Page Summarizer), its version 2.0.0, its popup and service worker, and its permissions. The permissions are `activeTab`, `scripting`, `storage`, `offscreen` and `unlimitedStorage`. The host permissions are Hugging Face (`huggingface.co`, `*.huggingface.co`, `*.hf.co`) and `raw.githubusercontent.com`. The content security policy allows `'wasm-unsafe-eval'`, which lets the extension page run WebAssembly code.

```json
  "permissions": ["activeTab", "scripting", "storage", "offscreen", "unlimitedStorage"],
  "host_permissions": [
```

*Source: `manifest.json`, lines 19 and 20.*

**What to say if asked.** "`unlimitedStorage` stops Chrome from deleting the 695 MB model when disk space runs low. The extension has no permission for the Gemini address any more."

**What breaks if removed.** Without `offscreen`, no model host could be created. Without `unlimitedStorage`, Chrome could delete the model under disk pressure.

### `package.json` (changed)

**Purpose.** Two test scripts: `npm test` runs the unit tests with `node --test "tests/unit/*.test.js"`, and `npm run test:e2e` runs the browser tests one at a time. The only development dependency is Playwright, version 1.64.1 or newer in the 1.x line.

**What breaks if removed.** The tests could not be run. The extension would still work.

### `setup.bat` (changed)

**Purpose.** Checks the computer and the files, then says "SETUP COMPLETE." and "Next step: double-click run.bat". Its switches are `--dev` (install the test tools), `--gpu` (set Chrome to the separate card, asking Windows first) and `--reset` (delete `node_modules` and the setup marker). It runs `scripts/check-extension.ps1` and `scripts/check-computer.ps1`.

**What to say if asked.** "`--gpu` changes a Windows setting, so the script never does it unless the user types the switch. It can be undone with `set-chrome-gpu.ps1 -Remove`."

**What breaks if removed.** The client would have no guided install.

### `run.bat` (changed)

**Purpose.** Refuses to run unless `setup.bat` has finished. It copies the folder path to the clipboard, opens `chrome://extensions` and prints four steps. Chrome no longer loads an extension from a command-line flag on branded builds, so the Load unpacked step stays manual.

### `scripts/check-computer.ps1` (new)

**Purpose.** Prints the Windows version, the processor, the memory, the graphics chips (ignoring basic and virtual display adapters) and the free disk space on the system drive. It warns below 3 GB free, which is the default `MinFreeGB`.

**What breaks if removed.** The client would have no quick check before installing.

### `scripts/set-chrome-gpu.ps1` (new)

**Purpose.** Writes one value under `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`, named after Chrome's path, with the value `GpuPreference=2;`. That is the same setting as the Windows Graphics page, and it affects only the current user. `-Remove` undoes it. `-RegistryPath` lets the tests use a throw-away key.

**What to say if asked.** "It is opt-in, it needs no administrator rights, and it was tested only against a throw-away key."

### `scripts/local-run.mjs` (new)

**Purpose.** The measurement script. The modes are `nvidia` (cold start on the separate card), `nvidia-offline` (outside sites blocked) and `intel`. It writes `docs/test-runs/v2-local-<mode>.json` and `.md`, and screenshots into `docs/screenshots`. Its header says the first run downloads about 660 MB.

**What to say if asked.** "Every real-model number in the test-run folder came from this script. It is slow and uses about 660 MB, so it is run on purpose, not in the tests."

### `scripts/check-extension.ps1` and `scripts/secret-scan.mjs`

`check-extension.ps1` is run by `setup.bat`. The Version 2 copy differs from the Version 1 copy. `secret-scan.mjs` looks through the repository for the API key before a push. Its header still says "the real API key" from Version 1, and Version 2 has no key. Treat it as a leftover guard.

## 8. The tests

**Unit tests (`tests/unit`, six files, 65 tests).** `chunker.test.js` (10), `gpu-and-errors.test.js` (9), `local-engine.test.js` (18), `merger.test.js` (8), `pipeline.test.js` (7) and `small.test.js` (13). The chunker and merger tests are the same as in Version 1.

**Browser tests (`tests/e2e`, 26 scenarios).** `smoke.test.js` has the smoke test. `pipeline.test.js` has the 25 scenarios V01 to V24, with V18b. They use the pretend model and run hidden. The helpers in `tests/helpers` start the fixture server and the extension. `tests/helpers/key.mjs` is a helper whose role was not read for this chapter, so it is not described here.

**Script checks (`tests/bat/test-bat-scripts.ps1`).** Fourteen checks, all passing in run 1.

## What this means in plain words

Each file does one job. The popup shows, the service worker owns the job, the offscreen page holds the model, the engine asks the page, and the pipeline calls the engine in order. Eight files were changed from Version 1, nine are new, seven are the same as before, and three were removed with the cloud engine. A tutor who asks about a file should hear one sentence about its job, one file name with a line number, and one limit.
