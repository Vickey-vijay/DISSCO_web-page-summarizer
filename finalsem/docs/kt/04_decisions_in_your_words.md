# The big decisions, in your own words

*Purpose: this chapter explains the twelve decisions in `finalsem/docs/DECISIONS.md` the way you would say them out loud at the viva, with the reason, the alternatives, the cost, and one sentence to learn.*

Each decision follows the same five parts. The first says what was decided. The second gives the reason. The third lists what else was considered. The fourth states the trade-off. The last is one sentence to say aloud. Learn the last sentence for each, then say it without the notes.

Where a number appears, it comes from `DECISIONS.md`, `DEVLOG.md`, the saved test-run files or the code. Numbers from an unsaved speed test are labelled that way. The repository does not score summary quality. Decisions 2, 4, 5, 7 and 9 were revised after the code review, the failure in the real Chrome, or the speed work, and each one says how.

## 1. The library is WebLLM, copied in as one file

**What was decided.** The model runs with WebLLM, version 0.2.86 according to the README and the decision record. Its single file is copied into `src/lib/web-llm.js`, and no bundler is used. Transformers.js was kept as a second plan.

**Why.** WebLLM runs small models on WebGPU and lists the models the project uses. Copying the file keeps setup as simple as Version 1.

**What else was considered.** Transformers.js. The first spike worked, so the second plan was not needed then. Decision 12 explains why it is still a possible option.

**The trade-off.** An update means copying a new file and testing it again.

**What you can say.** "The project uses WebLLM, copied into the folder as one file, so the setup stays as simple as Version 1."

## 2. The model runs in a hidden page, not in the service worker

**What was decided.** The model is held by an offscreen page, which is a hidden page Chrome lets an extension open. Inside it, a web worker runs WebLLM's handler. The job itself stays in the service worker.

**Why.** Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load.

**What else was considered.** Keeping the model in the service worker. The decision record does not list any other place.

**The trade-off.** The page is one more part to start, message and close, and it holds the model in graphics memory until the idle countdown ends.

**Revised.** The page is never closed while a message runs (review). Each keepalive also refreshes the running job records, so a long answer is not shown as dead (24 October). The page unloads a loaded model before it loads a different one, so a change of Quality does not keep two models (26 October).

**What you can say.** "The model runs in a hidden page because Chrome can stop the background worker when it is idle. The page is only closed when no work is running."

## 3. Local only, with no key

**What was decided.** Version 2 runs only on the computer. The key box is gone. The first use shows one button, "Download model and summarize". Version 1 stays as the cloud version.

**Why.** The summary should need no account, no key and no network after the download, and the page text should never leave the computer.

**What else was considered.** A cloud fallback for computers without WebGPU. The record says the choice would change if the client's laptop had no WebGPU. The client's laptop has WebGPU hardware acceleration, so that condition does not apply. The `shader-f16` feature is not yet confirmed on that laptop.

**The trade-off.** A computer without WebGPU or without `shader-f16` cannot run Version 2. The popup says so, and nothing is sent to the cloud instead.

**What you can say.** "Version 2 is local only, so no key is needed and the page text never leaves the computer. The cost is that a computer without the right graphics support cannot run it."

## 4. The model: Llama 3.2 1B by default, SmolLM2 360M as a choice

**What was decided.** The main model is Llama 3.2 1B, id `Llama-3.2-1B-Instruct-q4f16_1-MLC`. It is the default on every chip. SmolLM2 360M is used only in three cases: when the person chooses Quality: Fast in the popup's Settings, after a memory or load failure of the main model (saved as `modelOverride`), or on a computer that reports under 8 GB of memory.

**Why.** The 1B model was the one whose summary of a realistic part had no invented details in the benchmark. On the built-in chip it takes about 2.4 times as long per part as SmolLM2 (162 s against 66 s), and the speed work of 26 October made that time acceptable (decision 12).

