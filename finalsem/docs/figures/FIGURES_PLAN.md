# Brief: Version 2 figures

Goal: make the diagrams for the Version 2 report. Put EVERYTHING in `finalsem/docs/figures/` (create it). Do NOT change anything under `midsem/`.

Start by copying `midsem/docs/figures/build-figures.mjs` to `finalsem/docs/figures/build-figures.mjs` and reading it; reuse its helpers, palette, text-width logic and rules (all text at least 22 px, box titles 24 to 26 px bold, at most 1000 px tall, 1600 px wide, no text wider than its box, paper/ink/brick palette, not a "default AI blue" look). Fix the paths in the copy (`PROJECT` must point to `finalsem/project`; output SVGs to `finalsem/docs/figures/svg`, PNGs to `finalsem/docs/figures`). Delete the V1 figure definitions from the copy and write the V2 ones. Render with Playwright's headless Chromium (it is installed under `finalsem/project/node_modules`; run with the default hidden mode; never open a visible window). After building, open every PNG yourself (Read tool) and check legibility, overlaps and clipped text. Build a contact sheet `_contact-sheet.png`.

Names are `V01_...` to `V17_...`. For each figure read the real source first so every box and arrow is true of the code. Names used in boxes must match the code (file names, message names, error codes).

| ID | File name | What it shows | Source to read |
|---|---|---|---|
| V01 | V01_context | The user, Chrome, the page they read, the extension, and the model that lives on the laptop. No cloud arrow (show a crossed-out cloud: "no data leaves the computer"); one dashed arrow to the model host for the first download only. | `finalsem/README.md`, `src/background/offscreen-manager.js` |
| V02 | V02_layers | The layers: popup, service worker, offscreen page, web worker, WebLLM, WebGPU on the graphics card; beside them the stores (chrome.storage.session for the job, IndexedDB for the model files, chrome.storage.local for settings). | `src/**`, `manifest.json` |
| V03 | V03_first_run_vs_cached | Two sequence diagrams side by side or stacked: first use (check the card, download, load, warm up, summarize) and later use (check cache, load, summarize). Use the measured times only as labels where real: 197 s cold, 15.3 s offline short. | `docs/test-runs/v2-local-nvidia-cold-first-attempt.md`, `docs/test-runs/v2-local-nvidia-offline.md` |
| V04 | V04_model_preparation | Flow chart of `prepare()`: check status, integrated GPU gives the small model, download if not cached, load, warm-up, errors GPU_MEMORY / MODEL_LOAD_FAILED retry once with the small model. | `src/engines/local.js`, `src/core/gpu-check.js` |
| V05 | V05_offscreen_messages | The message protocol between service worker and offscreen page: LOCAL_STATUS, LOCAL_LOAD, LOCAL_GENERATE, MODEL_PROGRESS, KEEPALIVE every 10 s, and the idle close after 5 minutes. | `src/background/offscreen-manager.js`, `src/offscreen/offscreen.js` |
| V06 | V06_job_phases | The job phases shown in the popup in order: extracting, checking, downloading, loading, warming up, summarizing (part n of m), merging, done / error. Show which phases are skipped when the model is already downloaded. | `src/ui/popup.js` (`progressLabel`), `src/core/pipeline.js` |
| V07 | V07_v1_vs_v2 | Side-by-side comparison table-like figure: V1 (cloud Gemini, key needed, internet needed, speed, privacy) versus V2 (local model, no key, internet only once, speed measured, text stays on the laptop). | `finalsem/README.md`, `midsem/docs/test-runs/` for V1 timings |
| V08 | V08_speed_chart | Bar chart, NVIDIA RTX 3050 versus Intel built-in graphics: decode speed in tokens per second and time for the first short answer. Only real numbers from `finalsem/docs/test-runs/*.json` (use the clean runs; label any run done while other programs were running). If the Intel numbers are not yet in a file, leave a clearly labelled gap and tell me. | `finalsem/docs/test-runs/` |
| V09 | V09_cold_timeline | Horizontal timeline of the first-use run (download, loading into the card, warm-up, summarizing) with seconds taken from the first cold run. | `docs/test-runs/v2-local-nvidia-cold-first-attempt.md` |
| V10 | V10_storage | What is stored where and for how long: model files (IndexedDB, stays), job record (session storage, until the browser closes), settings (local storage), the loaded model (graphics memory, freed after 5 minutes idle). | `src/**`, `manifest.json` |
| V11 | V11_error_flow | Errors and what the user sees: NO_WEBGPU and NO_SHADER_F16 (blocked, popup explains), GPU_MEMORY (retry with small model), MODEL_DOWNLOAD_FAILED, MODEL_LOAD_FAILED, TIMEOUT, EMPTY_ANSWER, TOO_LITTLE_TEXT, RESTRICTED_PAGE, INTERRUPTED, CANCELLED. Use the real messages from `src/core/errors.js`. | `src/core/errors.js`, `src/core/engine-errors.js` |
| V12 | V12_deployment | What runs where on the client laptop: Chrome processes (page, extension service worker, offscreen page, GPU process), the graphics card, disk (model cache). | `finalsem/README.md`, `manifest.json` |
| V13 | V13_repo_tree | Folder tree of `finalsem/` with one-line notes. | the real folder |
| V14 | V14_reuse_v1_v2 | Which V1 modules were reused unchanged, which were changed, which are new. Compare real file lists of `midsem/project/src` and `finalsem/project/src` (diff them) so the labels are true. | both `src` folders |
| V15 | V15_how_a_model_writes | The AI explainer: page text, tokens, the model reads all tokens (prefill), then writes one token at a time (decode) until finished; show the numbers measured (about 600 tokens per second reading, 40 to 63 writing, NVIDIA). | `DEVLOG.md`, `docs/test-runs/` |
| V16 | V16_chunking_v2 | A long page cut into parts of about 6000 characters (`chunkChars`), each summarized, then merged; limit `maxChunks` 12 (TOO_LONG above). Use the 7-part Lighthouse example (74.1 s clean run). | `src/core/chunker.js`, `src/core/merger.js`, `docs/test-runs/v2-local-nvidia-cold-first-attempt.md` |
| V17 | V17_two_graphics_chips | A laptop with two graphics chips: Chrome by default uses the Intel chip (about 2 tokens per second); the flag `--force_high_performance_gpu` or the Windows Graphics setting (`setup.bat --gpu`) makes it use the NVIDIA chip (about 40 to 63). | `scripts/set-chrome-gpu.ps1`, `DEVLOG.md` |

Rules:
- Every figure has a plain title strip and fits the page when printed (portrait pages: width 1600, height at most 1000).
- Do not invent numbers. If a number is not in a repository file, leave it out.
- No clipart look, no gradients, no icons from icon fonts. Boxes and arrows only, with the palette in the copied generator.
- When done, write `finalsem/docs/figures/FIGURES.md`: a table of ID, file, one-sentence caption, source files used.
- Report: the list of files made, anything you could not verify, and any text that looked clipped.
