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

The primary model is used unless one of three things happens. The first is that Chrome reports less than 8 GB of memory. Chrome caps its report at 8, so the developer laptop, with 15.7 GB, is not switched by this rule, and the rule has not been seen on real low-memory hardware. The second is that the graphics chip is the one built into the processor. The extension recognises Intel only by name, so a built-in AMD or Apple chip would count as a full card. The third is that the primary model fails to start. The engine then retries once with the smaller model and saves that choice. The extension never clears the saved choice, so later summaries stay on the smaller model until the stored settings are cleared.

When the smaller model wrote a summary after the main model failed, the popup shows a notice in the result block.

![Pretend model: the result block with the notice that the smaller model wrote this summary](../screenshots/ui-12-fallback-after-out-of-memory.png)

Reading the screenshot: this is a pretend-model capture, so the three points are fixed test text. The notice reads "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The model line reads "Model: SmolLM2 360M. Downloaded, runs on this computer." Chapter 7 gives the full rules and chapter 12 the failures.

**What this means in plain words.** The extension picks the smaller model when the laptop reports little memory, when only the built-in chip is there, or when the bigger model will not start. It tells the reader when the smaller model wrote a summary. The saved choice stays until the stored settings are cleared.

## The graphics card, WebGPU and shader-f16

Each step of the model is many multiplications of long lists of numbers. A graphics card has many small calculating units that work on parts of one job together, so it runs the model far faster than a processor. The extension has no path that runs the model on the processor.

WebGPU is the browser's way for a web page to ask the card to do calculations. The project requires Chrome 116 or newer (`README.md`). A shader is a small program that runs on the card. The shader-f16 feature lets those programs use 16-bit floating-point numbers, and the configuration comment says both models need it (`src/core/config.js`). The card must also hold the model: 879 MB of graphics memory for the 1B model and 376 MB for SmolLM2. The developer laptop's NVIDIA RTX 3050 has 6 GB of its own memory (`finalsem/docs/DECISIONS.md`, D1).

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

The first use is slow because the model is downloaded, copied into the card's memory, and the card prepares its programs before the first answer. Chapter 8 gives the stages. The table gives the stage times from the two clean first-use runs. Both started with no stored model.

Table: The first use in the two clean runs, in seconds after the button was pressed

| Step | NVIDIA RTX 3050, Llama 3.2 1B (`v2-local-nvidia-cold-first-attempt.md`) | Built-in Intel chip, SmolLM2 360M (`v2-local-intel.md`) |
|---|---|---|
| Download, 0% to 100% | 0.5 to 158 (about 695 MB) | 0.9 to 81.2 (about 204 MB) |
| Load into the card | 158.8 to 162.2 (3.4) | 81.6 to 83.3 (1.7) |
| Warm-up (one short answer) | 162.6 to 193.1 (30.5) | 83.7 to 123.1 (39.4) |
| Writing the summary | 193.1 to 196.8 (3.7) | 123.1 to 199.2 (76.1) |
| Total | 196.8 | 199.2 |

The warm-up sends one answer of one token, to the question "Say ok." (`src/offscreen/offscreen.js`). Its purpose is to compile the card's programs, so the first real summary does not look frozen. The developer notes say the first answer takes about 30 seconds (`DEVLOG.md`). The clean NVIDIA run matches that figure. The run recorded as 207 seconds, done while other programs were running, took 56 seconds, and its timing is not used as a clean figure. Later offline warm-ups took 0.5 seconds in the clean run and 0.4 seconds after the label fix. The cause of the difference was not investigated.

![Pretend model: the popup during the warm-up](../screenshots/ui-04-warming.png)

Reading the screenshot: a pretend-model capture. The progress line reads "Warming up the model (first time can take about 30 seconds)...". The model line shows "about 664 MB", which is the pretend model's fixed number and not a measurement. The real download was about 695 MB.

Two limits apply to this step. Closing the tab during a download does not stop the download, because the preparation step ignores the abort signal. The model line is not refreshed while a download or warm-up is running (chapter 11).

**What this means in plain words.** The first use waits for the download, the copy into the card and a warm-up of about half a minute on the NVIDIA card or about forty seconds on the Intel chip. Later uses skip the download.

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

## Laptops with two graphics chips

The developer laptop has two graphics chips. The Intel chip is built into the processor, and the NVIDIA RTX 3050 is a separate card (`DECISIONS.md`, D1). Chrome decides which chip a page uses. The page's request for the high-performance card is only a hint. On this laptop Chrome used the built-in Intel chip by default. Starting Chrome with the test flag `--force_high_performance_gpu` made it use the NVIDIA card. A speed test recorded in the developer notes gave about 2 tokens a second on the Intel chip and about 63 on the NVIDIA card with the 1B model. That test was not saved as a run file.

