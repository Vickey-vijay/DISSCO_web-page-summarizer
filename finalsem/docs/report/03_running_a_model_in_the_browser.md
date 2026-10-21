# Running a model in the browser

Chapter 2 explained what the model does. This chapter explains how the model reaches Chrome and runs there. The question is how a file of about 695 MB becomes a working program inside a browser extension, running on a graphics card that the browser shares with other programs.

The chain has several links. The popup holds the button and shows progress. The service worker owns the job. The offscreen page is a hidden page that holds the loaded model. A web worker, a separate thread, runs the WebLLM library, which runs the model on the graphics card through WebGPU. The model files sit in the browser's own storage.

## The model file and what 4-bit compression gives up

A photo saved at a lower quality is smaller, and the fine details are lost. The model file is compressed in the same way. Each stored number is rounded to fewer bits, so the file takes less space.

The model's stored numbers are the parameters from chapter 2, and they are also called weights. In the project's model, the weights are kept at 4 bits each for most of the model, where full precision would use 16 bits. The name of the model carries the format: `q4f16_1`. The `q4` part means the stored weights use 4 bits. The `f16` part means the other numbers used while the model runs are 16-bit floating-point numbers. The `_1` is a version label for the packing format used by WebLLM, and the repository does not describe it further.

The arithmetic shows the saving. One billion numbers at 4 bits each is about 0.5 GB. The downloaded file is about 695 MB, which is larger than the simple figure. This means not every part of the model is stored at 4 bits. The repository does not list which parts are kept at a higher precision.

The cost of compression is precision. Four bits can hold only 16 different values, so each stored number is an approximation of the value it came from. The answers of the compressed model can differ a little from those of the full-precision model. The project did not run the full-precision model, so the size of this loss is not measured here. WebLLM publishes this compressed version for the size, and `DECISIONS.md` (D1) records why Llama 3.2 1B was chosen as the default.

**What this means in plain words.** The model is stored with rounded numbers to make the file about three times smaller. The price is a small loss of accuracy, which was not measured against the full version.

## Choosing the model in the code

The two models are listed in one place, `src/core/config.js`.

`src/core/config.js`

```
export const MODELS = Object.freeze({
  primary: Object.freeze({ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', vramMB: 879 }),
  fallback: Object.freeze({ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', vramMB: 376 }),
});
```

The primary model is used unless one of three things happens. The first is that Chrome reports less than 8 GB of memory. Chrome rounds its memory report and caps it at 8, so a laptop with 15.7 GB of memory also reports 8 and is not switched by this rule (`chooseModel()` in `src/core/gpu-check.js`). The second is that the graphics chip is the one built into the processor. The third is that the primary model fails to start because it does not fit.

`src/engines/local.js`

```
async checkStatus() {
  let status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
  if (status.gpu?.integrated && engine.model.id === MODELS.primary.id && !settings.modelOverride) {
    engine.model = MODELS.fallback;
    engine.modelSwitchReason = 'integrated-graphics';
    status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
  }
  engine.status = status;
  return status;
},
```

The third case is a retry. If the primary model fails with a graphics memory error or a load error, the engine tries once with the smaller model. The choice is then saved in `chrome.storage.local` as `modelOverride`, so the next summary starts with the smaller model. The saved choice is set by the service worker through `onFallback` (`src/background/service-worker.js`). The retry and the messages it produces are covered in chapter 12.

**What this means in plain words.** The extension picks the smaller model when the laptop looks small, when only the built-in chip is available, or when the bigger model will not start. The reader does not make this choice.

## The graphics card and why the model uses it

A processor (CPU) works through a job one step at a time, with a few skilled workers. A graphics card has many small calculating units that can work on parts of one job at the same time. A language model is mostly multiplication of long lists of numbers, and those lists can be split across many units, so a graphics card runs the model far faster than a processor does.

