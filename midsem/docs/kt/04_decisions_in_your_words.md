# The big decisions, in your own words

Each decision below follows the same five parts. The first part says what was decided. The second gives the reason. The third lists what else was considered. The fourth states the trade-off you accept. The last part is one sentence you can say in your own words at the viva. Learn the last sentence for each decision, then say it aloud without the notes.

Where a number matters, it comes from a file in `docs/test-runs`, from `DEVLOG.md`, or from the code. The repository does not record quality scores for the summaries, so any claim about summary quality is marked as not measured.

## 1. A popup, not a new tab

**What was decided.** The summary opens in the popup that appears when you click the toolbar icon. The Gemini key can be typed into that popup, so the user does not have to open another page.

**Why.** The project owner asked that the extension should not open tabs. The DEVLOG entry dated 20 October 2026 records this design change. The popup is part of the browser window, so it does not take over a tab.

**What else was considered.** A full extension page in a new tab, and a side panel. The DEVLOG entry says the owner accepted a popup or a side panel. The code uses the popup.

**The trade-off.** A popup closes when you click elsewhere. The work therefore runs in the service worker, and the popup only shows it (decision 4). The Options page still opens a tab when you choose it, so the rule "no new tab" has one exception.

**What you can say.** "The popup is the only window the user sees. The work runs in the background, so closing the popup does not lose the summary."

## 2. JavaScript, not TypeScript

**What was decided.** The code is plain JavaScript with ES modules. Types are written in comments (JSDoc).

**Why.** The V1 plan says the client should not need a build step. Plain JavaScript runs in Chrome as it is, so `setup.bat` stays simple and no compiler can break.

**What else was considered.** TypeScript, which adds a compile step and type checks before the code runs.

**The trade-off.** Nothing checks the types at build time. The unit tests and the JSDoc comments carry that load. A type error would show up in a test, not in an editor.

**What you can say.** "The project uses plain JavaScript, so it runs with no build step. The cost is that the tests catch type mistakes, not a compiler."

## 3. Readability for the page text

**What was decided.** The main text of the page is found with Mozilla's Readability library, which is copied into the project as one file. If the result is too short, the reader uses the visible text of the page.

**Why.** Readability is built to remove menus, adverts and footers. The V1 plan says the library is the one behind Firefox's Reader View. It is licensed under Apache-2.0, and the licence file is in `src/lib`.

**What else was considered.** Hand-written rules to find the article, and the visible text of the whole page. The whole-page text includes menus, so it was the fallback only.

**The trade-off.** Readability is written for articles. On a dashboard page it found too little text, so the fallback is used (test T13). Its first output also joined table cells together. Test T21 caught this, and the reader now puts a separator between cells (DEVLOG entry, bug B3).

**What you can say.** "Readability finds the article in the page, and the project has a fallback for pages that are not articles. Both were tested on fixture pages."

## 4. The service worker owns the job

**What was decided.** The service worker starts the job, runs the pipeline and writes progress and the result to session storage. The popup only sends the start message and reads the record.

**Why.** A popup closes when you click away. A job that ran in the popup would stop with it. The V1 plan records this reasoning, and test T11 checks that a reopened popup shows the same job and the summary arrives.

**What else was considered.** Running the job inside the popup. That was rejected for the reason above.

**The trade-off.** Chrome may stop an idle service worker. The plan hoped that the frequent storage writes keep it awake, and it marked that as a point to verify. The repository has no separate measurement of this. When the worker stops, the job is marked INTERRUPTED (test T18), and the user presses Summarize again.

**What you can say.** "The service worker keeps the job alive, so closing the popup does not lose the summary. If Chrome stops the worker, the job says so and the user can start again."

## 5. A plain HTTPS call, with no SDK

**What was decided.** The Gemini engine calls Google's REST address with `fetch`, Chrome's built-in way to make web requests. It does not use Google's client library.

**Why.** The V1 plan says the official client library needs a bundler and adds weight. One endpoint is simple to copy into a test. The unit tests replace `fetch` with a fake and check each error code.

**What else was considered.** Google's official JavaScript library.

**The trade-off.** The project writes its own error mapping, retry rules and timeout. That is more code to check. The 18 unit tests in `gemini.test.js` cover these rules, and one bug was found and fixed in the timeout code (DEVLOG entry on the Gemini engine tests).

**What you can say.** "The project calls the REST address directly with `fetch`. That keeps the build simple and makes the requests easy to fake in tests. The cost is that the error handling is written by hand."

## 6. The key is kept on this computer

**What was decided.** The key is saved in `chrome.storage.local`, which is storage on this computer. It is sent to Google only, in a request header, never in the address.

**Why.** Storage in `sync` would copy the key to the user's Google account, which the V1 plan rejects. The header keeps the key out of web addresses, which may be logged.

**What else was considered.** Storage in `sync`, and asking for the key on every request.

**The trade-off.** Chrome stores the key unencrypted on this computer. Anyone who can read the Chrome profile can read it. The plan states this limit in the report. The repository also has `scripts/secret-scan.mjs`, which checks the project files for the key before a push.

**What you can say.** "The key stays on this computer, goes only to Google in a header, and is stored unencrypted. That is a real limit, and the project states it."

## 7. The model was chosen by measurement

**What was decided.** The model is `gemini-3.5-flash-lite`, with the thinking setting at low.

**Why.** The choice came from measurements in two steps. The benchmark first favoured keeping `gemini-3.8-flash` with the thinking setting low (DEVLOG entry on the model choice). Then the first live run hit the daily limit of 20 requests for the bigger model, and the default moved to the faster one (`config.js`, lines 4 to 7, records this).

