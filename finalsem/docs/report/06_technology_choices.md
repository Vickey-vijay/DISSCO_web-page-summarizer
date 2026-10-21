# Technology choices

This chapter records the big choices behind Version 2 as decision records. The records come from `finalsem/docs/DECISIONS.md` (decisions D1 to D6). Each record gives the options, the choice, why the others were rejected, the trade-off accepted and what was measured afterwards. A later section says which problems found in review are fixed and which remain.

## Plain terms used in these records

- **Token**: a piece of text the model reads or writes, such as a word or part of a word. Speed is counted in tokens per second.
- **Context window**: how much text the model can read at once. The Llama 3.2 1B model has a 4,096-token window (D1).
- **Quantization (4-bit)**: storing each number in fewer bits, so the file is much smaller, at the cost of a little accuracy.
- **Warm-up**: the first answer compiles the graphics card's programs, which took about 30 seconds on the first run.

## How the first choice was checked before building

Before any code was written, the first choice (whether a model could run inside a Chrome extension, and how) was put in writing to a second, stronger model, which the decision record calls "Opus". Its answer gave a confidence of medium, and high for three of the six items. The developer laptop then had an Intel i5-12450H, 15.7 GB of memory, an Intel built-in graphics chip and an NVIDIA RTX 3050 with 6 GB, and ran Chrome 155. The client's laptop was unknown.

Table: The first choice, question by question, from decision D1

| # | Question | Advice given | What was done |
|---|---|---|---|
| 1 | Library | WebLLM 0.2.86, pinned, one file; Transformers.js only as plan B | Followed. The spike worked |
| 2 | Where it runs | Offscreen page with one module web worker; job stays in the service worker; keepalive; close after about five idle minutes | Followed. Keepalive every 10 s |
| 3 | Which model | Llama 3.2 1B by default, SmolLM2 360M as fallback, chosen by computer | Followed, with one rule added after measuring (D3) |
| 4 | Piece size and prompt | 6,000 characters a part; at most 300 tokens an answer; temperature 0.2; halve the part if the window is exceeded | Followed, except the halving step, which was **not built** |
| 5 | Keep the cloud engine? | Local only; remove the key box | Followed |
| 6 | Biggest risk | WebLLM without a bundler in an offscreen page on a weak chip; test first in a throw-away extension | Done as a spike, which found the storage problem (D2) |

The advice named three conditions that would change it: a client laptop without WebGPU, a failed spike, and one part taking more than about 60 seconds. The first two did not happen. The third did, on the Intel chip, where the first part of the two-part article took about 65 s with SmolLM2. The response was narrower than the advice: SmolLM2 became the default on Intel graphics only (D3). The halving step was never built, because no real run hit a window error.

**What this means in plain words.** Most of the advice was followed. One condition came true, and the answer was a rule for one kind of chip, not a change for every computer.

## Decision records

### Library: WebLLM, pinned in one file

- **Options.** WebLLM, or Transformers.js (kept only as plan B if the spike failed).
- **Choice.** WebLLM 0.2.86, copied as one file into `src/lib/web-llm.js`, with no bundler.
- **Why the other was rejected.** The spike worked, so the fallback was not needed.
- **Trade-off accepted.** Upgrades are manual, because the file is copied by hand.
- **Measured afterwards.** All six real-model runs used the library.

**What this means in plain words.** One library, copied in as one file, so nothing has to be built before the extension runs.

### Where the model runs: an offscreen page with a worker

- **Options.** The service worker alone, or a hidden offscreen page hosting a web worker. The offscreen page's header comment gives the reason against the service worker: Chrome stops an idle worker, and a stopped worker would lose the loaded model.
- **Choice.** An offscreen page, with reason WORKERS, hosting one module web worker. The job stays in the service worker.
- **Trade-off accepted.** One more page to manage. The page is not closed while a message is running, and the five-minute countdown starts only when the last message finishes.
- **Measured afterwards.** Scenario V20 (worker stopped mid-job) and scenario V23 (idle close, then a working summary) pass.

**What this means in plain words.** The model lives in a hidden page that stays alive while there is work, and it closes after five quiet minutes.

### Which model: Llama 3.2 1B, with SmolLM2 360M as fallback

