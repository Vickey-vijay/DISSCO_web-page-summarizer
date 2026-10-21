# Testing and results

This chapter reports how Version 2 was tested and what the measurements show. There are three kinds of evidence. Automated tests check the logic and the browser behaviour, with a pretend model that can be made to fail on purpose. A set of Windows checks runs the batch files. Real-model runs measure what the actual model does on the developer's laptop. Each kind answers different questions, so the results are kept apart.

Every saved result is labelled. A run marked **clean** was done with nothing else busy on the laptop, according to its record. A run marked **under load** was done while other programs were using the processor, according to the note in its record file. Under-load runs are kept because they were measured, but they are never presented as clean numbers. Two clean offline runs are shown side by side, one made before a popup fix and one made after it, because the fix changed what the reader sees.

## The four test layers

Table: The test layers, what each one covers and how to run it

| Layer | Files | Count | Where it runs | Model used | Command |
|---|---|---|---|---|---|
| Unit tests | `tests/unit/*.test.js` (six files) | 70 | Node.js only, no browser, no network | None; fakes and pure functions | `npm test` |
| Browser tests | `tests/e2e/smoke.test.js`, `tests/e2e/pipeline.test.js` | 26 (the smoke test plus V01 to V24, with V18b) | Hidden Playwright Chromium with the extension loaded | Pretend model (`?mock=<mode>`) | `npm run test:e2e` |
| Windows script checks | `tests/bat/test-bat-scripts.ps1` | 15 (B1 to B10c) | Runs `setup.bat` and `run.bat` in throw-away copies, and the graphics script against a throw-away registry key | None | `powershell -File tests\bat\test-bat-scripts.ps1` |
| Real-model runs | `scripts/local-run.mjs` | Three modes, saved as record files in `docs/test-runs` | Hidden Chromium, real model | Llama 3.2 1B or SmolLM2 360M | `node scripts/local-run.mjs nvidia` (and the other modes) |

The secret scan (`scripts/secret-scan.mjs`) is a check before pushing to the repository, not a test of the product. Chapter 16 explains its limit.

The layers answer different questions. The unit tests check the logic of each piece on its own. The browser tests check the whole chain from the button to the summary, with the extension loaded. The Windows checks check the batch files and the graphics script. Only the real-model runs show how fast the real model is and how it behaves on this laptop.

### What this means in plain words

Each layer tests something the others cannot. Only the real-model runs can say how long a real summary takes.

## Unit tests, file by file

Table: The six unit test files, the number of tests in each, and what they cover

| File | Tests | What they cover |
|---|---|---|
| `tests/unit/chunker.test.js` | 10 | Cutting text into parts: empty text, short text, packing paragraphs, splitting at sentence ends and at spaces, cutting a word longer than the limit, keeping the order, rejecting bad limits, and cleaning line endings. Identical to the Version 1 file. |
| `tests/unit/merger.test.js` | 8 | Grouping parts within the size limit, merging one part or many, merging in levels when there are too many, no model call for a single part, and failures and cancellation passing up. Identical to the Version 1 file. |
| `tests/unit/pipeline.test.js` | 7 | A short page in one call, a long page in parts merged in order, too little text stopping before any model call, extraction and engine failures, cancellation between parts, and the timing clock. Identical to the Version 1 file. |
| `tests/unit/local-engine.test.js` | 20 | The engine's contract with a fake offscreen page: the part and merge prompts, copied markers removed from answers, empty answers, error codes passed through, the checking, downloading and loading phases, no WebGPU, integrated graphics choosing the small model, a retry with the small model after running out of graphics memory, no retry after a download failure, one offscreen page reused, answers made one at a time, the idle close, and the idle countdown not starting while a load is still running. |
| `tests/unit/gpu-and-errors.test.js` | 11 | No WebGPU API, no adapter, no shader-f16 support, a good adapter; the model choice on a normal and on a small computer; download and loading progress, including no "downloading" label for a stored model; engine error classification; the word "room" not counting as out of memory; and a network word during generation not counting as a download failure. |
| `tests/unit/small.test.js` | 14 | Summary formatting that never produces HTML, default settings and stored values, rejected silly values, the two model names, a plain message for every error code, technical detail kept apart from the user message, the prompt layout, removal of copied page markers, restricted addresses, and the same-page check. |

