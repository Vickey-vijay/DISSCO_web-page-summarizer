# Running a model in the browser

Chapter 2 explained what the model does. This chapter explains how the model reaches Chrome and runs there. Chapter 5 gives the system design, chapter 7 the graphics-card check and the choice of model, chapter 8 the download, storage and first use, chapter 9 the offscreen page and its messages, and chapter 10 the summaries. This chapter outlines those parts and explains the ideas they depend on.

The chain has several links. The popup holds the button and shows progress. The service worker owns the job. The offscreen page is a hidden page that holds the loaded model. A web worker, a separate thread of the browser, runs the WebLLM library, and the library runs the model on the graphics card through WebGPU. The model files sit in the browser's own storage.

## The model file and what 4-bit compression gives up

A photo saved at a lower quality is smaller, and its fine details are lost. The model file is compressed in a similar way: each stored number is rounded to fewer bits.

The stored numbers are the parameters from chapter 2, also called weights. Most of them are kept at 4 bits, where full precision would use 16. The model's name carries the format, `q4f16_1`. The `q4` part means the weights use 4 bits. The `f16` part means the other numbers used while the model runs are 16-bit floating-point numbers. The `_1` is a version label for WebLLM's packing format, which the repository does not describe further.

One billion numbers at 4 bits each take about 0.5 GB. The downloaded file is about 695 MB, so not every part is stored at 4 bits. The repository does not say which parts keep a higher precision.

The cost is precision. Four bits hold only 16 different values, so each stored number approximates the value it came from. The answers can differ a little from those of the full-precision model. The project did not run the full-precision model, so the size of this loss is not measured.

**What this means in plain words.** The model is stored with rounded numbers, which makes the file about three times smaller. The price is a small loss of accuracy that was not measured.

## The model choice, in brief

The two models are listed in `src/core/config.js`.

`src/core/config.js`

```
export const MODELS = Object.freeze({
  primary: Object.freeze({ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', vramMB: 879 }),
  fallback: Object.freeze({ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', vramMB: 376 }),
});
```

The primary model is used on every chip. The smaller model is used in three cases. The first is that the reader chooses "Quality: Fast" under Settings, which is marked as `quality-fast` in the stats. The second is that the primary model fails to start with a memory or load error. The engine then retries once with the smaller model and saves that choice. The extension never clears the saved choice itself, so later summaries stay on the smaller model until the stored settings are cleared. The third is that Chrome reports less than 8 GB of memory. Chrome caps its report at 8, so the developer laptop, with 15.7 GB, is not switched by this rule, and the rule has not been seen on real low-memory hardware. Built-in graphics no longer changes the model. The extension still recognises Intel by name to show the graphics note, and only Intel, so a built-in AMD or Apple chip would get no note.

When the smaller model wrote a summary after the main model failed, the popup shows a notice in the result block.

![Pretend model: the result block with the notice that the smaller model wrote this summary](../screenshots/ui-12-fallback-after-out-of-memory.png)

Reading the screenshot: this is a pretend-model capture, so the three points are fixed test text. The notice reads "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The model line reads "Model: SmolLM2 360M. Downloaded, runs on this computer." Chapter 7 gives the full rules and chapter 12 the failures.

**What this means in plain words.** The 1B model is the default on every chip. The smaller model is a choice for speed, a fallback after a failure, or the choice for a computer that reports little memory. The popup says when the smaller model wrote a summary, and the saved fallback stays until the stored settings are cleared.

## The graphics card, WebGPU and shader-f16

Each step of the model is many multiplications of long lists of numbers. A graphics card has many small calculating units that work on parts of one job together, so it runs the model far faster than a processor. The extension has no path that runs the model on the processor.

WebGPU is the browser's way for a web page to ask the card to do calculations. The project requires Chrome 116 or newer (`README.md`). A shader is a small program that runs on the card. The shader-f16 feature lets those programs use 16-bit floating-point numbers, and the configuration comment says both models need it (`src/core/config.js`). The card must also hold the model: 879 MB of graphics memory for the 1B model and 376 MB for SmolLM2. The developer laptop's NVIDIA RTX 3050 has 6 GB of its own memory (`finalsem/docs/DECISIONS.md`, D1). On the client's laptop the Iris Xe chip shares the 16 GB of main memory (`finalsem/docs/CLIENT_LAPTOP.md`).

