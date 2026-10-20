# Problems and solutions

The project log, DEVLOG.md at the root of the repository, holds 14 entries, and every entry is dated 2026-10-20. The log's rule is that nothing is recorded unless it actually happened. The sections below follow the log's order. Each gives the symptom, the root cause, what was done, and what was learned. M0 to M8 are the stages in the project plan, V1_PLAN.md.

## Run.bat cannot load the extension in Chrome 137 and later

**Date and area:** 2026-10-20, run.bat and testing (M0).

**Symptom.** The installed Google Chrome 155, started with a flag that loads a folder, showed no extension service worker within eight seconds. Playwright's bundled Chromium 156 loaded the same extension at once.

**Root cause.** Chrome 137 removed the `--load-extension` flag from branded builds. Chromium still supports it. The log cites the Chromium team's April 2025 announcement. The check is `tests/e2e/chrome-flag-check.mjs`.

**What was done.** run.bat opens chrome://extensions and prints the Load unpacked steps. Automated tests run on Playwright's Chromium.

**What was learned.** Check what a browser flag does on the target machine before building around it. Tests on Chromium do not prove the install path in branded Chrome.

**What this means in plain words.** The plan had listed this as a risk to confirm, and the check confirmed it. The script now guides the user instead of loading the extension.

## Node could not find the unit test folder on Windows

**Date and area:** 2026-10-20, unit tests (M3 and M4).

**Symptom.** `node --test tests/unit` failed with "Cannot find module".

**Root cause.** On Windows, Node 22 treated the folder name as a file to load.

**What was done.** The npm scripts use a glob, a wildcard pattern that matches file names: `tests/unit/*.test.js`.

**What was learned.** Use a glob for test discovery on Windows.

**What this means in plain words.** The runner treated the folder as a file, so it could not find the tests.

## Four engine tests showed as cancelled

**Date and area:** 2026-10-20, Gemini engine tests (M4).

**Symptom.** After a timeout test, four tests showed as cancelled, and several others failed with an empty-answer error.

**Root cause.** There were two faults. A timer from `AbortSignal.timeout()` does not keep Node's event loop alive, so the runner could exit early. The event loop is the list of work Node is still waiting for. The test helper also returned one response object several times, but a response body can be read only once.

**What was done.** The engine uses its own timer and an AbortController, the browser object that cancels a request. The timer is cleared in a finally block, which always runs. The fake fetch returns a copy of the response each time.

**What was learned.** A flaky-looking test is often a fault in the harness. Check what the fake allows before changing the product. The engine change was still worth keeping.

**What this means in plain words.** The test fake reused one reply, and the runner stopped early. The fake was fixed, and the engine's timer was tidied.

## The default model was too slow

**Date and area:** 2026-10-20, cloud model choice (M4).

**Symptom.** gemini-3.8-flash answered a two-word prompt in 9.4 seconds. A real summary request of about 7,000 characters took 11.4 to 12.6 seconds, and one request returned HTTP 503, "high demand".

**Root cause.** By default the model does hidden thinking before it answers. The usage data showed about six times as much hidden thinking as visible answer. With a 25-second limit and several parts per page, the time was too close to the limit.

**What was done.** `scripts/model-bench.mjs` timed several settings, and the results are in model-bench.json. A "low" thinking setting cut a typical request to about 3.9 seconds, though one run in three still took 12.5 seconds. The lowest setting was rejected with HTTP 400. Flash-Lite took 1.6 to 2.0 seconds. The 503 is handled by the retry logic.

**What was learned.** Measure speed on the real task before changing a model or a timeout. A request setting was the cheapest speed-up. The answer quality of the faster models was not compared, which is a limitation.

**What this means in plain words.** The model thought for too long before answering. A setting reduced the wait, and the default model changed later, as the design-change entry below describes.

## setup.bat stopped with "116 was unexpected at this time"

**Date and area:** 2026-10-20, setup.bat (M7).

**Symptom.** The first real run of setup.bat stopped at step 2 with that message.