- **Options.** Four models, shown below.
- **Choice.** Llama 3.2 1B by default. SmolLM2 360M is used when memory is under 8 GB, on an Intel built-in chip, or after the primary model fails to load.
- **Why the others were rejected.** DECISIONS.md skips Qwen2.5 0.5B as bigger than the 1B model and weaker, and Qwen3 0.6B for its graphics memory and thinking mode.
- **Trade-offs accepted.** A 1B model writes weaker summaries than a large cloud model, as the PRD states. A saved fallback stays until the stored settings are cleared, because `modelOverride` is never cleared. The reader is told when the fallback wrote the summary (scenario V10).
- **Measured afterwards.** In the saved clean NVIDIA runs, writing speed was 34 to 53 tokens a second, each value from the last request of its job. The offline run after the label fix wrote at 65 tokens a second for its single request (short article) and 45 for the two-part article. Intel with SmolLM2 wrote at 4 to 5. A speed test recorded only in DEVLOG gave about 2 tokens a second for the 1B model on Intel, and about 63 writing and 600 reading on NVIDIA; that row does not say which text was used.

Table: The four models considered, with the graphics memory from DECISIONS.md

| Model | Graphics memory | Outcome |
|---|---|---|
| Llama 3.2 1B | 879 MB | Chosen as the default; 4,096-token window |
| Qwen2.5 0.5B | 945 MB | Skipped: bigger than the 1B model and weaker |
| SmolLM2 360M | 376 MB | Chosen as the fallback |
| Qwen3 0.6B | 1,403 MB | Skipped: the largest of the four, with a thinking mode |

**What this means in plain words.** The 1B model runs on a normal computer, and the smaller model is used where memory or the chip is short.

### Piece size and prompt

- **Options.** Version 1 used 8,000 characters a part. DECISIONS.md does not record the other sizes tried.
- **Choice.** 6,000 characters a part, about 1,500 tokens, with part answers capped at 300 tokens, the final answer at 320, and temperature 0.2.
- **Trade-off accepted.** Long pages need more requests, and pages over 12 parts are refused (`maxChunks`).
- **Measured afterwards.** The clean NVIDIA runs took 15.9 s for the two-part article and 74.1 s for the seven-part article. No real run hit a window error.
- **Not built.** The halve-and-retry step.

**What this means in plain words.** Each piece is small enough for the model to read at once, and very long pages are refused before the wait starts.

### Keep a cloud engine, or go local only

- **Options.** A selectable cloud engine with the key box, or a local-only Version 2.
- **Choice.** Local only. Version 1 stays the cloud version.
- **Why the other was rejected.** The PRD goal is no API key and no page text leaving the machine, which a selectable cloud engine would break.
- **Trade-off accepted.** A computer without WebGPU gets no summary. The advice said the cloud engine would return for such a laptop, so this stays open until the client's laptop is known.
- **Measured afterwards.** Scenarios V07 and V08 (no WebGPU, no 16-bit support) pass.

**What this means in plain words.** The product makes no outside call for a summary and needs no key.

### The spike: the riskiest step, tested first

- **Options.** Build the whole extension first, or first run a throw-away extension in a hidden browser, measuring download, cache load and time per part, then again with the network off.
- **Choice.** The spike, as advised. DECISIONS.md names this step as the biggest risk.
- **Trade-off accepted.** The throw-away extension differs from the real one, so each finding was checked again in the real extension.
- **Measured afterwards.** DECISIONS.md says the spike found two problems and points to D2, which describes only one. The second, a silent offscreen page, is in the development log only.

**What this means in plain words.** The riskiest step was tried in a small copy before the real extension depended on it.

### Where the model files are stored