If WebGPU or shader-f16 is missing, the popup shows a plain message and disables the button. Scenarios V07 and V08 check both cases with the pretend model. Chapter 7 covers the check.

**What this means in plain words.** The card does the model's arithmetic much faster than the processor. If the card or its 16-bit feature is missing, the extension says so and stops before any download.

## WebLLM, the web worker and the offscreen page

WebLLM is an open-source library that loads a model into the browser and runs it. The project uses version 0.2.86 under the Apache 2.0 licence. It is copied into the project as one file, `src/lib/web-llm.js`, of about 6.8 MB, so the project needs no build step (`finalsem/docs/DECISIONS.md`, D1). The library turns text into tokens, runs the model on the card and turns the output back into text.

The library runs in a web worker, so heavy work does not freeze the page that started it. `src/offscreen/engine-worker.js` starts the library's handler inside that worker. The whole file is four lines.

`src/offscreen/engine-worker.js`

```
import { WebWorkerMLCEngineHandler } from '../lib/web-llm.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message) => handler.onmessage(message);
```

The offscreen page exists because of the service worker. Chrome stops an extension's service worker when it is idle, and a stopped worker would lose the loaded model, which takes seconds to load. The offscreen page is a hidden page that stays alive. It has only the `chrome.runtime` messaging API, so it cannot read the storage or the tabs, and it works purely by messages from the service worker (chapter 9).

Two timing rules govern the page. While it is busy, it sends a keepalive message every 10 seconds, which keeps the service worker awake and also refreshes the job record. It closes after five minutes without work to free the card's memory. It is never closed while a message is still running: only the last message to finish starts the five-minute countdown. The code comment estimates that closing frees about a gigabyte of graphics memory, which was not measured. A job that receives no update for five minutes counts as dead. The answer limit is ten minutes (`generateTimeoutMs` in `src/core/config.js`), a separate rule, so a long answer on a slow chip is not taken for a dead job.

![What runs where on the client laptop: the popup, service worker, offscreen page, web worker, Chrome GPU, graphics card, the disk and the first download](../figures/V12_deployment.png)

Reading the figure: the popup and the service worker sit at the top. The service worker sends messages to the offscreen page, which holds the model and starts the web worker. The web worker runs WebLLM, whose work goes through Chrome's WebGPU to the graphics card. The offscreen page reads and writes the model files in IndexedDB on disk. Hugging Face and GitHub sit outside the laptop, with a dashed arrow for the first download only. The footer says the client's laptop has not been tested and Chrome's own process layout is not measured.

**What this means in plain words.** The model runs in a hidden page and a separate thread, under the library's control. The page stays alive while work is in progress, and it closes after five minutes without work.

## Where the model is kept

WebLLM stores its files in Cache Storage by default. Inside the offscreen page that failed with `UnknownError: Failed to execute 'open' on 'CacheStorage': Unexpected internal error` (`DEVLOG.md`, 21 October 2026). A normal extension page could use Cache Storage, so only this kind of page was affected. The project stores the model in IndexedDB instead, which had about 10.7 GB of quota in the test (`DECISIONS.md`, D2). The switch is one setting in `src/offscreen/offscreen.js`: `cacheBackend: 'indexeddb'`. The manifest also asks for the `unlimitedStorage` permission, so the browser does not delete the model when disk space runs short.

![What is stored where, and for how long: model files, job record, settings and loaded model](../figures/V10_storage.png)

Reading the figure: a table with one row per store. The model files are in IndexedDB, are kept between runs, and no code deletes them. The job record is in session storage until the browser closes, and it is removed when its tab closes. The settings are in local storage and survive restarts, including the saved switch to the smaller model. The loaded model is in graphics memory inside the offscreen page until the page closes, five minutes after the last message or when the browser closes. The footer notes that Version 2 stores no API key.

A wording fault appeared in the timelines of the clean offline run, recorded before the fix. The popup showed "Downloading the model (first time only): 0%" for about 0.8 seconds, although the model was stored and no download was possible. The library's progress text contains the word "fetch", and the code treated any such text as a download. The fix passes the stored state to `mapInitProgress()` in `src/core/gpu-check.js`. The run made after the fix has no "Downloading" line. The DEVLOG rows dated 21 October 2026 record the fault.

**What this means in plain words.** The model lives in the browser's database, so it survives a restart and can hold the large file. Cache Storage did not work in this kind of page, so another store is used. Chapter 8 covers the storage in detail.