The total is 70. Two of the six files are new in Version 2 (`gpu-and-errors` and `local-engine`), and one (`small`) was changed for it. The other three (`chunker`, `merger` and `pipeline`) are identical to the Version 1 files. The `local-engine` file is the largest because the engine has the most branches.

### What this means in plain words

The 70 small tests check each piece of logic with fake parts. They need no browser and no internet, so they can be repeated at any time.

## Browser tests and the pretend model

The browser tests load the real extension into a hidden Chromium, serve the fixture pages from a small local server, press the real Summarize button and read what the popup shows. A test cannot click the toolbar icon, so the popup is opened as a small popup window. The test copy of the extension gets one extra host permission for the local server. The product manifest is not changed. The real toolbar grant is covered only by the manual smoke test, which is not yet recorded (chapter 16).

The browser tests choose their model through a test seam. The offscreen page reads the `mock` value from its address. The code that builds that address is short:

`src/background/offscreen-manager.js` (the test seam)

```
    if (typeof engineMode === 'string' && engineMode.startsWith('mock')) {
      const mode = engineMode.split(':')[1] ?? 'ok';
      const { mockDelayMs } = await api.storage.local.get('mockDelayMs');
      return `${path}?mock=${encodeURIComponent(mode)}&delay=${Number(mockDelayMs) || 0}`;
    }
```

Most browser tests use this pretend model. The project's decision record (`docs/DECISIONS.md`, D5) gives the reason. The pretend model is fast and free, and it needs no graphics card. It can also be made to fail in exactly the way a test needs: no WebGPU, out of memory, a failed download, an empty answer or hostile output. A real model cannot be made to fail on demand. The pretend model therefore proves the extension's own logic, and the real-model runs prove that the real model works. The browser tests say nothing about how good a real summary is.

A worked example shows the level of detail. Scenario V01 checks that download percentages never go down while the model downloads:

`tests/e2e/pipeline.test.js` (the V01 check, lines 180 to 185)

```
  const percents = downloadPercents(lines);
  assert.ok(percents.length >= 2, `expected several download percentages, the popup showed: ${JSON.stringify(lines)}`);
  for (let i = 1; i < percents.length; i += 1) {
    assert.ok(percents[i] >= percents[i - 1], `download percentage went down: ${percents.join(' -> ')}`);
  }
```

The first full run is recorded in `docs/test-runs/run-1.md`. It was run with `npm run test:e2e` on 21 October 2026, and all 26 browser tests passed in each of three runs in a row, at about 77 seconds per run. Later fixes added checks, and the current suite still has the same 26 scenarios, all passing. The table reproduces the scenarios in plain words. The IDs are the same as in the test file.

Table: The 26 browser scenarios, what each one checks, and the result

