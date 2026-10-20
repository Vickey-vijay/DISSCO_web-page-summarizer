# Requirements

## Where the requirements come from

The requirements come from the project requirements document (the PRD). The PRD lists eight functional requirements, FR1 to FR8, which say what the product must do, and a short set of non-functional requirements, which say how well it must do it and on which platform.

The table below restates each functional requirement in plain words. The Version column says which version must deliver it. The last column names the tests that checked V1. The T numbers are the scenario IDs used in the browser test files and the test run reports. Unit tests are named by file.

## Functional requirements

Table: Functional requirements, what each one means, which version delivers it, and how V1 was checked

| ID | Requirement in plain words | Version | How V1 was checked |
|---|---|---|---|
| FR1 | The user opens the extension on a page, presses Summarize, and the summary appears in the popup. | V1 and V2 | Smoke test, T01, T11, T16. Live run L01. |
| FR2 | The extension reads the main text and drops menus, advertisements and footers. | V1 and V2 | Smoke test (noise removed), T13, T21. Live runs L04, L06. |
| FR3 | Text longer than the model's limit is split, each part is summarized, and the parts are merged into one. | V1 and V2 | T01 (four parts, merged in order), T23 (page refused when too long), chunker, merger and pipeline unit tests. Live runs L02 to L05, L07. |
| FR4 | A progress indicator shows while the parts are processed. | V1 and V2 | T01 (shows "part 2 of" while running), T05 (retry notice), T11 (reopened popup shows progress). |
| FR5 | The user enters their own key once, and it is stored in the browser. | V1 | T03, T15 (Options page save and remove), T25 (key entered in the popup; no recorded run yet). |
| FR6 | The model downloads on first use with a progress bar, and is cached. | V2 | Not in V1; not built. |
| FR7 | Summaries work with no network once the model is cached. | V2 | Not in V1; not built. |
| FR8 | Clear messages for a missing or invalid key, rate limits, no WebGPU and too little text. | V1 and V2 | T02 to T10, T12b, T23, T24 (no recorded run yet). Live runs L08, L09. gemini.test.js unit tests. The "no WebGPU" message is V2 only. |

WebGPU is a browser feature that lets a web page use the graphics card for calculations. Only the later version runs a model in the browser, so only that version needs the WebGPU check.

## Non-functional requirements

- **Platform.** Chrome on a desktop computer, using Manifest V3. The check script that setup.bat runs (scripts/check-extension.ps1) confirms that manifest.json declares version 3.
- **Installation.** The extension is loaded with "Load unpacked" from the project folder. setup.bat and run.bat check the files and open the right pages. The bat test script has 10 checks, and the result of its last run is [to be measured]. The manual check in the real Chrome browser has not yet been recorded, so its result is [to be measured].
- **Privacy of the key.** The key is kept in local browser storage, which is not synced to the Google account. It is sent only in a request header, never in the web address. The unit test "sends the key in a header, not in the URL, and returns the text" checks this, and T25 checks the key saved in the popup.
- **Reliability.** A request with no answer within 25 seconds is stopped. Busy replies and server errors are retried up to three times. Checks: T06, T07, T08 and the gemini.test.js unit tests.
- **Cost control.** A page can cause at most 30 part requests, plus merge requests, before the run stops. This protects a free-tier key. Check: T23.
- **Plain-English errors.** Every failure has a short message, and technical detail goes to the console log only. Checks: the unit test "every error code has a plain-English message" and browser scenarios T02 to T10.

## Traceability

The table below links each requirement to its code and to its evidence. A tutor can follow any row from the requirement to the file and then to the result.

Table: Traceability from requirement to code, test and evidence

| Requirement | Main code files | Tests | Evidence file |
|---|---|---|---|
| FR1 | ui/popup.js, background/service-worker.js | Smoke, T01, T11, T16 | test-runs/run-1.md, run-2.md |
| FR2 | background/extract-tab.js, content/extract.js, lib/readability.js | Smoke, T13, T21 | test-runs/run-1.md, examples.md |
| FR3 | core/chunker.js, core/merger.js, core/pipeline.js | T01, T23, unit tests | test-runs/run-2.md, live-measurements.md |
| FR4 | ui/popup.js, core/pipeline.js | T01, T05, T11 | test-runs/run-1.md |
| FR5 | ui/options.js, ui/popup.js, core/config.js | T03, T15, T25 | test-runs/run-1.md |
| FR8 | core/errors.js, engines/gemini.js | T02 to T10, T12b, T23, T24, gemini unit tests | test-runs/run-1.md, live-measurements.md |

## Test status

Two test runs are recorded. In test run 1, the 56 unit tests all passed, and 21 of the 25 browser scenarios passed. The four failures (T19 to T22) were real product bugs: a silent refusal when Summarize was pressed on a new page, a popup that kept showing progress after its worker had stopped, table cells that ran together, and a stored record that survived a closed tab. Each was fixed.

In test run 3 (midsem/docs/test-runs/run-3.md), all 65 unit tests and all 28 browser scenarios passed. Run 3 includes T24 (the daily quota limit) and T25 (the key saved inside the popup), and the unit tests for the quota wait times.

### What this means in plain words

Each requirement has a named test, so a tutor can ask for the evidence. The first run found real bugs, and the second run passed after the fixes. Two requirements belong to the later version. Some of the newest tests have no recorded result yet.

### Questions this chapter answers

**Which requirements are in V1?**
FR1 to FR5 and most of FR8. FR6 and FR7 belong to the later version, and the "no WebGPU" message is later work too.

**How do you know the summary is correct?**
The tests check the steps: extraction, splitting, merging, retries and messages. The live runs on real pages show that the steps work with the real service. Summary quality was not scored formally, and the report says so.

**What is not yet tested?**
The results of T24, T25 and the five added unit tests, a clean-copy run of the setup scripts, and the manual check in the real Chrome browser. Each is marked [to be measured].