## The first use and the warm-up

The first use is slow because the model is downloaded, copied into the card's memory, and the card prepares its programs before the first answer. Chapter 8 gives the stages. The table gives the stage times for the same model, Llama 3.2 1B, on each chip. Both runs started with no stored model.

Table: The first use with Llama 3.2 1B on each chip, in seconds after the button was pressed

| Step | NVIDIA RTX 3050 (`v2-local-nvidia-cold-first-attempt.md`) | Built-in Intel chip (`v2-local-intel-better.md`) |
|---|---|---|
| Download, 0% to 100% | 0.5 to 158 (about 695 MB) | 0.5 to 118.0 (about 695 MB) |
| Load into the card | 158.8 to 162.2 (3.4) | 118.8 to 121.4 (2.6) |
| Warm-up (one short answer) | 162.6 to 193.1 (30.5) | 121.8 to 149.5 (27.7) |
| Writing the summary | 193.1 to 196.8 (3.7) | 149.5 to 200.6 (51.1) |
| Total | 196.8 | 200.6 |

The warm-up sends one answer of one token, to the question "Say ok." (`src/offscreen/offscreen.js`). Its purpose is to compile the card's programs, so the first real summary does not look frozen. The developer notes say the first answer takes about 30 seconds (`DEVLOG.md`). The clean NVIDIA run (30.5 seconds) and the Intel run (27.7 seconds) both match that figure. Since 26 October the popup also starts loading a stored model as soon as it opens, so the warm-up is often over before the first press. The run recorded as 207 seconds, done while other programs were running, took 56 seconds, and its timing is not used as a clean figure. Later offline warm-ups took 0.5 seconds in the clean run and 0.4 seconds after the label fix. The cause of the difference was not investigated.

![Pretend model: the popup during the warm-up](../screenshots/ui-04-warming.png)

Reading the screenshot: a pretend-model capture. The progress line reads "Warming up the model (first time can take about 30 seconds)...". The model line shows "about 664 MB", which is the pretend model's fixed number and not a measurement. The real download was about 695 MB.

Two limits apply to this step. Closing the tab during a download does not stop the download, because the preparation step ignores the abort signal. The model line is not refreshed while a download or warm-up is running (chapter 11).

**What this means in plain words.** The first use waits for the download, the copy into the card and a warm-up of about half a minute, on either chip. Later uses skip the download.

## The second use, with no internet

The second use starts from the stored files. The extension checks the card, asks whether the model is stored (`hasModelInCache()` in the offscreen page), loads the files into the card, runs the warm-up and then summarizes. Nothing is downloaded.

Two clean offline runs on the NVIDIA card, with outside websites blocked, give the timings. The first, recorded before the label fix, took 15.3 seconds for the short article and 16.5 seconds for the two-part article. Its load took 6.9 seconds (`v2-local-nvidia-offline.md`). The second, made after the label fix, took 17.7 and 16 seconds. Its load took 11.6 seconds and its first answer was written at 65 tokens a second. The two-part article's last request, the merge, ran at 45 tokens a second (`v2-local-nvidia-offline-after-label-fix.md`). The run notes say that differences of this size are normal on this laptop.

In the test setup, outside websites were blocked with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, which makes every outside name fail to resolve. Playwright's own offline switch was not used, because it also blocks the extension's pages (`DEVLOG.md`). The extension was loaded from one fixed folder, because its identifier comes from the folder and the stored data belongs to that identifier.

![Real model, NVIDIA chip, offline, after the label fix: the popup while the stored model is warmed](../screenshots/v2-nvidia-offline-short-warming-after-label-fix.png)

Reading the screenshot: a real-model capture made after the label fix. The model line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer." The progress line reads "Warming up the model (first time can take about 30 seconds)...". No "Downloading" line appears.

![Real model, NVIDIA chip, offline, after the label fix: the popup with the finished summary](../screenshots/v2-nvidia-offline-short-popup-after-label-fix.png)

Reading the screenshot: a real-model capture of the short article. The summary is a title line and a numbered list of points. The footer reads "1 part · 1 request · 17.5 s · Llama 3.2 1B".

These tests ran on one computer, with two pages, in a hidden browser. They did not run on the client's laptop or in the visible Chrome window. They show that the stored model works with outside websites blocked on this computer.