| ID | What the scenario checks | Result |
|---|---|---|
| smoke | A first run shows the model line, a download bar and a summary. A second run skips the download. | Pass |
| V01 | A first run shows download percentages that only rise, a warm-up, and a summary. Afterwards the popup shows the model as downloaded. | Pass |
| V02 | The job passes through its phases in order: extracting, checking, downloading, loading, summarizing. | Pass |
| V03 | A long article is cut into four parts, summarized in order, and merged. The stats say four parts. | Pass |
| V04 | A near-empty page is refused for too little text, and the model is not downloaded. | Pass |
| V05 | A restricted Chrome page is refused before any model work starts. | Pass |
| V06 | A page that needs more parts than the limit is refused as too long, with no download. | Pass |
| V07 | A computer without WebGPU shows that in the model line. The button is disabled and a script press starts no job. | Pass |
| V08 | A computer without 16-bit shader support gets the same treatment. | Pass |
| V09 | Integrated graphics shows a note that names Intel, the small model is used, and a summary works. | Pass (run 1 found a fault here, fixed; see chapter 15) |
| V10 | When the main model runs out of memory, the small model writes the summary, the choice is saved, the next popup shows it, and the finished summary carries a notice that the smaller model wrote it. | Pass |
| V11 | When every model runs out of memory, the error says so, the choice is saved, and Summarize is enabled again. | Pass |
| V12 | A failed download shows an error and saves nothing. A later press succeeds once the download works. | Pass |
| V13 | An empty answer from the model is reported as no summary. | Pass |
| V14 | Markup in the model's answer is shown as plain text and is never rendered. | Pass |
| V15 | A popup closed during a job shows the same job when it is reopened, then the summary. | Pass |
| V16 | A finished job is still shown when the popup reopens, and no new job starts. | Pass |
| V17 | After the tab moves to another page, the old summary is hidden and Summarize is enabled. | Pass |
| V18 | Text that arrives late, after 1.5 seconds, is still summarized. | Pass |
| V18b | Text still missing when Summarize is pressed is refused for too little text. | Pass |
| V19 | An article with a table is summarized without failure. | Pass |
| V20 | A service worker stopped during a job leaves the job marked interrupted, and the popup says so. | Pass |
| V21 | Pressing Summarize on a new page while an old job runs gets a reply within four seconds. | Pass |
| V22 | A tab closed during a job leaves no job record behind. | Pass (run 1 found a fault here, fixed; see chapter 15) |
| V23 | The offscreen page closes after the idle time, and the next summary still works. | Pass |
| V24 | A normal summary opens only the popup window. No tab and no options page open. | Pass |

Run 1 found a fault in the graphics note (V09) and a fault in the closed-tab cleanup (V22), and fixed both. Chapter 15 tells those stories, along with the later faults found by the screenshot run and the code reading.

### What this means in plain words

The browser tests press the real buttons, but on a fake model. They prove that the popup, the background worker and the offscreen page work together and handle failures. They say nothing about the quality of a real summary.

## The real-model runs: how they were measured

The real-model script `scripts/local-run.mjs` measures the real model in hidden Chromium with the extension loaded. It has three modes, and each one keeps its own browser profile folder, so the downloaded model is kept between runs.

Table: The three real-model modes and their settings

| Mode | Chrome flags | Outside websites | Profile folder | Cases run |
|---|---|---|---|---|
| `nvidia` | `--force_high_performance_gpu` | Allowed | `.model-profile` | Short article, long article, Wikipedia "Lighthouse" (live) |
| `nvidia-offline` | The same flag, plus a host rule that maps every outside address to "not found" | Blocked; the cache only | `.model-profile`, the same folder as `nvidia` | Short article, long article |
| `intel` | None | Allowed | `.model-profile-intel` | Short article, long article |

The script records the popup's text with a time stamp every time it changes, the wall time from the click to the result, the job's own statistics (model, parts, requests, load time and writing speed) and three screenshots: the download, the warm-up and the final popup. Each run writes a JSON file and a Markdown table into `docs/test-runs`. A first use needs a profile that does not yet hold the model. Later runs in the same mode use the stored model.

Table: The saved real-model record files and their labels

| Record file | Mode and state | Label | Note |
|---|---|---|---|
| `v2-local-nvidia-cold-first-attempt.md` | `nvidia`, first use | Clean | Markdown only; no JSON file in the folder |
| `v2-local-nvidia.md` | `nvidia`, first use | Under load | JSON file present |
| `v2-local-nvidia-cold-second-attempt-with-load.md` | `nvidia`, first use | Under load | The same numbers as `v2-local-nvidia.md`; it looks like a copy |
| `v2-local-nvidia-offline.md` | `nvidia-offline`, stored model | Clean, before the label fix | JSON file present; has a wrong "Downloading" line |
| `v2-local-nvidia-offline-first-attempt-with-load.md` | `nvidia-offline`, stored model | Under load | Markdown only |
| `v2-local-nvidia-offline-after-label-fix.md` | `nvidia-offline`, stored model | Clean, after the label fix | JSON file present; no "Downloading" line |
| `v2-local-intel.md` | `intel`, first use | Clean, before the marker fix | JSON file present; its summary still shows the copied markers |

