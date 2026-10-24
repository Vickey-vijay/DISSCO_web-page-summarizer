# Limitations and next steps

This chapter lists what Version 2 does not yet do or show, and what to do next, in order of value. Each limit points to its source so that a reader can check it. Faults that have been fixed are not listed here; chapter 15 tells how each one was found and fixed.

## Not yet tested on real hardware or in the visible browser

**The client's laptop.** The client's graphics chip, memory and free disk space were requested, and the answer has not come back (README). Every real-model number in chapter 14 comes from the developer's laptop, which has an NVIDIA RTX 3050 and a built-in Intel chip. The client's speed, model choice and disk margin are therefore [to be measured].

**The graphics switch on a real Chrome.** `setup.bat --gpu` and its undo command now work as written and report a failure, but they have been tested only against a throw-away registry key (tests B10, B10b and B10c). They have not been tried on the client's Chrome setting. Chapter 13 gives the commands.

**The visible browser.** All browser tests ran in hidden Chromium. In the test copy, the toolbar's `activeTab` grant is replaced by an extra host permission. The Load unpacked step in branded Chrome has not been run and recorded, and the V2 click-through checklist is not done (README).

**The short Intel article with the current code.** The copied markers are removed from every answer in the code, and the short Intel run that showed them was made before that change. The Wikipedia run made with the current code has no markers in its saved summary, but a short-article run on the Intel chip with the current code has not been recorded.

### What this means in plain words

The tests show that the software works in a test browser on one laptop. They do not yet show the client's install, the graphics switch, a short Intel summary with the current code, or the extension in the normal browser window.

## Output quality

The model is small, and its answers have faults that the code does not catch. The examples come from saved records, each a single run, so they are examples and not a rate.

- **Copied wording.** The merge step can repeat the prompt's own wording. The under-load long summary repeated "These are summaries of consecutive parts of one web page", and the after-fix long summary still begins with the bullet "Page title provides a brief overview of the content within.", which gives no fact.
- **Factual slips and invented facts.** The under-load long summary gave "around 3000 BC" for the Pharos lighthouse, where the fixture says "the third century BC". The old-code second try on the Intel chip contains invented facts, dates and names, and its record's note points to one of them.
- **Generic answers.** The new-code Wikipedia summary is three short points whose counts (a list of 14,700 lighthouses, 54 diagrams and 651 photographs) were not checked against the page.
- **Bullet counts.** The prompt asks for three to six bullets, and several saved summaries have more (chapter 14 gives the counts).
- **No formal rating.** The repository rates no summary for quality, so this report does not call the summaries good or poor. The model is meant for English only, and no other language is tested.

### What this means in plain words

The model can repeat the prompt, give a wrong date, invent a fact, or write generic points. A reader must check the page before trusting a fact in a summary.

## Speed, memory and first use

- **The built-in chip is slow.** The small model wrote 4 to 5 tokens a second. The short article took 199.2 seconds on first use, and the two-part article took 149.1 seconds. The earlier speed test gives about 2 tokens a second for the larger model. No saved run measures a short answer on this chip with the model already stored.
- **A long page takes 10 to 12 minutes on the Intel chip.** The 7-part Lighthouse article with SmolLM2 took 616.4 seconds with the current code, and 704.5 seconds with the old code. The answer limit was raised to 10 minutes for this reason, and the job record is refreshed during each answer so that the five-minute dead-job rule does not fire.
- **First use is long.** The download took about 81 seconds for the small model on the Intel chip, and about 138 to 158 seconds for the larger model on the NVIDIA chip. The download time depends on the network, which the test did not control. The warm-up took 30 to 56 seconds, and the cause of the difference between runs is not measured. In the offline runs on the same browser profile, the warm-up took about half a second, so the first-use warm-up is the one that is slow. The popup reads the main model's size from its file list, about 695 MB in the real runs.
- **Memory is not measured.** The loaded model stays in the offscreen page until it has been idle for five minutes (`idleCloseMs`). A code comment in `offscreen-manager.js` says that closing the page "frees about a gigabyte of graphics memory". No run file measures that, so the figure is [to be measured]. The 879 MB and 376 MB figures in `config.js` are WebLLM's list values, not measured use.
- **The reading speed is not stored.** The development log records about 600 tokens a second for reading the prompt, from an earlier speed test. The saved runs do not keep that figure, so no saved run measures it.
- **After an idle close, the next use reloads.** The clean offline run loaded the stored model in 6.9 seconds, and the run after the label fix took 11.6 seconds.

### What this means in plain words

On the NVIDIA chip the first use takes minutes and later uses take seconds. On the built-in chip every use takes minutes, and a long page takes ten to twelve. The memory held while the model is loaded has not been measured.

## Design gaps and unfinished behaviour