- **Options.** Cache Storage (WebLLM's default), or IndexedDB.
- **Choice.** IndexedDB, set with `cacheBackend: "indexeddb"`.
- **Why the other was rejected.** Cache Storage failed inside the offscreen page with "UnknownError: Failed to execute 'open' on 'CacheStorage'". IndexedDB worked there, with about 10.7 GB of quota in the test.
- **Trade-off accepted.** The extension needs `unlimitedStorage`, so the browser does not delete the model of about 700 MB when disk space runs low.
- **Measured afterwards.** Loading the stored model took 6.9 s before the label fix and 11.6 s after it. The spike found 8 to 13 s (DEVLOG).

**What this means in plain words.** The model is kept in the browser's own database, the storage that worked inside the offscreen page.

### A weak graphics chip: a smaller model, chosen by the extension

This record changed after measuring. The first version used the same model on every chip.

- **Options.** Keep the 1B model on integrated graphics, refuse to run, or switch to the smaller model for an Intel built-in chip.
- **Choice.** Switch to SmolLM2 360M, and show a note that a separate card is much faster.
- **Why the others were rejected.** On Intel the 1B model wrote about 2 tokens a second, and the first answer took 36 s to prepare. The development log says the weak chip "is not an error", so it gets a note and a smaller model rather than a refusal.
- **Trade-off accepted.** Answers are slow and come from the smaller model, whose quality was not compared. Detection covers Intel only, so an AMD or Apple built-in chip is not switched. This limit remains.
- **Measured afterwards.** The Intel short article took 199.2 s on first use (81 s download, about 40 s warm-up, 76 s writing). The two-part article took 149.1 s with the model stored.

![Real model, Intel built-in graphics, recorded before the marker fix: the popup with the note that names the chip](../screenshots/v2-intel-short-popup.png)

This is the single Intel run. The note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The result begins with the copied marker line, because the run predates the marker fix.

![Speed on the two graphics chips, clean runs only: writing speed in tokens a second, and time for the short article](../figures/V08_speed_chart.png)

Reading the figure: The NVIDIA bars show 34 to 53 tokens a second for the clean runs. The Intel bars show 4 and 5 for SmolLM2, and a dashed bar marks the DEVLOG speed-test value of about 2 for the 1B model. Time bars give 196.8 s for NVIDIA first use, 15.3 s for stored offline use, and 199.2 s for Intel first use. A box marks the Intel stored-model short article as not measured.

**What this means in plain words.** On a weak chip the extension trades answer quality for a usable wait, and it tells the reader why the answer is slow.

### Making Chrome use the stronger chip: opt-in only

- **Options.** Set Windows by hand, run `setup.bat --gpu` (one per-user registry value), or change nothing.
- **Choice.** Both ways are offered, and neither runs by default. The script runs only when `--gpu` is given.
- **Why the default was rejected.** The change alters a Windows setting, and the project owner does not want settings changed without asking.
- **Trade-off accepted.** Most laptops with two chips start on the weak one until someone acts.
- **Measured afterwards.** The registry change was tested only against a throw-away key. The undo command, `powershell -File scripts\set-chrome-gpu.ps1 -Remove`, now works without a Chrome path. If the change fails, `setup.bat --gpu` says so and setup continues.

![Chrome's two routes to the separate card, the undo command and the default on this laptop](../figures/V17_two_graphics_chips.png)

Reading the figure: The figure shows Chrome on the Intel chip by default, and the Windows setting or `setup.bat --gpu` moving it to the NVIDIA card. Its undo line still shows the optional `-ChromePath` argument, which the script accepts without needing it.

**What this means in plain words.** The project offers the faster chip but does not change the computer's settings on its own.

### Pretend model for most tests, one real run for proof

- **Options.** Real model only, or a pretend model for most tests with real runs for proof.
- **Choice.** Both. Most browser scenarios use the pretend model selected with `?mock=<mode>`.
- **Why the first option was rejected.** A real model cannot be made to fail on demand.
- **Trade-off accepted.** The pretend model says nothing about summary quality or real memory limits. Its fixed numbers, such as 664 MB and 300 MB, are not measurements.
- **Measured afterwards.** The current code has 70 unit tests, 26 browser scenarios and 15 batch-script checks, from the change notes. `run-1.md` records three full browser runs made before the later fixes.

**What this means in plain words.** Most tests are quick and repeatable, and a few real runs show that the model works on the developer's laptop.

### Version 1 stays untouched

- **Options.** Link the shared code, copy it, or change Version 1 in place.
- **Choice.** Copy the shared parts into `finalsem/`, and leave `midsem/` as it was.
- **Why the others were rejected.** DECISIONS.md says the parts were copied so that each version runs from its own folder.
- **Trade-off accepted.** A fix to shared code has to be made in both places by hand.
- **Measured afterwards.** Eight of the 19 Version 1 source files are byte-for-byte the same, eight changed, three were removed and ten are new (system design chapter).

**What this means in plain words.** Each version runs from its own folder, at the cost of two copies of the shared code.

## Problems found in review: what is fixed and what remains

Reading the code and the runs turned up problems. The table shows where each stands now.

Table: Problems found in review, and their status

| Problem | Status now | Where |
|---|---|---|
| Unused key-box and options CSS | **Fixed.** Removed from `ui.css`; one rule added for the notice | Chapter 5, reuse |
| Intel detection | **Still open.** Only an Intel built-in chip is switched; AMD or Apple built-in chips are not | This chapter, weak-chip record; FR9 |
| TIMEOUT untested | **Still open.** No automated test runs the 180-second timer; the pretend model has no timeout | Chapter 5, failures; FR8 |
| Copied page markers in answers | Fixed. `stripPageMarkers` with two unit tests. The Intel run and its screenshot predate the fix | Chapter 5, engine seam |
| Silent fallback to the smaller model | Fixed. A notice shows on the result (scenario V10) | Chapter 5, failures |
| Stale "Not downloaded yet" after both models fail | Fixed. The line refreshes once when a job ends; not during download or warm-up | Chapter 5, first use |
| "Downloading" shown for a stored model | Fixed, with a unit test. The earlier offline run keeps its timings | Chapter 5, first use |
| Offscreen page closed during a long answer | Fixed. Messages in flight are counted, with a unit test | Chapter 5, offscreen page |
| "oom" matched inside words such as "room" | Fixed, with a unit test | Chapter 4, FR8 |
| Stale limit of three minutes | Changed to five minutes; Version 1 kept three | Chapter 5, job record |
| Undo command needed `-ChromePath` | Fixed. The README command works | This chapter, opt-in record |

One loose end is not a code change: the download size is quoted as 664 MB in a DEVLOG row and as about 660 MB in a script comment, while the popup reports about 695 MB, which this report uses.

These limits are still true of the code. `modelOverride` is never cleared, so the small model stays in use until the stored settings are cleared. Closing a tab during a download does not stop it, because `prepare()` ignores the abort signal. The merge answer can repeat the prompt's own wording, and small models make factual slips. The model line is not refreshed during the download or warm-up. A load-stage error containing "cache" counts as a download failure. The secret-scan script knows only the Version 1 Gemini key. The under-8-GB rule has not been seen on low-memory hardware. The dashboard fixture is used by no Version 2 browser scenario. The warm-up took about 30 s on first use and 0.4 to 0.5 s later, and the reason is not measured.

**What this means in plain words.** The fixes cover the defects a reader would see. The open items are the chip detection, the untested timeout and several limits of the small model and the test setup.

## Why the interface keeps the Version 1 look

![Pretend model screenshot: the popup in the not-downloaded state, in the printed-page style](../screenshots/ui-01-not-downloaded.png)

This is a pretend-model picture. The "about 664 MB" figure is the pretend model's number, not a measurement. The style is a paper background, dark ink, one red accent, a serif summary font and numbered points.

DECISIONS.md holds no record about the look. The reasons come from the PRD, which states that "Only the summarization engine differs between versions", and from the Version 1 development log, which records that the owner said the first design looked AI-made and that it was redrawn in this style. The look has not been tested with readers.

**What this means in plain words.** Version 2 looks like Version 1 because the PRD changes only the engine, and the look had already been accepted.

## Why no cloud engine remains

D1 answered the question of keeping the cloud engine with "local only". The reason follows the PRD goal of no key and no page text leaving the machine. Version 1 stays as the cloud version, so `engines/gemini.js`, the Options page and the key form are not in Version 2. A laptop without WebGPU or 16-bit support cannot run Version 2, and the extension says so. Whether that matters depends on the client's laptop, which has not been tested.

**What this means in plain words.** The product makes no outside call for a summary and needs no key, and it has no fallback to the cloud.

## Questions this chapter answers

**Why WebLLM and not Transformers.js?**
WebLLM was the first answer, and the spike ran, so Transformers.js was kept only as plan B. The library is one copied file, so there is no build step, and upgrades are manual.

**Why did the team change its choice of model after measuring?**
On the Intel chip the 1B model wrote about 2 tokens a second, and the first answer took 36 s to prepare. The extension now switches to SmolLM2 on an Intel built-in chip, which is recorded as D3.

**Why is the model stored in IndexedDB?**
Cache Storage failed inside the offscreen page, and IndexedDB worked there. The extension asks for `unlimitedStorage` so the browser keeps the model when disk space runs low.

**Why no cloud engine?**
The PRD goal of no API key and no page text leaving the machine would be broken by a cloud engine. A laptop without WebGPU gets a clear refusal rather than a fallback.

**Did another model check the first choice, and was its advice followed?**
Yes. The question went to a stronger model in writing before building, with a stated confidence of medium. Most of the advice was followed, one condition came true on the Intel chip, and the halving step was not built.