The model also has to fit in the card's memory. The 1B model needs 879 MB of graphics memory and SmolLM2 needs 376 MB (`src/core/config.js`). The card's memory is shared with the browser and with any other program that uses the card, such as a game or a video player. The developer laptop's NVIDIA RTX 3050 has 6 GB of its own memory (`finalsem/docs/DECISIONS.md`, D1).

The extension has no path that runs the model on the processor. WebLLM uses WebGPU, and if WebGPU is missing, the popup refuses with the message for NO_WEBGPU and disables the button (`src/ui/popup.js`). The consequence is that a computer without a usable graphics card cannot run Version 2 at all. The popup says so instead of failing silently.

**What this means in plain words.** The model runs on the graphics card because the card does the model's arithmetic much faster than the processor. A computer without a usable card cannot run this version, and the popup says so.

## WebGPU and the 16-bit feature, shader-f16

WebGPU is the browser's way for a web page to ask the graphics card to do calculations. The project requires Chrome 116 or newer (`README.md`). A web page does not reach the card directly. It sends its work through this interface, and the browser passes the work on.

shader-f16 is an optional feature of WebGPU. A shader is a small program that runs on the card. With the feature, those programs can use 16-bit floating-point numbers. The configuration comment says that both models need it (`src/core/config.js`), and WebLLM's model list marks them with the same requirement (`src/lib/web-llm.js`). A card without the feature cannot run either model, even if it supports WebGPU.

The check is short. This is `evaluateGpu()` in `src/core/gpu-check.js`, which the offscreen page calls with the result of the browser's request.

`src/core/gpu-check.js`

```
export function evaluateGpu({ hasGpuApi, adapter }) {
  if (!hasGpuApi) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'navigator.gpu is missing' };
  if (!adapter) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'requestAdapter() returned nothing' };
  if (!adapter.features.has('shader-f16')) {
    return { ok: false, code: ERROR_CODES.NO_SHADER_F16, detail: 'adapter has no shader-f16 feature' };
  }
  const info = adapter.info ?? {};
  return { ok: true, f16: true, vendor: String(info.vendor ?? ''), architecture: String(info.architecture ?? '') };
}
```

The two failures have plain messages in `src/core/errors.js`. For NO_WEBGPU the popup says that Chrome cannot use the graphics card for the model and tells the reader to open `chrome://gpu`. For NO_SHADER_F16 it says that the card does not support the 16-bit math the model needs. In both cases the button is disabled, so a press does nothing. Test V07 and V08 check these two cases with the pretend model.

The request for the card asks for the high-performance one: `requestAdapter({ powerPreference: 'high-performance' })` (`src/offscreen/offscreen.js`). The request is only a hint. The developer laptop showed that Chrome can still choose the built-in chip, as described in the section on two graphics chips below.

**What this means in plain words.** WebGPU lets the page use the card, and shader-f16 is an extra feature the model needs. If either is missing, the extension says so and stops before any download.

## WebLLM and the web worker

WebLLM is an open-source library that loads a model into the browser and runs it. The version in this project is 0.2.86 under the Apache 2.0 licence (`README.md`). It is copied into the project as one file, `src/lib/web-llm.js`, of about 6.8 MB, so the project needs no build step (`finalsem/docs/DECISIONS.md`, D1). The library does the heavy work: it turns text into tokens, runs the model on the card and turns the output back into text.

The library runs in a web worker. A web worker is a separate thread of the browser. Work done there does not freeze the page that started it. `src/offscreen/engine-worker.js` starts the library's handler in that worker, and it is short enough to show in full.

`src/offscreen/engine-worker.js`

```
import { WebWorkerMLCEngineHandler } from '../lib/web-llm.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message) => handler.onmessage(message);
```

The offscreen page creates the worker and loads the model into it. This is the part that reports progress and that the popup shows.

`src/offscreen/offscreen.js`

```
const worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
engine = await CreateWebWorkerMLCEngine(worker, modelId, {
  appConfig: APP_CONFIG,
  initProgressCallback: (report) => emitProgress(mapInitProgress(report)),
});
```

