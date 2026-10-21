# Limitations and next steps

This chapter lists what Version 2 does not yet show, and what to do next, in order of value. Each limit points to its source so that a reader can check it. Some limits were found while this chapter was written, when the saved records and the code were compared again. Those are marked.

## Not yet tested on real hardware or in the visible browser

**The client's laptop.** The client's graphics chip, memory and free disk space were requested, and the answer has not come back (README). Every real-model number in chapter 14 comes from the developer's laptop, which has an NVIDIA RTX 3050 and a built-in Intel chip. The client's speed, model choice and disk margin are therefore [to be measured].

**The graphics switch on a real Chrome.** `setup.bat --gpu` has been tested only against a throw-away registry key (tests B10 and B10b). Setup does not check whether the change worked, and the README's undo command is wrong. Chapter 13 gives the working form.

**The visible browser.** All browser tests ran in hidden Chromium. In the test copy, the toolbar's `activeTab` grant is replaced by an extra host permission. The Load unpacked step in branded Chrome has not been run and recorded, and the V2 click-through checklist is not done (README).

### What this means in plain words

The tests show that the software works in a test browser on one laptop. They do not yet show the client's install, the graphics switch, or the extension in the normal browser window.

## Output quality

The faults below come from the saved records, which hold one run each. They are examples, not a rate.

- **Prompt markers.** The short Intel summary begins with `<<<PAGE TEXT START>>>` and ends with the end marker. No code removes them. This is the first fault a reader sees.
- **Labels copied from the prompt.** The long NVIDIA summary under load repeats "Page title:", "These are summaries of consecutive parts of one web page", "Part 1:" and "Part 2:". Chapter 14 shows the lines.
- **A wrong date.** The same summary gives "around 3000 BC" for the Pharos lighthouse. The fixture article says "the third century BC".
- **Empty or excess bullets.** The offline long summary begins with the bullet "Page title provides a brief overview of the content within.", which gives no fact. Three of the five saved summaries that use bullets have eight, ten or twelve, where the prompt asks for three to six.
- **No formal rating.** The repository rates no summary for quality, so this report does not call the summaries good or poor. The model is meant for English only, and no other language is tested.

### What this means in plain words

The model can copy the prompt, give a wrong date, or add a bullet that says nothing. A reader must check the page before trusting a fact in a summary.

## Speed, memory and first use

- **The built-in chip is slow.** The small model wrote 4 to 5 tokens a second. The short article took 199.2 seconds on first use, and the two-part article took 149.1 seconds. The development log's earlier speed test gives about 2 tokens a second for the larger model.
- **First use is long.** The download took about 81 seconds for the small model on the Intel chip, and about 137 to 158 seconds for the larger model on the NVIDIA chip. The download time depends on the network, which the test did not control. The warm-up took 30 to 56 seconds. The popup reads the model's size from its file list, which showed about 695 MB in the real runs.
- **Memory is not measured.** The loaded model stays in the offscreen page until it has been idle for five minutes (`idleCloseMs`). A code comment in `offscreen-manager.js` says that closing the page "frees about a gigabyte of graphics memory". No run file measures that, so the figure is [to be measured]. The 879 MB and 376 MB figures in `config.js` are WebLLM's list values, not measured use.
- **After an idle close, the next use reloads.** The clean offline run loaded the stored model in 6.9 seconds. The development log's earlier spike recorded 8 to 13 seconds.

### What this means in plain words

On the NVIDIA chip, the first use takes minutes and later uses take seconds. On the built-in chip, every use takes minutes. The memory held while the model is loaded has not been measured.

## Design gaps

