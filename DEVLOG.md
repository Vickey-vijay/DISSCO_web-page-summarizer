# Development log

Real problems met while building this project, written as they happen. Each entry: date, what broke or was hard, symptom or error, root cause, fix, what was learned. Nothing is recorded here that did not actually happen.

| Date | Area | Symptom | Root cause | Fix | Lesson |
|---|---|---|---|---|---|
| 2026-10-20 | run.bat / testing (M0) | Launching the installed Google Chrome 155 with `--load-extension=<folder>` through Playwright showed no extension service worker within 8 s. Playwright's bundled Chromium 156 with the same flags loaded it at once. | The Chromium team removed the `--load-extension` flag from branded Chrome builds in Chrome 137 (announced April 2025). Chromium and Chrome for Testing keep it. Confirmed by `tests/e2e/chrome-flag-check.mjs`. | `run.bat` cannot launch Chrome with the extension pre-loaded. It opens `chrome://extensions` and prints the exact "Load unpacked" steps. Automated tests run on Playwright's Chromium. | Check what a browser flag really does on the target machine before building a launcher around it. Tests on Chromium do not prove the install path in branded Chrome, so a manual Load-unpacked smoke test is still needed. |