**What else was considered.** Qwen2.5 0.5B and 1.5B, gemma3-1b. Qwen2.5 0.5B was measured and its summaries were less accurate. Qwen2.5 1.5B was not measured because the benchmark run stopped. gemma3-1b did not load with this WebLLM version.

**The trade-off.** The main model is slower. The Fast choice is quicker, and its summaries are often muddled or wrong.

**Revised.** Until 26 October the built-in graphics switched to SmolLM2 by themselves (decision 7). That automatic switch is removed. The records made before 26 October are labelled "SmolLM2 default".

**What you can say.** "The project uses Llama 3.2 1B on every chip. SmolLM2 is there for a person who chooses speed over accuracy, and for a computer that cannot hold the big model."

## 5. Part size, the reading budget, the short prompts and the temperature

**What was decided.** A part holds at most 6,000 characters, about 1,500 tokens, so one part fits the 4,096-token window with room for the answer. On built-in graphics the page is cut before it is read: the back matter and markers are removed, and then the text is shortened to a reading budget of 6,000 characters (decision 12). The answers on built-in graphics are short: 3 sentences for a single part, 2 per part of a longer page, and 4 or 5 for the merge. The temperature is 0.2. A page that needs more than 12 parts is refused.

**Why.** The window limits what one prompt can hold. The chip reads slowly, so reading less and writing less are the only ways to keep the time down.

**What else was considered.** Halving a part when it does not fit the window. The record listed this as part of the plan and it was not built at first. It was built on 24 October, after the real-Chrome failure. When WebLLM refuses a part for size, the part is cut in half at a break and each half is summarized, up to three levels deep and never for text under 600 characters.

**The trade-off.** The reading budget covers only about a fifth of a long page. The rest is not summarized unless the person chooses "Read the whole page (slower)". The repository does not show that 6,000 characters gives better summaries than another size.

**Revised.** A small model copied the start marker into its answer, so the markers are removed from every answer. The cleaners also now remove a repeated copy of the prompt's own safety sentence and an empty "Summary:" label, which become EMPTY_ANSWER (26 October).

**What you can say.** "Each part is about 1,500 tokens, so it fits the model's window. On the slow chip the page is cut to about one part and the answers are short, and the popup says how much was read."

## 6. The model files are kept in IndexedDB, not Cache Storage

**What was decided.** WebLLM stores the model in IndexedDB, with `cacheBackend: 'indexeddb'` in `offscreen.js`. The page checks whether the model is stored before it loads, so a stored model is shown as loading and never as a download.

**Why.** WebLLM's default store, Cache Storage, failed inside the extension's hidden page with `UnknownError: Failed to execute 'open' on 'CacheStorage'`. IndexedDB worked, with about 10.7 GB of quota in the test.

**What else was considered.** The default Cache Storage, which failed.

**The trade-off.** The extension needs `unlimitedStorage`, so Chrome does not delete the 695 MB model when disk space is low.

**What you can say.** "The model is kept in IndexedDB, because the default store failed inside the hidden page, and the extension asks for unlimited storage so the model is not deleted."

## 7. On built-in graphics: no automatic switch to the small model

**What was decided at first.** When WebGPU reports an Intel built-in chip, the extension chose SmolLM2 360M by itself and showed a note that a separate card is much faster.

**Why it was decided.** On the Intel chip the 1B model wrote about 2 tokens a second, in an unsaved speed test (DEVLOG, 21 October), and its first answer took 36 seconds to prepare. The record set a warning line of about 60 seconds for one part.

**What changed.** On 24 October the real Chrome failed on the Wikipedia article, and a hidden run of the same case timed out at 180 s. With the new code the article took 616 s with SmolLM2 on the whole page, and its summary was not reliable. On 26 October the owner said that 10 minutes is far too long and asked for speed, with a bigger model accepted if it fits. The automatic switch was removed (decision 12). The note on built-in graphics stays.

