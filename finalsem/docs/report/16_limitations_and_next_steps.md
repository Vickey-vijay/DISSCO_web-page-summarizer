# Limitations and next steps

This chapter lists what Version 2 does not yet do or show, and what to do next, in order of value. Each limit points to its source so that a reader can check it. Faults that have been fixed are not listed here; chapter 15 tells how each one was found and fixed.

## Not yet tested on the client's laptop or in a visible window

**The client's laptop.** The client's photos are in (`docs/CLIENT_LAPTOP.md`). The extension has still not been run on that laptop. No number in chapter 14 comes from it. Its Iris Xe graphics share the main memory and sit in a 15-watt processor, so its speed cannot be promised from the developer laptop's chip. The developer's target, about two minutes warm and about three with the first-answer warm-up, is not measured there.

**Shader support on the client's chip.** The photos do not show whether the Iris Xe chip offers the 16-bit shader feature. If it does not, the extension stops with `NO_SHADER_F16`, and the popup says so. The check has not been made.

**Runs in a visible window.** Every real run was made in hidden Chromium on the developer laptop. The advice on the speed question asked for a run in a visible window on mains power, timing three summaries in a row. That has not been done.

**The graphics switch on a real Chrome.** `setup.bat --gpu` and its undo command work as written and report a failure, but they have been tested only against a throw-away registry key (tests B10, B10b and B10c). On the client's laptop, which has one chip, the switch does nothing. Chapter 13 gives the commands.

**The visible browser.** All browser tests ran in hidden Chromium. In the test copy, the toolbar's `activeTab` grant is replaced by an extra host permission. The Load unpacked step in branded Chrome has not been run and recorded, and the V2 click-through checklist is not done (README).

### What this means in plain words

The client's facts are known, but the software has not been run on the client's laptop or in a visible window. Until it has, the speed and the first-run experience there are expectations.

## Speed and the whole page

- **The whole page takes 11 to 12 minutes on this chip.** The popup estimated 692 seconds to read all of the Lighthouse page with the default model. That estimate is a rough guess from measured speed. The old small model took 616 seconds for the whole text. The whole-page button is the only path that still takes ten minutes or more.
- **The shortened summary covers about a fifth of a long page.** On the Lighthouse page 5,968 of 27,964 characters were read, about 21 percent. The fixture article was read to about half. The opening and the first sentences of each paragraph are kept, so a fact that sits in the middle of a section can be missed.
- **Reading is the cost, and it is slow on this chip.** The model reads 15 to 40 tokens a second whatever its size, measured only on the developer laptop's Intel chip. The job statistics do not keep the reading speed of the default runs, so the speed of a real run cannot be read back from the records.
- **A different runtime has not been tried.** Transformers.js or ONNX Runtime Web was not tested. The advice was to try it only if the visible-window run is still slow, for half a day at most, and to switch only if reading is at least twice as fast.
- **First use is long.** The first use downloads about 695 MB, then loads and warms up the model. The warm-up on the first answer took about 28 to 37 seconds on this chip. The download time depends on the network, which the test did not control. In the offline runs on the same browser profile, the warm-up took about half a second. The cause of that difference is not measured.
- **Memory is not measured.** The loaded model stays in the offscreen page until it has been idle for five minutes (`idleCloseMs`). A code comment in `offscreen-manager.js` says that closing the page "frees about a gigabyte of graphics memory". No run file measures that, so the figure is [to be measured]. The 879 MB and 376 MB figures in `config.js` are WebLLM's list values, not measured use.
- **The dead-job rule stays at five minutes.** A running job is refreshed on each heartbeat, which the offscreen page sends every ten seconds while it works, so a long answer is not shown as dead.

### What this means in plain words

On this chip a long page is quick only when the reader accepts a shortened summary. The whole page takes about eleven to twelve minutes, and the speed of the client's chip is unknown until it is measured there.

## The Fast setting and output quality

The model is small, and its answers have faults that the code does not catch. The examples come from saved records, each a single run, so they are examples and not a rate.

- **The Fast setting gives poor summaries.** Quality: Fast uses SmolLM2 360M, which the setting itself says is often muddled or wrong. The Fast Lighthouse run of 26 October returned only the echoed safety sentence, a failed answer. That run was made before the fix, and after the fix such an answer is reported as empty. The reader has to choose Fast, so the default is not affected.
- **Copied wording.** The merge step can repeat the prompt's own wording. The under-load long summary repeated "These are summaries of consecutive parts of one web page", and the after-fix long summary still begins with the bullet "Page title provides a brief overview of the content within.", which gives no fact.
- **Factual slips and invented facts.** The under-load long summary gave "around 3000 BC" for the Pharos lighthouse, where the fixture says "the third century BC". The old-code second try on the Intel chip contains invented facts, dates and names, and its record's note points to one of them.
- **Generic answers.** The new-code Wikipedia summary of 24 October is three short points whose counts were not checked against the page.
- **Bullet counts.** The prompt asks for three to six bullets, and several saved summaries have more (chapter 14 gives the counts).
- **No formal rating.** The repository rates no summary for quality, so this report does not call the summaries good or poor. The model is meant for English only, and no other language is tested.

### What this means in plain words

The default answers are recorded as accurate, but they are checked only on three pages. The Fast choice is quicker and less reliable, and a reader must still check any fact against the page.

## Design gaps and unfinished behaviour

