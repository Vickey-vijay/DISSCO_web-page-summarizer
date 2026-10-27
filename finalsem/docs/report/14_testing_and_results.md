# Testing and results

This chapter reports how Version 2 was tested and what the measurements show. Three kinds of evidence are used. Automated tests run the whole chain with a pretend model that can be made to fail on purpose. Windows checks run the batch files. Real-model runs and a speed benchmark measure the actual model.

Every real number in this chapter comes from the developer laptop: its NVIDIA RTX 3050 and its built-in Intel chip. Most come from hidden Chromium. One set, the visible-window timing of 28 October, comes from a visible Chrome window on mains power. None comes from the client's laptop, which is described in chapter 13.

Each real-model run appears once, in the table for its case. A run marked **clean** was done with nothing else busy on the laptop, according to its record. A run marked **under load** was done while other programs were using the processor, according to its note. Under-load runs are kept as records, but their numbers are never presented as clean.

## The test layers

Table: The test layers

| Layer | Files | Count | What it shows |
|---|---|---|---|
| Unit tests | `tests/unit` (eight files) | 93 | Each piece of logic, with fakes. No browser, no network |
| Browser tests | `tests/e2e` (smoke test, V01 to V29 and V18b) | 31 | The whole chain in hidden Chromium, with the pretend model |
| Windows script checks | `tests/bat` | 15 (B1 to B10c) | `setup.bat` and `run.bat` in throw-away copies, and the graphics script against a throw-away registry key |
| Real-model runs | `scripts/local-run.mjs` | Eight plans | The real model's speed and output on the developer laptop |
| Speed benchmark | `scripts/bench-models.mjs` | Seven model versions | Where the time goes on the built-in Intel chip |

The layers answer different questions. The commands are `npm test`, `npm run test:e2e`, the Windows check script, `node scripts/local-run.mjs` with a plan name, and `node scripts/bench-models.mjs`.

### What this means in plain words

Each layer tests something the others cannot. Only the real-model runs can say how long a real summary takes, and only the benchmark says where that time goes.

## Unit tests

Table: The eight unit test files

| File | Tests | What it covers |
|---|---|---|
| `chunker.test.js` | 10 | Cutting text into parts. Identical to Version 1 |
| `condense.test.js` | 6 | Shortening a long page before reading: the opening, the spread of sentences, and the headings |
| `trim-text.test.js` | 6 | Cutting back matter and reference markers before reading |
| `merger.test.js` | 8 | Joining part summaries, in levels when there are many. Identical to Version 1 |
| `pipeline.test.js` | 7 | The job flow for short and long pages, and early refusals. Identical to Version 1 |
| `local-engine.test.js` | 28 | The engine's calls to the fake offscreen page, the cut-in-half retry, the idle close and countdown, and removal of copied markers |
| `gpu-and-errors.test.js` | 13 | Graphics checks, model choice, progress labels, error codes (including the context-window code), and the word "room" |
| `small.test.js` | 15 | Formatting, settings, plain error messages, prompts, marker removal and URL checks |

Four files are new in Version 2 (`gpu-and-errors`, `local-engine`, `condense` and `trim-text`), one was changed (`small`), and three are identical to Version 1 (`chunker`, `merger` and `pipeline`).

### What this means in plain words

The 93 tests check each piece of logic with fake parts. They need no browser and no internet.

## Browser tests and the pretend model

The browser tests load the extension in hidden Chromium, serve fixture pages, press the real Summarize button and read the popup. Most of them use a pretend model, which is chosen by a `mock` mode. The decision record gives the reason (`docs/DECISIONS.md`, D5). The pretend model is fast and free, it needs no graphics card, and it can be made to fail in each way a test needs. A real model cannot be made to fail on demand. The pretend model therefore proves the extension's own logic, and it says nothing about how good a real summary is. The error cases the tests force are described in chapter 12.

A worked example shows the level of detail. Scenario V01 checks that the download percentages never go down:

`tests/e2e/pipeline.test.js` (the V01 check)

```
  for (let i = 1; i < percents.length; i += 1) {
    assert.ok(percents[i] >= percents[i - 1], `download percentage went down: ${percents.join(' -> ')}`);
  }
```

