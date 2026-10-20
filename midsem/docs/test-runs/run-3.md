# Test run 3: the latest results

- Date: 2026-10-20
- Scope: all unit tests and all browser scenarios in midsem/project, after the quota handling, the key box inside the popup, the popup window harness and the switch to hidden (headless) browser runs.

| Suite | Command | Result |
|---|---|---|
| Unit tests | npm test (in midsem/project) | 65 passed, 0 failed |
| Browser scenarios | npm run test:e2e (hidden Chromium, mock Gemini service) | 28 passed, 0 failed, about 130 seconds |

What is new since run 2:
- T24: the daily free-tier quota is used up. The extension stops at once and says how long to wait; it does not retry.
- T25: a key is pasted and saved inside the popup. No Options page and no new tab opens.
- Unit tests for the quota wait times (parsing the wait the service gives, and the message shown).

What was not re-run in this record:
- The 10 checks of the setup and run scripts (tests/bat) were last run before the popup redesign. They must be run again before they are quoted.
- The manual smoke test in the real Google Chrome (midsem/docs/MANUAL_SMOKE_TEST.md) has not been recorded.
- The live runs against the real service (L01 to L09) were made before the popup redesign; their results are in live-measurements.md.
