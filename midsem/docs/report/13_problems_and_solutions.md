# Problems and solutions

The project log, DEVLOG.md at the root of the repository, holds 14 entries, all dated 2026-10-20. Its rule is that nothing is recorded unless it actually happened. The sections below follow the log's order. M0 to M8 are the stages in the project plan, V1_PLAN.md.

## Run.bat cannot load the extension in Chrome 137 and later

**Date and area:** 2026-10-20, run.bat and testing (M0).

**Symptom.** The installed Google Chrome 155, started with a flag that loads a folder, showed no extension service worker within eight seconds. Playwright's Chromium 156 loaded the same extension at once.

**Root cause.** Chrome 137 removed the `--load-extension` flag from branded builds. Chromium still supports it. The check is `tests/e2e/chrome-flag-check.mjs`.

**What was done.** run.bat opens chrome://extensions and prints the Load unpacked steps. Automated tests run on Playwright's Chromium.

**What was learned.** Check what a browser flag does on the target machine before building around it.

**What this means in plain words.** The plan had listed this as a risk to confirm. The check confirmed it, so the script guides the user instead.

## Node could not find the unit test folder on Windows

**Date and area:** 2026-10-20, unit tests (M3 and M4).

**Symptom.** `node --test tests/unit` failed with "Cannot find module".

**Root cause.** On Windows, Node 22 treated the folder name as a file.

**What was done.** The npm scripts use a glob, a wildcard pattern that matches file names: `tests/unit/*.test.js`.

**What was learned.** Use a glob for test discovery on Windows.

**What this means in plain words.** The runner looked for a file named after the folder, so it could not find the tests.

## Four engine tests showed as cancelled

**Date and area:** 2026-10-20, Gemini engine tests (M4).

**Symptom.** After a timeout test, four tests showed as cancelled, and others failed with an empty-answer error.

**Root cause.** A timer from `AbortSignal.timeout()` does not keep Node's event loop, the list of pending work, alive, so the runner could exit early. The test helper also returned one response object several times, but a response body can be read only once.

**What was done.** The engine uses its own timer and an AbortController, the browser object that cancels a request. The fake fetch returns a fresh copy of the response each time.

**What was learned.** A flaky-looking test is often a harness fault. Check what the fake allows before changing the product.

**What this means in plain words.** The test fake reused one reply, and the runner stopped early. The fake was fixed.

## The default model was too slow

**Date and area:** 2026-10-20, cloud model choice (M4).

**Symptom.** gemini-3.8-flash took 9.4 seconds for a two-word prompt, and 11.4 to 12.6 seconds for a real summary. One request returned HTTP 503, "high demand".

**Root cause.** The model does hidden thinking first by default. The usage data showed about six times as much hidden thinking as visible answer. That was too close to the 25-second limit.

**What was done.** `scripts/model-bench.mjs` timed several settings, saved in model-bench.json. A "low" thinking setting cut a typical request to about 3.9 seconds, though one run in three still took 12.5. The lowest setting was rejected with HTTP 400. Flash-Lite took 1.6 to 2.0 seconds. The retry logic handles the 503.

**What was learned.** Measure speed on the real task before changing a model or a timeout. The answer quality of the faster models was not compared, which is a limitation.

**What this means in plain words.** The model thought too long before answering. A setting reduced the wait, and the default changed later, as the design-change entry below describes.

## setup.bat stopped with "116 was unexpected at this time"

**Date and area:** 2026-10-20, setup.bat (M7).

**Symptom.** The first real run stopped at step 2 with that message.

**Root cause.** The Chrome version was set and compared inside one parenthesised block, a group of commands wrapped in brackets. A batch file reads the whole block first, so the variable was still empty.

**What was done.** The checks moved into subroutines that use goto. Chapter 11 shows the routine.

**What was learned.** A variable set inside a block cannot be read again in that block. Run the script for real, because reading it looked fine.

**What this means in plain words.** The script used a value before it had been set.

## setup.bat failed after a scripted edit

**Date and area:** 2026-10-20, setup.bat (M7).

**Symptom.** setup.bat failed with "The system cannot find the batch label specified - check_chrome_version". A label is a named place a batch file can jump to.

**Root cause.** A text search for `:find_chrome` matched the call line in the main flow first. The new subroutine was pasted into the middle of a line.

**What was done.** The whole file was rewritten with Windows line endings (CRLF). The batch test script caught the fault at once.

**What was learned.** Do not patch batch files by searching for text. Rewrite them whole.

**What this means in plain words.** An automatic edit put code in the wrong place.

## The test script could not find run.bat, then hung

**Date and area:** 2026-10-20, bat tests (M7).

**Symptom.** The test reported that run.bat was "not recognized", although the file was in the folder. Later a test hung.

