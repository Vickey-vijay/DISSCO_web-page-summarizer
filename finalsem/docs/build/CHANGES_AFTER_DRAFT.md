# Changes made after the first drafts (read this before you fix your chapters)

The first drafts of the report and the KT pack were written against the code as it was at 10:00 on 21 October 2026. These changes were made afterwards. Re-read the named files, then make every chapter you wrote true of the code as it is now. Do not describe a fixed problem as still open, and do not describe an unfixed one as fixed.

## Code that changed (all in `finalsem/project`)
1. **Copied page markers are removed from answers.** `stripPageMarkers()` in `src/core/prompts.js`, used in `src/engines/local.js`. Two unit tests. The Intel summary in `docs/test-runs/v2-local-intel.json` and the screenshot `v2-intel-short-popup.png` were recorded BEFORE this change and still show the marker: say so ("recorded before the fix").
2. **The popup tells the user when the small model took over.** For a finished summary whose `stats.modelSwitchReason` is `GPU_MEMORY` or `MODEL_LOAD_FAILED`, the result block shows (element `#result-notice`): "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." No notice for `integrated-graphics` (that case has the graphics note). The model line is now refreshed once when any job ends, success or error (`refreshModelLineOnce` in `src/ui/popup.js`), so after both models fail it no longer shows a stale "Not downloaded yet". The job record's `notice` field is still always null (the new notice is computed in the popup from the stats). Browser scenario V10 checks the notice. The screenshots ui-12 and ui-13 were re-shot after this change and show it.
3. **No "Downloading" label for a stored model.** `mapInitProgress(report, {cached})` in `src/core/gpu-check.js`; `src/offscreen/offscreen.js` checks `hasModelInCache` before loading. Real-model check after the fix: `docs/test-runs/v2-local-nvidia-offline-after-label-fix.md` (17.7 s short, 16 s two-part, first answer written at 65 tokens a second, no "Downloading" line; load took 11.6 s). The earlier clean offline run (`v2-local-nvidia-offline.md`: 15.3 s and 16.5 s) was made before the fix and has the wrong line at 3.9 s; keep citing it for timings and say so. Unit test added.
4. **The offscreen page is never closed while a message is running.** `src/background/offscreen-manager.js` counts messages in flight; only the last one to finish starts the 5-minute idle countdown, and `close()` does nothing while any message is running. One unit test.
5. **A job counts as dead after 5 minutes without an update, not 3** (`STALE_MS` in `src/background/service-worker.js` and `src/ui/popup.js`). The 180-second answer timeout (`generateTimeoutMs`) is unchanged. Version 1 kept 3 minutes.
6. **`oom` matches only as a whole word** in `src/core/engine-errors.js` ("room" is not an out-of-memory error). Unit test.
7. **Dead CSS removed** from `src/ui/ui.css` (key box and options page rules). One small rule added for the notice spacing.
8. **`scripts/set-chrome-gpu.ps1`**: `-ChromePath` is now optional (the script finds Chrome itself), so `powershell -File scripts\set-chrome-gpu.ps1 -Remove` works as written in the README. **`setup.bat --gpu`** now prints "The graphics setting was NOT changed ..." if the script fails (setup still goes on). New script check B10c.
9. **`scripts/check-computer.ps1`** prints "Free space on drive C: ..." (the double colon is gone).

## Test counts now
Unit tests: 70. Browser tests: 26 (smoke, V01 to V24, V18b), all pass. Windows script checks: 15 (B1 to B10c). Say "70", "26", "15". Do not write 65, 14 or 28 for Version 2 (65 and 28 are Version 1 figures).

## Speed facts (use exactly these)
- Writing speed in the saved clean runs: 34 to 53 tokens a second (each value is the last request of that job). The after-fix offline run: 65 for the single request of the short article, 45 for the two-part article.
- About 63 tokens a second writing and about 600 a second reading come from an earlier speed test on the NVIDIA chip that was not saved as a run file; the DEVLOG row does not say which text was used. Label them like that.
- Intel chip with SmolLM2: 4 to 5 tokens a second (`v2-local-intel.md`); about 2 with the 1B model (speed test, DEVLOG only).
- Never write "40 to 63", "40 to 50" or "29 to 53" as a clean range. 29 comes from a run done while other programs were running.
- Download size: the popup reports about 695 MB for the main model and about 204 MB for SmolLM2 in real runs; the pretend model's fixed numbers (664, 300) are not measurements.

## Still true (state these as limits or next steps, not as fixed)
`modelOverride` is never cleared (the switch to the small model is permanent until stored settings are cleared); closing a tab during the download does not stop the download (`prepare()` ignores the abort signal); the merge step's answer can repeat the prompt's own wording ("These are summaries of consecutive parts of one web page") and small models make factual slips; built-in graphics detection recognises Intel only; no automated test covers the TIMEOUT path (the pretend model has no timeout; the logic is in the real engine); the model line is not refreshed while the download or warm-up is running; at the load stage any error text containing "cache" counts as a download failure; `scripts/secret-scan.mjs` only knows the Version 1 Gemini key; the under-8-GB rule (`navigator.deviceMemory`) has not been seen on real low-memory hardware; the dashboard fixture is not used by any Version 2 browser test; the warm-up took about 30 s on first use and 0.5 s in the offline runs on the same browser profile and the cause is not measured.

## Figures and screenshots
- All 17 figures now exist in `finalsem/docs/figures/` (see `FIGURES.md`). Open each figure you cite, replace every `<!-- check against figure -->` line with a "Reading the figure" paragraph that matches what is drawn. If a drawing is wrong, tell me; do not describe something that is not drawn.
- All 18 pretend-model screenshots `ui-01` to `ui-18` exist (see `finalsem/docs/screenshots/UI_STATES.md`). Cite the ones that help and remove every `<!-- check against screenshot -->` line. `ui-03` was made by writing a job record by hand (the pretend model never sends that message); say so in its caption.
- The new run screenshots `v2-nvidia-offline-*-after-label-fix.png` exist; the old names are the earlier run.
- Use "test setup", not "harness" (banned word list). Test scenario IDs V01 to V24 and figure IDs V01 to V17 share the prefix: write "scenario V10" and "figure V10".
- Browser scenarios are also described in `docs/test-runs/run-1.md`.
- The DEVLOG (repository root, rows dated 2026-10-21) now also has rows for: the wrong "Downloading" label, the copied markers, the silent fallback, and a code-reading review (items 4, 5, 6, 7 and 8 above). Chapter 15 should tell those stories.
