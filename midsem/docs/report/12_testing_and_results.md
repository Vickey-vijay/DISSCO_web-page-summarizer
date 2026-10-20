# Testing and results

## How the testing is layered

The project was tested at five levels. Each level catches a different kind of mistake.

- **Unit tests** check small pieces of code one at a time. The network is replaced by a fake, so no request leaves the computer.
- **Browser scenarios** run the whole extension in a Chromium browser. Chromium is the open-source browser that Chrome is built from. A tool called Playwright drives it from a script. The real Gemini service is replaced by a mock, which is a stand-in server that gives fixed answers.
- **Setup checks** are ten checks that run the two batch files on copies of the project. Chapter 11 lists them.
- **Live runs** send a few real pages to the real Gemini service, using the developer's own key.
- **The manual smoke test** is done by hand in real Chrome. Chapter 11 describes it.

The numbers in this chapter come from the files in `midsem/docs/test-runs/`, from the test source, and from the project log, DEVLOG.md.

## Unit tests

The unit tests run with `npm test`. That command starts Node's built-in test runner on the files in `tests/unit/`. Node.js runs JavaScript outside the browser. Each test gives a small piece of code some input and checks the output. The engine tests replace the network with a fake, so the tests run without the internet.

Table: The six unit test files and what they cover

| File | Tests | What it covers |
|---|---|---|
| chunker.test.js | 10 | Splitting page text into parts: paragraphs, sentence ends, long words, empty text |
| merger.test.js | 8 | Joining part summaries, including several merge levels and an aborted merge |
| pipeline.test.js | 7 | The whole flow without Chrome: short pages, long pages, errors, cancellation, timing |
| gemini.test.js | 18 | The cloud engine: the key sent in a header, each HTTP error, retries, timeouts, empty and blocked answers |
| fixes.test.js | 9 | Checks added after run 1: same-page test, part limit, 403 location case, reading retry times, quota detection |
| small.test.js | 13 | Summary formatting, default settings, error messages, prompt markers, restricted pages |

The evidence files record three runs. Run 1 recorded 56 passing unit tests, and run 2 recorded 60, with none failing. Run 3, the latest record, recorded all 65 passing and none failing (run-3.md). That matches the 65 tests in the files.

**What this means in plain words.** The unit tests check each small rule on its own, without Chrome and without the internet. They catch a broken rule before the browser tests run.

## Browser scenarios

The scenarios load the extension into Playwright's Chromium and open the popup in a small window, because a test cannot click the toolbar icon. Six fixture pages (saved copies of web pages) are served locally. The mock Gemini server answers each request and records it. A scenario passes when the popup shows the expected text and the mock received the expected requests.

The test copy of the manifest adds one extra permission, for the local test server. The permission that Chrome grants when a user clicks the toolbar icon, called activeTab, is therefore not tested by these scenarios. Chapter 14 returns to this point.

Table: The 28 browser scenarios and their results in run 1 and run 2

| ID | What it checks | Run 1 | Run 2 |
|---|---|---|---|
| smoke | A short article gives one summary, and menus and cookie text are removed before the model sees the page | Pass | Pass |
| T01 | A long article in four parts: parts sent in page order, merged, progress shown | Pass | Pass |
| T02 | A near-empty page is refused before any request | Pass | Pass |
| T03 | No key saved: a message and an Options button that opens the options page | Pass | Pass |
| T04 | Wrong key: one request only, no retry, a clear message | Pass | Pass |
| T05 | Rate limited twice, then works: the popup shows a retry notice | Pass | Pass |
| T06 | Rate limited every time: stops after four requests | Pass | Pass |
| T07 | Server error every time: stops after four requests | Pass | Pass |
| T08 | Model too slow: cut off, reported as too long, not retried | Pass | Pass |
| T09 | Empty answer: reported as no summary | Pass | Pass |
| T09b | Blocked answer: reported as no summary | Pass | Pass |
| T10 | A chrome:// page: refused before any request | Pass | Pass |
| T11 | Popup closed mid-run, then reopened: same job, each part sent once | Pass | Pass |
| T12 | Content that arrives late: waits, then summarizes it | Pass | Pass |
| T12b | Content still missing when Summarize is pressed: refused as too little text | Pass | Pass |
| T13 | A dashboard page with little article text is still summarized | Pass | Pass |
| T14 | Hostile model output: markup shown as plain text, never rendered | Pass | Pass |
| T15 | Options page: save, remove, empty key and key with a space | Pass | Pass |
| T16 | A finished summary is still there when the popup reopens, with no new request | Pass | Pass |
| T17 | A finished summary is hidden after the tab moves to another page | Pass | Pass |
| T18 | Service worker stopped mid-job: the job is marked interrupted | Pass | Pass |
| T19 | Summarize pressed on a new page while the old one still runs: the press gets a reply | Fail (bug B1) | Pass |
| T20 | Worker stopped with the popup open: progress stops once the job is stale | Fail (bug B2) | Pass |
| T21 | A table on the page: cells stay separate in the text sent to the model | Fail (bug B3) | Pass |
| T22 | Tab closed mid-run: no job record is left behind | Fail (bug B4) | Pass |
| T23 | A page needing too many parts is refused before any request | Not in run 1 | Pass |
| T24 | Daily quota used up: stops at once and says how long to wait | Not in run 1 | Not in run 2 |
| T25 | Key typed into the popup, then a summary, with no Options tab opened | Not in run 1 | Not in run 2 |