The saved runs use different models on each chip, so they are not a like-for-like comparison. On the built-in chip the extension picks SmolLM2 360M, and the clean run wrote at 4 to 5 tokens a second (`v2-local-intel.md`). On the NVIDIA card the clean runs wrote at 34 to 53 tokens a second with Llama 3.2 1B. Chapter 7 sets out the comparison.

The seven-part Wikipedia article shows the difference in time. With the current code the built-in chip took 616.4 seconds, a little over ten minutes, with SmolLM2 writing at 4.1 tokens a second (`v2-local-intel-wikipedia.md`). An earlier try with the older code took 704.5 seconds, so the same chip varies from one try to the next. The NVIDIA card took 74.1 seconds for the same article in a clean run, with the model already downloaded (`v2-local-nvidia-cold-first-attempt.md`). A single run on the Intel chip is therefore not a fixed figure, and its summary of this article is weak (chapter 2).

The extension detects the built-in chip by vendor and architecture. The Intel chip here reports the architecture `gen-12lp`, and the rule matches the "gen" part (`src/offscreen/offscreen.js`). The popup then shows a note that answers can be slow.

![Pretend model: the popup with the note for built-in graphics](../screenshots/ui-09-intel-note.png)

Reading the screenshot: a pretend-model capture. The note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The model line shows "about 300 MB", which is the pretend model's fixed number. The real SmolLM2 download was about 204 MB.

A user can move Chrome to the separate card in two ways. By hand, in Windows Settings under System, Display and Graphics, Chrome is set to High performance (`README.md`). Or with the optional `setup.bat --gpu`, which writes one per-user value, `GpuPreference=2`, for Chrome (`scripts/set-chrome-gpu.ps1`). The switch is never run by default. If the script fails, setup says the graphics setting was not changed and carries on. The undo command is `powershell -File scripts\set-chrome-gpu.ps1 -Remove`, which needs no Chrome path. The switch was tested only against a test registry key, not yet against a real Chrome on the client's laptop (`DECISIONS.md`, D4).

![A laptop with two graphics chips: Chrome's default built-in chip, and the NVIDIA card reached by the Windows setting or setup.bat --gpu](../figures/V17_two_graphics_chips.png)

Reading the figure: from Chrome, the default path leads to the Intel built-in graphics, marked as measured at 4 to 5 tokens a second with SmolLM2 360M and 199.2 seconds for the short article on first use. The dashed path, through the Windows setting or `setup.bat --gpu`, leads to the NVIDIA RTX 3050, marked at 34 to 53 tokens a second with Llama 3.2 1B and 15.3 seconds for the stored short article offline. The box below lists the two ways. Its undo line still shows the older `-ChromePath` argument, which the script no longer needs. The footer says the flag `--force_high_performance_gpu` is used only by the test script.

**What this means in plain words.** The built-in chip is far slower at writing, so the extension uses the smaller model there and says so. On the developer laptop the separate card ran the larger model much faster once Chrome was set to use it. The setting can be made by hand or by the opt-in switch.

### Questions this chapter answers

**Does the model run on the processor or on the graphics card?**
On the graphics card, through WebGPU. The extension has no path that runs the model on the processor. A computer without a usable card, or without shader-f16, is refused with a plain message.

**Why does the first summary take minutes, and the later ones seconds?**
The first summary must download the model, copy it into the card's memory and warm up the card. On the NVIDIA card the download, the load and the warm-up took about 190 seconds in the clean run. Once the model is stored, later summaries load it from the browser's storage, and the warm-up took half a second or less in the offline runs.

**Where is the model kept, and can it be deleted?**
The model files are kept in IndexedDB, in the browser's storage for the extension. The loaded copy lives in the card's memory and is freed when the offscreen page closes after five idle minutes. Removing the extension's data removes the stored files.

**Why does Chrome sometimes use the weak chip?**
Chrome decides which chip a page uses. On the developer laptop it chose the built-in Intel chip by default, although the code asked for the high-performance one. The reader can move Chrome to the separate card by hand or with the opt-in switch, which is never run by default. The extension also detects the built-in chip and uses the smaller model there.

**Does the extension work offline?**
Yes, once the model is stored. The clean offline runs on the NVIDIA card gave summaries in 15.3 and 16.5 seconds with outside websites blocked, and the run made after the label fix gave 17.7 and 16 seconds. These tests covered one computer in a hidden browser. They have not been run on the client's laptop or in the visible Chrome window.
