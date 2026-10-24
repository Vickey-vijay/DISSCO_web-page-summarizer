# Requirements for Version 2

This chapter lists what Version 2 must do. For each requirement it names the code that meets it, the test or measurement behind it, and how far it is verified. The sources are the product requirements document (`prd.md`, 17 October 2026) and the goals in the abstract. Each row was checked against `finalsem/project/` as it is now, including the changes made after a review of the code.

In the test column, "scenario V10" names a browser scenario from `finalsem/docs/test-runs/run-1.md`. Figures are named "figure V10" in the text. In the status column, **Met** means a test or a measured run shows it. **Met by reading** means the code is true but no test checks it. **Partly** means only some cases, or only the developer's laptop, are covered. **Not verified** means there is no evidence yet.

## Functional requirements

Table: Functional requirements for Version 2

| ID | Requirement | Where it is met in the code | Test | Status |
|---|---|---|---|---|
| FR1 | Summarize from the popup; the summary appears there. | `src/ui/popup.js`; `src/background/service-worker.js` (`startJob`, `runJob`) | smoke; scenarios V01, V15, V16 | Met |
| FR2 | Read the page's main text; drop menus, ads and footers. | `src/background/extract-tab.js` injects `src/lib/readability.js` and `src/content/extract.js` | Scenarios V04, V05, V18, V18b; V19 (table page, checked for no failure only) | Met. The extractor files are unchanged from Version 1 |
| FR3 | Split long text, summarize each part, merge the parts. | `src/core/chunker.js`; `src/core/pipeline.js`; `src/core/merger.js`; `src/engines/local.js` | Unit: chunker (10), merger (8), pipeline (7); scenarios V03, V06 | Met |
| FR4 | Show progress while working. | `src/background/service-worker.js` (`writeJob`); `src/ui/popup.js` (`progressLabel`) | Scenarios V01, V02; unit: local engine | Met |
| FR5 | Enter a key once in an options page (Version 1 only). | Not built. No key box, Options page, key storage or key styles | None; checked by reading | Dropped on purpose |
| FR6 | Download the model on first use with a progress bar, and keep it cached. | `src/engines/local.js` (`prepare`); `src/offscreen/offscreen.js` (`load`, IndexedDB cache); `src/core/gpu-check.js` (`mapInitProgress`, with the stored-model flag) | Scenarios V01, V12; smoke; unit: GPU and errors (stored and not-stored labels). Real first use: 196.8 s | Met, on one laptop |
| FR7 | After caching, summarize with no network. | `src/offscreen/offscreen.js` asks for the file list only when the model is not stored. The summary path makes no request | Clean offline runs with outside websites blocked: 15.3 s and 16.5 s before the label fix; 17.7 s and 16 s after it. Not in the browser tests | Met on the developer's laptop |
| FR8 | Failures give a clear message. | `src/core/errors.js` (`USER_MESSAGES`); `src/core/engine-errors.js` (`classifyEngineError`, `oom` matched as a whole word); `src/ui/popup.js` | Scenarios V04, V05, V06, V07, V08, V10 to V13, V20, V27; unit: GPU and errors (11), which includes CONTEXT_TOO_LONG | Met for the listed codes (15 codes now). The popup adds a technical-detail line for SERVICE_ERROR and MODEL_LOAD_FAILED (V27). TIMEOUT has no automated test |
| FR9 | Check the computer first. Show a clear message if the model cannot run. Use a smaller model when memory is short. (From the risk table in `prd.md`.) | `src/core/gpu-check.js` (`evaluateGpu`, `chooseModel`); `src/engines/local.js` (`checkStatus`, one retry in `prepare`); `src/ui/popup.js` (`#result-notice`) | Scenarios V07 to V10 (V10 checks the notice); unit: local engine; real run on the Intel chip | Met. The fallback stays in force until stored settings are cleared. The under-8-GB rule has not been seen on low-memory hardware |
| FR10 | Long pages on slow chips: the page is still summarized, each answer has up to 10 minutes, a part the model cannot read at once is cut in half, and a long answer does not make the job look dead. | `src/engines/local.js` (`summarizeChunk`: halving, up to three levels, not below 600 characters); `src/core/engine-errors.js` (CONTEXT_TOO_LONG); `src/core/config.js` (`generateTimeoutMs` 600000); `src/background/service-worker.js` (the KEEPALIVE message refreshes running jobs) | Scenarios V25 (cut part) and V26 (heartbeat); unit: local engine (halving), GPU and errors (CONTEXT_TOO_LONG). Real run on the Intel chip: the Wikipedia article in 616.4 s with the new code | Met in tests. One real run finished in 616.4 s, and no part needed cutting that day. The first try, under the old 180-second limit, failed with TIMEOUT |