The suite holds 28 scenarios: the smoke test plus 27 in `tests/e2e/pipeline.test.js`. Run 2 ran 26 of them, all passing. T24 and T25 were added after run 2. Run 3, the latest record, passed all 28, with none failing (run-3.md).

Three test faults were fixed in run 1, all in the harness and not the product. T12b's 4-second delay was too short under load, so it became 20 seconds. T20's 10-second wait landed exactly on the 3-minute limit, so it became 15 seconds. T21's text search matched the page title first, so it now starts at the page body.

**What this means in plain words.** The browser scenarios play out the user's steps in a real browser. They check what the popup shows and how many requests reach the mock service. They prove the extension handles each case, but not how good a real summary is.

## The first run: four bugs, T19 to T22

The first full run added T19 to T22 on purpose, because earlier probes had found four problems that no test covered. All four failed. Each was a real product defect, recorded as B1 to B4 in run-1.md.

- **B1: Summarize ignored after a page change (T19, medium).** When the tab moved to a new page while the old summary was still running, pressing Summarize left the popup blank. The service worker refused the second job, and the popup hid the running job because its address did not match, and it threw away the refusal. Nothing on the screen explained the problem.
- **B2: Progress kept showing in an open popup (T20, medium).** A dead job kept showing "Summarizing..." with a disabled button, while the popup stayed open. The popup checked for stale jobs only when it opened or when storage changed. A dead worker writes nothing, so the check never ran.
- **B3: Table cells ran together (T21, medium).** The text sent to the model read "QuarterRevenueMargin" and "Q14.5M12%". The summary still looked normal, so nothing on screen showed the damage.
- **B4: A closed tab's record was kept (T22, low).** A finished job record was written back after its tab had closed. It stayed in the browser's temporary session storage until the browser restarted.

Run 2 fixed all four. Each job now has an id, and a replaced or closed job is stopped. An open popup re-checks its job every five seconds. Table cells are joined with " | " and each row is one line. A page that needs more than 30 parts is refused, which also answers a risk listed in run 1 about one huge page costing many requests. A per-tab start lock stops two popups from starting the same job. A 403 error about the caller's location is now reported as a service problem, not as a rejected key. Run 2 recorded 60 unit tests and 26 browser scenarios, all passing. Run 3, the latest, recorded 65 unit tests and 28 browser scenarios, all passing (run-3.md).

One finding from run 1 is not listed as fixed in the log. The merge step can send every part in one request when the part summaries are very long. With the default settings, that needs part summaries of about 4,000 characters or more, so it is unlikely.

**What this means in plain words.** The first run found four real faults, all of them silent. Each one was fixed, and the same tests then passed.

## Live runs against the real service

Live runs send real pages to the real Gemini service with the developer's key, which the scripts read but never print. The runs used a hidden Chromium window, the model gemini-3.5-flash-lite, the "low" thinking setting (which limits the hidden working the model does before answering), and parts of 8,000 characters. Run 3 notes that these runs were made before the popup redesign and were not repeated.

Table: The live runs, from live-measurements.md

| Case | Page (text characters) | Parts, requests, merge levels | Time (s) | What it shows |
|---|---|---|---|---|
| L01 | Short article, fixture (1,711) | 1, 1, 0 | 1.7 | A one-part page needs one request and no merge |
| L02 | Long article, fixture (10,532) | 2, 3, 1 | 5.9 | Two parts are summarized, then merged into one summary |
| L03 | Same article in 3,000-character parts (10,532) | 4, 5, 1 | 7.2 | Smaller parts mean more requests |
| L04 | Wikipedia: Lighthouse (36,752) | 5, 6, 1 | 17.8 | A real encyclopedia page works from start to end |
| L05 | Wikipedia: Fresnel lens (48,289) | 7, 8, 1 | 23.0 | The slowest successful case, still under the part limit |
| L06 | Chrome documentation: Manifest V3 (521) | 1, 1, 0 | 1.9 | A short real page takes the one-request path |
| L07 | MDN: WebGPU API (29,599) | 4, 5, 1 | 7.5 | A technical documentation page works |
| L08 | Wikipedia: World War II, part limit set to 10 | not run | 0.6 | Refused before any request, with the "too long" message |
| L09 | Real service, wrong key | not run | 0.5 | The key is rejected and the popup says so |

