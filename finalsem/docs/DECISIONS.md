# Decisions for Version 2, and why

This file is the record of the big choices for Version 2. The first one was put to a second, stronger model ("Opus") as a written question before any code was written. Its answer is summarized below, with what was followed, what was changed after real measurements, and what was not built. The report and the KT document take their "why" text from here.

## D1. How to run a model in the browser (asked before building, 21 October 2026)

**The question:** which library, where it runs inside a Chrome extension, which model, how big a piece of text to give it, whether to keep the cloud engine, and what the biggest risk is.

**What was known when asking:** the developer laptop (Acer Aspire Lite, Intel i5-12450H, 15.7 GB memory, an Intel graphics chip and an NVIDIA RTX 3050 with 6 GB, Chrome 155). WebGPU worked in the hidden test browser. The library listed these small models: Llama 3.2 1B (879 MB of graphics memory, 4096-token window), Qwen2.5 0.5B (945 MB), SmolLM2 360M (376 MB), Qwen3 0.6B (1403 MB). The client's laptop was unknown.

| # | Question | Answer given | What was done |
|---|---|---|---|
| 1 | WebLLM or Transformers.js | WebLLM 0.2.86, pinned, its single file copied into the project with no bundler. Keep Transformers.js only as plan B if the spike failed. | Followed. The spike worked, so plan B was not needed. File: `src/lib/web-llm.js`. |
| 2 | Where it runs | An offscreen document (reason WORKERS) that hosts one module web worker running the WebLLM handler. The job and the job record stay in the service worker. Send a message every few seconds so the service worker stays awake. Close the offscreen page after about 5 idle minutes. | Followed: `src/background/offscreen-manager.js`, `src/offscreen/*`, keepalive every 10 s, idle close after 5 minutes (`idleCloseMs`). |
| 3 | Which model | Llama 3.2 1B as the default, SmolLM2 360M as the fallback. Skip Qwen2.5 0.5B (bigger than the 1B and weaker) and Qwen3 0.6B (1403 MB and has a thinking mode). Pick by computer: no WebGPU or no shader-f16 gives a clear message; under 8 GB memory gives SmolLM2; if a load fails, try once more with SmolLM2 and remember the choice. | Followed, and one rule was added (D3). Files: `src/core/config.js`, `src/core/gpu-check.js`, `src/engines/local.js`. |
| 4 | Piece size and prompt | 6000 characters (about 1500 tokens) per part, at most 300 tokens per answer, page text first and one fixed instruction after it, temperature 0.2. If the model complains about the window size, halve the part and try again. | Followed for size, answer length, prompt layout and temperature (`chunkChars` 6000, `maxTokensPart` 300, `maxTokensFinal` 320, `src/core/prompts.js`). The "halve and retry" step was **not built**: no run hit a window error, and the part limit (`maxChunks` 12) refuses very long pages first. |
| 5 | Keep the cloud engine? | Local-only. Version 1 stays as the cloud version. The key box goes; first use shows one "Download model" button with a progress bar. | Followed. The popup has no key box. The button says "Download model and summarize" until the model is stored, then "Summarize this page". |
| 6 | Biggest risk and first test | Running WebLLM without a bundler inside an offscreen page plus worker, at a usable speed on the weak graphics chip. Test with a throw-away extension in a hidden browser: download time, load time from cache, seconds per part, then again with the network off. | Done as a spike. It found two problems (D2 below), then the real runs measured the rest. |

**Confidence stated by the answer:** medium (high for items 1, 2 and 4). It said the answer would change if the client's laptop had no WebGPU (bring the cloud engine back), if the spike failed in Manifest V3 (use Transformers.js), or if one part took more than about 60 seconds (make SmolLM2 the default).

**What happened to those "would change" conditions:** the spike did not fail; the NVIDIA chip answers a part in about 5 s. On the Intel chip a short answer took 76 s with SmolLM2 (see `docs/test-runs/v2-local-intel.md`), which is above the 60 s warning line, and that is the reason for D3. The client's laptop is still unknown (details were requested and have not come back).

## D2. Where the model files are stored (found during the spike)

WebLLM stores the model in "Cache Storage" by default. Inside the extension's hidden page that call failed with `UnknownError: Failed to execute 'open' on 'CacheStorage'`. IndexedDB worked there (about 10.7 GB of quota in the test), so the setting `cacheBackend: 'indexeddb'` was used. A side effect is that the extension needs the `unlimitedStorage` permission so the browser does not delete the 700 MB model when disk space is low.

## D3. Weak graphics chip: switch to the small model by itself (decided after measuring)

On the Intel chip the 1B model wrote about 2 tokens a second and the first answer took 36 s to prepare. On the NVIDIA chip the same model wrote about 63 tokens a second in that first speed test (34 to 53 in the later full runs). So when WebGPU reports an integrated chip, the extension chooses SmolLM2 360M (about 204 MB to download) and shows a one-line note that a separate graphics card is much faster. Measured with this rule: short article 199.2 s on first use, two-part article 149.1 s later. It is slow, but it finishes, and that is better than a refusal. The note names the chip ("Intel").