The first full run is recorded in `docs/test-runs/run-1.md`. It was run with `npm run test:e2e` on 21 October 2026. All 26 browser tests passed in each of three runs in a row, at about 77 seconds per run. Scenarios V25 to V29 were added on 24 and 26 October. On 26 October V09, V28 and V29 were run again and passed. The other scenarios were not run again for this report; the change list records them as passing.

Table: The 31 browser scenarios, what each checks, and the result

| ID | What is checked | Result |
|---|---|---|
| smoke | First run shows the model line, a download and a summary; a second run skips the download | Pass |
| V01 | Download percentages never fall; a warm-up follows; the model then shows as downloaded | Pass |
| V02 | The job phases come in order | Pass |
| V03 | A long article is cut into four parts and merged | Pass |
| V04 | A near-empty page is refused, and no model is downloaded | Pass |
| V05 | A restricted Chrome page is refused before any model call | Pass |
| V06 | A page over the part limit is refused, with no download | Pass |
| V07 | No WebGPU: the model line says so, the button is disabled, no job starts | Pass |
| V08 | No 16-bit shader support: the same treatment | Pass |
| V09 | Integrated graphics: the note names Intel, the main model is kept, and a summary works | Pass (fault found in run 1, fixed) |
| V10 | Main model out of memory: the small model writes the summary, the choice is saved, and a notice says so | Pass |
| V11 | Every model out of memory: the error shows and Summarize is enabled again | Pass |
| V12 | Failed download: an error, nothing saved, and a later press succeeds | Pass |
| V13 | An empty answer is reported as no summary | Pass |
| V14 | Markup in an answer is shown as plain text | Pass |
| V15 | A popup closed mid-job shows the same job when reopened | Pass |
| V16 | A finished job is shown again, and no new job starts | Pass |
| V17 | After the page changes, the old summary is hidden | Pass |
| V18 | Text that arrives after 1.5 seconds is still summarized | Pass |
| V18b | Text still missing at the press is refused | Pass |
| V19 | An article with a table is summarized | Pass |
| V20 | A worker stopped mid-job leaves the job marked interrupted | Pass |
| V21 | A press on a new page during an old job gets a reply within four seconds | Pass |
| V22 | A tab closed mid-job leaves no record behind | Pass (fault found in run 1, fixed) |
| V23 | The offscreen page closes after the idle time, and the next summary works | Pass |
| V24 | A normal summary opens only the popup window | Pass |
| V25 | A part that does not fit the model window is cut in half, and the page is still summarized | Pass (added 24 October) |
| V26 | A long answer keeps the job alive: the record is refreshed while the model works | Pass (added 24 October) |
| V27 | An unexpected failure shows the technical detail under the vague message | Pass (added 24 October) |
| V28 | On built-in graphics a long page is read in shortened form, the popup says so, and the whole-page button is offered | Pass (added 26 October) |
| V29 | Settings, Quality Fast: the small model is used, and the choice is remembered | Pass (added 26 October) |

Run 1 also found three faults in the test setup itself. Chapter 15 tells those stories with the extension faults.

### What this means in plain words

The browser tests press the real buttons, but on a fake model. They show that the parts work together. They say nothing about the quality of a real summary.

## Real-model runs

The script `scripts/local-run.mjs` measures the real model in hidden Chromium, except for the `intel-visible` plan, which runs in a visible window. Each plan keeps its own browser profile folder, so the downloaded model is kept between runs.

Table: The real-model plans

| Plan | Settings | Profile folder | Cases |
|---|---|---|---|
| `nvidia` | `--force_high_performance_gpu`; outside websites allowed | `.model-profile` | Short article, long article, Wikipedia "Lighthouse" (live) |
| `nvidia-offline` | The same flag and a host rule that blocks outside addresses; cache only | `.model-profile` | Short article, long article |
| `intel` | No flags; outside websites allowed | `.model-profile-intel` | Short article, long article |
| `intel-wikipedia` | No flags | `.model-profile-intel` | Wikipedia "Lighthouse" (live) |
| `intel-short` | No flags | `.model-profile-intel` | Short article |
| `intel-better` | No flags; the default main model, Llama 3.2 1B | `.model-profile-intel-better` | Short article, Wikipedia "Lighthouse" (live), long article |
| `intel-fast` | No flags; Settings, Quality: Fast (SmolLM2 360M) | `.model-profile-intel` | Short article, Wikipedia "Lighthouse" (live) |
| `intel-visible` | No flags; a visible window (`HEADED=1`), on mains power | `.model-profile-intel-better` | Wikipedia "Lighthouse" (live), three times in one session |

