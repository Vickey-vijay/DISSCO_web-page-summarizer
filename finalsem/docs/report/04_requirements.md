# Requirements for Version 2

This chapter lists what Version 2 must do. For each requirement it names the code that meets it, the test or measurement behind it, and how far it is verified. The sources are the product requirements document (`prd.md`, 17 October 2026) and the goals in the abstract. Each row was checked against `finalsem/project/` as it is now.

Codes such as V01 or V24 in the test column are browser test scenarios from `finalsem/docs/test-runs/run-1.md`. They are not figure names. In the status column, **Met** means a test or a measured run shows it. **Met by reading** means the code is true but no test checks it. **Partly** means only some cases, or only the developer's laptop, are covered. **Not verified** means there is no evidence yet.

## Functional requirements

Table: Functional requirements for Version 2

| ID | Requirement | Where it is met in the code | Test | Status |
|---|---|---|---|---|
| FR1 | Summarize from the popup; the summary appears there. | `src/ui/popup.js`; `src/background/service-worker.js` (`startJob`, `runJob`) | smoke; V01; V15; V16 | Met |
| FR2 | Read the main text of the page; drop menus, ads and footers. | `src/background/extract-tab.js` with `src/lib/readability.js` and `src/content/extract.js` | V04; V05; V18; V18b; V19 (table page, checked for no failure only) | Met. Version 1 file, unchanged |
| FR3 | Split long text, summarize each part, merge the parts. | `src/core/chunker.js`; `src/core/pipeline.js`; `src/core/merger.js`; `src/engines/local.js` | Unit: chunker (10), merger (8), pipeline (7); V03; V06 | Met |
| FR4 | Show progress while working. | `src/background/service-worker.js` (`writeJob`); `src/ui/popup.js` (`progressLabel`) | V01; V02; unit: local engine | Met |
| FR5 | Enter a key once in an options page (Version 1 only). | Not built. No key box, Options page or key storage | None; checked by reading | Dropped on purpose |
| FR6 | Download the model on first use with a progress bar; keep it cached. | `src/engines/local.js` (`prepare`); `src/offscreen/offscreen.js` (`load`, IndexedDB cache); `src/core/gpu-check.js` (`mapInitProgress`) | V01; V12; smoke (second run skips the download). Real first-use run: 196.8 s | Met, on one laptop |
| FR7 | After caching, summarize with no network. | `src/offscreen/offscreen.js` requests the model file list only when the model is not cached | Clean offline runs with outside websites blocked: 15.3 s and 16.5 s. Not in the browser tests | Met on the developer's laptop |
| FR8 | Failures give a clear message the reader can act on. | `src/core/errors.js` (`USER_MESSAGES`); `src/core/engine-errors.js`; `src/ui/popup.js` | V04; V05; V06; V07; V08; V10 to V13; V20; unit: GPU and errors (9) | Met for the listed codes. TIMEOUT has no end-to-end test |
| FR9 | Check the computer first. Show a clear message if it cannot run the model. Use a smaller model when short of memory. (From the risk table in `prd.md`.) | `src/core/gpu-check.js` (`evaluateGpu`, `chooseModel`); `src/engines/local.js` (`checkStatus`, one retry in `prepare`) | V07; V08; V09; V10; unit: local engine; real run on the Intel chip | Met |

**What this means in plain words.** The reader still presses one button, sees progress and gets a summary. The key is gone, the model download is new, and the messages now describe graphics and model failures instead of key and rate-limit failures.

## Non-functional requirements

NF1 to NF4 come from the goals in `prd.md`. NF5 to NF10 come from the project brief for this stage.

Table: Non-functional requirements for Version 2