**Root cause.** The Chrome major version was set and compared inside one parenthesised block, a group of commands wrapped in brackets. A batch file reads the whole block first. So the variable was still empty when the comparison was read, and the line was invalid.

**What was done.** The checks moved into subroutines that use goto to jump between them. Chapter 11 shows the routine.

**What was learned.** A variable set inside a block cannot be read again in that same block. Run the script for real, because reading it looked fine.

**What this means in plain words.** The script used a value before it had been set.

## setup.bat failed after a scripted edit

**Date and area:** 2026-10-20, setup.bat (M7).

**Symptom.** setup.bat failed with "The system cannot find the batch label specified - check_chrome_version". A label is a named place that a batch file can jump to.

**Root cause.** The edit searched for the text `:find_chrome` to insert a subroutine. The first match was the call line in the main flow, so the subroutine was pasted into the middle of a line.

**What was done.** The whole file was rewritten and saved with Windows line endings, called CRLF. The batch test script caught the fault at once.

**What was learned.** Do not patch batch files by searching for text. Rewrite the whole file and list its labels afterwards.

**What this means in plain words.** An automatic edit put code in the wrong place, so the file was rewritten.

## The test script could not find run.bat, then hung

**Date and area:** 2026-10-20, bat tests (M7).

**Symptom.** The test reported that run.bat was "not recognized as an internal or external command", although the file was in the folder. Later a test hung.

**Root cause.** The Windows command prompt, called cmd, does not search the current folder unless the name starts with `.\`. The hang came from the fake Chrome file, which was opened in a cmd window that never closed.

**What was done.** The tests call `.\setup.bat` and `.\run.bat`. The fake Chrome file ends with `exit`.

**What was learned.** A test harness must clean up the processes it starts. The clipboard step is not tested automatically, because the test must not read or overwrite the user's clipboard.

**What this means in plain words.** Windows did not look where the test expected, and a test window was left open.

## Popup ignored a second Summarize (T19, bug B1)

**Date and area:** 2026-10-20, popup and service worker (M8, bug B1).

**Symptom.** The tab moved to another page while a summary was running. Pressing Summarize on the new page did nothing, and the popup stayed blank (test T19).

**Root cause.** The service worker, which is the extension's background part, allowed one job per tab and replied "already running". The popup ignored that reply. It also hid any job whose address differed from the page.

**What was done.** Each job now has an id. If the tab moved to another page, the old job is stopped and replaced, and its late writes are dropped. The popup reads the reply and shows the current job or an error.

**What was learned.** Every refusal must reach the user. A silent "no" looks like a broken button.

**What this means in plain words.** The button was refused quietly, and the popup hid the job that refused it.

## Popup kept showing "Summarizing" (T20, bug B2)

**Date and area:** 2026-10-20, popup (M8, bug B2).

**Symptom.** With the popup open, a job whose service worker had died kept showing "Summarizing..." and a disabled button.

**Root cause.** The popup checked whether a job was stale only when it opened and when stored data changed. A dead worker writes nothing, so nothing triggered the check.

**What was done.** The popup redraws its last job every five seconds. A job older than three minutes now shows as interrupted.

**What was learned.** A timeout that is checked only on events never fires once the thing it guards stops sending events.

**What this means in plain words.** The popup waited for news that never came. Now it checks by itself.

## Table cells ran together (T21, bug B3)

**Date and area:** 2026-10-20, extractor (M8, bug B3).

**Symptom.** The model received "QuarterRevenueMargin" and "Q14.5M12%". The summary still looked normal.

**Root cause.** The text reader treated table rows as blocks but not their cells. Minified pages, which have their spaces removed, had no gap between cells.

**What was done.** A cell that follows another cell in its row now gets " | " before it, and each row is one line. The first fix made every row a separate paragraph, and test T21 caught that too.

Source: `midsem/project/src/content/extract.js`, line 38.

```javascript
      if (CELL_TAGS.has(tag) && node.previousElementSibling) out.push(' | ');