**What this means in plain words.** After the first download, the summary runs from the stored model on the laptop. The internet is not needed for later summaries, which was shown on the developer laptop with outside websites blocked.

## One chip on the client's laptop, two on the developer laptop

The client's laptop has one graphics chip, the Intel Iris Xe built into its processor, and no separate card (`finalsem/docs/CLIENT_LAPTOP.md`). The built-in path is therefore the path the client will use. The setup switch `setup.bat --gpu` has nothing to change there.

The developer laptop has two chips. Chrome decides which one a page uses, and the page's request for the high-performance card is only a hint. Chrome used the built-in Intel chip by default. The test flag `--force_high_performance_gpu` made it use the NVIDIA RTX 3050, but that flag belongs to the project's test script, not to a user. The optional setup switch, by hand or with `setup.bat --gpu`, exists only for that laptop (`DECISIONS.md`, D4). Its undo command is `powershell -File scripts\set-chrome-gpu.ps1 -Remove`. The switch has been tested only against a test registry key.

On the built-in Intel chip the 1B model is the default. The run record of 26 October gives the figures (`v2-local-intel-better.md`). A short article took 200.6 seconds on first use, including the download. The Wikipedia article on lighthouses took 124.6 seconds, because the extension read 5,968 of its 27,964 characters, about a fifth. The long fixture article took 103.8 seconds, with about half of its text read. The model wrote at 1.8 to 2.0 tokens a second. The record describes the three summaries as accurate. This report has not checked them line by line.

The faster setting, Quality: Fast, uses SmolLM2 360M (`v2-local-intel-fast.md`). It took 39.5 seconds for the short article with the model already stored, and 64.7 seconds for the Lighthouse article, writing at about 4 tokens a second. The Lighthouse answer in that run failed: it repeated the prompt's safety sentence and an empty "Summary:" label. The run was made before the fix that reports such an answer as an error, so Fast is an optional choice and not the default.

Runs made before 26 October used SmolLM2 as the automatic choice on the Intel chip, and they are labelled that way. The whole Lighthouse article took 616.4 seconds in one run and 704.5 seconds in a second try with the older code (`v2-local-intel-wikipedia.md`). The short article took 199.2 seconds on first use (`v2-local-intel.md`). On the NVIDIA card, with Llama 3.2 1B and the model already downloaded, the same Lighthouse article took 74.1 seconds in a clean run (`v2-local-nvidia-cold-first-attempt.md`). That is a different chip and setup, so it is not a fair test of the client's laptop.

The extension recognises the built-in chip by its vendor and architecture, and shows the note that answers can be slow (`src/offscreen/offscreen.js`). It no longer changes the model.

**What this means in plain words.** The client's laptop has one chip, so the built-in path matters most. The extension uses the 1B model there by default, and the reader can pick the faster, less accurate SmolLM2 model in Settings. The SmolLM2 numbers from before 26 October are a record of the old automatic choice.

### Questions this chapter answers

**Does the model run on the processor or on the graphics card?**
On the graphics card, through WebGPU. The extension has no path that runs the model on the processor. A computer without a usable card, or without shader-f16, is refused with a plain message.

**Why does the first summary take minutes, and the later ones seconds?**
The first summary must download the model, copy it into the card's memory and warm up the card. On the NVIDIA card the download, the load and the warm-up took about 190 seconds in the clean run. Once the model is stored, later summaries load it from the browser's storage, and the warm-up took half a second or less in the offline runs. On the built-in Intel chip the first use with the 1B model took 200.6 seconds, including the 695 MB download.

**Where is the model kept, and can it be deleted?**
The model files are kept in IndexedDB, in the browser's storage for the extension. The loaded copy lives in the card's memory and is freed when the offscreen page closes after five idle minutes. Removing the extension's data removes the stored files.

**Does the client's laptop need the separate-card setting?**
No. It has one graphics chip, so there is no separate card to choose. On the developer laptop Chrome used the built-in chip by default, and the opt-in switch moved it to the NVIDIA card. The extension does not force either choice, and it keeps the 1B model on the built-in chip.

**Does the extension work offline?**
Yes, once the model is stored. The clean offline runs on the NVIDIA card gave summaries in 15.3 and 16.5 seconds with outside websites blocked, and the run made after the label fix gave 17.7 and 16 seconds. These tests covered one computer in a hidden browser. They have not been run on the client's laptop or in the visible Chrome window.