| ID | Requirement | How it is checked, and the evidence | Status |
|---|---|---|---|
| NF1 | Page text never leaves the computer. | Code reading: the summary path only sends messages inside the extension. The one `fetch` outside the library reads the model file list. No network capture was recorded | Partly |
| NF2 | A speed a reader can wait for. The PRD sets no number. | Clean NVIDIA runs: first use 196.8 s; later use 15.3 s (short article), 16.5 s (two parts), 74.1 s (seven parts). Clean Intel runs: first use 199.2 s; two parts 149.1 s | Partly |
| NF3 | Disk space fits a normal laptop. | Not checked by the extension. `scripts/check-computer.ps1` prints free space. The popup reports a download of about 695 MB. The README asks for about 3 GB free | Not verified on the client's laptop |
| NF4 | The model fits in graphics memory. | `src/core/config.js` holds 879 MB (1B model) and 376 MB (SmolLM2). There is no free-memory check. A failed load is retried once with the small model. A real out-of-memory was never produced | Partly |
| NF5 | Works offline after the first download. | The model is stored in IndexedDB. The summary path makes no request. Clean offline runs with outside websites blocked | Met on the developer's laptop |
| NF6 | Nothing opens in a new tab. | No `chrome.tabs.create`, `openOptionsPage` or `window.open` in the Version 2 code. Test V24 passes | Partly. Not checked in the visible Chrome |
| NF7 | No key. | No key box in `src/ui/popup.html`. No key is read or stored. No test asserts it | Met by reading |
| NF8 | Chrome desktop, Manifest V3, loaded unpacked. | `manifest.json` (`manifest_version` 3). `run.bat` shows the load steps, because branded Chrome no longer accepts the load flag (DEVLOG, 20 October). Tests use Playwright's Chromium | Partly. A manual load in installed Chrome is still needed |
| NF9 | Works on the client's laptop. | FR9 chooses the model from the reported card and memory. The client's details have been requested and not returned | Not verified |
| NF10 | Summaries good enough for a busy reader (abstract goal 6). | No formal quality check. One saved Intel summary starts with `<<<PAGE TEXT START>>>` and reuses the page's sentences. The Llama summary of the short article calls the thick single lens "the original Fresnel lighthouse", which the page does not say | Not verified |

**What this means in plain words.** The privacy and offline claims rest on reading the code and on offline runs, with no network capture behind them. The speed numbers come from one laptop. Quality has not been measured, and the saved samples show faults.

## What differs from Version 1, and why

![Version 1 and Version 2 compared: engine, key, network, speed and privacy](../figures/V07_v1_vs_v2.png)
<!-- check against figure -->

Reading the figure: Version 1 needs a key and the internet for every summary. Version 2 needs no key, needs the internet only for the first download, and keeps the page text on the laptop. The speed row uses measured Version 2 numbers only, because the Version 1 timings belong to the Version 1 report.

Table: Requirements that differ from Version 1

| Requirement | Version 1 | Version 2 | Why it changed |
|---|---|---|---|
| Key (FR5) | Entered in an options page | None | No cloud call is made. The PRD goal is no key |
| Download and offline use (FR6, FR7) | A cloud call for every summary | Downloaded once, then offline | The engine runs in the browser |
| Part size (FR3) | 8,000 characters, at most 30 parts | 6,000 characters, at most 12 parts | The small model's window is about 4,096 tokens, and a slow laptop should not get very long pages (`src/core/config.js`) |
| Messages (FR8) | Key, rate-limit, quota and network messages | Graphics, shader, memory, download and model-start messages | The failures differ. NO_KEY, INVALID_KEY, RATE_LIMIT, QUOTA_EXHAUSTED and NETWORK no longer exist |
| Progress (FR4) | By part | By phase, with percentages for download and load | The first use has steps that Version 1 did not have |
| Computer check (FR9) | None | Card, WebGPU and memory are checked | The model runs on the card |

**What this means in plain words.** From the reader's side the product looks the same. Underneath, the engine, the key, the messages and the speed differ, and each change follows from running the model in the browser.

## Parts only partly verified, or not verified

- **The client's laptop has not been tested** (README, "Not yet verified"). Its graphics chip, memory and free disk space have been requested and have not come back.
- **Both measured chips are on one laptop**: an Intel built-in chip and an NVIDIA RTX 3050 with 6 GB, Chrome 155 and 15.7 GB of memory (DECISIONS.md, D1).
- **`setup.bat --gpu`** was tried only against a throw-away registry key, not a real Chrome.
- **The visible Chrome** has had no manual click-through. Every browser test ran hidden.
- **Summary quality** has not been compared. Five real-model runs exist: three clean, and two done while other programs were using the processor.

**What this means in plain words.** Every claim about the client's own laptop, the visible browser and summary quality is still open, and the results so far come from one developer's machine.

## Questions this chapter answers

**Which requirements did Version 2 keep?**
Reading the page, splitting and merging, the progress display and the popup button all carry over, and they use the same code for reading and merging. The key requirement is dropped, and the failure messages are replaced by graphics and model messages.

**Is the page text kept on the computer?**
The code gives page text no route off the machine, and the only network request outside the library asks for the model's file list. No network capture was made, so this is only partly verified.

**Does it work offline?**
On the developer's laptop, yes. Two clean runs with outside websites blocked produced summaries in 15.3 s and 16.5 s from the stored model. The client's laptop has not been tested.

**How fast is it?**
On the NVIDIA chip the first use took about 197 s, most of it the download, and a short article took 15.3 s once the model was stored. The PRD sets no target, so the speed requirement is only partly met.

**Which requirements are still open?**
The client's laptop, disk and memory on a second computer, the visible Chrome check, the setup script against a real Chrome, and summary quality. None of these has a result in the repository yet, so each stays marked as not verified or partly verified in the tables above.