Each run records the popup's text with time stamps, the wall time from the click to the result, the job's own statistics and up to three screenshots. It writes a JSON file and a Markdown table. The wall time is always a little longer than the job's own time in the saved pairs. The NVIDIA runs used the test flag `--force_high_performance_gpu`, not the Windows setting that `setup.bat --gpu` writes. Chapter 13 covers that setting. The Intel runs used no flags, so Chrome chose the built-in chip, as it does on the client's laptop.

The clean records are `v2-local-nvidia-cold-first-attempt.md`, `v2-local-nvidia-offline.md` (made before the label fix), `v2-local-nvidia-offline-after-label-fix.md` and `v2-local-intel.md`. The records made under load are `v2-local-nvidia.md`, `v2-local-nvidia-cold-second-attempt-with-load.md` and `v2-local-nvidia-offline-first-attempt-with-load.md`. The Intel records of 24 and 26 October have their own labels in the Intel section.

**A stale service worker.** A persistent browser profile keeps the extension's service worker script from its first use. On 24 October a real run lacked the new `halvedParts` statistic, which showed that the profile was running old code. The failing run was made with the code from before the changes. The second try also ran the old code, because the profile still held the old script. The run script now deletes the profile's `Service Worker` and `Code Cache` folders before each launch. The downloaded model is kept in IndexedDB, so it is not affected. Real-model runs made before 24 October ran the service-worker code as it was when each profile was first used. Changes made later to service-worker-side code, such as the marker removal, the idle close and the five-minute limit, were covered by unit and browser tests, but no real-model run exercised them until the Intel Wikipedia run of 24 October.

### What this means in plain words

Each real-model run leaves a timeline, the statistics and a screenshot, so every number can be traced back to a record. A profile can keep old code, so a run is only as current as the folders it starts from.

## First use on the NVIDIA chip, clean run

The clean first-use run is in `v2-local-nvidia-cold-first-attempt.md`. It has no JSON file.

Table: Clean first use on the NVIDIA chip

| Measure | Value |
|---|---|
| Short article, total time | 196.8 s |
| Long article (2 parts), total time | 15.9 s |
| Wikipedia "Lighthouse" (7 parts, 8 requests), total time | 74.1 s |
| Writing speed, short / long / Wikipedia | 47 / 53 / 34 tokens a second |
| Short article: download, from 0.5 s to 158.8 s | 158.3 s |
| Short article: loading into the graphics card | 3.8 s |
| Short article: warm-up, compiling the card's programs | 30.5 s |
| Short article: writing the answer | 3.7 s |

![First-use timeline, clean run on the NVIDIA chip](../figures/V09_cold_timeline.png)

Reading the figure: the download is most of the wait, 158.3 s of the 196.8 s total. Loading into the card takes 3.8 s, and the warm-up takes 30.5 s. The popup shows a warm-up message during that stage, which tells the reader why the wait is long. Chapter 9 explains the offscreen page that does the warm-up.

### What this means in plain words

Most of the first use is the download and the warm-up. Both happen once, when the model is first stored and first loaded.

## Offline use on the NVIDIA chip, before and after the label fix

Offline runs use a stored model, and outside websites are blocked. Before the label fix, the popup printed "Downloading the model (first time only): 0%" at 3.9 s, although the model was already stored. The fix removed that line. Chapter 15 tells how.

Table: Offline runs on the NVIDIA chip, before and after the label fix

| Measure | Before the fix (`v2-local-nvidia-offline.md`) | After the fix (`v2-local-nvidia-offline-after-label-fix.md`) |
|---|---|---|
| Short article, wall time / time shown in the popup | 15.3 s / 14.8 s | 17.7 s / 17.5 s |
| Short article, load (loading and warm-up, no download) | 6.9 s | 11.6 s |
| Short article, writing speed | 40 tokens a second | 65 tokens a second (one request) |
| Long article (2 parts), wall time / time shown in the popup | 16.5 s / 16.4 s | 16.0 s / 15.7 s |
| Long article, writing speed (last request) | 42 tokens a second | 45 tokens a second |
| "Downloading" line for a stored model | Yes, at 3.9 s, showing 0% | None |