```

**What was learned.** Silent corruption is worse than a visible error. Test with the markup that real sites produce.

**What this means in plain words.** The gaps between cells were lost, so the numbers ran together.

## A closed tab's job record stayed behind (T22, bug B4)

**Date and area:** 2026-10-20, service worker (M8, bug B4).

**Symptom.** After a tab closed mid-job, a record with the full summary stayed in `chrome.storage.session`, which is Chrome's temporary storage for an extension.

**Root cause.** The handler that runs on tab close deleted the record. But the job kept running, and its queued writes created the record again.

**What was done.** Closed tabs are now remembered, and their jobs are stopped. A write is applied only if the stored record still belongs to the job writing it.

**What was learned.** A cleanup handler cannot win against work that is still running. Stop the work as well.

**What this means in plain words.** The cleanup ran first, then the unfinished job wrote the record back.

## Review of the test notes found three missing guards

**Date and area:** 2026-10-20, review of test findings (M8).

**Symptom.** The notes from the test review listed three risks that had no failing test. There was no limit on how many parts one page could need. Two popups clicked at once might start a double job. Every HTTP 403 was reported as a rejected key.

**Root cause.** These were missing guards, not defects that had been seen.

**What was done.** A page-length limit was added, with a default of 30 parts, the error code TOO_LONG, and test T23. A per-tab start lock was added. A 403 about the caller's location is treated as a service problem. The options page Save button no longer squeezes the key field.

**What was learned.** A free key makes one huge page a real cost risk, so the limit is part of error handling, not an extra feature.

**What this means in plain words.** Three things could go wrong without any test failing. Each now has a guard.

## The design changed after the owner's feedback

**Date and area:** 2026-10-20, design change after owner feedback (M8).

**Symptom.** The owner watched a test run and asked for four changes. The extension should open in a popup or side panel, not a new tab. V1 should stay simple. The interface looked as if an AI had made it. Tests should be hidden and use cheap models.

**Root cause.** The test harness opened the popup as a browser tab, because a test cannot click the toolbar icon. The Options page also opened as a tab. So the product seemed to open tabs. The first interface used a common blue, rounded-card look.

**What was done.** The key can be pasted inside the popup. The harness opens the popup as a small popup window. The interface and icon were redrawn in a printed-page style, with one red accent and numbered points. Browser tests run hidden unless HEADED=1 is set. The default model became gemini-3.5-flash-lite, which the log calls the cheap model.

**What was learned.** Watching the test exposed a mismatch. The harness showed something the product does not do, so the harness was fixed to show the truth.

**What this means in plain words.** The test view did not match the real product, so it was changed to match.

## A prompt test matched the wrong marker

**Date and area:** 2026-10-20, prompt tests (M4).

**Symptom.** A prompt test reported that the page text came before the "start" marker.

**Root cause.** The instruction line also names both markers. The test used `indexOf`, which finds the first mention, and that was in the instructions.

**What was done.** The test uses `lastIndexOf`, which finds the last mention. The prompt itself was not changed.

**What was learned.** A marker repeated inside the instructions makes a position check ambiguous.

**What this means in plain words.** The check looked at the wrong mention of the marker. The prompt was fine.

## Questions this chapter answers

**Which problem changed the design the most?** The owner's feedback changed the interface and the test view. The Chrome 137 finding changed how run.bat works. Both are recorded in the log.

**Who found the problems, the product or the tests?** The browser tests found four silent faults in the product (T19 to T22). The test review found three missing guards. Several entries were faults in the test harness itself.

**Why do three entries concern batch files?** A batch file reads a whole block before running it, and the Windows command prompt does not search the current folder for commands. Entries 5 and 7 come from those facts. Entry 6 came from a text-based edit that put code in the wrong place.

**Were the product bugs visible to the user?** No. All four browser bugs failed silently: a blank popup, a stuck progress display, corrupted text, and a stale record. Each fix made the popup answer every press, re-check open jobs, stop work for closed tabs, or separate table cells.
