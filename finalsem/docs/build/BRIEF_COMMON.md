# Common brief for everyone writing Version 2 documents

Work in `C:\Users\Vicke\OneDrive\Desktop\Python\COH_11\Jeffy` (Windows). Write Markdown files only in the folder and with the names your own brief gives. Do not edit anything under `midsem/` or `finalsem/project/`, do not edit other documents, do not commit, never run `scripts/local-run.mjs`, never open visible browser windows.

## Read first, completely
1. `finalsem/docs/build/WRITING_GUIDE.md` (the rules: plain English, humanized, banned words, the chapter structure, the AI topics that belong in Version 2).
2. `finalsem/docs/DECISIONS.md` (why Version 2 is built the way it is).
3. One Version 1 chapter for the format, `midsem/docs/report/05_technology_choices.md` (headings, tables, figure links, the "Questions this chapter answers" section). Version 2 chapters must be deeper than Version 1: more worked examples, more real code snippets (copy real lines from the source, under 25 lines each, in fenced blocks, with the file name on the line above), more screenshots and figures.

## The project
Page Summarizer is a Chrome extension. Version 1 (folder `midsem/`) sends the page text to Google Gemini. Version 2 (folder `finalsem/project`) runs a small language model inside Chrome on the computer's graphics card (WebLLM and WebGPU), so there is no key and the page text never leaves the computer. This is the final-semester documentation for Version 2. Version 1 is finished and documented in `midsem/docs/report/`; call it "Version 1" and reuse its facts only where Version 2 reuses its code.

## Where facts may come from
- The code in `finalsem/project/` (read the files your chapters need; every statement must be true of the code as it is now).
- `finalsem/README.md`, `finalsem/docs/DECISIONS.md`, `DEVLOG.md` (rows dated 2026-10-21 are Version 2; struggles come only from here and from the test-run files), `prd.md`, `abstract/abstract.md`.
- `finalsem/docs/test-runs/*` (the measurements) and `finalsem/docs/screenshots/UI_STATES.md` (if it exists yet).
- Every number must come from one of these files; otherwise write `[to be measured]`. Runs done while other programs were using the processor are labelled so in `finalsem/docs/test-runs/`; never present them as clean. Clean runs: `v2-local-nvidia-cold-first-attempt.md`, `v2-local-nvidia-offline.md`, `v2-local-intel.md`.
- Pieces of general AI background (what a token is, what quantization means) may come from general knowledge, kept short and plain, and tied to the numbers measured here.
- Do not invent supervisor remarks, names, dates or struggles. Use `[Insert ...]` placeholders for personal details.

## Figures and screenshots
Another writer is drawing the figures right now in `finalsem/docs/figures/` (plan and sources: `finalsem/docs/figures/FIGURES_PLAN.md`). File names:
V01_context, V02_layers, V03_first_run_vs_cached, V04_model_preparation, V05_offscreen_messages, V06_job_phases, V07_v1_vs_v2, V08_speed_chart, V09_cold_timeline, V10_storage, V11_error_flow, V12_deployment, V13_repo_tree, V14_reuse_v1_v2, V15_how_a_model_writes, V16_chunking_v2, V17_two_graphics_chips (all `.png`).
Link them as `![Caption](../figures/V04_model_preparation.png)`. If the PNG exists when you write the paragraph, open it and make "Reading the figure" match what is drawn. If it does not exist yet, write the paragraph from the plan and put `<!-- check against figure -->` on the line after the figure line.

Real-model screenshots already exist in `finalsem/docs/screenshots/`: v2-nvidia-short-downloading, v2-nvidia-short-warming, v2-nvidia-short-popup, v2-nvidia-long-popup, v2-nvidia-wikipedia-popup, v2-nvidia-offline-short-warming, v2-nvidia-offline-short-popup, v2-nvidia-offline-long-popup, v2-intel-short-downloading, v2-intel-short-warming, v2-intel-short-popup, v2-intel-long-popup (all `.png`). Open each one you cite and describe exactly what it shows.
Popup-state screenshots made with the PRETEND model are being produced now in the same folder: ui-01-not-downloaded, ui-02-downloading, ui-03-loading, ui-04-warming, ui-05-summarizing-parts, ui-06-merging, ui-07-result, ui-08-ready-to-use, ui-09-intel-note, ui-10-no-webgpu, ui-11-no-shader-f16, ui-12-fallback-after-out-of-memory, ui-13-out-of-memory-all, ui-14-download-failed, ui-15-too-little-text, ui-16-restricted-page, ui-17-interrupted, ui-18-hostile-output-as-text (all `.png`). Link as `../screenshots/<name>.png`. Say in every caption whether it is a "pretend model" or a "real model" screenshot. Open the ones that exist; for the others put `<!-- check against screenshot -->` on the line after.

## What to reply with when done
The files written, the word count of each, every place you were unsure, and every fact you wanted but could not find in the repository.