The clean label for the first-use and offline runs follows each record's own note. The under-load label follows each file's own note. The JSON file `v2-local-nvidia.json` holds the same 207 s run as `v2-local-nvidia.md`, and the popup screenshot `v2-nvidia-short-popup.png` was taken from that same run.

### What this means in plain words

The real-model runs record every step the popup showed, with the time it showed it. Each result is labelled, so a slow number cannot pass as a fast one, and a run made before a fix is labelled as such.

## Results: first use on the NVIDIA chip

The first use means the model is downloaded and loaded for the first time. The clean run is in `v2-local-nvidia-cold-first-attempt.md`. The run under load is in `v2-local-nvidia.md`.

Table: First use on the NVIDIA chip, clean run and run under load

| Measure | Clean run | Run under load |
|---|---|---|
| Short article, total time | 196.8 s | 207 s |
| Long article, total time (2 parts) | 15.9 s | 17 s |
| Wikipedia "Lighthouse", total time (7 parts) | 74.1 s | 101.6 s |
| Writing speed, short article | 47 tokens a second | 38 tokens a second |
| Writing speed, long article | 53 tokens a second | 44 tokens a second |
| Writing speed, Wikipedia | 34 tokens a second | 39 tokens a second |

The first-use total is about 10 seconds longer under load. The timeline of the two runs shows where the time went. The stage boundaries are the first "Loading" line, the "Warming up" line and the "Summarizing" line of each timeline.

Table: Stages of the short article's first use, in seconds after the click

| Stage | Clean run | Run under load |
|---|---|---|
| Read the page and check the card | 0.5 | 1.8 |
| Download, from the start to the first loading line | 158.3 | 138.6 |
| Loading into the graphics card | 3.8 | 6.0 |
| Warm-up, the first answer compiling the card's programs | 30.5 | 56.0 |
| Writing the answer | 3.7 | 4.6 |

The clean run's download was longer, not shorter. The under-load run's warm-up was about 25 seconds longer, and that stage is where a busy processor would show most. The download depends on the network speed, which the test did not control. These two runs cannot prove the cause of the difference. The file's own note attributes the slower numbers to other programs running, and the timeline places most of the extra time in the warm-up.

Figure V09 draws the clean run's stages as one timeline.

![First-use timeline, clean run on the NVIDIA chip](../figures/V09_cold_timeline.png)

Reading the figure: the figure shows the first use of the clean run as one long bar. The download bar runs from 0.5 s to 158.8 s and is labelled 158.3 s. The loading into the card is a short bar of 3.8 s, the warm-up is 30.5 s, and the final summary takes 3.7 s, for a total of 196.8 s. The figure's notes give the timestamps of each stage, and it says that a "Loading 0%" line during the download is not shown.

The Wikipedia article shows the difference more clearly, because the same steps were slower one after another. Each line below is the time a part started in each run.

Table: Wikipedia "Lighthouse" (7 parts), time in seconds at which each step started

| Step | Clean run | Run under load |
|---|---|---|
| Part 1 | 3.2 | 5.1 |
| Part 2 | 7.8 | 12.4 |
| Part 3 | 17.0 | 21.7 |
| Part 4 | 22.5 | 30.6 |
| Part 5 | 30.1 | 37.2 |
| Part 6 | 38.1 | 50.1 |
| Part 7 | 54.7 | 65.8 |
| Combining the seven summaries | 60.2 | 80.5 |

In the Wikipedia run, every step was slower under load. That pattern is consistent with a busy processor, but the test does not measure the processor's use, so the cause is not proven.

The popup screenshot below is from the under-load first-use run. It was taken at the moment the summary appeared.

![Popup after first use on the NVIDIA chip, run under load](../screenshots/v2-nvidia-short-popup.png)

Real-model screenshot, first-use run under load. The summary is the start of the Lighthouse article, shown as a heading line and bullets. The stats line reads 206.5 s, the job's own time, while the table above gives 207 s, the script's wall time. The model line still reads "Not downloaded yet". The popup refreshes that line after a job ends, and the picture was taken as soon as the summary appeared, so it shows the state from before the press.