The offscreen page exists because of the service worker. Chrome stops an extension's service worker when it is idle, and a stopped worker would lose the loaded model, which takes seconds to load. The offscreen page is a hidden page that Chrome lets an extension open for a task such as this one. It has only the `chrome.runtime` messaging API. It cannot read the storage or the tabs, so it works purely by messages from the service worker. While it is busy, it sends a message every 10 seconds, which keeps the service worker awake. When it has been idle for five minutes, the page is closed to free the card's memory (`idleCloseMs` in `src/core/config.js`). The code comment estimates that this frees about a gigabyte of graphics memory. That figure was not measured.

The figure below shows which part runs in which process.

![What runs where on the client laptop: the Chrome pages, the web worker, the graphics card and the disk](../figures/V12_deployment.png)
<!-- check against figure -->

Reading the figure: the popup and the service worker run in the extension, the offscreen page and its web worker run beside them, and the work on the model goes to the graphics card through Chrome. The disk holds the model files in the browser's storage. The model files stay on disk after the page closes, and only the loaded model leaves the card.

**What this means in plain words.** The model runs in a hidden page, in a separate thread, under the library's control. The page stays alive while the model is in use, and it closes after five idle minutes so the card's memory is returned.

## Where the model is stored: IndexedDB, and why Cache Storage failed

WebLLM stores the downloaded files in Cache Storage by default, which is one of the browser's storage systems for web files. In the offscreen page this did not work. The first real try stopped at once with the message `UnknownError: Failed to execute 'open' on 'CacheStorage': Unexpected internal error` (`DEVLOG.md`, 21 October 2026). A normal extension page could use Cache Storage, so only this kind of page was affected.

The project therefore uses IndexedDB, the browser's database for larger structured data. In the test, IndexedDB offered about 10.7 GB of quota (`DECISIONS.md`, D2). The switch is one setting, shown below.

`src/offscreen/offscreen.js`

```
// Cache Storage fails inside an offscreen page ("Unexpected internal error"), IndexedDB works,
// so the model is stored in IndexedDB. (Found by a spike; see DEVLOG.md.)
const APP_CONFIG = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' };
```

The extension also asks for the `unlimitedStorage` permission in its manifest. Without it, the browser may delete a large amount of stored data when disk space runs short, and the model's files would be at risk (`DECISIONS.md`, D2).

Table: What is kept where, and for how long

| What | Where | How long it stays | Source |
|---|---|---|---|
| Model files | IndexedDB, in the browser's storage | Until the extension's data is removed | `src/offscreen/offscreen.js`, `DECISIONS.md` D2 |
| The job record (progress and summary) | `chrome.storage.session` | Until the browser restarts | `src/background/service-worker.js` |
| Settings and the saved model choice | `chrome.storage.local` | Until changed or removed | `src/core/config.js`, `src/background/service-worker.js` |
| The loaded model | The graphics card's memory | While the offscreen page is open, and closed after five minutes idle | `src/background/offscreen-manager.js` |

The figure below shows the same layout.

![Where the model, the job record, the settings and the loaded model are kept, and for how long](../figures/V10_storage.png)
<!-- check against figure -->

Reading the figure: each store is shown with its lifetime. The model files and the settings survive a browser restart. The job record does not, and the loaded model must be loaded again after the page closes.

A small wording fault shows in the timelines of the runs. In the clean offline run, the popup showed "Downloading the model (first time only): 0%" for about 0.8 seconds, from 3.9 to 4.7 seconds, although the model was stored and no download was possible. At that moment the library's progress text contained the word "fetch". The code treats any progress text containing "fetch" as a download (`mapInitProgress()` in `src/core/gpu-check.js`), so the label was wrong for that moment.

`src/core/gpu-check.js`