After the fix, neither timeline has the "Downloading" line. The short article's timeline runs from "Loading the model into the graphics card: 0%" at 1.9 s to 96% at 12.7 s, then warm-up at 13.1 s and the summary at 13.5 s. The short article took longer after the fix, because its load took 11.6 s against 6.9 s, and its writing was faster. The record notes that differences of this size are normal on this laptop. Two runs in each state are too few to show why the load differed, so this report does not explain it.

![Popup after an offline summary, after the label fix](../screenshots/v2-nvidia-offline-short-popup-after-label-fix.png)

Real-model screenshot, offline short article, clean run after the label fix. The model line reads "Downloaded, runs on this computer", and the stats line reads 17.5 s, the job's own time.

### What this means in plain words

Once the model is stored, a short article takes about 15 to 18 seconds on this chip, with no internet. After the fix, the popup no longer says that a stored model is downloading.

## Runs done while other programs were running

These records are kept as measurements, not as clean numbers.

Table: Runs under load on the NVIDIA chip

| Record | Case | Result | Writing speed |
|---|---|---|---|
| `v2-local-nvidia.md` and `.json` | First use | Short 207 s; long 17 s; Wikipedia 101.6 s | 38, 44 and 39 tokens a second |
| `v2-local-nvidia-offline-first-attempt-with-load.md` | Offline, stored model | Short 13.4 s; long 32.2 s | 48 and 29 tokens a second |

Against the clean offline run, the under-load short article was faster (13.4 s against 15.3 s) and the under-load long article was slower (32.2 s against 16.5 s), so the record's note that the run was slower holds for the long article only. The under-load first use took 138.6 s to download, 6.0 s to load and 56.0 s to warm up, against 158.3 s, 3.8 s and 30.5 s in the clean run. The under-load Wikipedia article started every part later: part 1 at 5.1 s instead of 3.2 s, and the final combining step at 80.5 s instead of 60.2 s. The cause of these differences is not proven, because the test does not measure the processor's use. The file `v2-local-nvidia-cold-second-attempt-with-load.md` repeats the numbers of `v2-local-nvidia.md`.

![Popup after first use on the NVIDIA chip, under load](../screenshots/v2-nvidia-short-popup.png)

Real-model screenshot, first use under load. The summary is the start of the Lighthouse article, and the stats line reads 206.5 s, the job's own time. The model line still reads "Not downloaded yet", because the picture was taken as the summary appeared, before the popup refreshed that line.

### What this means in plain words

The runs under load are slower in several steps. The records do not prove what caused that, so they are kept apart from the clean results.

## Speed benchmark on built-in graphics

On 26 October the speed of the small models was measured on the developer laptop's Intel chip (`scripts/bench-models.mjs`, `docs/test-runs/bench-models.md`). The benchmark ran in hidden Chromium, with one run per model and one part of 6,000 characters, about 1,440 tokens. Differences of 10 to 20 percent between runs are normal. Reading is the part of the work where the model takes in the text. Writing is where it produces the answer.

Table: Speed of each model on built-in Intel graphics, in plain words

| Model | Reading, tokens a second | Writing, tokens a second | One realistic part, seconds | In plain words |
|---|---|---|---|---|
| SmolLM2 360M, 4-bit | 28.7 | 4.8 | 66 | The Fast choice. Mixed up names and dates in the same part |
| SmolLM2 360M, 32-bit math | 29.0 | 3.3 | 97 | About the same at reading, slower at writing |
| SmolLM2 135M | 40.2 | 13.6 | 43 | The quickest, and less accurate |
| Qwen2.5 0.5B, 4-bit | 24.1 | 3.5 | 54 | Faster than SmolLM2 360M for one part, and less accurate, like the other smaller models |
| Qwen2.5 0.5B, 32-bit math | 33.1 | 2.6 | 47 | Reads faster than its 4-bit version, but writes slower |
| Llama 3.2 1B, 4-bit (the default) | 15.6 | 2.0 | 162 | The only one whose summary of the part had no invented details |
| Llama 3.2 1B, 32-bit math | 15.4 | 1.1 | 188 | No faster, and slower at writing |

Two models were not measured. The Gemma 3 1B model did not load, because this WebLLM version reports a window configuration error. The Qwen2.5 1.5B run was stopped, so it has no figures.

