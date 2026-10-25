# Page Summarizer, Version 2 (final sem)

A Chrome extension that summarizes the page you are reading. In Version 2 the summary is made by a small language model that runs **inside your browser, on your own graphics card**. There is no account, no API key, and the page text never leaves your computer.

Version 1 (in [../midsem](../midsem)) sent the page text to Google's Gemini service. Version 2 replaces that with a model that lives on the laptop. Everything around it (reading the page, cutting long pages into parts, the popup, the job handling) is reused from Version 1.

## What you need

| Thing | What is needed |
|---|---|
| Computer | Windows 10 or 11 |
| Browser | Google Chrome 116 or newer |
| Graphics | A graphics chip that WebGPU can use, with the `shader-f16` feature. Most graphics cards from the last six years have it. About 1 GB of free graphics memory. |
| Disk space | About 3 GB free (the main model is about 695 MB; Chrome keeps some extra copies while it unpacks it) |
| Internet | Only for the first download of the model. After that it works with no internet. |

If the computer cannot do this, the popup says so in plain words instead of failing quietly. Run `scripts\check-computer.ps1` to see what your computer has (it prints the Windows version, memory, graphics chips and free disk space, and tells you what to change).

## Install (for the client)

1. Get the project: `git clone https://github.com/Vickey-vijay/DISSCO_web-page-summarizer.git`
2. Open the folder `finalsem\project` and **double-click `setup.bat`**. Wait for `SETUP COMPLETE`. If it says `SETUP FAILED`, it tells you what is missing; the details are in `setup.log`.
3. **Double-click `run.bat`.** Chrome opens on its extensions page. Follow the four steps shown in the window: turn on Developer mode, click Load unpacked (the folder path is already on your clipboard), pin the extension.
4. Open any article, click the Page Summarizer icon, press **Download model and summarize**. The first time, the popup shows the download and then "Loading the model into the graphics card". Later it just says **Summarize this page**.

### Built-in graphics only (the client's laptop) and laptops with two graphics chips

The client's laptop (HP 15, Core i7-1355U, 16 GB, Intel Iris Xe built-in graphics, no separate card; details in [docs/CLIENT_LAPTOP.md](docs/CLIENT_LAPTOP.md)) runs on its built-in graphics. That chip reads text slowly (about 15 tokens a second for the main model), so on built-in graphics the extension **reads less of a long page**: it cuts the notes and references, keeps the opening and the first sentences of the paragraphs (about 6,000 characters, one part), keeps its answers short, and says so in the popup. A button, **Read the whole page (slower)**, reads everything (about 5 to 12 minutes for a long article). The popup's **Settings** section has a **Quality** choice: Better (Llama 3.2 1B, the default, accurate) or Fast (SmolLM2 360M, about 2 times quicker, but its summaries are often muddled or wrong).

Many other laptops have a weak built-in chip and a stronger separate one (for example NVIDIA). Chrome often uses the weak one. To make Chrome use the stronger chip, either:

- run `setup.bat --gpu` (it writes one value under `HKEY_CURRENT_USER`, which only affects your Windows user; undo it with `powershell -File scripts\set-chrome-gpu.ps1 -Remove`), or
- do it by hand: Windows Settings, System, Display, Graphics, add Chrome, Options, High performance.

Then restart Chrome and open `chrome://gpu`. The line **WebGPU** should say *Hardware accelerated*. `setup.bat --gpu` is never run by default, because it changes a Windows setting; it was tested only against a throw-away registry key, and it has nothing to do on the client's laptop (one chip).

## How it works, in short

```
popup  ->  service worker  ->  offscreen page  ->  web worker  ->  WebLLM  ->  graphics card (WebGPU)
(button)   (owns the job)     (keeps the model     (does the       (runs the
                               loaded)              heavy work)     model)
```

- The **popup** only has a button and shows the job's progress. Close it and the job keeps going.
- The **service worker** owns the job: reads the page, cuts it into parts, asks the model for a summary of each part, then asks for one combined summary.
- The **offscreen page** is a hidden page that Chrome lets an extension open so that a heavy task has somewhere to live. It holds the loaded model. It is closed after 5 minutes of nothing to do, to give the memory back.
- **WebLLM** is the open-source library that loads the model into the graphics card and runs it. The model files are saved in the browser's own storage (IndexedDB) after the first download, which is why the second use needs no internet.

The full explanation, with diagrams, is in the final-sem report (written after this README).

## Measured results

All numbers below were measured in a hidden Chromium (not the daily Chrome window) on the developer's laptop with an NVIDIA RTX 3050 and a separate Intel graphics chip. Raw output is in [docs/test-runs](docs/test-runs), screenshots in [docs/screenshots](docs/screenshots).