The popup's own stats line shows slightly different times. It shows 5.7 seconds for L02 and 17.6 seconds for L04. The two timers start at slightly different moments, so they differ by a fraction of a second.

Two summaries from the live runs are quoted below exactly as printed in live-summaries.md. Both are model output. Nobody scored them for accuracy, so the report does not claim they are correct.

Case L02, a long article with two parts:

```text
This page provides a short history of lighthouses, covering their evolution from ancient fires to modern automated navigation backups and preservation efforts.

- Dangerous coastal waters led to the creation of lighthouses, starting with the Pharos of Alexandria in the third century BC.
- John Smeaton built a pioneering dovetail granite tower at the Eddystone Rocks in 1759.
- Lighting technology improved with Aime Argand's 1780s oil lamps and Augustin Fresnel's 1823 stepped glass lens system.
- Britain's last keepered lighthouse at North Foreland in Kent was automated in 1998, though Boston Light in the United States remains staffed.
- In 1999, the tallest brick lighthouse in the United States, Cape Hatteras in North Carolina, was moved 2,900 feet inland to protect it from erosion.
```

Case L06, a short Chrome documentation page:

```text
This page provides an overview of Manifest V3, the latest version of the Chrome extensions platform.
- Manifest V3 is the newest version of the extensions platform, featuring changes to available APIs and new features.
- The platform aims to improve the privacy, security, and performance of extensions as a first step in the platform vision.
- Another goal is to give users more understanding and control over what extensions can do.
- The platform changes will take several years to complete.
```

**What this means in plain words.** All nine live cases ended with a summary or a clear message, as the code intends. Times generally rise with the amount of text, from under two seconds for a short page to about 23 seconds for the longest one. This is a handful of pages on one day, so it is a sample and not a promise of speed.

## Choosing the model: speed and length

The project had to choose which Gemini model to call. The benchmark script sent the same prompt, about 7,000 characters of a long article, to several settings. It ran each setting three times and recorded the time and the answer length. The saved results are in model-bench.json. The table shows the four settings that have saved rows.

Table: Benchmark of four settings, three runs each (model-bench.json)

| Setting | Three runs (seconds) | Answer length (characters) |
|---|---|---|
| gemini-3.8-flash, default thinking | 12.3, 11.4, 12.6 | 1,072 to 1,238 |
| gemini-3.8-flash, thinking setting "low" | 3.9, 3.9, 12.5 | 1,268 to 1,444 |
| gemini-3.5-flash-lite, default | 2.0, 1.6, 1.6 | 1,147 to 1,418 |
| gemini-2.5-flash, thinking turned off | 2.4, 2.7, 2.4 | 1,420 to 1,441 |

The larger model, with its default thinking, took between 11 and 13 seconds for each request. Its usage data showed far more hidden thinking work than visible answer text, roughly six to seven times as much. Setting the thinking level to "low" cut most runs to under four seconds. One run in three still took 12.5 seconds. The Flash-Lite model was the fastest and the most consistent, between 1.6 and 2.0 seconds. The answers were similar in length across all four settings, so length does not show which answer is better.

The benchmark measured speed and length, not answer quality. The cheaper model's answers were not formally compared with the larger model's, so the choice rests on measured speed and the free quota.

Two details need care. DEVLOG.md says six settings were compared, and that the lowest setting was rejected with an error. The saved file holds four settings, so the other two have no saved numbers. The setting the product sends is Flash-Lite with the "low" thinking setting. That exact pairing is not one of the four rows. The live runs did use it. Case L01, a one-request page, took 1.7 seconds.

**What this means in plain words.** The faster model answered in about two seconds in these runs. The larger model was slower and sometimes took more than ten seconds. The choice is based on speed, and the answer quality was not formally scored.

## The quota probe

A free key allows only a limited number of requests. The quota probe found the limit for each model. It sent tiny requests one after another until the service refused one, up to 30 requests per model. The results are in quota-probe.json.

Table: Quota probe results (quota-probe.json)

| Model | Successful requests before the first refusal | What the service said |
|---|---|---|
| gemini-3.5-flash-lite | 16 | HTTP 429, a free-tier limit of 15 requests, retry in about 50 seconds |
| gemini-2.5-flash-lite | 11 | HTTP 429, a free-tier limit of 10 requests, retry in about 33 seconds |
| gemini-2.5-flash | 6 | HTTP 429, a free-tier limit of 5 requests, retry in about 22 seconds |
| gemini-3.1-flash-lite | 3 | HTTP 503, "high demand", which is a busy signal and not a limit |