- **Closing a tab does not stop the download.** The pipeline passes an abort signal to the engine's `prepare()` step, but `prepare()` does not use it. A tab closed during the download therefore leaves the download running.
- **The smaller-model choice is never cleared.** After a memory error, the service worker writes `modelOverride: 'fallback'` to `chrome.storage.local`. No code clears it, so the switch to the smaller model stays until the stored settings are cleared. The popup has no control for it.
- **The model line is not refreshed during a download or warm-up.** It is refreshed when a job ends. A reader who watches a long first use does not see the line change until the job is over.
- **A load error that mentions "cache" counts as a download failure.** At the load stage, any error text containing "cache" is classified as `MODEL_DOWNLOAD_FAILED`, even when the cause is different.
- **Built-in graphics detection recognises Intel only.** A built-in chip from another maker would not get the graphics note.
- **The TIMEOUT path has no automated test.** The pretend model has no timeout. A unit test feeds a `TIMEOUT` reply into the engine, but no test triggers the timeout itself in the real engine.
- **The halving step has only been exercised by unit tests and the pretend model.** Scenario V25 uses the pretend model's `longprompt` mode. No real run has overflowed the window, and the 24 October Wikipedia run had `halvedParts` set to 0.
- **The under-8-GB rule has not been seen on real hardware.** A computer below 8 GB, as reported by `navigator.deviceMemory`, gets the small model. The rule has been tested with fake values only.
- **The dashboard fallback has no Version 2 browser test.** The extractor falls back to the rendered page text when Readability finds under 200 characters. The fixture `tests/fixtures/dashboard.html` exists, but no Version 2 browser test loads it.
- **The secret scan knows only the Version 1 key.** `scripts/secret-scan.mjs` looks for the old Gemini key through `tests/helpers/key.mjs`. It does not check for any key that Version 2 might use, and when it finds no key it exits without scanning any file.

### What this means in plain words

Some behaviour is unfinished. A tab closed during a download keeps the download running, a saved choice of the smaller model stays set until the stored data is cleared, and the model line does not change while a first use is in progress.

## Records and files to tidy

These are not faults in the product, but a reader who opens the files will meet them.

- `v2-local-nvidia-cold-second-attempt-with-load.md` repeats the numbers of `v2-local-nvidia.md`.
- The note in `v2-local-nvidia-offline-first-attempt-with-load.md` says that run was slower, but only its long article was slower. Its short article was faster.
- The note in `v2-local-intel-wikipedia.md` attributes an invented fact to the 24 October run. The invented facts are in the summary of the old-code second try, `v2-local-intel-wikipedia-second-try-old-code.json`. The note needs correcting.
- Figure V13 does not show the benchmark or the page-text script, and figure V14 does not list `condense.js` and `trim-text.js`. Both need redrawing for the 26 October files.
- The decision record quotes a writing speed for the separate card that mixes a saved figure with an earlier speed test. The earlier test's figure, about 63 tokens a second, has no saved file. This report uses the saved runs and labels the earlier figure.

### What this means in plain words

The files are correct in their numbers, but some notes, figures and script messages still describe the old default. A reader must read the notes as well as the tables.

## Questions this chapter answers

**What is the most important thing the tests have not shown?**
The extension has not been run on the client's laptop, and no number comes from it. The runs were in hidden Chromium on the developer laptop, so the speed on the client's chip is unknown.

**Can the summaries be trusted as facts?**
The default's summaries are recorded as accurate on three pages, but the other saved summaries show copied wording, a wrong date, invented facts and generic points. A reader must check the facts against the page.

**What happens if a tab is closed during the first download?**
The download keeps running in the background, because the engine's preparation step ignores the abort signal. Nothing shows its result to a reader, because the tab that asked for it has closed.

**What would change the plan first?**
The first run on the client's laptop. If the chip reads far slower than the developer's numbers, the runtime test becomes the next step. If the chip has no 16-bit shader support, the extension cannot run there at all.

## Next steps, in order of value

1. **Run the extension on the client's laptop.** Download the main model in advance, then time one summary of each of two pages with the default model, and record the model line, the first-use time and the stats line. This is the first action of the manual test plan (`docs/MANUAL_SMOKE_TEST.md`).
2. **Run the benchmark in a visible window on mains power.** Time three summaries in a row for the default. If reading stays near the developer laptop's 15.6 tokens a second or better, no other runtime is needed.
3. **Try a different runtime only if reading is still slow.** Test Transformers.js on one page for half a day at most, and switch only if reading is at least twice as fast.
4. **Run the manual click-through in the visible Chrome.** Cover Load unpacked, pinning, one summary, one offline summary with the network switched off, the notice after a memory failure, and the Settings choice. Keep the screenshots and the checklist results.
5. **Confirm the shader support on the client's laptop.** Check whether the chip offers the 16-bit shader feature before the first run.
6. **Reduce copied wording, invented facts and bullet overruns.** Remove repeated labels from the merge answer, keep the bullets within three to six, and have a reader rate a fixed set of pages against their text.
7. **Test the graphics switch on a real Chrome.** Use a spare browser profile, run `setup.bat --gpu`, check `chrome://gpu`, then undo the change with the plain `-Remove` command.
8. **Test halving on a real page that overflows the window.** Use a dense page that is known to exceed the window, and record `halvedParts` in the saved stats.
9. **Pass the abort signal into the download.** Stop the model download when the tab that asked for it has closed.
10. **Let the reader or the developer reset the smaller-model choice.** Show the saved choice in the popup, with a button that clears it.
11. **Measure memory and reading speed.** Record the memory held while the model is loaded and after the idle close, and store the reading speed in the run files.
12. **Test the timeout and the dashboard fallback, or remove the claims.** Add a test that triggers the timeout with a slow fake answer, and a browser test that loads `dashboard.html`.
13. **Fix the secret scan and the records.** Make the scan fail when it has nothing to scan for, check for key-like patterns, correct the note on the 24 October Wikipedia run, and redraw V13 and V14 for the 26 October files and scripts.

### What this means in plain words

The client's laptop comes first, because its numbers decide what the client will experience. The visible-window run and the shader check come next, since they decide whether the default is fast enough there.
