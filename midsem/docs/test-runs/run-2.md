# Test run 2: after the fixes for run 1

- Date: 2026-10-20
- Command: `npm test` and `npm run test:e2e` in `midsem/project`, in a visible (headed) Chromium window, mock Gemini only.
- Changes since run 1 (see `DEVLOG.md` for the reasoning): per-job ids with abort of replaced jobs and closed tabs (B1, B4), a 5-second staleness re-check in the open popup (B2), table cells separated in the extractor (B3), a page-length limit with the TOO_LONG error, a per-tab start lock, 403-location handling, and an options-page layout fix.

| Suite | Run 1 | Run 2 |
|---|---|---|
| Unit tests (`npm test`) | 56 pass | **60 pass**, 0 fail |
| Browser scenarios (`npm run test:e2e`) | 25 run: 21 pass, 4 fail (T19 to T22) | **26 run: 26 pass**, 0 fail, about 123 s |

Scenarios added since run 1: T23 (page needs more parts than the limit is refused before any model call). The test for T21 was tightened to require `Q1 | 4.5M | 12%` on one line and rows on consecutive lines.

Not covered by these runs (unchanged from run 1): real model behaviour, the toolbar `activeTab` path in the real Chrome (see `MANUAL_SMOKE_TEST.md`), and other Chrome versions.