Benchmark: three runs of each candidate, the same input of 6,952 characters (`docs/test-runs/model-bench.json`).

| Candidate | Request time in seconds (three runs) | Note |
|---|---|---|
| gemini-3.8-flash, default thinking | 11.4, 12.3, 12.6 | Too slow for several parts |
| gemini-3.8-flash, thinking low | 3.9, 3.9, 12.5 | Fast in two runs of three |
| gemini-3.5-flash-lite, default | 2.0, 1.6, 1.6 | Chosen |
| gemini-2.5-flash, thinking budget 0 | 2.4, 2.7, 2.4 | Fast alternative |

Quota probe: requests were sent one after another until Google sent HTTP 429 (`docs/test-runs/quota-probe.json`).

| Model | Successful requests before the first limit | Limit named in the message |
|---|---|---|
| gemini-3.5-flash-lite | 16 | 15 |
| gemini-2.5-flash-lite | 11 | 10 |
| gemini-2.5-flash | 6 | 5 |
| gemini-3.1-flash-lite | 3, then HTTP 503 "high demand" | None |

The probe got 16 successful answers before the first limit message, but the message names 15. The repository does not explain the difference, so say that it is not explained. The partial live run with `gemini-3.8-flash` also hit rate limits on four of its seven pages (`live-measurements-partial.md`).

**What else was considered.** Other Gemini models and the NVIDIA cloud service. The NVIDIA option was in the plan and was not built.

**The trade-off.** The benchmark measured speed and length only. Summary quality of the faster models was not compared, and the DEVLOG records this as a limitation. Free-tier limits can change at Google's side.

**What you can say.** "The project measured speed and the free-tier limit for each model. The chosen model was the fastest candidate, and it had the highest request limit in the quota probe. Its summaries were not compared for quality, and the project says so."

## 8. The splitting rule

**What was decided.** A part holds at most 8,000 characters. The cutting order is paragraphs first, then sentences, then spaces, and a hard cut only for a word with no space. A page that needs more than 30 parts is refused.

**Why.** Cutting at natural breaks keeps the sense of each part. The 30-part limit protects the free quota: `config.js` says 30 parts of 8,000 characters is about 240,000 characters. The limit was added after the first browser run.

**What else was considered.** Cutting every fixed number of characters, which can split a word or a sentence. Sending the whole page in one request, which the plan notes a large cloud model could often take.

**The trade-off.** Characters are not the same as meaning. The live runs show the path works: a 10,532-character article gave 2 parts and 3 requests at the default size, and 4 parts and 5 requests at 3,000 characters. The repository does not show that the default size gives better summaries than another size. Also, a page over 30 parts is refused, so the user has to try a shorter page.

**What you can say.** "The text is cut at paragraph and sentence breaks, and a page longer than 30 parts is refused so the free quota is not used up."

## 9. The printed-page look

**What was decided.** The popup and options page use a plain, printed-page style: a paper-coloured background, one ink colour, one red accent, a serif font for the summary, and numbered points.

**Why.** The owner said the first design looked AI-made. The DEVLOG entry on the design change records the redraw. The stylesheet `src/ui/ui.css` holds the colours: paper `#fbf8f1`, ink `#1c1b1a`, accent `#b4391f`, and a Georgia serif for the summary.

**What else was considered.** The blue, rounded-card style that was the first version.

**The trade-off.** The repository holds no usability test or user survey of the design. The look was judged through the owner's feedback, as the DEVLOG records. Say that the choice was a judgement, not a measured result.

**What you can say.** "The interface was redrawn after the owner's feedback. It is a printed-page style with one accent colour. No usability study was run."

## 10. Setup scripts, not an installer

**What was decided.** Setup and run are two batch files, `setup.bat` and `run.bat`. Setup checks Chrome, the version and the files. Run opens the extensions page and prints the four steps.

**Why.** The client should be able to install the extension without a build tool. A batch file runs on any Windows computer and prints plain messages for each failure. The V1 plan records the design (section 11).

**What else was considered.** A packaged installer, and an npm build step.

**The trade-off.** The user still does four manual steps in Chrome. An installer could do more, but the project has not built one, so the user still does these steps by hand.

**What you can say.** "The setup script checks the computer and the files and says in plain words what to fix. The user still loads the folder in Chrome by hand."

## 11. The Chrome flag, and why automated tests use another browser

**What was decided.** The automated browser tests run in Playwright's bundled Chromium with the extension loaded by a command-line flag. The real install path, which is Load unpacked in branded Chrome, is checked by hand.

**Why.** The DEVLOG's first entry records the test. On Chrome 155 the flag `--load-extension` did not load the extension. On Playwright's Chromium 156 it did. The Chromium team removed that flag from branded Chrome in version 137. The check script is `tests/e2e/chrome-flag-check.mjs`.

**What else was considered.** Driving the user's own Chrome through Chrome's tools, which needs manual loading and is hard to script.

**The trade-off.** The automated tests do not prove the install path in branded Chrome. The manual test in `docs/MANUAL_SMOKE_TEST.md` covers that, and its results are not yet recorded.

**What you can say.** "The automated tests use Playwright's Chromium, because branded Chrome no longer loads an extension from a flag. The real Chrome install is a manual step, and its result is not yet recorded."

## What this means in plain words

The decisions were made for four reasons: simple setup, a result the user can see, cost limits on the free service, and honest measurements. Each decision has a cost. Learn the cost as well as the choice, because a tutor often asks about the cost first.
