# Test run 1: pipeline end-to-end (T01-T22)

- Date: 2026-10-20
- Project: `midsem/project` (Page Summarizer, Manifest V3)
- Suite: `midsem/project/tests/e2e/pipeline.test.js` (24 tests) plus the existing smoke test
- Fixture added: `midsem/project/tests/fixtures/table-article.html`
- Command: `npm run test:e2e` (headed Chromium, slowMo 120 ms, mock Gemini only, no real API calls, no key printed or stored)
- Screenshots: `midsem/project/test-output/` (names cited below)
- `src/` was not modified. Nothing was committed or pushed.

## Result

| Run | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| Planned list, first run (`pipeline.test.js` only: T01-T18, incl. T09b and T12b) | 20 | 20 | 0 | before T19-T22 were added |
| Run 3 (after T19-T22 added) | 25 | 20 | 5 | T12b failed from harness timing (fixed, see section 3) |
| Run 4, run 5 | 25 | 21 | 4 | same four failures each time (T19-T22) |
| **Final, run 7 (`npm run test:e2e`)** | **25** | **21** | **4** | **0 skipped, 79.6 s. Failures are T19, T20, T21, T22: genuine product bugs** |

`npm test` (unit tests): 56 pass, 0 fail.

## 1. Scenario table

| ID | What it checks | Result | Notes |
|---|---|---|---|
| smoke | Short article: one call, noise removed before the model | PASS | pre-existing test, still green |
| T01 | Long article (4 parts at chunkChars 3000): chunk requests in order 1..n, then merge; "part 2 of" seen while running; "Combined overview"; stats "4 parts" | PASS | screenshots T01-progress, T01-done; stats read "4 parts · 5 requests" |
| T02 | Near-empty page refused before any model call | PASS | "too little readable text"; 0 requests |
| T03 | No key: "No API key", Options button visible, 0 requests, button opens options.html | PASS | the helper page is moved off options.html first (see section 3, item 5) |
| T04 | Wrong key: "rejected", 1 request (no retry), Options button | PASS | |
| T05 | 429 twice then success: retry notice seen with "busy", 3 requests, summary | PASS | notice reads "The service is busy. Trying again in 2 s (attempt 1 of 3)."; screenshot T05-retry-notice |
| T06 | 429 every time: busy message, 4 requests | PASS | "The free tier is busy right now..." |
| T07 | 500 every time: problem message, 4 requests | PASS | |
| T08 | Model slower than requestTimeoutMs: "too long", 1 request, no retry | PASS | |
| T09 | Empty model answer: "no summary", 1 request | PASS | |
| T09b | Safety-blocked answer: "no summary", 1 request | PASS | |
| T10 | chrome://version refused: "does not allow", 0 requests | PASS | chrome://version opened directly in Playwright; the about:blank fallback was not needed |
| T11 | Popup closed mid-run: reopened popup shows progress or result, every part sent exactly once, merge made, summary shown | PASS | screenshot T11-reopened |
| T12 | Late content (delay 500), summarized after 1.5 s; prompt contains "Hill Station" | PASS | |
| T12b | Late content still loading when Summarize is pressed: "too little readable text", 0 requests | PASS | delay raised from 4000 to 20000 ms, see section 3, item 1 |
| T13 | Dashboard page summarized; extractMethod logged | PASS | extractMethod = `fallback-innerText`; screenshot T13-dashboard |
| T14 | Hostile model output: no `<img>` or `<b>` element, page and popup titles not "hacked", literal "<img" visible | PASS | screenshot T14-hostile-output shows the markup as text |
| T15 | Options page: save (Saved, note shown, field cleared, key stored), remove (note hidden, key gone), "Enter a key", "no spaces" | PASS | screenshots T15-saved, T15-empty-error; visual note V1 |
| T16 | Finished job persists: second popup shows the result, no new model call | PASS | screenshot T16-persisted |
| T17 | Tab navigated to another page: old summary hidden, Summarize enabled | PASS | screenshot T17-navigated |
| T18 | Worker stopped mid-job (CDP stopAllWorkers), then woken: job record error INTERRUPTED, popup says "interrupted" | PASS | passed on the first attempt, so no t.skip was needed; screenshot T18-interrupted |
| T19 (added) | Summarize pressed on a new page while the previous page's summary is still running: the popup must show progress, a message or a result within 4 s | **FAIL** | bug B1; popup stays blank; screenshot T19-new-page-press |
| T20 (added) | Worker stopped with the popup open and the job older than 3 minutes: the open popup must stop showing progress | **FAIL** | bug B2; screenshot T20-stale-while-open |
| T21 (added) | Article with a table: cells stay separate in the text sent to the model | **FAIL** | bug B3; assertion shows `arterRevenueMargin`, `Q14.5M12%`; screenshot T21-table-article |
| T22 (added) | Tab closed while summarizing: no job record remains for that tab | **FAIL** | bug B4; the record is kept with status "done" |