- **Closing a tab does not stop the download.** The pipeline passes an abort signal to the engine's `prepare()` step, but `prepare()` does not use it. A tab closed during the download therefore leaves the download running.
- **The smaller-model choice is never cleared.** After a memory error, the service worker writes `modelOverride: 'fallback'` to `chrome.storage.local`. No code clears it, so the switch to the smaller model is permanent until the stored settings are cleared. The popup has no control for it.
- **The model line is not refreshed during a download or warm-up.** It is refreshed when a job ends. A reader who watches a long first use does not see the line change until the job is over.
- **A load error that mentions "cache" counts as a download failure.** At the load stage, any error text containing "cache" is classified as `MODEL_DOWNLOAD_FAILED`, even when the cause is different.
- **Built-in graphics detection recognises Intel only.** A built-in chip from another maker would not get the small model or the note.
- **The TIMEOUT path has no automated test.** The pretend model has no timeout. A unit test feeds a `TIMEOUT` reply into the engine, but no test triggers the timeout itself in the real engine.
- **The halving step has only been exercised by unit tests and the pretend model.** Scenario V25 uses the pretend model's `longprompt` mode. No real run has overflowed the window: the new-code Wikipedia run had `halvedParts` set to 0, and whether a part overflows depends on the page text of the day.
- **The under-8-GB rule has not been seen on real hardware.** A computer below 8 GB, as reported by `navigator.deviceMemory`, gets the small model. The rule has been tested with fake values only.
- **The dashboard fallback has no Version 2 browser test.** The extractor falls back to the rendered page text when Readability finds under 200 characters. The fixture `tests/fixtures/dashboard.html` exists, but no Version 2 browser test loads it.
- **The secret scan knows only the Version 1 key.** `scripts/secret-scan.mjs` looks for the old Gemini key through `tests/helpers/key.mjs`. It does not check for any key that Version 2 might use, and when it finds no key it exits without scanning any file.

### What this means in plain words

Some behaviour is unfinished. A tab closed during a download keeps the download running, a saved choice of the smaller model stays set until the stored data is cleared, and the model line does not change while a first use is in progress. The halving step works in the tests, but no real page has yet needed it.

## Records to tidy

These are not faults in the product, but a reader who opens the files will meet them.

- `v2-local-nvidia-cold-second-attempt-with-load.md` repeats the numbers of `v2-local-nvidia.md`.
- The note in `v2-local-nvidia-offline-first-attempt-with-load.md` says that run was slower, but only its long article was slower. Its short article was faster.
- The note in `v2-local-intel-wikipedia.md` attributes an invented fact to the new-code run. The invented facts are in the summary of the old-code second try, `v2-local-intel-wikipedia-second-try-old-code.json`. The note needs correcting.
- The decision record quotes a writing speed for the separate card that mixes a saved figure with an earlier speed test. The earlier test's figure, about 63 tokens a second, has no saved file. The saved clean runs give 34 to 53. This report uses the saved runs and labels the earlier figure.

### What this means in plain words

The files are correct in their numbers, but some notes repeat or overstate, so a reader must read the notes as well as the tables.

## Questions this chapter answers

**What is the most important thing the tests have not shown?**
The client's laptop has not been tested, so its speed, model choice and disk margin are unknown. The tests ran on one developer laptop, in a hidden browser.

**Can the summaries be trusted as facts?**
No. The saved summaries show copied wording, a wrong date, invented facts in one old-code run and generic points in the new-code run, so a reader must check the facts against the page.

**Why is the built-in chip such a problem?**
It writes about 4 to 5 tokens a second with the small model. On first use the short article took 199 seconds, and a 7-part article takes 10 to 12 minutes. No saved run measures a short answer on this chip with the model already stored.

**What happens if a tab is closed during the first download?**
The download keeps running in the background, because the engine's preparation step ignores the abort signal. Nothing shows its result to a reader, because the tab that asked for it has closed.

**What would change the plan first?**
A test on the client's laptop. A built-in chip makes the small model and its note the main path, and summary quality becomes the main question. A separate card makes the faster path apply, and the graphics switch becomes the main risk to test.

## Next steps, in order of value

1. **Test on the client's laptop.** Collect its graphics chip, memory and free disk space, then run `setup.bat` and one summary on that machine. Record the model line, the first-use time and the stats line, labelled as the client's machine.
2. **Run the manual click-through in the visible Chrome.** Cover Load unpacked, pinning, one summary, one offline summary with the network switched off, and the notice after a memory failure. Keep the screenshots and the checklist results.
3. **Record a short-article Intel run with the current code.** Keep the saved summary, so that the marker removal is shown on the chip where the markers appeared.
4. **Reduce copied wording, invented facts and bullet overruns.** Remove repeated labels from the merge answer, keep the bullets within three to six, and have a reader rate a fixed set of pages against their text.
5. **Test the graphics switch on a real Chrome.** Use a spare browser profile, run `setup.bat --gpu`, check `chrome://gpu`, then undo the change with the plain `-Remove` command.
6. **Test halving on a real page that overflows the window.** Use a dense page that is known to exceed the window, and record `halvedParts` in the saved stats.
7. **Pass the abort signal into the download.** Stop the model download when the tab that asked for it has closed.
8. **Let the reader or the developer reset the smaller-model choice.** Show the saved choice in the popup, with a button that clears it.
9. **Measure memory and reading speed.** Record the memory held while the model is loaded and after the idle close, and store the reading speed in the run files.
10. **Test the timeout and the dashboard fallback, or remove the claims.** Add a test that triggers the timeout with a slow fake answer, and a browser test that loads `dashboard.html`.
11. **Fix the secret scan and the note in the Wikipedia record.** Make the scan fail when it has nothing to scan for, check for key-like patterns that Version 2 could leak, and correct the note that attributes the invented fact to the wrong run.

### What this means in plain words

The client's laptop comes first, because its results decide which path applies. The visible-browser check and a short Intel run with the current code come next, since those are the results a reader would look for first.