**The trade-off.** The main model is slower per part, but the page is shortened, so the total time is about two minutes instead of ten.

**What you can say.** "On built-in graphics the extension used to switch to the small model by itself. Now it keeps the accurate model and makes the job smaller instead, and the person can still choose the small model."

## 8. Making Chrome use the separate card is opt-in only

**What was decided.** The script `setup.bat --gpu` sets one per-user Windows value, `GpuPreference=2`, that asks Chrome to use the high-performance card. It is never run by default. Undo is `scripts\set-chrome-gpu.ps1 -Remove`.

**Why.** On a laptop with two chips Chrome often starts on the weak one. The project owner does not want Windows settings changed without asking.

**What else was considered.** Changing the setting automatically, or leaving it to the user with no help.

**The trade-off.** The script was tested only against a throw-away registry key, not against a real Chrome.

**Revised.** The script finds Chrome by itself, so the undo command works as written. If the setting cannot be changed, `setup.bat --gpu` says so and carries on. The client's laptop has one chip, so the option does not apply there.

**What you can say.** "The separate card is used only when the user asks for it, because it changes a Windows setting, and one command undoes it."

## 9. A pretend model for most tests, and one real run for proof

**What was decided.** Most browser scenarios use a pretend model, selected with `?mock=<mode>`, which now has twelve modes. Real-model runs are separate, through `scripts/local-run.mjs`.

**Why.** A real model cannot be made to fail on demand. The pretend model can produce a download failure, an out-of-memory error, no WebGPU, a prompt that is too long, or a crash. The real-model runs prove that the real thing works.

**What else was considered.** Testing only with the real model, which would be slow and could not force the failures.

**The trade-off.** The pretend model proves the extension's logic, not the model's quality. The scenarios run in hidden Chromium, not in the daily Chrome.

**Revised.** The browser scenarios now number 31 and the unit tests 93. The scenario for the shortened page and the whole-page button (V28) and the Quality choice (V29) use the pretend model too.

**What you can say.** "The browser scenarios use a pretend model so that failures can be forced. The real model was run separately, and those runs are the proof that it works."

## 10. Version 1 stays untouched

**What was decided.** Version 2 lives in `finalsem/`. Nothing under `midsem/` was edited. Shared parts, such as the chunker, the merger and the pipeline, were copied, not linked.

**Why.** The midterm submission must stay as it was. Copies let each version run by itself from its own folder.

**The trade-off.** A bug fixed in one copy must be fixed in the other by hand. The DEVLOG records a case: a closed-tab bug fixed in Version 1 (B4) came back in a different form in Version 2 and was fixed again there.

**What you can say.** "Version 1 is untouched, and the shared code was copied, so each version runs on its own."

## 11. A spike before building, and the risk tested first

**What was decided.** Before any code was written, the core choices were put as a written question to a second, stronger model (recorded as "Opus" in `DECISIONS.md`). The biggest risk, running WebLLM without a bundler inside an offscreen page and a worker at a usable speed, was tested first with a throw-away extension in a hidden browser.

**Why.** Running a model in a browser extension was new to the project. The spike found problems, and the Cache Storage failure is one of them (decision 6).

**What else was considered.** Building the full extension first and testing later.

**The trade-off.** The spike did not test a long, dense page on the slowest chip. The first real-Chrome run on that case, on 24 October, found the gap. The same method was used again on 26 October, with the same kind of question put to Opus (decision 12).

**What you can say.** "The biggest risk was tested first with a throw-away extension, and the real runs later found what the spike had missed."

## 12. Speed on the client's laptop: read less, keep the accurate model (26 October)

**Why it came up.** The client's laptop has only built-in graphics: an Intel Iris Xe chip on a 15-watt processor, with 16 GB of memory and 363 GB free (`finalsem/docs/CLIENT_LAPTOP.md`). On the developer's Intel chip a long Wikipedia page took about 10 minutes with the small model, and the owner asked for it to be as fast as possible, with a bigger model accepted if it fits.