## 2. Bugs found

### B1. Summarize is silently ignored while the previous page's summary is still running (medium)

- **Steps:**
  1. Open `article-long.html` (4 parts) in a tab and press Summarize. Wait for the progress bar.
  2. In the same tab, navigate to `near-empty.html` while the summary is still running.
  3. Open the popup again and press Summarize.
- **Expected:** within a few seconds the popup shows progress, a message (for example "already summarizing the previous page"), or a result for the new page.
- **Actual:** the popup stays blank: no progress, no message, no result. The button is enabled again about 1.5 s later, when the old job's next progress write arrives. The old page's job keeps running and ends silently. Pressing Summarize again after the old run has ended works and shows "This page has too little readable text to summarize."
- **Evidence:**
  - Assertion (T19): "pressing Summarize on the new page must show progress, a message or a summary within 4 s; the popup stayed blank".
  - Screenshot `T19-new-page-press.png`: blank popup on "Nearly empty page", button enabled, no message.
  - Exploratory probe (not in the suite): after the press, progress false, error null, result false; the job record still belonged to the old URL.
- **Root cause (best guess, not changed):**
  - `src/background/service-worker.js`, `startJob()`: allows one job per tab and answers `{ok:false, reason:'already_running'}`.
  - `src/ui/popup.js`, `render()`: `sameUrl` hides any job whose URL differs from the tab, so the running job is invisible to the new page.
  - `src/ui/popup.js`, the Summarize click handler: discards the `sendMessage` response, so the refusal is never shown.

### B2. An open popup keeps showing "Summarizing..." after its worker has died (medium)

- **Steps:**
  1. Open `article-short.html`, set the mock to a 4 s delay, press Summarize.
  2. While the popup stays open, stop the extension service worker (CDP `ServiceWorker.stopAllWorkers`). Do not wake it.
  3. Let the job become older than 3 minutes. The test writes `updatedAt` as 170 s ago and waits 15 s with no other storage write.
- **Expected:** the popup shows "The summary was interrupted. Press Summarize to try again." and the button is enabled. The popup's own rule says a running job silent for 3 minutes is dead.
- **Actual:** the popup keeps "Summarizing..." with an empty progress bar and a disabled button. Only closing and reopening the popup, or a storage write, shows the interruption.
- **Evidence:**
  - Assertion (T20): "a job last updated more than 3 minutes ago must not keep showing progress in an open popup", result `true !== false`.
  - Screenshot `T20-stale-while-open.png`.
  - Exploratory probe: with the job about 190 s old, the open popup still showed progress and a disabled button. A freshly opened popup showed "The summary was interrupted...".
- **Root cause (best guess, not changed):**
  - `src/ui/popup.js`, `render()`: the `STALE_MS` check runs only on popup start-up and on `chrome.storage.onChanged`. No timer re-checks an open popup.
  - `src/background/service-worker.js`, `sweepOrphans()`: runs only when the worker starts, so nothing marks the dead job while no event wakes the worker.

### B3. Table cells run together in the text sent to the model (medium)

- **Steps:**
  1. Open `tests/fixtures/table-article.html` (an article with a three-column table in minified HTML).
  2. Press Summarize. Inspect the prompt the mock received.
- **Expected:** each cell is separated from the next, for example "Q1", "4.5M", "12%" each on its own line or with a space.
- **Actual:** the text reads `QuarterRevenueMargin`, `Q14.5M12%`, `Q25.1M14%`. The model receives fused figures. The popup still reports success, so the error is silent.
- **Evidence:**
  - Assertion (T21) after the message fix: `table cells run together in the text sent to the model: "arterRevenueMargin\n\nQ14.5M12%\n\nQ25.1M14%\n\nAnalysts expect th"`.
  - Screenshot `T21-table-article.png` shows a normal summary, so nothing in the UI reveals the problem.
  - Node probe of `src/content/extract.js` on the same HTML: `method: readability`, text `QuarterRevenueMargin ... Q14.5M12%`.
- **Root cause (best guess, not changed):** `src/content/extract.js`, `htmlToText()`. `BLOCK_TAGS` contains `tr` and `table` but not `td`, `th` or `caption`, so cell text is joined with no separator. The `innerText` fallback path is not affected.

### B4. A job record for a closed tab is written back and kept (low)

- **Steps:**
  1. Press Summarize on `article-long.html` with a 1 s mock delay.
  2. Close the popup and the tab while the summary is running.
  3. Wait until the model has answered the merge, then read the job record for the tab id.