Reading is the cost. On this chip every model reads at 15 to 40 tokens a second, so one 6,000-character part takes 36 to 90 seconds to read before a word is written. Reading is about 80 percent of the time of one part. The smaller the model, the faster it reads, but not by much. Llama 3.2 1B takes about 2.4 times as long as SmolLM2 360M for one part, 162 seconds against 66. The 32-bit versions write more slowly, and only the 32-bit Qwen version reads faster, so the 4-bit versions are kept for the default.

### What this means in plain words

On a slow chip, the time is spent reading the text, not writing the answer. A smaller model does not solve that, so the decision was to read less of the page and keep the accurate model.

## Intel chip

The Intel chip is built into the processor, and it is the client's only chip, so its numbers matter most. Until 26 October the extension chose the small model, SmolLM2 360M, by itself on built-in graphics. Those runs are labelled "SmolLM2 default, before 26 October". From 26 October the main model, Llama 3.2 1B, is the default on every chip. SmolLM2 is used only when the reader chooses Fast.

Table: Intel runs made with SmolLM2 as the automatic choice, before 26 October

| Measure | Short article (clean) | Long article, 2 parts (clean) | Wikipedia, old code, failed | Wikipedia, old code, second try | Wikipedia, 24 October code |
|---|---|---|---|---|---|
| Record | `v2-local-intel.md` | `v2-local-intel.md` | `v2-local-intel-wikipedia-before-fix.md` | `v2-local-intel-wikipedia-second-try-old-code.md` | `v2-local-intel-wikipedia.md` |
| Outcome | Summary | Summary | TIMEOUT | Summary | Summary |
| Total time | 199.2 s | 149.1 s (popup 148.7 s) | 615.6 s | 704.5 s | 616.4 s |
| Model at start | First use: download 0.9 to 81.2 s | Stored | Stored | Stored | Stored |
| Warm-up | 83.7 to 123.1 s (about 39 s) | Stored | Started at 6.2 s | Started at 4 s | Started at 3.1 s |
| Parts (seconds each) | Writing the answer 123.1 to 199.0 s (about 76 s) | Parts start at 0.9 s and 65.7 s; merge from 122.6 s | 76, 127, 66, 50 and 77 s. Part 6 started at 435.8 s and had not answered 180 s later | 75, 124, 73, 56, 90, 121 and 60 s; merge 100 s | 70.6, 68.4, 65.9, 75.1, 79.2, 121.5 and 68.6 s; merge about 62.7 s |
| Writing speed | 4 tokens a second | 5 tokens a second | Not recorded | 4 tokens a second | 4.1 tokens a second |
| Notes | Before the marker fix | Before the marker fix | Old code: 180 s answer limit, no halving | Same old code and profile, which still held the old script | Halving and heartbeat present. No part overflowed the window. The saved summary has no markers |

The same old code timed out once and succeeded on the second try, after 704.5 s. Answer times on this chip vary a lot. Whether a part overflows the model's window depends on the page text, which changes from day to day, and no part overflowed on the day of the 24 October run, so the halving step is covered by unit tests and by scenario V25, not by a real run.

Table: Intel runs with the current default, Llama 3.2 1B, and with Quality: Fast (SmolLM2), 26 October

| Measure | Short article, first use (default) | Lighthouse (default) | Long article (default) | Lighthouse (Fast) | Short article (Fast) |
|---|---|---|---|---|---|
| Record | `v2-local-intel-better.md` | `v2-local-intel-better.md` | `v2-local-intel-better.md` | `v2-local-intel-fast.md` | `v2-local-intel-fast.md` |
| Model | Llama 3.2 1B | Llama 3.2 1B | Llama 3.2 1B | SmolLM2 360M | SmolLM2 360M |
| Total time | 200.6 s | 124.6 s | 103.8 s | 64.7 s | 39.5 s |
| Text read | Whole article, 1,711 characters | 5,968 of 27,964 characters (21 percent), after cutting 8,788 characters of back matter | 5,302 of 10,532 characters (about half) | 5,968 of 27,964 characters (21 percent) | Whole article, 1,711 characters |
| Writing speed | 2.0 tokens a second | 1.8 tokens a second | 1.9 tokens a second | 3.8 tokens a second | 3.9 tokens a second |
| Whole-page estimate shown in the popup | Not shown | 692 s | 303 s | 372 s | Not shown |
| Notes | Includes the 695 MB download. Load 149.0 s, warm-up about 28 s | The popup says that the opening was read and offers the whole page | The popup says that the opening was read | Recorded before the echo fix. Its saved summary is the echoed safety sentence, a failed answer | The model was already stored |