The popup's messages for a missing WebGPU and a missing 16-bit feature are drawn in the two pictures below. Both are pretend-model screenshots, so they show the messages, not measured behaviour.

![Pretend model screenshot: the popup when Chrome has no WebGPU, with the button disabled](../screenshots/ui-10-no-webgpu.png)

![Pretend model screenshot: the popup when the card has no 16-bit maths, with the button disabled](../screenshots/ui-11-no-shader-f16.png)

**What this means in plain words.** The reader still presses one button, sees progress and gets a summary. The key is gone, the model download is new, and the messages now describe graphics and model failures. A summary written by the smaller model says so.

## Non-functional requirements

NF1 to NF4 come from the goals in `prd.md`. NF5 to NF10 come from the project brief for this stage.

Table: Non-functional requirements for Version 2

| ID | Requirement | How it is checked, and the evidence | Status |
|---|---|---|---|
| NF1 | Page text never leaves the computer. | Code reading: the summary path only sends messages inside the extension. The one `fetch` outside the library reads the model's file list. No network capture was recorded | Partly |
| NF2 | A speed a reader can wait for. The PRD gives no number. | Clean NVIDIA runs: first use 196.8 s; seven parts 74.1 s; a stored model 15.3 s (short) and 16.5 s (two parts) before the label fix, and 17.7 s and 16 s after it. Clean Intel runs: first use 199.2 s; two parts 149.1 s. On Intel, part 1 of the two-part article took about 65 s. The seven-part Wikipedia article took 616.4 s with the new code, and 704.5 s on a second try with the old code | Partly |
| NF3 | Disk space fits a normal laptop. | Not checked by the extension. `scripts/check-computer.ps1` prints the free space on drive C. The popup reports the download as about 695 MB. The README asks for about 3 GB free | Not verified on the client's laptop |
| NF4 | The model fits in graphics memory. | `src/core/config.js` holds 879 MB (1B model) and 376 MB (SmolLM2), taken from WebLLM's list. No free-memory check exists. A failed load is retried once with the small model. A real out-of-memory was never produced; the failure paths are tested with the pretend model (scenarios V10, V11) | Partly |
| NF5 | Works offline after the first download. | The model is stored in IndexedDB. The summary path makes no request. Clean offline runs with outside websites blocked | Met on the developer's laptop |
| NF6 | Nothing opens in a new tab. | No tab-opening or options-page call in the Version 2 code. Scenario V24 passes. Not checked in the visible Chrome | Partly |
| NF7 | No key. | No key box, key storage or key styles remain in the Version 2 code. No test asserts it | Met by reading |
| NF8 | Chrome desktop, Manifest V3, loaded unpacked. | `manifest.json` (`manifest_version` 3). `run.bat` shows the load steps, because branded Chrome no longer accepts the load flag (DEVLOG, 20 October). 15 batch-script checks (B1 to B10c). `set-chrome-gpu.ps1 -Remove` works without a Chrome path. A manual load in the installed Chrome is still needed | Partly |
| NF9 | Works on the client's laptop. | FR9 chooses the model from the reported card and memory. The client's details have been requested and have not come back | Not verified |
| NF10 | Summaries good enough for a busy reader (abstract goal 6). | No formal quality check. Copied page markers are now removed from answers. The saved Intel summary and its screenshot were recorded before that fix and still show the marker. The Llama summary of the short article calls the thick single lens "the original Fresnel lighthouse", which the page does not say. The Intel Wikipedia summaries have not been checked against the page, and the summary of the old-code second try contains invented facts | Not verified |

**What this means in plain words.** The privacy and offline claims rest on reading the code and on offline runs, with no network capture behind them. The speed numbers come from one laptop. Quality has not been measured, and the saved samples show faults, one of which has since been fixed in the code.

## What differs from Version 1, and why

![Version 1 and Version 2 compared: engine, key, network, speed and privacy](../figures/V07_v1_vs_v2.png)