| Case | Result |
|---|---|
| First use, model download, NVIDIA | 197 s (first attempt) and 207 s (second attempt, while other programs were using the processor). Download takes most of this; the first answer also needs about 30 s to prepare the graphics card. |
| Short article, model already downloaded, NVIDIA, no internet | 15.3 s |
| Two-part article, model already downloaded, NVIDIA, no internet | 16.5 s |
| Seven-part Wikipedia article (Lighthouse), NVIDIA | 74 s with nothing else running, 101.6 s with other programs running |
| Speed of the model | While writing, 34 to 53 word-pieces ("tokens") per second on NVIDIA in the clean runs (the figure is the last request of each job). A separate speed test on one 6,000-character text measured about 63 tokens per second when writing and about 600 per second when reading. On the built-in Intel chip: 4 to 5 tokens per second with SmolLM2, about 2 with Llama 3.2 1B. |
| Reading speed on the built-in Intel chip | 15.6 tokens a second for Llama 3.2 1B, 26 to 29 for SmolLM2 360M (about 600 on the NVIDIA chip). Reading the page is about 80 percent of the time of one part; the speed hardly grows when the model gets smaller ([docs/test-runs/bench-models.md](docs/test-runs/bench-models.md)). |
| Wikipedia "Lighthouse" on the built-in Intel chip, **before** the speed work (SmolLM2, whole page, 7 parts) | 616.4 s (a failed run with the 3-minute limit and a second try of 704.5 s are also recorded) |
| Wikipedia "Lighthouse" on the built-in Intel chip, **now** (Llama 3.2 1B, page shortened to 21 percent, one part) | **124.6 s**. The popup says it read about 21 percent and that reading all of it would take roughly 12 minutes. |
| Long fixture article on the built-in Intel chip, now | 103.8 s (about half of the text read) |
| First use on the built-in Intel chip, now (short article, includes the 695 MB download and the warm-up) | 200.6 s |
| Quality: Fast (SmolLM2) on the built-in Intel chip | short article 39.5 s, Lighthouse 64.7 s, but its Lighthouse summary was a failure (it repeated the prompt); this is why Fast is not the default |

"No internet" here means the outside websites were made unreachable for the test browser (only the local test server stayed reachable). The summary was still produced from the model stored in the browser.

## Not yet verified

- A test on the **client's laptop** itself. Its details are known ([docs/CLIENT_LAPTOP.md](docs/CLIENT_LAPTOP.md)), but every number above is from the developer's laptop in a hidden Chromium. Its Iris Xe chip has more execution units than the developer laptop's built-in chip but runs at 15 watts, so its real speed is to be measured (expected: about 2 minutes for a long page, about 3 minutes the first time).
- The same benchmark in a **visible Chrome window on mains power** (advised by the decision record D7 in [docs/DECISIONS.md](docs/DECISIONS.md)); a different engine (Transformers.js) was not tried.
- `setup.bat --gpu` against a real Chrome installation.
- A manual click-through in the real (visible) Chrome, using the checklist for V2. Every test so far ran in hidden Chromium.
- Languages other than English. The model is small and is meant for English text.

## For developers

```
cd finalsem\project
setup.bat --dev          # also installs Playwright and its test browser (needs Node.js 20+)
npm test                 # unit tests (no browser, no network)
npm run test:e2e         # browser tests with a pretend model (fast, hidden Chromium)
node scripts/local-run.mjs nvidia          # real model: first use, then repeats (downloads ~700 MB once)
node scripts/local-run.mjs nvidia-offline  # real model with outside websites blocked
node scripts/local-run.mjs intel-better    # real model on the built-in Intel chip, the default settings (first case downloads 695 MB)
node scripts/local-run.mjs intel-fast      # the same with Settings > Quality: Fast
node scripts/bench-models.mjs              # reading and writing speed of several small models on this computer
node scripts/secret-scan.mjs               # check the repository for keys before pushing
```

- The browser tests use a **pretend model** (`?mock=<mode>` on the offscreen page) so they are quick and need no graphics card. Modes: `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html`, `slow`. One real-model script then proves that the real thing works.
- The tests run hidden so they do not disturb your work. `HEADED=1` shows the window.
- Test-only settings (`chunkChars`, `maxChunks`, `engineMode`, `generateTimeoutMs`, `idleCloseMs`, `modelOverride`) can be put in `chrome.storage.local`.
- `src/lib/web-llm.js` is the WebLLM library (version 0.2.86, Apache 2.0 licence, text included in the file).

## Folder layout

```
finalsem/
  README.md        this file
  project/         the extension (load this folder in Chrome), setup.bat, run.bat, tests, scripts
    src/core/        parts shared with V1: chunker, merger, pipeline, prompts, errors, settings; plus the graphics-card check
    src/engines/     local.js: the engine that talks to the offscreen page
    src/background/  service-worker.js (the job) and offscreen-manager.js (opens/closes the hidden page)
    src/offscreen/   the hidden page, the web worker and the pretend model for tests
    src/ui/          popup
  docs/
    screenshots/   pictures taken by the real-model runs
    test-runs/     raw results (JSON) and readable tables (Markdown)
    figures/       diagrams for the report
```