The Lighthouse page took 616 seconds with SmolLM2 and the whole text, and it takes 124.6 seconds with the default. Reading all of it, the popup estimated 692 seconds. The whole-page button, Read the whole page, is therefore about 11 to 12 minutes on this chip, and it is the only path that still takes ten minutes or more. The summaries of the three default runs are recorded as accurate and fluent. On 28 October the same page was run three times in a row in a visible Chrome window, on mains power, with the default model already stored. The times were 118.7, 101.7 and 116.7 seconds (`v2-local-intel-visible.md`). So the hidden window did not cause the slow reading: the chip did, and the visible runs averaged about 112 seconds, about 10 percent less than the hidden run.

![Popup for the short article on the Intel chip, recorded before 26 October and before the marker fix](../screenshots/v2-intel-short-popup.png)

Real-model screenshot, Intel chip, short article, first use, recorded before 26 October and before the marker fix. The model line reads "SmolLM2 360M. Not downloaded yet (about 204 MB, first use only)", and the graphics note is shown. The summary begins with the copied marker `<<<PAGE TEXT START>>>`, which the later code removes from answers. The short Intel run with the default model has no markers in its saved summary.

### What this means in plain words

On the built-in chip the default now reads a fifth of a long page and answers in about two minutes for the Lighthouse page, where the old small model took about ten. A reader who asks for the whole page waits about eleven to twelve minutes. The smaller model is faster only when the reader chooses it, and its summaries are often muddled or wrong.

## What the saved summaries show

The three original JSON files hold seven summaries, all made before the marker fix. The offline run after the label fix adds two more. The Intel records of 24 and 26 October add more. Only the short Intel summary of the original set contains the copied markers.

Five of the seven summaries that use bullets, across the original and after-fix runs, have more than six bullet lines, counting nested lines. They are the under-load long article (10), the under-load Wikipedia article (13), the clean offline short article (8), the after-fix offline short article (8) and the after-fix long article (9, of which six are at the top level). The Wikipedia article is live, so its facts cannot be checked here.

The clearest factual slip is in the under-load long article. The fixture says the Pharos lighthouse "was built in the third century BC", but the summary said "around 3000 BC". The same summary repeats the merge prompt's labels. Its opening lines, as saved, are:

```
Lighthouses: A Short History of Light on the Coast

- Page title: Lighthouses: A Short History of Light on the Coast
- These are summaries of consecutive parts of one web page
- Part 1: Lighthouses have been used for navigation and safety for thousands of years
```

The after-fix long summary shows a milder copy. Its first bullet repeats the "Page title" label.

![Popup for the long article after the label fix, Llama 3.2 1B](../screenshots/v2-nvidia-offline-long-popup-after-label-fix.png)

Real-model screenshot, offline long article, clean run after the label fix. The first numbered point is "Page title provides a brief overview of the content within." The stats line reads 15.7 s, and the popup's summary box scrolls, so the list continues below the visible part.

The two Intel Wikipedia summaries from 24 October differ. The old-code second try contains invented facts, several dates and names, and the record's note points to one of them. That summary must not be quoted as fact. The new-code summary is three short generic points, a list of 14,700 lighthouses, 54 diagrams and 651 photographs, and the counts were not checked against the page. Its saved text repeats the three points once more. The Fast Lighthouse run of 26 October returned only the echoed safety sentence, which chapter 15 explains.

Each record is a single run. The tables above show what happened in those runs, not how often it happens.

### What this means in plain words

The model follows the shape of the prompt, but it can copy the prompt's labels, give a wrong date, invent facts, or write generic points. The marker removal stopped one kind of copying. A reader still has to check the facts against the page.

## Speed

The speeds below are measured in tokens a second, which is the decode speed of each job's last request. A token is a piece of a word, so a higher number means the answer appears faster.

- Clean NVIDIA runs with the 1 billion parameter model: 34 to 53 tokens a second.
- Offline after the label fix: 65 for the short article (one request) and 45 for the two-part article. These are single measurements.
- Intel with SmolLM2 360M, clean runs before 26 October: 4 to 5 tokens a second. Fast setting runs on 26 October: 3.8 to 3.9.
- Intel with Llama 3.2 1B: 2.0 tokens a second in the benchmark, and 1.8 to 2.0 in the default runs. The earlier speed test in the development log gave about 2 as well.
- NVIDIA with the 1 billion parameter model, earlier speed test: about 63 tokens a second writing and about 600 reading the prompt. No run file holds these, and the log does not say which text was used.
- Download sizes in the real runs, from the popup: about 695 MB for the main model and about 204 MB for SmolLM2. The pretend model's 664 MB and 300 MB are fixed numbers, not measurements.