```
export function mapInitProgress(report) {
  const text = String(report?.text ?? '');
  const fraction = Math.max(0, Math.min(1, Number(report?.progress) || 0));
  // "Start to fetch params" and "Fetching param cache[...]" both mean the download is happening.
  const phase = /fetch/i.test(text) ? 'downloading' : 'loading';
  return { phase, percent: Math.round(fraction * 100), text };
}
```

The report records it as a fault of wording. It did not affect the summary.

**What this means in plain words.** The model is kept in the browser's database, which survives a restart and can hold the large file. Cache Storage was the usual choice and did not work in this kind of page, so a different store was used.

## The first use: download, load and warm-up

The first use is slow for three reasons. The model must be downloaded, it must be copied into the graphics card's memory, and the card must prepare its programs before the first answer. The popup shows each step in turn. The table gives the times from the two clean first-use runs, one on each chip. Both runs started with no stored model.

Table: The first use in the two clean runs, in seconds after the button was pressed

| Step | NVIDIA RTX 3050, Llama 3.2 1B (`v2-local-nvidia-cold-first-attempt.md`) | Built-in Intel chip, SmolLM2 360M (`v2-local-intel.md`) |
|---|---|---|
| Reading the page | 0.1 | 0.1 |
| Checking the card | the download label appears at 0.5 | 0.5 |
| Download, 0% to 100% | 0.5 to 158, about 695 MB | 0.9 to 81.2, about 204 MB |
| Load into the card | 158.8 to 162.2 (3.4) | 81.6 to 83.3 (1.7) |
| Warm-up (one short answer) | 162.6 to 193.1 (30.5) | 83.7 to 123.1 (39.4) |
| Writing the summary | 193.1 to 196.8 (3.7) | 123.1 to 199.2 (76.1) |
| Total | 196.8 | 199.2 |

The two totals are almost the same, but the runs are not a like-for-like test. The Intel run downloaded the smaller model, and the NVIDIA run downloaded the larger one. The totals match by coincidence of the parts: the longer download on the NVIDIA run offsets the slower answer on the Intel chip. The difference between the chips shows in the writing step, at 3.7 seconds on the card and 76 seconds on the built-in chip.

Two rates can be read from these runs. The NVIDIA run downloaded about 695 MB in about 158 seconds, which is about 4.4 MB a second. The Intel run downloaded about 204 MB in about 81 seconds, which is about 2.5 MB a second. These rates depend on the connection on the day, and they are not fixed values.

Two screenshots show the download and the warm-up on the NVIDIA card. They were taken in the session of the run recorded as 207 seconds, which was done while other programs were using the processor, so its timing is not used as a clean figure. Both are real-model captures.

![Real model, NVIDIA chip, first use: the popup during the download, at 32 percent](../screenshots/v2-nvidia-short-downloading.png)

Reading the screenshot: the model line reads "Not downloaded yet (about 695 MB, first use only)", the button reads "Download model and summarize", and the progress line reads "Downloading the model (first time only): 32%".

![Real model, NVIDIA chip, first use: the popup during the warm-up](../screenshots/v2-nvidia-short-warming.png)

Reading the screenshot: the progress line reads "Warming up the model (first time can take about 30 seconds)...", which is the message written in `progressLabel()` in `src/ui/popup.js`.

The warm-up is the step that most readers will not expect. The offscreen page sends one short question to the model, "Say ok.", with a limit of one token (`src/offscreen/offscreen.js`). The purpose is to prepare the card before the first real part is sent, so that the first summary does not look frozen. The developer notes say that the first answer compiles the card's programs and takes about 30 seconds (`DEVLOG.md`, 21 October 2026).

The warm-up times differ across the runs. The clean NVIDIA run took 30.5 seconds and the clean Intel run 39.4 seconds. The run recorded as 207 seconds took 56 seconds, and that run was disturbed. The clean offline run, which reused a stored model, took 0.5 seconds, and the second offline run, also done while other programs were running, took 0.6 seconds. The repository does not record why the later runs were so much shorter. The popup message says "first time", and the offline runs, which reused the stored model, did not wait for it.