### What this means in plain words

The first use takes about three minutes on this laptop, most of it downloading and warming up. The clean run was not faster on every stage, so the 10 seconds between the two runs should not be read as a clear effect of other programs.

## Results: offline use on the NVIDIA chip, before and after the label fix

Offline use means the model is already stored in the browser, and every outside website is blocked. The summary still has to be made. Two clean runs were made in this mode, one before a popup fix and one after it. The fix stopped the popup from saying "Downloading the model" when the model was already stored. Before the fix, the popup printed that line for a stored model at 3.9 s, showing 0%.

Table: Offline use on the NVIDIA chip, clean run before the label fix and clean run after it

| Measure | Before the label fix (`v2-local-nvidia-offline.md`) | After the label fix (`v2-local-nvidia-offline-after-label-fix.md`) |
|---|---|---|
| Short article, wall time (script) | 15.3 s | 17.7 s |
| Short article, time shown in the popup | 14.8 s | 17.5 s |
| Short article, load (loading and warm-up, no download) | 6.9 s | 11.6 s |
| Short article, writing speed | 40 tokens a second | 65 tokens a second (one request) |
| Long article (2 parts), wall time | 16.5 s | 16.0 s |
| Long article, time shown in the popup | 16.4 s | 15.7 s |
| Long article, writing speed (last request) | 42 tokens a second | 45 tokens a second |
| "Downloading the model" line for a stored model | Yes, at 3.9 s, showing 0% | None |

The label result is clear. After the fix, the timeline of both articles has no "Downloading" line. The short article's timeline runs from "Loading the model into the graphics card: 0%" at 1.9 s, through the loading percentages to 96% at 12.7 s, then "Warming up the model" at 13.1 s and "Summarizing" at 13.5 s.

The timings did not all improve. The short article took longer after the fix, because its load took 11.6 seconds against 6.9 seconds. Its writing was faster, at 65 tokens a second against 40, although that figure comes from one request. The record notes that differences of this size are normal on this laptop. Two runs in each state are too few to show why the load differed, and this report does not settle the question. The "before" record is kept for its timings, but its timeline carries the wrong line, and its note says so.

The before-fix screenshot shows the popup after the clean run, with the stats line at 14.8 s and the model line reading "Downloaded, runs on this computer".

![Popup after an offline summary, before the label fix](../screenshots/v2-nvidia-offline-short-popup.png)

Real-model screenshot, offline short article, clean run before the label fix. The summary's first lines are numbered points, and the stats line reads 14.8 s. This picture does not show the wrong line, which is in the timeline only.

The after-fix popup was taken from the same kind of run after the fix.

![Popup after an offline summary, after the label fix](../screenshots/v2-nvidia-offline-short-popup-after-label-fix.png)

Real-model screenshot, offline short article, clean run after the label fix. The model line reads "Downloaded, runs on this computer", and the stats line reads 17.5 s, the job's own time. The table gives 17.7 s, the script's wall time.

The picture of the warm-up stage after the fix shows the progress line that replaced the wrong one.

![Popup during the warm-up, after the label fix](../screenshots/v2-nvidia-offline-short-warming-after-label-fix.png)

Real-model screenshot, offline short article, warm-up stage after the label fix. The model line reads "Downloaded, runs on this computer". The popup shows "Warming up the model (first time can take about 30 seconds)..." with an indeterminate bar and no "Downloading" line. The button is greyed out while the job runs.

The under-load offline run, `v2-local-nvidia-offline-first-attempt-with-load.md`, gave 13.4 s for the short article and 32.2 s for the long one. Its note says the run was slower than the clean run. That holds for the long article only, because the short article was faster.

### What this means in plain words

Once the model is stored, a short article takes about 15 to 18 seconds on this chip, and no internet is needed. The popup no longer tells the reader that a stored model is downloading. Two runs in each state are too few to say why the load time varied.

## Results: the integrated Intel chip