With the 1 billion parameter model, the clean NVIDIA runs were roughly 17 to 27 times the earlier Intel speed test. Figure V08 draws the saved numbers.

![Writing speed on the NVIDIA card against the Intel chip](../figures/V08_speed_chart.png)

Reading the figure: the left panel gives writing speed. NVIDIA with Llama 3.2 1B writes 47, 53, 34, 40 and 42 tokens a second. Intel with Llama 3.2 1B now writes 2.0 for the short article, 1.8 for the Lighthouse page and 1.9 for the long article, and the two SmolLM2 bars from before 26 October write 4 and 5. The right panel gives seconds for one summary: 196.8 s and 74.1 s on NVIDIA, 616.4 s before with SmolLM2 on the whole Lighthouse page, and 124.6 s, 103.8 s and 200.6 s now with Llama 3.2 1B. Its notes say that the Intel "now" runs read long pages shortened, that all runs were in hidden Chromium on the developer laptop and not on the client's laptop, and that runs under load are left out.

### What this means in plain words

The separate card writes many times faster than the built-in chip. On the built-in chip the default model writes about 2 tokens a second, so the time goes into reading the page, and the design answer is to read less of it.

## What these tests do not show

From run 1, the browser tests do not show:

- real summary quality, because the pretend model returns fixed text;
- real download speed, graphics-card behaviour or shader warm-up, which only the real-model records cover;
- the visible Chrome the client will use, because the automated tests ran in hidden Chromium, and the one visible-window timing was made on the developer laptop.

From the README and the change list, these items are not yet verified:

- the extension on the client's laptop. Its facts are known from photos, but the extension has not been run there, and no number here is from that laptop;
- a visible-window run on mains power on the client's laptop. The developer laptop had one on 28 October (chapter 14), which does not stand in for the client's laptop, and the advice on the speed question asked for this before any other runtime is tried;
- `setup.bat --gpu` against a real Chrome installation;
- a manual click-through in the visible Chrome, using the V2 checklist;
- a real answer timeout, because no automated test triggers the TIMEOUT path;
- a different runtime, such as Transformers.js, which has not been tried;
- languages other than English, because the model is meant for English text.

The real-model records cover two fixture articles and one live Wikipedia page. No formal rating of summary quality exists in the repository, so this report does not call any summary good or poor.

### What this means in plain words

The tests prove the logic, and the real runs prove the speed on one developer laptop, in a hidden browser and once in a visible one. They do not prove how the extension runs on the client's laptop, how it looks in a visible Chrome window, or how good the summaries are.

## Questions this chapter answers

**Why do most browser tests use a pretend model?**
A real model cannot be made to fail on demand, and it needs a graphics card and a long download. The pretend model is fast, free and forced into each failure case. The real-model runs then cover what the pretend model cannot.

**Which results are clean, and which were done under load?**
The clean results are the NVIDIA first-use run in `v2-local-nvidia-cold-first-attempt.md`, the two offline runs (before and after the label fix), and the Intel run of 21 October. The runs in `v2-local-nvidia.md` and `v2-local-nvidia-offline-first-attempt-with-load.md` were done while other programs were busy, and they are kept as records. The runs of 24 and 26 October carry dates and notes instead of the clean label.

**Can the results be trusted for the client's laptop?**
Not yet. The client's laptop has one built-in Intel chip, Iris Xe, in a 15-watt processor, and its facts are known from photos. Every number in this chapter comes from the developer laptop in hidden Chromium. The first measurement on the client's laptop is still to be made, so its speed is [to be measured]. The developer's expectation, a little over two minutes warm, is a target and not a result.

**What did the change of default model do to speed and accuracy?**
On the Lighthouse page, the old small model took 616 seconds with the whole text, and the default takes 124.6 seconds on about a fifth of the text. The default's summaries are recorded as accurate, and the small model's were often wrong. The cost is that the whole page, if the reader asks for it, takes about eleven to twelve minutes.