**Root cause.** The Windows command prompt does not search the current folder unless the name starts with `.\`. The hang came from a fake Chrome window that never closed.

**What was done.** The tests call `.\setup.bat` and `.\run.bat`, and the fake Chrome file ends with `exit`.

**What was learned.** A test harness must clean up the processes it starts. The clipboard step is not tested, because the test must not touch the user's clipboard.

**What this means in plain words.** Windows looked in the wrong place, and a test window was left open.

## Popup ignored a second Summarize (T19, bug B1)

**Date and area:** 2026-10-20, popup and service worker (M8, bug B1).

**Symptom.** The tab moved to another page mid-summary. Pressing Summarize did nothing, and the popup stayed blank.

**Root cause.** The service worker, the extension's background part, allowed one job per tab and replied "already running". The popup ignored that reply and hid the running job.

**What was done.** Each job has an id. A job for a changed page is stopped and replaced, and its late writes are dropped. The popup shows the current job or an error.

**What was learned.** Every refusal must reach the user. A silent "no" looks like a broken button.

**What this means in plain words.** The button was refused quietly, and the popup hid the job that refused it.

## Popup kept showing "Summarizing" (T20, bug B2)

**Date and area:** 2026-10-20, popup (M8, bug B2).

**Symptom.** With the popup open, a job whose worker had died kept showing "Summarizing..." past three minutes.

**Root cause.** The popup checked for stale jobs only on open and on storage changes. A dead worker writes nothing.

**What was done.** The popup redraws its last job every five seconds.

**What was learned.** A timeout checked only on events never fires once the events stop.

**What this means in plain words.** The popup waited for news that never came. Now it checks by itself.

## Table cells ran together (T21, bug B3)

**Date and area:** 2026-10-20, extractor (M8, bug B3).

**Symptom.** The model received "QuarterRevenueMargin" and "Q14.5M12%". The summary still looked normal.

**Root cause.** The text reader treated table rows as blocks but not their cells. Minified pages, with spaces removed, had no gap between cells.

**What was done.** A cell after another cell in its row now gets " | " before it, and each row is one line. The first fix made every row a paragraph, which T21 also caught.

Source: `midsem/project/src/content/extract.js`, line 38.

```javascript
      if (CELL_TAGS.has(tag) && node.previousElementSibling) out.push(' | ');
```

**What was learned.** Silent corruption is worse than a visible error. Test with the markup real sites produce.

**What this means in plain words.** The gaps between cells were lost, so numbers ran together.

## A closed tab's job record stayed behind (T22, bug B4)

**Date and area:** 2026-10-20, service worker (M8, bug B4).

**Symptom.** After a tab closed mid-job, a record with the full summary stayed in `chrome.storage.session`, Chrome's temporary storage for an extension.

**Root cause.** The close handler deleted the record, but the job kept running, and its queued writes created it again.

**What was done.** Closed tabs are remembered and their jobs stopped. A write applies only if the stored record still belongs to that job.

**What was learned.** A cleanup cannot win against work that is still running. Stop the work too.

**What this means in plain words.** The cleanup ran first, then the unfinished job wrote the record back.

## Review of the test notes found three missing guards

**Date and area:** 2026-10-20, review of test findings (M8).

**Symptom.** The review listed three risks with no failing test: no limit on parts per page, a possible double start, and every 403 reported as a rejected key.

**Root cause.** Missing guards, not defects that had been seen.

**What was done.** A 30-part limit (error TOO_LONG, test T23), a per-tab start lock, and a location-related 403 treated as a service problem.

**What was learned.** A free key makes one huge page a real cost risk, so a limit is part of error handling.

**What this means in plain words.** Three things could go wrong without any test failing, and each now has a guard.

## The design changed after the owner's feedback

**Date and area:** 2026-10-20, design change after owner feedback (M8).

**Symptom.** The owner watched a test run and asked for four changes: a popup rather than a new tab, a simpler V1, an interface that did not look AI-made, and hidden tests that use cheap models.

**Root cause.** The test harness opened the popup as a browser tab, and Options opened as a tab, so the product seemed to open tabs. The first interface used a common blue look.

**What was done.** The key can be pasted inside the popup. The harness opens a small popup window. The interface was redrawn in a printed-page style. Browser tests run hidden unless HEADED=1 is set. The default model became gemini-3.5-flash-lite.

**What was learned.** The harness showed something the product does not do. The harness was fixed to show the truth.

**What this means in plain words.** The test view did not match the real product, so it was changed to match.

## A prompt test matched the wrong marker

**Date and area:** 2026-10-20, prompt tests (M4).

**Symptom.** A prompt test reported that the page text came before the "start" marker.

**Root cause.** The instruction line also names both markers. The test used `indexOf`, which finds the first mention.

**What was done.** The test uses `lastIndexOf`. The prompt was not changed.

**What was learned.** A marker repeated in the instructions makes a position check ambiguous.

**What this means in plain words.** The check read the wrong mention of the marker. The prompt was fine.

## Questions this chapter answers

**Which problem changed the design the most?** The owner's feedback changed the interface and the test view. The Chrome 137 finding changed how run.bat works.

**Who found the problems, the product or the tests?** The browser tests found four silent faults in the product (T19 to T22). Several other entries were faults in the test harness.

**Why do three entries concern batch files?** A batch file reads a whole block before running it, and cmd does not search the current folder. Entries 5 and 7 come from those facts. Entry 6 came from a text-based edit.

**Were the product bugs visible to the user?** No. All four browser bugs failed silently, with a blank popup, a stuck progress display, corrupted text, or a stale record.