The Intel screenshot shows the same warm-up on the built-in chip, with the graphics note.

![Real model, built-in Intel chip: the popup during the warm-up, with the graphics note](../screenshots/v2-intel-short-warming.png)

Reading the screenshot: the model line reads "Model: SmolLM2 360M. Not downloaded yet (about 204 MB, first use only)". The note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The progress line reads "Warming up the model".

**What this means in plain words.** The first use waits for the download, then for the copy into the card, then for a warm-up of about half a minute on the NVIDIA card and about forty seconds on the Intel chip. Only after that does the summary start. Once the model is stored, the download is skipped, and the warm-up was short in the offline runs.

## Why the second use works with no internet

The second use starts from the stored files. The extension checks the card, asks the storage whether the model is there, loads the stored files into the card, warms the card, and then summarizes. Nothing is downloaded. The table gives the clean offline run on the NVIDIA card.

Table: The second use with outside websites blocked, clean run, in seconds

| Step | Time (s) |
|---|---|
| Reading the page | 0 to 0.1 |
| Checking the card | 0.6 |
| Loading the stored model into the card | 1.3 to 7.6 |
| Warm-up | 8.1 to 8.6 |
| Summary, one part | 8.6 to 14.8 (the run's own timer) |
| Total for the short article | 15.3 |
| Total for the long article, two parts | 16.5 |

The model line in this run read "Model: Llama 3.2 1B. Downloaded, runs on this computer." The check that the model is stored is `hasModelInCache()`, called from the offscreen page. It looks for the stored files in the browser, and the offline run shows that it works with the outside websites blocked.

The test made the outside websites unreachable and left the local test server working. Chrome was started with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, which makes every outside name fail to resolve. The developer notes explain why this was chosen. Playwright's own offline switch also blocks the extension's own pages, so the summary could not be made with it (`DEVLOG.md`, 21 October 2026). The test also loaded the extension from one fixed folder, because an unpacked extension gets its identifier from its folder, and the stored data belongs to that identifier.

The two screenshots below come from this clean offline run.

![Real model, NVIDIA chip, offline: the popup while the stored model is loaded and warmed](../screenshots/v2-nvidia-offline-short-warming.png)

Reading the screenshot: the model line reads "Model: Llama 3.2 1B. Downloaded, runs on this computer." and the progress line reads "Warming up the model (first time can take about 30 seconds)...". The warm-up in this run took half a second.

![Real model, NVIDIA chip, offline: the popup with the finished summary](../screenshots/v2-nvidia-offline-short-popup.png)

Reading the screenshot: the summary is shown as a numbered list, and the footer reads "1 part · 1 request · 14.8 s · Llama 3.2 1B". The footer matches the clean offline run.

What the test shows is limited. It was run on one computer, with two pages, in a hidden browser, and not in the visible Chrome window that the client would use. It was not run on the client's laptop. The offline result proves that the stored model is used without the internet on this computer. It does not prove the same on another machine.

**What this means in plain words.** After the first download, the summary runs from the stored model on the laptop. The internet is not needed for later summaries, which the test showed on the developer laptop with the outside websites blocked.

## Laptops with two graphics chips

The developer laptop has two graphics chips. The Intel chip is built into the processor, and the NVIDIA RTX 3050 is a separate card (`DECISIONS.md`, D1). Chrome decides which chip to use, and the page's request is only a hint. On this laptop, Chrome picked the built-in Intel chip even when the code asked for the high-performance card. The fix that was measured was a browser start with the flag `--force_high_performance_gpu`, which made Chrome use the NVIDIA card (`DEVLOG.md`, 21 October 2026). The speed of the same model on the two chips was about 2 tokens a second on the built-in chip and about 63 tokens a second on the card, in the speed test that the developer notes record.

The clean runs give the same comparison in a fuller form. The two runs are not the same model, so the table marks which model each run used.

Table: The built-in Intel chip and the NVIDIA card on the same laptop, from the clean runs

| Measure | Built-in Intel chip, SmolLM2 360M | NVIDIA RTX 3050, Llama 3.2 1B |
|---|---|---|
| Writing speed | 3.9 and 4.7 tokens a second | 40 to 47 tokens a second (clean runs, short article) |
| First-use total, short article | 199.2 s | 196.8 s |
| Writing the short summary | 76.1 s | 3.7 s |
| Offline short summary | not measured | 15.3 s |

The sources are `v2-local-intel.md` and `v2-local-intel.json` for the Intel column, and `v2-local-nvidia-cold-first-attempt.md` and `v2-local-nvidia-offline.md` for the NVIDIA column.

The extension does not force the choice of chip. It detects the built-in chip and switches to the smaller model by itself (`checkStatus()` in `src/engines/local.js`). The detection reads the vendor and the architecture name. The Intel chip in this laptop reports the architecture `gen-12lp`, and the rule matches the "gen" part (`src/offscreen/offscreen.js`). The popup then shows the note from the screenshot above. The note says that answers can be slow and that a separate card is much faster.

The figure below shows the choice.

![A laptop with two graphics chips: Chrome on the built-in chip by default, and the NVIDIA card when the setting is changed](../figures/V17_two_graphics_chips.png)
<!-- check against figure -->

Reading the figure: by default Chrome uses the built-in chip, and the project then uses the smaller model with the note. The figure shows the two ways to move Chrome to the card, the Windows setting made by hand and the optional setup switch. The test flag `--force_high_performance_gpu` appears only as the setting of the project's own test script. A client laptop does not need it.

There are two ways to make Chrome use the separate card. The first is by hand: in Windows Settings, under System, Display and Graphics, add Chrome, open its options and choose High performance (`README.md`). The second is the optional switch `setup.bat --gpu`, which asks Windows to run Chrome on the separate card by writing one value under the current user's registry key (`scripts/set-chrome-gpu.ps1`). The switch is never run by default, because it changes a Windows setting. The undo command is `scripts\set-chrome-gpu.ps1 -Remove`. The switch was tested only against a throw-away registry key. It has not yet been tried against a real Chrome on the client's laptop (`DECISIONS.md`, D4).

**What this means in plain words.** The built-in chip is far slower at writing, so the extension uses the smaller model on it and says why. On the developer laptop, the separate card ran the larger model much faster, once Chrome was set to use it. The setting can be made by hand or by the optional switch.

### Questions this chapter answers

**Does the model run on the processor or on the graphics card?**
On the graphics card, through WebGPU. The extension has no path that runs the model on the processor. A computer without a usable card is refused with a plain message.

**Why does the first summary take minutes, and the later ones seconds?**
The first summary has to download the model, copy it into the card's memory and warm up the card. On the NVIDIA card the download and the warm-up took about 190 seconds in the clean run. Once the model is stored, the later summaries load it from the browser's storage, and the warm-up was under a second in the offline runs.

**Where is the model kept, and can it be deleted?**
The model files are kept in IndexedDB, in the browser's storage for the extension. The loaded copy lives in the card's memory and is freed when the offscreen page closes after five idle minutes. Removing the extension's data removes the stored files.

**Why does Chrome sometimes use the weak chip?**
Chrome chooses the chip for each page, and on the developer laptop it chose the built-in Intel chip even when the code asked for the high-performance one. The reader can change Chrome's setting by hand, or use the optional switch, which is never run by default. The extension also detects the built-in chip and uses the smaller model.

**Does the extension work offline?**
Yes, once the model is stored. The clean offline runs on the NVIDIA card gave summaries in 15.3 and 16.5 seconds with the outside websites blocked. The test covers one computer in a hidden browser. It has not been run on the client's laptop or in the visible Chrome window.
