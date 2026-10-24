# Version 2 test run 1 (pretend model, hidden Chromium)

> Later additions: after this run the suite grew to 29 browser scenarios (V25 cut part, V26 heartbeat, V27 technical detail; 24 October) and the unit tests to 76. The table below is the 26-scenario run of 21 October.

Date: 2026-10-21. Command: `npm run test:e2e` in `finalsem/project`.

The browser tests load the real extension into a hidden Chromium window and press the real Summarize button. The model is a **pretend model** (the offscreen page answers from `mock-engine.js` when `?mock=<mode>` is set), so these tests check the extension's own behaviour: messages, progress, storage, errors and the popup. They do not check how good a real model's summaries are. That is covered by the real-model runs in the other files in this folder.

## Result

| Test set | Count | Result |
|---|---|---|
| Unit tests (`npm test`, no browser) | 65 | all pass |
| Browser tests (`npm run test:e2e`), run three times in a row | 26 each time | 26 / 26 passed every time (about 77 s per run) |
| Windows script checks (`tests/bat/test-bat-scripts.ps1`) | 14 | all pass (run earlier; scripts unchanged since) |

## Browser scenarios

| ID | What is checked | Result |
|---|---|---|
| smoke | First run: model line, download progress, summary; second run skips the download | pass |
| V01 | First run: model line, download percentages never go down, warm-up, summary; afterwards the model shows as downloaded | pass |
| V02 | Phases of a first run appear in order: extracting, (checking), downloading, (loading), summarizing | pass |
| V03 | Long article in parts: parts in order, merged, stats say 4 parts | pass |
| V04 | Near-empty page: refused as too little text, model not downloaded | pass |
| V05 | Restricted page (`chrome://version`): refused before any model call | pass |
| V06 | Page needing more parts than `maxChunks`: refused as too long, no download | pass |
| V07 | No WebGPU: model line says so, button disabled, a press does nothing | pass |
| V08 | No 16-bit shader support: model line says so, button disabled | pass |
| V09 | Integrated graphics: note names Intel, small model used, summary works | pass (after fix 1 below) |
| V10 | Main model out of memory: summary still works with SmolLM2, choice saved, next popup shows it | pass |
| V11 | Every model runs out of memory: error says so, choice saved, Summarize enabled again | pass |
| V12 | Download fails: error says so, nothing saved, a later press succeeds once the download works | pass |
| V13 | Empty answer from the model: reported as no summary | pass |
| V14 | Hostile model output: markup is shown as text, never rendered | pass |
| V15 | Popup closed mid-job: a reopened popup shows the same job, then the summary | pass |
| V16 | Finished job persists: second popup shows the result, no new job starts | pass |
| V17 | Stale result after navigation: old summary hidden on a different page, Summarize enabled | pass |
| V18 | Content that arrives late (after 1.5 s): page summarized with the text that arrived | pass |
| V18b | Content still missing when Summarize is pressed: refused as too little text | pass |
| V19 | Article with a table: summarized without failure | pass |
| V20 | Service worker stopped mid-job: job becomes INTERRUPTED and the popup says so | pass |
| V21 | Summarize pressed on a new page while the old page is still being summarized: reply within 4 s | pass |
| V22 | Tab closed while summarizing: no job record left behind for that tab | pass (after fix 2 below) |
| V23 | Idle close: offscreen page closed after the idle time, next summary still works | pass |
| V24 | Nothing opens: a normal summary adds only the popup window (no tab, no options page) | pass |

## Problems the tests found in the extension

1. **V09: the graphics note said "intel" in lowercase.** WebGPU reports the vendor name in lowercase and the popup printed it as it came. A user-facing sentence must read "Graphics: Intel (built into the processor)". Fix: `vendorName()` in `src/ui/popup.js` maps the known names (Intel, NVIDIA, AMD, Apple, Qualcomm, Arm) and capitalizes anything else.
2. **V22: a job record could come back after its tab was closed.** When the tab closed, the service worker removed the record at once, but a progress write that was already queued for that tab could still finish afterwards and write the record again. This is the most likely cause: the failure was seen before the fix and not after it, but it was not caught in the act. Version 1 had a similar bug (B4) that was fixed by remembering closed tabs; Version 2 added many more progress writes (download and loading percentages), so the gap between "check" and "write" was wide enough to hit. Fix in `src/background/service-worker.js`: the removal now waits for the queued writes of that tab, and a write that finishes after the tab closed removes its own record.

## Problems in the tests themselves (not the extension)

| Problem | Fix |
|---|---|
| The second `summarize()` in the smoke test acted on the popup window left over from the first one | The helper asks Chrome which tab is active, and the test closes other popup windows first |
| Version 1's test bridge page (`options.html`) does not exist in Version 2 | A small bridge page `src/ui/test-bridge.html` is written into the staged copy of the extension for the tests only |
| The secret scan failed with `EBUSY` on a profile folder that Chrome still had open | The Version 2 scan skips `.model-profile*` and `test-output` |

## What this run does not show

- It does not show real summary quality: the pretend model returns fixed text.
- It does not show real download speed, graphics-card behaviour or shader warm-up. See [v2-local-nvidia.md](v2-local-nvidia.md), [v2-local-nvidia-offline.md](v2-local-nvidia-offline.md) and [v2-local-intel.md](v2-local-intel.md).
- It ran in hidden Chromium, not in the visible Chrome the client will use.