Reading the figure: The figure sets Version 1, a cloud model that needs a key and the internet for every summary, against Version 2, a model on the laptop that needs no key and keeps the page text there. The Version 2 times are the clean runs only, so the seven-part article shows 74.1 s and the short article 15.3 s when the model is stored, against 196.8 s on first use. The Version 1 timings appear only as the figure's comparison column.

Table: Requirements that differ from Version 1

| Requirement | Version 1 | Version 2 | Why it changed |
|---|---|---|---|
| Key (FR5) | Entered in an options page | None | No cloud call is made. The PRD goal is no key |
| Download and offline use (FR6, FR7) | A cloud call for every summary | Downloaded once, then offline | The engine runs in the browser |
| Part size (FR3) | 8,000 characters, at most 30 parts | 6,000 characters, at most 12 parts | The small model reads about 4,096 tokens at a time, and a slow laptop should not get very long pages (`src/core/config.js`) |
| Messages (FR8) | Key, rate-limit, quota and network messages | Graphics, shader, memory, download and model-start messages | The failures differ. NO_KEY, INVALID_KEY, RATE_LIMIT, QUOTA_EXHAUSTED and NETWORK no longer exist |
| Notice of the smaller model (FR9) | None | Shown on the result when the main model ran out of memory or failed to start | The reader should know which model wrote the summary |
| Progress (FR4) | By part | By phase, with percentages for download and load | The first use has steps that Version 1 did not have |
| Computer check (FR9) | None | Card, WebGPU and memory are checked | The model runs on the card |

**What this means in plain words.** From the reader's side the product looks the same. Underneath, the engine, the key, the messages and the speed differ, and each change follows from running the model in the browser.

## Parts only partly verified, or not verified

- **The client's laptop has not been tested** (README, "Not yet verified"). Its graphics chip, memory and free disk space have been requested and have not come back.
- **Both measured chips are on one laptop**: an Intel built-in chip and an NVIDIA RTX 3050 with 6 GB, Chrome 155 and 15.7 GB of memory (DECISIONS.md, D1).
- **`setup.bat --gpu`** was tried only against a throw-away registry key, not a real Chrome.
- **The real Chrome** showed a failure on 24 October. The project owner's run of the Wikipedia article on the Intel chip ended with "Something went wrong inside the extension. Try again." and no reason. The cause and the changes are in chapter 6. No full manual click-through is recorded, and the browser scenarios ran hidden.
- **Summary quality** has not been compared.
- **Real-model runs.** Nine run files exist. Six were made before 24 October, and three Intel Wikipedia runs were added that day (one failed with TIMEOUT under the old code, one finished under the old code, and one under the new code). Of the six older runs, four are clean: the first NVIDIA run, the NVIDIA offline run before the label fix, the Intel run, and the NVIDIA offline run after the label fix. Two were done while other programs were using the processor and are kept as records.
- **Test counts.** The current code has 76 unit tests, 29 browser scenarios and 15 batch-script checks. The unit and scenario counts match the test files; the batch count comes from the change notes. `run-1.md` records three full browser runs made before the later fixes.

**What this means in plain words.** Every claim about the client's own laptop, the visible browser and summary quality is still open. The results so far come from one developer's machine.

## Questions this chapter answers

**Which requirements did Version 2 keep?**
Reading the page, splitting and merging, the progress display and the popup button all carry over, using the same code for reading and merging. The key requirement is dropped, and the failure messages are replaced by graphics and model messages.

**Is the page text kept on the computer?**
The code gives page text no route off the machine, and the only network request outside the library asks for the model's file list. No network capture was made, so this is only partly verified.

**Does it work offline?**
On the developer's laptop, yes. Clean runs with outside websites blocked gave summaries in 15.3 s and 16.5 s before the label fix, and 17.7 s and 16 s after it. The client's laptop has not been tested.

**How fast is it?**
On the NVIDIA chip the first use took about 197 s, most of it the download. A short article took 15.3 s to 17.7 s once the model was stored. On the Intel chip the seven-part Wikipedia article took 616.4 s with the new code. The PRD sets no target, so the speed requirement is only partly met.

**Which requirements are still open?**
The client's laptop, disk and memory on a second computer, the visible Chrome check, the setup script against a real Chrome, and summary quality. None of these has a result in the repository yet, so each stays marked as not verified or partly verified above.