HTTP 429 means "too many requests". HTTP 503 means the service is busy. The probe counted one more success than the named limit for the first two models, 16 against 15 and 11 against 10. For the third model it counted 6 against 5. The probe does not explain this difference, so the table reports the numbers as printed. The error text names a limit but does not say over what period it applies.

The code deals with a used-up quota in a specific way. When the service asks for a wait longer than 25 seconds, the engine stops at once instead of retrying. The message then tells the user how long to wait.

Source: `midsem/project/src/engines/gemini.js`, lines 149 to 151.

```javascript
      if (response.status === 429 && waitSeconds !== null && waitSeconds > MAX_RETRY_WAIT_SECONDS) {
        throw new AppError(ERROR_CODES.QUOTA_EXHAUSTED, detail, { retryAfterSeconds: waitSeconds });
      }
```

**What this means in plain words.** A free key runs out after a handful of requests in one period. The code treats a long wait as an empty quota, stops at once, and tells the user to wait or to use another key.

## Screenshot gallery

These screenshots come from the test runs. The summary text in panel F is the mock's text, not Google's, and the seven-hour wait in panel J was set by the test.

### The popup in its states

![Three popup states: idle popup, Key box open with no key saved, and a key saved inside the popup](../screenshots/ui-states-1.png)

Panel A shows the idle popup with the page title and the Summarize button. Panel B shows the Key box that opens when no key is saved. Panel C shows the key saved inside the popup, with a Remove saved key link.

![Three popup states: progress on part 2 of 4, the service busy notice, and a finished summary](../screenshots/ui-states-2.png)

Panel D shows progress on part 2 of 4, with a progress bar. Panel E shows the busy notice that says the service will be tried again in 2 seconds, attempt 1 of 3. Panel F shows a finished summary with its stats line, which reads "4 parts · 5 requests · 2.1 s".

![Four popup refusals: too little text, a restricted page, a page too long for V1, and a used-up free quota](../screenshots/ui-states-3.png)

Panel G shows the too-little-text message. Panel H shows the restricted-page message for a Chrome page. Panel I shows the too-long message. Panel J shows the used-up quota message, with the Key box open so the user can paste another key.

### The Options page

![Options page with a key saved in this browser, a field to replace it, and a Remove saved key link](../screenshots/options-page.png)

The Options page shows that a key is saved in this browser. It also shows the field to replace the key and the link to remove it. The page says the key is stored only in this browser.

### Live cases

![Local copy of the long article used in case L02, shown as a normal web page](../screenshots/L02-page.png)

The page for case L02 is the long-article fixture, served from the test's own local server. The popup reads the text of this page, and the summary itself comes from the real service.

![Popup during case L02, showing progress on part 2 of 2](../screenshots/L02-progress.png)

Progress shows part 2 of 2 while the second part is being summarized.

![Popup with the finished L02 summary, showing the overview, numbered points and the stats line 2 parts, 3 requests, 5.7 s](../screenshots/L02-popup.png)

The finished L02 popup shows the overview, the numbered points and the stats line. The screenshot shows the first three of the five points.

![Popup with the finished L04 summary for the Wikipedia Lighthouse article, showing 5 parts, 6 requests and 17.6 s](../screenshots/L04-popup.png)

The L04 popup shows a real encyclopedia article summarized in five parts. The text is the model's output for that page.

![Popup for case L08 showing the message that the page is too long for Version 1 to summarize](../screenshots/L08-popup.png)

Case L08 was a long Wikipedia article with the part limit set to 10. The popup refused it with the too-long message, and no summary was requested.

## Questions this chapter answers

**How many tests are there, and do they pass?** Run 3, the latest, has 65 unit tests and 28 browser scenarios, and all of them passed. Run 2 had 60 and 26, all passing. Every run is written up in midsem/docs/test-runs.

**Why did four scenarios fail on the first run?** They tested behaviour that no earlier test covered. Each failure was a real defect (B1 to B4). Each was fixed, and the scenarios were run again.

**Why was this model chosen when answer quality was not compared?** The choice rests on measured speed and the free quota. The benchmark did not score the answers, and the report says so.

**Can the tests prove that the real service works?** Not on their own. The browser scenarios use a stand-in service. The live runs sent seven pages to the real service on one day, and tested one wrong key.

**What did you measure, and where is it recorded?** The measures are test counts, request counts, timings for each live case, benchmark timings, and the quota responses. Each one comes from a file in the test-runs folder or from the test output.