## D4. Making Chrome use the stronger chip (opt-in only)

Chrome often starts on the weak chip on a laptop with two. Two ways to change that: the Windows Graphics setting for Chrome (by hand), or `setup.bat --gpu`, which writes one per-user registry value (`UserGpuPreferences`, GpuPreference=2). The script is **never** run by default because it changes a Windows setting, and the project owner does not want settings changed without asking. It was tested only against a throw-away registry key; it has not yet been tried against a real Chrome on the client's laptop. Undo: `scripts\set-chrome-gpu.ps1 -Remove`.

## D5. Pretend model for tests, one real run for proof

Most browser tests use a pretend model (`?mock=<mode>`) so they are fast, free and need no graphics card, and so that failure cases (no WebGPU, out of memory, a download that fails) can be forced on purpose. A real model cannot be made to fail on demand. The pretend model proves the extension's own logic; separate runs with the real model (`scripts/local-run.mjs`) prove that the real thing works, including with outside websites blocked.

## D6. Version 1 stays untouched

Version 2 lives in `finalsem/`. Nothing under `midsem/` was edited during the Version 2 build, so the mid-semester submission stays as it was. Shared parts (chunker, merger, pipeline, extraction) were copied, not linked, so each version can be run by itself from its own folder.

## D7. Speed on the client's laptop: read less, keep the accurate model (asked on 26 October 2026)

**Why it came up.** The client's laptop has only built-in graphics (Intel Iris Xe, see [CLIENT_LAPTOP.md](CLIENT_LAPTOP.md)). On the developer laptop's Intel chip a long Wikipedia page took about 10 minutes, and the owner asked for it to be as fast as possible, with a bigger model accepted if it fits.

**What was measured** (`docs/test-runs/bench-models.md`, `scripts/bench-models.mjs`): on built-in graphics the model reads only 15 to 40 tokens a second whatever its size, and about 80 percent of the time of one part is reading. Llama 3.2 1B reads at 15.6 and writes at 2 tokens a second (162 s for one realistic part); SmolLM2 360M reads at 26 to 29 and writes at 4.7 (66 s). The 4-bit versions with 32-bit math (q4f32) were no faster at reading and slower at writing. The smaller models were less accurate; Llama 1B was the only one whose summary of the same part had no invented details.

**The question put to Opus** (a second, stronger model, as a written brief with the numbers above) and its answer:

| # | Question | Answer | What was done |
|---|---|---|---|
| 1 | Default model on built-in graphics | Llama 3.2 1B (accurate, 2.4 times slower per part). Do not show a model choice on the main screen; put "Quality: Better / Fast" under Settings. | Done. The popup has a closed "Settings" section with that choice. The automatic switch to SmolLM2 on built-in graphics (D3) is removed: SmolLM2 is now used on built-in graphics only when the person chooses Fast (or after a memory failure, as before). |
| 2 | How much of a page to read on built-in graphics | Keep 6,000 characters (exactly one part, so no merge request). Aim for about 2 minutes warm and 3 minutes with the first-answer warm-up. | Done (`readBudgetIntegrated` 6000, `src/core/condense.js`). |
| 3 | Shorter answers | Yes: 3 sentences for a single part (130 tokens), 2 per part (90), 4 to 5 for the merge (180), and end every cut-off answer at its last full stop. | Done for built-in graphics only (a fast card keeps the richer format). |
| 4 | A different runtime (Transformers.js / ONNX Runtime Web) | Not now. First run the same benchmark in a visible Chrome window on mains power, because reading at 15.6 tokens a second is far below what the chip should do. Only if reading is still slow, try one page with Transformers.js, half a day at most, and switch only if reading is at least 2 times faster. | **Not done.** Everything measured so far ran in a hidden Chromium. The visible-window run needs a window on screen and was not made. |
| 5 | Biggest risk | None of the numbers is from the client's chip or a real Chrome window; Llama could be slower than expected or fail to load. First action: run the extension on the client's laptop with a timing log for both models on the same page, which also downloads the 695 MB model in advance. | Open: see [MANUAL_SMOKE_TEST.md](MANUAL_SMOKE_TEST.md). |

**Also built, from the same advice:** the model is loaded and warmed up while the popup is open (when it is already stored), so the first answer does not wait 30 to 40 seconds; back matter and markers are cut before reading (`src/core/trim-text.js`); the popup says when a page was shortened and offers "Read the whole page (slower)" with a rough time estimate.

**Result on the developer laptop's Intel chip** (`docs/test-runs/v2-local-intel-better.md`): the Wikipedia "Lighthouse" page 124.6 s (before: 616 s with the small model), the long fixture article 103.8 s, the first use including the 695 MB download and the warm-up 200.6 s. The popup stated that 21 percent of the Lighthouse text was read and that reading all of it would take roughly 12 minutes. The summaries were accurate on all three pages. The client's laptop has a faster variant of this chip, but it is a 15-watt processor, so its real speed is still to be measured.
