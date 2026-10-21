# The big decisions, in your own words

*Purpose: this chapter explains the eleven decisions in `finalsem/docs/DECISIONS.md` the way you would say them out loud at the viva, with the reason, the alternatives, the cost, and one sentence to learn.*

Each decision follows the same five parts. The first says what was decided. The second gives the reason. The third lists what else was considered. The fourth states the trade-off. The last is one sentence to say aloud. Learn the last sentence for each, then say it without the notes.

Where a number appears, it comes from `DECISIONS.md`, from `DEVLOG.md`, from the saved test-run files, or from the code. Numbers that come from an unsaved speed test are labelled that way. The repository does not score summary quality, so any claim about quality is marked as not measured. Decisions 2, 4, 5 and 8 were revised after the code review, and each one says how.

## 1. The library is WebLLM, copied in as one file

**What was decided.** The model runs with WebLLM, version 0.2.86 according to the README and the decision record. Its single file is copied into `src/lib/web-llm.js`, and no bundler is used. Transformers.js was kept as a second plan, in case the first spike failed.

**Why.** WebLLM already runs small models on WebGPU, and it lists the models the project uses. Copying the file keeps setup the same as in Version 1, with no build step.

**What else was considered.** Transformers.js. The first spike worked, so the second plan was not needed.

**The trade-off.** The project depends on one library's file, and an update means copying a new file and testing it again.

**What you can say.** "The project uses WebLLM, copied into the folder as one file, so the setup stays as simple as Version 1."

## 2. The model runs in a hidden page, not in the service worker

**What was decided.** The model is held by an offscreen page, which is a hidden page that Chrome lets an extension open. Inside it, a web worker runs WebLLM's handler. The job itself stays in the service worker.

**Why.** The offscreen page's own comment gives the reason: Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load. The page stays open while the model is needed.

**What else was considered.** Keeping the model in the service worker, which Chrome may stop. The decision record does not list any other place for the model.

**The trade-off.** The offscreen page is one more part to start, message and close. It keeps the model in graphics memory until the five-minute idle countdown ends.

**Revised after review.** The page is never closed while a message is running. The manager counts messages in flight, and the countdown starts only when the last one finishes.

**What you can say.** "The model runs in a hidden page because Chrome can stop the background worker when it is idle, and the page keeps the model ready. It is only closed when no work is running."

## 3. Local only, with no key

**What was decided.** Version 2 runs only on the computer. The key box is gone. The first use shows one button, "Download model and summarize", with a progress bar. Version 1 stays as the cloud version.

**Why.** The decision record gives the purpose: the summary should need no account, no key and no network after the download, and the page text should never leave the computer.

**What else was considered.** Keeping the cloud engine as a fallback for computers without WebGPU. The record says the answer would change if the client's laptop had no WebGPU: the cloud engine would come back. The client's laptop has not been checked, so that condition is still open.

**The trade-off.** A computer without WebGPU or without `shader-f16` cannot run Version 2. The popup says so in plain words, and nothing is sent to the cloud instead.

**What you can say.** "Version 2 is local only, so no key is needed and the page text never leaves the computer. The cost is that a computer without the right graphics support cannot run it."

## 4. The model: Llama 3.2 1B by default, SmolLM2 360M as the fallback

**What was decided.** The primary model is Llama 3.2 1B, id `Llama-3.2-1B-Instruct-q4f16_1-MLC`. The fallback is SmolLM2 360M. The fallback is chosen when the computer reports less than 8 GB of memory, when the graphics card is built into the processor, or when the primary model fails to load with a memory or load error.

**Why.** The 1B model was the one measured at a usable speed on the NVIDIA card, at 34 to 53 tokens a second in the saved clean runs. The 360M model needs about 376 MB of graphics memory against 879 MB for the 1B, and it was the model measured on the Intel chip. No larger model was tried.

**What else was considered.** Qwen2.5 0.5B, which needs 945 MB, and which the record calls weaker. Qwen3 0.6B, which needs 1,403 MB and has a thinking mode.

**The trade-off.** The 1B model's summary quality was not measured. The saved outputs show faults, such as meta-comments and repeated facts, which chapter 06 explains.

**Revised after review.** When the smaller model writes a summary after a memory or load failure, the popup now says so above the summary: "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." Before the review, nothing on the screen said so. The choice is also kept (`modelOverride`) and is never cleared, which is a limit still standing.

**What you can say.** "The project uses Llama 3.2 1B and falls back to SmolLM2 360M when the computer is weak or the big model will not load, and the popup tells the user when the smaller model wrote the summary."

## 5. Part size, answer length, the prompt and temperature

**What was decided.** A part holds at most 6,000 characters, about 1,500 tokens. A part's summary is limited to 300 tokens, and the final summary to 320 tokens. The temperature is 0.2. The prompt puts the page text first, between markers, and one fixed instruction after it. A page that needs more than 12 parts is refused.

**Why.** The model's window is 4,096 tokens, so the part must leave room for the prompt and the answer. A short prompt suits a small model. A low temperature keeps the answer close to the text.

**What else was considered.** Halving the part and trying again if the model reports a window error. The record lists this as part of the plan, and it was not built, because no run hit a window error and the 12-part limit refuses long pages first.

**The trade-off.** The part size was chosen by reasoning and tested for the path, not tuned for quality. The repository does not show that 6,000 characters gives better summaries than another size.

**Revised after review.** A small model sometimes copied the start marker into its answer, as the saved Intel summary shows. `stripPageMarkers` now removes the markers from every answer. The saved output and its screenshot were recorded before this fix, so they still show the marker. The repeated opening sentence in the 1B model's merged answer is not fixed. It is listed as a limit.