- **The halve-and-retry step was not built.** The decision record planned to halve a part and try again when the model rejects it as too long for its window (`docs/DECISIONS.md`, D1, item 4). No run hit a window error, and the part limit (`maxChunks`, 12) refuses very long pages first. A window error is not among the cases the code names. Depending on its wording, `engine-errors.js` could read it as a memory error, because some of its patterns are broad. Otherwise the reader sees the general message "Something went wrong inside the extension. Try again." No test covers this path.
- **The smaller-model choice cannot be reset.** After a memory error, the service worker writes `modelOverride: 'fallback'` to `chrome.storage.local`. No code clears that value, and the popup has no control for it.
- **The dashboard fallback has no Version 2 test.** The extractor falls back to the rendered page text when Readability finds under 200 characters. The fixture `tests/fixtures/dashboard.html` exists, but no Version 2 browser test loads it.
- **The secret scan checks for a key that Version 2 no longer uses.** `scripts/secret-scan.mjs` finds the old Gemini key through `tests/helpers/key.mjs`, which looks in the Version 1 folder and in the environment. When it finds no key, it prints "No key available on this machine, so nothing to scan for." and exits without checking any file. That also breaks the rule that each version runs on its own (`docs/DECISIONS.md`, D6).
- **Records to tidy (found while writing).** `v2-local-nvidia-cold-second-attempt-with-load.md` repeats the numbers of `v2-local-nvidia.md`. The note in `v2-local-nvidia-offline-first-attempt-with-load.md` says that run was slower, but only its long article was slower. The decision record gives 40 to 63 tokens a second for the separate card, while the saved runs give 29 to 53. This report uses the saved runs.

### What this means in plain words

Some safety steps planned earlier were not built. A reader who meets a window error would see a general message, and a saved choice of the smaller model stays set until the stored data is cleared.

## Questions this chapter answers

**What is the most important thing the tests have not shown?**
The client's laptop has not been tested, so its speed, model choice and disk margin are unknown. The tests ran on one developer laptop, in a hidden browser.

**Can the summaries be trusted as facts?**
No. The saved summaries show copied labels, a wrong date and empty bullets, so a reader must check the facts against the page.

**Why is the built-in chip such a problem?**
It writes about 4 to 5 tokens a second with the small model. On first use the short article took 199 seconds, and the answer alone took about 76 seconds. No saved run measures a short answer on this chip with the model already stored.

**How long does the model stay in memory?**
Until the offscreen page has been idle for five minutes, and then the page closes. The graphics memory it holds has not been measured, so the release of that memory is intended by the code but not confirmed by a run.

**What would change the plan first?**
A test on the client's laptop. A built-in chip makes the small model and its note the main path, and summary quality becomes the main question. A separate card makes the faster path apply, and the graphics switch becomes the main risk to test.

## Next steps, in order of value

1. **Test on the client's laptop.** Collect its graphics chip, memory and free disk space, then run `setup.bat` and one summary on that machine. Record the model line, the first-use time and the stats line, labelled as the client's machine.
2. **Run the manual click-through in the visible Chrome.** Cover Load unpacked, pinning, one summary, and one offline summary with the network switched off. Keep the screenshots and the checklist results.
3. **Remove the prompt markers from answers.** Strip the marker text in the code, and add a unit test that feeds in an answer containing it.
4. **Enforce the answer format.** Remove echoed labels such as "Page title:" and "Part n:", keep the bullets within three to six, and run the saved examples again. Then ask a reader to rate a fixed set of pages against their text.
5. **Test the graphics switch on a real Chrome.** Use a spare browser profile, make `setup.bat` check the result of the switch, and correct the undo command in the README.
6. **Let the client reset the smaller-model choice.** Show the saved choice in the popup, with a button that clears it.
7. **Measure memory and reading speed.** Record the memory held while the model is loaded and after the idle close. Store the reading speed (prefill) in the run files, which do not keep it now.
8. **Test the dashboard fallback, or remove the claim.** Add a browser test that loads `dashboard.html`.
9. **Fix the secret scan.** Make it fail when it has nothing to scan for, and replace the old Gemini key check with a check for key-like patterns. Build the halve-and-retry step only if a window error appears on a real laptop.

### What this means in plain words

The client's laptop comes first, because its results decide which path applies. The visible-browser check and the removal of the prompt markers come next, since a reader would notice those faults first.