The Intel chip is built into the processor. Its results come from the `intel` mode, which does not force the separate card. The extension chose the small model (SmolLM2 360M) by itself, because the chip is integrated. The clean run is in `v2-local-intel.md` and `v2-local-intel.json`. That run was made before the fix that removes copied markers from answers, and it has not been repeated since. Its saved output therefore still shows the markers.

Table: Clean run on the Intel chip, the automatic small model

| Measure | Short article | Long article (2 parts) |
|---|---|---|
| Total time | 199.2 s | 149.1 s |
| Download (small model, about 204 MB) | 0.9 to 81.2 s | Already stored |
| Loading into the graphics card | 81.6 to 83.3 s | Already stored |
| Warm-up | 83.7 to 123.1 s (about 39 s) | Already stored |
| Writing the answer | 123.1 to 199.0 s (about 76 s) | Parts: 0.9 s and 65.7 s; merge from 122.6 s |
| Writing speed | 4 tokens a second | 5 tokens a second |

The popup for the short article shows the graphics note that the extension adds for integrated chips. The note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster."

![Popup for the short article on the Intel chip, recorded before the marker fix](../screenshots/v2-intel-short-popup.png)

Real-model screenshot, Intel chip, short article, first use, recorded before the fix that removes copied markers. The model line reads "SmolLM2 360M. Not downloaded yet (about 204 MB, first use only)", and the graphics note is shown. The summary begins with the text `<<<PAGE TEXT START>>>`, a marker copied from the prompt. This picture shows the defect, which the code now removes, but the Intel run has not been made again to show the fixed output.

![Popup for the long article on the Intel chip, clean run](../screenshots/v2-intel-long-popup.png)

Real-model screenshot, Intel chip, long article, clean run with the model already stored. The stats line reads "2 parts · 3 requests · 148.7 s · SmolLM2 360M". The table above gives 149.1 s, the script's wall time.

The copied markers are a defect in the saved output. The short Intel summary begins with the prompt's start marker and ends with its end marker. The record text starts like this:

```
<<<PAGE TEXT START>>>
A lighthouse lens works by using many thin glass rings to bend the light.
```

The most likely cause is that the small model repeats the marker text it was given. Chapter 15 tells how the fix was made. Of the seven summaries in the three original JSON files, this is the only one that contains the markers.

### What this means in plain words

On the built-in chip, the small model writes a short summary in a little over three minutes on first use, and a two-part article in about two and a half minutes. The answers work but are slow. The first short answer shows the prompt's marker text, which the code now removes. That removal has not been checked on the Intel chip.

## What the saved summaries show

The three original JSON files hold seven summaries, all made before the marker fix. The offline run after the label fix adds two more. The table lists each one and what a reader sees in it. The check is about form and about facts that can be checked from the repository. The Wikipedia article is live and is not in the repository, so its facts cannot be checked here.

Table: The saved summaries and what they show. Bullet counts include nested bullet lines.

| Record | Case and run | Bullet lines | What a reader sees |
|---|---|---|---|
| `v2-local-nvidia.json` | Short article, under load, before the fixes | 5 | Heading line and five bullets. No fault seen |
| `v2-local-nvidia.json` | Long article, under load, before the fixes | 10 | Repeats labels from the merge prompt ("Page title:", "These are summaries of consecutive parts", "Part 1:", "Part 2:"). Gives "around 3000 BC" for the Pharos lighthouse, where the page says "the third century BC" |
| `v2-local-nvidia.json` | Wikipedia, under load, before the fixes | 13 | Heading line and thirteen bullets. The prompt asks for three to six |
| `v2-local-nvidia-offline.json` | Short article, clean, before the label fix | 8 | Heading line and eight bullets |
| `v2-local-nvidia-offline.json` | Long article, clean, before the label fix | 5 | The first bullet is "Page title provides a brief overview of the content within.", which gives no fact |
| `v2-local-intel.json` | Short article, clean, before the marker fix | 0 | Begins with the prompt's start marker and ends with its end marker |
| `v2-local-intel.json` | Long article, clean | 0 | One paragraph of five sentences. No fault seen in the form |
| `v2-local-nvidia-offline-after-label-fix.json` | Short article, clean, after the fixes | 8 | Heading line and eight bullets. No markers |
| `v2-local-nvidia-offline-after-label-fix.json` | Long article, clean, after the fixes | 9 (six at the top level, three nested) | No markers. The first bullet still repeats the copied label "Page title provides a brief overview of the content within." |