**What was measured** (`docs/test-runs/bench-models.md`, `scripts/bench-models.mjs`). On the built-in chip the model reads only 15 to 40 tokens a second whatever its size, and reading takes about 80 percent of the time of one part. Llama 3.2 1B reads at 15.6 and writes at 2 tokens a second, and one realistic part takes 162 s. SmolLM2 360M reads at 26 to 29 and writes at 4.8, and takes 66 s for the same part. The 4-bit versions with 32-bit math were no faster at reading and slower at writing.

**The question put to Opus** (a second, stronger model, as a written brief with these numbers) and its answer:

| # | Question | Answer | What was done |
|---|---|---|---|
| 1 | Default model on built-in graphics | Llama 3.2 1B, accurate and 2.4 times slower per part. Do not show a model choice on the main screen; put Quality under Settings. | Done. The automatic switch to SmolLM2 is removed. Quality: Better or Fast is under Settings. |
| 2 | How much of a page to read | Keep 6,000 characters, exactly one part, so no merge request. Aim for about 2 minutes warm and 3 with the first-answer warm-up. | Done. `readBudgetIntegrated` is 6,000, and the page is shortened in `condense.js`. |
| 3 | Shorter answers | 3 sentences for a single part (130 tokens), 2 per part (90), 4 or 5 for the merge (180), and every cut answer ends at its last full stop. | Done for built-in graphics only. |
| 4 | A different runtime | Not now. First run the same benchmark in a visible Chrome window on mains power, because reading at 15.6 tokens a second is far below what the chip should do. Only if reading is still slow, try Transformers.js on one page, half a day at most, and switch only if reading is at least two times faster. | Visible-window run done on the developer's laptop on 28 October: 118.7 s, 101.7 s and 116.7 s, against 124.6 s hidden, with no slowdown. Transformers.js not tried. |
| 5 | Biggest risk | None of the numbers is from the client's chip. First action: run the extension on the client's laptop with a timing log for both models on the same page, which also downloads the 695 MB model in advance. | Open. See the timing run in chapter 03. |

**Also built, from the same advice:** the model is loaded and warmed while the popup is open, when it is already stored; back matter and markers are cut before reading; the popup says when a page was shortened and offers "Read the whole page (slower)" with a rough time estimate; the Quality choice is in Settings.

**Result on the developer's Intel chip** (`docs/test-runs/v2-local-intel-better.md`). The Wikipedia Lighthouse page took 124.6 s, against about 616 s with the small model on the whole page. The popup stated that 21 percent of the text was read, and that reading all of it would take roughly 692 s. The long fixture took 103.8 s, with half its text read. The short fixture took 200.6 s with the first use, including the 118 s download. The records say the three summaries were accurate and fluent. Fast, with SmolLM2, took 39.5 s for the short fixture and 64.7 s for the Lighthouse page, but its Lighthouse answer was a failed summary, made before the cleanup fix.

**The trade-off.** The shortened summary covers about a fifth of a long page, and the whole page takes 5 to 12 minutes on built-in graphics. The estimate for the whole page is a rough guess from the measured speed.

**What is still open.** The client's laptop has not been timed. The visible-window run on mains power was made on the developer's laptop on 28 October, with no slowdown over three runs. Transformers.js has not been tried, and is needed only if a shorter time is wanted.

**What you can say.** "The slow chip reads about 15 tokens a second, so the project reads less of a long page and writes short answers. The main model stays, and the person decides whether to trade accuracy for speed."

## What this means in plain words

The decisions came from four needs: the page text should stay on the computer, the extension should work on the laptop the client has, the model should load without a build step, and each claim should be backed by a measurement. Each choice costs something. The model's quality on the slow chip is not measured across many pages, the reading budget covers only part of a long page, and the client's laptop is untested. Learn the cost as well as the choice, because a tutor will often ask about the cost first.