**What you can say.** "Each part is about 1,500 tokens, so the page and the answer fit the model's 4,096-token window. The page markers are removed from the answer, and pages longer than 12 parts are refused."

## 6. The model files are kept in IndexedDB, not Cache Storage

**What was decided.** WebLLM is set to store the model in IndexedDB, with `cacheBackend: 'indexeddb'` in `offscreen.js`. The page checks whether the model is stored before it loads, so a stored model is always shown as loading and never as a download.

**Why.** WebLLM's default store, Cache Storage, failed inside the extension's hidden page with `UnknownError: Failed to execute 'open' on 'CacheStorage'`. IndexedDB worked there, with about 10.7 GB of quota in the test.

**What else was considered.** The default Cache Storage, which failed. The record does not list another store.

**The trade-off.** The extension needs the `unlimitedStorage` permission, so Chrome does not delete the 695 MB model when disk space is low.

**What you can say.** "The model is kept in IndexedDB, because the default store failed inside the hidden page, and the extension asks for unlimited storage so the model is not deleted."

## 7. On the built-in graphics chip, the extension uses the small model by itself

**What was decided.** When WebGPU reports an Intel chip with the `gen` architecture name, the extension chooses SmolLM2 360M and shows a note that a separate card is much faster.

**Why.** On the Intel chip the 1B model wrote about 2 tokens a second, in an unsaved speed test (DEVLOG, 21 October), and its first answer took 36 seconds to prepare. The record set a warning line of about 60 seconds for one part. The small model was chosen to get below that line on this chip. Even with it, the saved Intel run took 76 seconds to write one short summary, which the record names as above the line.

**What else was considered.** Refusing to run on integrated graphics. The record chose a note and a slower answer, because a slow answer is more useful than a refusal.

**The trade-off.** Summaries on the Intel chip take minutes, not seconds. The saved runs took 199.2 s for a short article on first use and 149.1 s for a two-part article. The small model's summaries are weaker than the 1B model's, and no quality test was made.

**What you can say.** "On the built-in graphics the extension switches to the small model by itself, because the big one was too slow there to be useful. It says so on screen."

## 8. Making Chrome use the separate card is opt-in only

**What was decided.** The script `setup.bat --gpu` sets one per-user Windows value, `GpuPreference=2`, that asks Chrome to use the high-performance card. It is never run by default. Undo is `scripts\set-chrome-gpu.ps1 -Remove`.

**Why.** On a laptop with two chips Chrome often starts on the weak one. The high-performance card gave about 63 tokens a second in the unsaved speed test, against about 2 on the built-in chip. The project owner does not want Windows settings changed without asking.

**What else was considered.** Changing the setting automatically, or leaving it to the user with no help. The record chose the explicit switch and a manual route in the README.

**The trade-off.** The script was tested only against a throw-away registry key, not against a real Chrome. It is not yet proven on the client's laptop.

**Revised after review.** The script finds Chrome by itself, so the undo command in the README works as written. If the setting cannot be changed, `setup.bat --gpu` now says so and carries on.

**What you can say.** "The separate card is used only when the user asks for it, because it changes a Windows setting, and one command undoes it."

## 9. A pretend model for most tests, and one real run for proof

**What was decided.** Most browser scenarios use a pretend model, selected with `?mock=<mode>`. Real-model runs are separate, through `scripts/local-run.mjs`.

**Why.** A real model cannot be made to fail on demand. The pretend model can produce a download failure, an out-of-memory error, or no WebGPU, so each failure path is tested. The real-model runs prove that the real thing works.

**What else was considered.** Testing only with the real model. That would be slow, need a graphics card in every scenario, and could not force the failures.

**The trade-off.** The pretend model proves the extension's logic, not the model's quality. The browser scenarios run in hidden Chromium, not in the daily Chrome.

**What you can say.** "The browser scenarios use a pretend model so that failures can be forced. The real model was run separately, and those runs are the proof that it works."

## 10. Version 1 stays untouched

**What was decided.** Version 2 lives in `finalsem/`. Nothing under `midsem/` was edited. Shared parts, such as the chunker, the merger and the pipeline, were copied, not linked.

**Why.** The midterm submission must stay as it was. Copies let each version run by itself from its own folder.

**What else was considered.** Linking the shared files from one folder. The record does not say why this was rejected, so do not claim more than the copying.

**The trade-off.** A bug fixed in one copy must be fixed in the other by hand. The DEVLOG records a case: a closed-tab bug fixed in Version 1 (B4) came back in a different form in Version 2 and was fixed again there.

**What you can say.** "Version 1 is untouched, and the shared code was copied, so each version runs on its own."

## 11. A spike before building, and the risk tested first

**What was decided.** Before any code was written, the core choices were put as a written question to a second, stronger model (recorded as "Opus" in `DECISIONS.md`). The biggest risk, running WebLLM without a bundler inside an offscreen page and a worker at a usable speed, was tested first with a throw-away extension in a hidden browser.

**Why.** Running a model in a browser extension was new to the project. A spike shows which parts fail before the design depends on them. The spike found problems, and the record describes the Cache Storage failure as one of them (decision 6). The slow Intel chip was measured later, in the real runs (decision 7).

**What else was considered.** Building the full extension first and testing later. The record does not say why it was rejected.

**The trade-off.** The spike was a second piece of work. The answer to the question was given at medium confidence, and the record lists what would have changed it.

**What you can say.** "The biggest risk was tested first with a throw-away extension, and it found the two problems that shaped the design."

## What this means in plain words

The decisions came from four needs: the page text should stay on the computer, the extension should work on the laptop the client has, the model should load without a build step, and each claim should be backed by a measurement. Each choice costs something. The model's quality is not measured, the Intel chip is slow, and the client's laptop is untested. Learn the cost as well as the choice, because a tutor will often ask about the cost first.