Five of the seven summaries that use bullets have more than six bullet lines, counting nested lines. Those are the under-load long article (10), the under-load Wikipedia article (13), the clean offline short article (8), the after-fix offline short article (8) and the after-fix long article (9). The after-fix long article has six top-level bullets, which is within the limit, plus three nested lines. The popup's summary box has a fixed maximum height and scrolls, so the picture below shows only the first five items.

The clearest factual slip is in the under-load long article. The fixture article says the Pharos lighthouse "was built in the third century BC during the reign of the Ptolemies". The model's summary said "around 3000 BC". The same summary copied the merge prompt's own labels. Its opening lines are shown here as they were saved:

```
Lighthouses: A Short History of Light on the Coast

- Page title: Lighthouses: A Short History of Light on the Coast
- These are summaries of consecutive parts of one web page
- Part 1: Lighthouses have been used for navigation and safety for thousands of years
- The first lighthouse was built on the island of Pharos in Egypt around 3000 BC
```

The after-fix long summary shows the same kind of copying in a milder form. Its first bullet repeats the "Page title" label, and the picture below shows that bullet at the top of the list.

![Popup for the long article after the label fix, Llama 3.2 1B](../screenshots/v2-nvidia-offline-long-popup-after-label-fix.png)

Real-model screenshot, offline long article (two parts), clean run after the label fix. The summary's first numbered point is "Page title provides a brief overview of the content within." The stats line reads "2 parts · 3 requests · 15.7 s · Llama 3.2 1B". The list continues below the visible part of the box.

Each record is a single run, so the table shows what happened in those runs, not how often it happens.

### What this means in plain words

The model follows the structure of the prompt, but its answers can copy the prompt's labels, add a wrong date, or add a bullet that says nothing. The marker fix removed one kind of copying. A reader still has to check the page before trusting a fact in a summary.

## Speed: NVIDIA against Intel

Writing speed is measured in tokens a second. A token is a piece of a word, so a higher number means the answer appears faster. The decode speed used in the records is the value for the job's last request. The table gathers the measured values and labels each one. The two chips did not run the same model in the saved clean runs, and that matters for reading the table.

Table: Writing speed on the two chips, with the model and the source of each number

| Chip and run | Model | Writing speed (tokens a second) | Source | Label |
|---|---|---|---|---|
| NVIDIA, first use | Llama 3.2 1B | 47 (short), 53 (two parts), 34 (seven parts) | `v2-local-nvidia-cold-first-attempt.md` | Clean |
| NVIDIA, offline, before the label fix | Llama 3.2 1B | 40 (short), 42 (two parts) | `v2-local-nvidia-offline.md` | Clean |
| NVIDIA, offline, after the label fix | Llama 3.2 1B | 65 (short, one request), 45 (two parts) | `v2-local-nvidia-offline-after-label-fix.md` | Clean |
| NVIDIA, runs under load | Llama 3.2 1B | 38, 44 and 39 (first use); 48 and 29 (offline) | The two under-load records | Under load |
| Intel built-in | SmolLM2 360M, chosen by the extension | 4 (short), 5 (two parts) | `v2-local-intel.md` | Clean |
| Intel built-in | Llama 3.2 1B | About 2 | Earlier speed test, recorded in the development log; no saved run file | Not a saved run |
| NVIDIA, earlier speed test | Llama 3.2 1B | About 63 while writing; about 600 while reading the prompt | Earlier speed test, recorded in the development log; no saved run file. The log does not say which text was used | Not a saved run |

The saved clean NVIDIA runs gave 34 to 53 tokens a second. The under-load values are listed separately, because the run under load is not a clean measurement. The earlier speed test in the development log, with about 63 tokens a second, is not a saved run file. The after-fix offline run's 65 tokens a second is a saved measurement, but it comes from a single request.