- **Expected:** no `job:<tabId>` record remains (the `chrome.tabs.onRemoved` handler removes it).
- **Actual:** the record is written back with status "done" and the full summary. Depending on timing it also has the page URL and start time. It stays in `chrome.storage.session` until the browser restarts.
- **Evidence:**
  - Assertion (T22): "the job record for a closed tab should be removed, but it was kept with status "done"".
  - Exploratory probe: after the closed tab's run, `chrome.storage.session` still held `job:<id>` with status "done" and a 137-character summary.
- **Root cause (best guess, not changed):** `src/background/service-worker.js`. The `chrome.tabs.onRemoved` listener deletes the record, but `runJob()` keeps running. Writes already queued in `writeJob()` still run `get` then `set`, and `set` re-creates the record from `{...current, ...patch}`. Nothing checks that the tab still exists, and the queue is not cancelled on removal.

## 3. Test bugs fixed along the way

1. **T12b timing (run 3 failure).** The late-content page starts its 4 s timer when the page loads. Under load the harness took more than 4 s to press Summarize, so the text had already arrived and the product correctly summarized it. Fix: delay raised from 4000 to 20000 ms, and an assertion added that the text is still "Loading the report" before Summarize. This departs from the `?delay=4000` in the brief, on purpose.
2. **T20 threshold.** The first draft waited 10 s after writing a 170 s-old job, which lands exactly on the 180 s limit. Raised to 15 s so the job is clearly past the limit.
3. **T21 failure message.** The message searched for "Quarter", which matched the page title "Quarterly Figures" first, so the snippet was misleading. The search now starts at the page body.
4. **Draft cleanup before the first run.** Removed a placeholder test and a stray screenshot call from the first draft.
5. **T03 precaution (did not fail).** Chrome focuses an already-open options page instead of opening a new one, and the helper page is an options page. T03 moves the helper page to `popup.html` before pressing "Open Options" and restores it in `finally`. It passed on the first try.
6. **T10 fallback.** The about:blank fallback is coded but was not needed.

## 4. Final command output summary

```
npm run test:e2e
# tests 25
# pass 21
# fail 4   (T19, T20, T21, T22 - product bugs B1, B2, B3, B4)
# skipped 0
# duration_ms 79642
```

## Visual notes

- **V1 (low), options page, `T15-saved.png` and `T15-empty-error.png`.** The Save button is full width (`src/ui/ui.css`, `button.primary { width: 100% }`) inside the flex row, so the key field shrinks to about 180 px. The placeholder "Paste a new key to replace the saved one" is cut off at "replac".
- **V2 (low), retry state, `T05-retry-notice.png`.** While retrying, the progress bar is empty beside "Summarizing...". The amber notice explains the wait, but the bar reads as stuck.
- **V3, stuck state, `T20-stale-while-open.png`.** A dead job looks like a normal running job (greyed button, empty bar, "Summarizing..."). This is B2.
- **V4, blank state, `T19-new-page-press.png`.** A blank popup with an enabled button and no message. This is B1.
- **Positive:** the 380 px popup layout is clean; long titles truncate with an ellipsis; the error and Options button are clear (`T03-no-key.png`); the stats line reads well (`T01-done.png`); hostile markup shows as literal text (`T14-hostile-output.png`).

## Other findings (not counted as failing tests)

- **O1, merger (low), `src/core/merger.js`, `mergeAll()`.** The line `if (groups.length === level.length) groups = [level];` merges every part in one request whenever no two parts fit together, even when each part fits alone. Probe: three 400-character parts with maxChars 500 gave one merge request of 1204 characters. This is reachable only when partial summaries exceed about half the chunk size, roughly 4000 characters with the default 8000, so it is unlikely with default settings.
- **O2, no cap on work (design risk, medium; code reading only).** `src/core/pipeline.js`, `runPipeline()`, has no maximum number of chunks or requests. A very large page could make many paid model calls. Not tested.
- **O3, possible double start (not reproduced).** `src/background/service-worker.js`, `startJob()`, checks for a running job and then writes it after several `await`s. Two popups clicked at the same moment produced one request in each of three attempts.
- **O4, misleading error (not tested).** `src/engines/gemini.js`, `classifyHttpError()`: every 403 becomes INVALID_KEY ("Your API key was rejected"), even when the cause is not the key.
- **O5, the 127.0.0.1 host permission (coverage gap).** The test copy of the manifest adds `http://127.0.0.1/*`, so `tab.url` is always visible and the real toolbar `activeTab` path is not exercised. Where `job.url` is null, `popup.js` treats every URL as the same page (`sameUrl = !job?.url || ...`). This was read from the code, not reproduced. A manual check on a real installed build is recommended.

## Coverage and limits

- Mock Gemini only. Prompt quality and real model behaviour are not tested.
- Extraction was tested on six fixture pages (article-short, article-long, near-empty, late-content, dashboard, table-article).
- The timing-sensitive scenarios run with a 120 ms slowMo. Under load, the T12b margin was too small; see section 3.