Model sizes come from the popup text in the real runs. The main model's download was about 695 MB, and SmolLM2's was about 204 MB. The pretend model reports fixed sizes of 664 MB and 300 MB. Those figures are not measurements, and no result in this chapter uses them.

The comparison that matters most is the same model on both chips. The saved runs do not contain that pair in full, because the Intel runs used the small model. Figure V08 draws the saved numbers and labels each bar.

![Writing speed on the NVIDIA card against the Intel chip](../figures/V08_speed_chart.png)

Reading the figure: the figure has two panels, writing speed in tokens a second and time for the short article. The NVIDIA bars come from the clean runs with the 1 billion parameter model, and they show 47, 53, 34, 40 and 42 tokens a second. The Intel bars with the small model show 4 and 5. A dashed bar marks the earlier speed test, about 2 tokens a second with the large model on the Intel chip. The time panel shows 196.8 s for the NVIDIA first use, 15.3 s for the stored offline short article, and 199.2 s for the Intel first use with the small model. A dashed box says that no short-article run on the Intel chip with the model stored has been measured. The footnote says that three under-load runs are left out.

With the large model, the clean NVIDIA runs (34 to 53 tokens a second) wrote roughly 17 to 27 times as fast as the built-in chip's earlier speed test of about 2 tokens a second. The built-in chip is usable only with the smaller model, and even then it is slow.

### What this means in plain words

The separate card writes many times faster than the built-in chip. The built-in chip gives usable answers only with the small model, and even then a short summary takes minutes.

## What these tests do not show

The honest limits of the results are listed here. The list is taken from `run-1.md` and the README, and it is kept in plain words.

From run 1, the browser tests do not show:

- real summary quality, because the pretend model returns fixed text;
- real download speed, graphics-card behaviour or shader warm-up, which are covered only by the real-model records;
- the visible Chrome the client will use, because every test ran in hidden Chromium.

From the README, these items are not yet verified:

- a test on the client's laptop, because its details were requested and have not been received;
- `setup.bat --gpu` against a real Chrome installation;
- a manual click-through in the visible Chrome, using the V2 checklist;
- languages other than English, because the model is small and is meant for English text.

Two more limits apply to the real-model records. They cover only the pages named in the table of cases: two fixture articles and one live Wikipedia page. No formal rating of summary quality exists in the repository, so a claim that a summary is good or poor is an opinion, and this report does not make one.

### What this means in plain words

The tests prove the logic and the real model's speed on one laptop. They do not prove how good the summaries are, how the extension behaves in visible Chrome, or how it runs on the client's laptop.

## Questions this chapter answers

**Why do most browser tests use a pretend model?**
A real model cannot be made to fail on demand, and it needs a graphics card and a long download. The pretend model is fast, free and forced into each failure case, such as no WebGPU or out of memory. The real-model runs then cover what the pretend model cannot.

**Which results are clean, and which were done under load?**
The clean results are the NVIDIA first-use run in `v2-local-nvidia-cold-first-attempt.md`, the two offline runs (one before and one after the label fix), and the Intel run. The first-use and Wikipedia runs in `v2-local-nvidia.md` were done while other programs were busy, and they are kept as records. Each run's note gives its label.

**What did the label fix change, and what did it leave?**
It removed the "Downloading the model" line that appeared for a stored model. It did not change the load time, which was 11.6 seconds after the fix against 6.9 seconds before. Two runs in each state are too few to say why, so the difference is recorded but not explained.

**How does the NVIDIA chip compare with the Intel chip?**
The clean NVIDIA runs wrote 34 to 53 tokens a second with the large model. The Intel chip wrote 4 to 5 tokens a second with the small model that the extension chooses for it, and about 2 with the large model in an earlier speed test. The same-model comparison rests on that earlier test, which has no saved run file.

**Can the results be trusted for the client's laptop?**
Not yet. Every real-model number comes from the developer's laptop, which has an NVIDIA RTX 3050 and a built-in Intel chip. The client's graphics chip, memory and free disk space have been requested and have not arrived, so the client's results are [to be measured].
