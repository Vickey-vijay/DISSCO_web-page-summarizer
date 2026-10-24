# The offscreen page and the messages

## What this part does and why it exists

The model lives in a page the reader never sees. That page holds the model in memory and on the graphics card, and it answers questions from the rest of the extension. It is an offscreen document, a Manifest V3 feature that lets an extension run a hidden page without a tab. The reason it exists is the lifetime of the service worker. Chrome stops a service worker when it is idle, and the page's own header comment states the consequence: a stopped worker "would lose the model that took seconds to load" (`src/offscreen/offscreen.js`).

This chapter explains what an offscreen document is and how the extension creates and finds it. It then covers the messages between the service worker and the page, the rule that one answer runs at a time, the keepalive, the idle close, the manifest permissions and the content security policy, and the pretend model that the tests use. The service worker side is `src/background/offscreen-manager.js`. The page side is `src/offscreen/offscreen.js` and `engine-worker.js`. The pretend model is `src/offscreen/mock-engine.js`.

## What an offscreen document is, and why this project needs one

An offscreen document is a hidden HTML page that an extension can create without a tab. Chrome requires a reason for creating one, and this project gives `WORKERS`. The page has only the `chrome.runtime` API, so it cannot read settings or tabs, and it works only through messages. The header of `offscreen.js` says so.

`src/offscreen/offscreen.js`
```js
// Why a separate page? The service worker is stopped by Chrome when it is idle, and a stopped
// worker would lose the model that took seconds to load. An offscreen page stays alive. It has
// only the chrome.runtime API (no chrome.storage, no chrome.tabs), so it works purely by
// messages: the service worker asks, this page answers.
```

Two facts make the split necessary. The first use takes minutes to download and load, and the service worker may stop before that ends. The popup is the other place where code runs, but it closes when the reader clicks away. The offscreen page is the one place that stays alive while the model is in use.

**What this means in plain words.** The model needs a home that does not disappear when Chrome puts the background part to sleep. The offscreen page is that home, and it can only talk through messages.

## How the page is created and found again

The service worker keeps no reference to the page. Before each request, it asks Chrome whether a page already exists, and it creates one only when none is found.

`src/background/offscreen-manager.js`
```js
  async function ensure() {
    if (creating) return creating;
    const contexts = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) return undefined;
    creating = (async () => {
      await api.offscreen.createDocument({
        url: await pageUrl(),
        reasons: ['WORKERS'],
        justification: 'Runs the local language model (WebGPU) in a worker, in a page that stays alive',
      });
    })().finally(() => {
      creating = null;
    });
    return creating;
  }
```

`getContexts` lists the running contexts of the offscreen type. The variable `creating` holds the promise of a page that is being created, so two requests that arrive together share one creation. The page's address comes from `pageUrl()`, which adds the test parameters only when the engine mode asks for the pretend model.

**What this means in plain words.** Each request checks for the page first, and creates it only when it is missing. Two requests that arrive together wait for the same creation.

## The messages, and what each direction carries

Five message types pass between the service worker and the page. Three are requests that get a reply, and two go from the page to the service worker with no reply.

Table: The five message types between the service worker and the offscreen page

| Message | Direction | Payload | Reply | When it is sent |
|---|---|---|---|---|
| `LOCAL_STATUS` | Service worker to page | `modelId` | `gpu`, `cached`, `downloadMB`, `deviceMemoryGB`, `model`, or an error | Before each job, and for the popup's model line |
| `LOCAL_LOAD` | Service worker to page | `modelId` | `loadMs`, or `alreadyLoaded`, or an error | Once per job, after the check |
| `LOCAL_GENERATE` | Service worker to page | `prompt`, `maxTokens`, `temperature`, `timeoutMs` | `text` and `stats`, or an error | Once per part, and once per merge step |
| `MODEL_PROGRESS` | Page to service worker | `phase`, `percent`, `text` | None | During a download or load |
| `KEEPALIVE` | Page to service worker | None | None | Every 10 seconds while the page is busy; the service worker also refreshes the running job records |

Figure: the message protocol between the two pages.

![The message protocol between the service worker and the offscreen page: the three requests with replies, the progress message and the keepalive, with the idle close at the end](../figures/V05_offscreen_messages.png)

Reading the figure: the service worker is on the left and the offscreen page on the right. Arrows to the right carry `LOCAL_STATUS`, `LOCAL_LOAD` and `LOCAL_GENERATE`, and the replies return to the left. Arrows to the left carry `MODEL_PROGRESS` and `KEEPALIVE`, which have no reply. The "Idle close" box says that each message restarts a five-minute timer, that the timer runs with `idleCloseMs = 300000`, and that the page is closed when it runs out, which frees its graphics memory while the model files stay in IndexedDB. The "Rules" box says that every message carries the `offscreen` target, that answers are made one at a time in the order asked, and that `KEEPALIVE` is sent only while a request runs. The code matches the rules. Its timer wording differs slightly from the box: the timer is cleared when a message starts, and the countdown starts only when the last message finishes (see the idle close section).

The first direction is a request with a reply. The `call()` function in `local.js` sends each request, and it turns a missing reply into an error.

`src/engines/local.js`
```js
  async function call(message) {
    let reply;
    try {
      reply = await send({ target: 'offscreen', ...message });
    } catch (err) {
      throw new AppError(ERROR_CODES.SERVICE_ERROR, `offscreen page not reachable: ${String(err?.message ?? err)}`, { cause: err });
    }
    if (!reply) throw new AppError(ERROR_CODES.SERVICE_ERROR, 'the offscreen page did not answer');
    if (!reply.ok) throw fromWire(reply.error);
    return reply;
  }
```

On the page side, one listener takes every request. It accepts only messages with the `offscreen` target, and it maps each type to a function.

`src/offscreen/offscreen.js`
```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;
  const handlers = { LOCAL_STATUS: 'status', LOCAL_LOAD: 'load', LOCAL_GENERATE: 'generate' };
  const name = handlers[message.type];
  if (!name) {
    sendResponse({ ok: false, error: { code: 'SERVICE_ERROR', detail: `unknown message ${message.type}` } });
    return false;
  }
  beginWork();
  impl[name](message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: { code: 'SERVICE_ERROR', detail: String(err?.message ?? err) } }))
    .finally(endWork);
  return true; // the answer is sent later
});
```

The second direction is progress from the page to the service worker. The page sends each report without waiting for an answer, and the service worker passes it to the job.

`src/offscreen/offscreen.js`
```js
function emitProgress(progress) {
  chrome.runtime.sendMessage({ type: 'MODEL_PROGRESS', ...progress }).catch(() => {});
}
```

`src/background/service-worker.js`
```js
  if (message?.type === 'MODEL_PROGRESS') {
    manager.emitProgress(message);
    return false;
  }
```

The catch on `sendMessage` is needed because a message with no listener rejects. If no service worker is listening, the progress is lost, and nothing else breaks. The third direction is the keepalive, covered below.

**What this means in plain words.** The service worker asks and the page answers. The page also reports progress without waiting for a reply. Messages without the target are ignored, so the extension's other messages never reach the page's handlers.

## One generation at a time

The graphics card does one job at a time, so the service worker lets only one generation run. A single promise chain makes every `LOCAL_GENERATE` wait for the one before it.

`src/background/offscreen-manager.js`
```js
  let generateChain = Promise.resolve();
  ...
      // Answers are generated one at a time, in the order they were asked.
      const result = message.type === 'LOCAL_GENERATE' ? (generateChain = generateChain.then(run, run)) : run();
```

The chain continues even when one generation fails, because the second argument to `then` runs the next step in both cases. The unit test "answers are generated one at a time, in the order asked" sends three requests together and checks that they start and end in order, with no overlap.

Only generation is queued. `LOCAL_STATUS` and `LOCAL_LOAD` are not. The page guards the load itself: a second load returns the first load's promise while one is running, and a load of a model that is already loaded returns at once. The status request only reads, so overlap is harmless. Two tabs that summarize at once therefore share the card, one part at a time.

**What this means in plain words.** Generation runs in a queue, so the card never works on two parts at once. Loading has its own guard inside the page.

## The 10-second keepalive

Chrome can stop a service worker that is idle. While the page is busy, it therefore sends a small message every 10 seconds, and the service worker receives it. A counter starts and stops the timer.

`src/offscreen/offscreen.js`
```js
let busy = 0;
let keepAliveTimer = null;
function beginWork() {
  busy += 1;
  if (!keepAliveTimer) {
    keepAliveTimer = setInterval(() => chrome.runtime.sendMessage({ type: 'KEEPALIVE' }).catch(() => {}), 10000);
  }
}
function endWork() {
  busy = Math.max(0, busy - 1);
  if (busy === 0 && keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}
```

`src/background/service-worker.js`
```js
  if (message?.type === 'KEEPALIVE') {
    // The offscreen page sends this every 10 s while it works. Receiving it keeps this worker alive,
    // and it also proves the running jobs are alive: one answer can take minutes on a slow chip,
    // and the popup treats a job with no update for 5 minutes as dead.
    for (const [tabId, running] of controllers) void writeJob(tabId, running.jobId, {});
    return false;
  }
```

The timer runs while at least one request is in progress. Each KEEPALIVE does two things in the service worker. Receiving it keeps the worker awake, and it refreshes the `updatedAt` time of every running job record. A single answer can take minutes on a slow chip, and the popup treats a job with no update for 5 minutes as dead, so without that refresh a long answer would look interrupted while it was still running. Chrome's general rule for idle workers is background knowledge, and the project does not measure it. The 10-second interval is the project's own choice.

**What this means in plain words.** While the page is busy, it contacts the service worker every 10 seconds, so Chrome does not put the worker to sleep in the middle of a job.

## The 5-minute idle close, and the in-flight rule

The page does not stay open forever. When no request is running, a countdown starts, and when it runs out the page is closed. The countdown length is `idleCloseMs`, which is five minutes by default (`src/core/config.js`). The service worker now counts the messages that are still running, and it never closes the page while any of them is still running.

`src/background/offscreen-manager.js`
```js
  let inFlight = 0; // messages sent and not yet answered; the page is never closed while this is above 0
```

`src/background/offscreen-manager.js`
```js
  async function close() {
    clearTimeout(closeTimer);
    if (inFlight > 0) return; // a load or an answer is still running: closing now would cut it off
    const contexts = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) await api.offscreen.closeDocument();
  }
```

`src/background/offscreen-manager.js`
```js
  /** Send one message to the offscreen page and wait for its answer. */
  async function send(message) {
    inFlight += 1;
    clearTimeout(closeTimer);
    try {
      await ensure();
      const run = () => api.runtime.sendMessage(message);
      // Answers are generated one at a time, in the order they were asked.
      const result = message.type === 'LOCAL_GENERATE' ? (generateChain = generateChain.then(run, run)) : run();
      return await result;
    } finally {
      inFlight -= 1;
      // Only the last message to finish starts the idle countdown.
      if (inFlight === 0) void scheduleIdleClose();
    }
  }
```

The countdown is cleared when any message starts. It starts again only when the last running message finishes, and `close()` refuses to run while a message is still in progress. Closing the page frees the graphics memory the model holds. The manager's comment estimates that as "about a gigabyte", while the model's own figure is 879 MB (`vramMB`), so the comment is an estimate and not a measurement. The download stays in IndexedDB, so the next use reloads the model from the browser. The clean offline run loaded it in about 6.9 seconds, and the after-fix offline run in about 11.6 seconds.

Figure: the storage layout, which shows what the close leaves behind.

![What is stored where and for how long: model files in IndexedDB, the job record in session storage, settings in local storage, and the loaded model in graphics memory](../figures/V10_storage.png)

Reading the figure: the drawing is a table of four stores. The loaded model, in graphics memory inside the offscreen page, lasts until the page closes: five minutes after the last message, or when the browser closes. That is the only store the idle close frees. The model files stay in IndexedDB, the job record stays in session storage until the browser or its tab closes, and the settings stay in local storage. So the close costs a reload from the browser and never a download.

**Before the in-flight rule.** Earlier, the countdown was started at the end of every message, including a quick status check. If a status check finished while a model load was still running, the countdown could expire in the middle of the load and close the page under it. The page would then have been gone in the middle of the load, and the job would have ended with the generic message. Code reading found this, not a test: the unit tests did not catch it, and the developer log records the finding (DEVLOG, 2026-10-21, "V2 review while writing the report", item 1). A unit test named "a quick status check finishing does not start the idle countdown while a load is still running" now covers it. No browser test covers closing during a load, so the in-flight rule is checked at unit level only.

**What this means in plain words.** After five minutes with no work, the page closes and frees the card's memory. The model stays stored, so the next use reloads it. The page now stays open while any message is still running, so a load is no longer cut off by an earlier, quicker message.

## Manifest permissions and the content security policy

The manifest lists what the extension may do. The table says what each entry is for in this project and what would fail without it.

`manifest.json`
```json
  "permissions": ["activeTab", "scripting", "storage", "offscreen", "unlimitedStorage"],
  "host_permissions": [
    "https://huggingface.co/*",
    "https://*.huggingface.co/*",
    "https://*.hf.co/*",
    "https://raw.githubusercontent.com/*"
  ],
```

Table: Each manifest entry and its job in this project

| Entry | Why this project needs it | What fails without it |
|---|---|---|
| `activeTab` | The reader starts the summary from the toolbar popup, on the tab they are looking at | Reading the tab depends on this grant (general Chrome rule, not tested on its own) |
| `scripting` | `extract-tab.js` runs `chrome.scripting.executeScript` to read the page text | No page text, so no summary |
| `storage` | Settings in `chrome.storage.local`; job record in `chrome.storage.session` | No settings, and no progress for the popup |
| `offscreen` | `offscreen-manager.js` calls `createDocument` | No model page, so the job fails with `SERVICE_ERROR` |
| `unlimitedStorage` | Keeps the stored model from being deleted when disk space is low (DECISIONS D2) | The browser may delete the model under pressure |
| `huggingface.co` and `*.huggingface.co` | The weights and the size file (`web-llm.js`, `estimateDownloadMB`) | No first download and no size estimate |
| `*.hf.co` | Not explained in the repository | [to be measured] |
| `raw.githubusercontent.com` | The graphics library (`modelLibURLPrefix` in `web-llm.js`) | No library on first use |

The content security policy limits what the extension's own pages may run.

`manifest.json`
```json
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
```

`'self'` allows scripts only from the extension's own files. WebLLM is copied into `src/lib` and loaded from there, so no remote script runs. `'wasm-unsafe-eval'` lets the browser compile WebAssembly in extension pages, and WebLLM's runtime is WebAssembly, so without it the runtime would not start. The repository has no test that removes this entry, so the reason is general Manifest V3 background. `object-src 'self'` allows no plug-in objects from elsewhere. The policy does not include `'unsafe-eval'`, which lets a page turn text into code, and the project does not need it.

**What this means in plain words.** Each permission has a visible reason in the code. The policy lets the extension run only its own scripts and the WebAssembly the model needs.

## The pretend model used by the tests

Browser tests cannot depend on a real graphics card or a 695 MB download. The project therefore has a pretend model that follows the same steps as the real one. A page address parameter, `?mock=<mode>`, selects it. The service worker builds that address from a setting in `chrome.storage.local`, which the test setup writes.

`src/background/offscreen-manager.js`
```js
  async function pageUrl() {
    const { engineMode } = await getSettings();
    const path = api.runtime.getURL(OFFSCREEN_PATH);
    // Test seam: "mock" or "mock:<mode>" starts the fake model instead of the real one.
    if (typeof engineMode === 'string' && engineMode.startsWith('mock')) {
      const mode = engineMode.split(':')[1] ?? 'ok';
      const { mockDelayMs } = await api.storage.local.get('mockDelayMs');
      return `${path}?mock=${encodeURIComponent(mode)}&delay=${Number(mockDelayMs) || 0}`;
    }
    return path;
  }
```

There are twelve modes. The table lists each mode and the browser test that uses it. The modes are defined in the header of `mock-engine.js`.

Table: The pretend model modes and the browser tests that use them

| Mode | What the pretend model does | Browser test |
|---|---|---|
| `ok` (default) | Everything works | Most scenarios, through `engineMode: 'mock'` |
| `nowebgpu` | The check fails with `NO_WEBGPU` | V07 |
| `nof16` | The check fails with `NO_SHADER_F16` | V08 |
| `intel` | Built-in graphics, so the note shows and the small model is used | V09 |
| `oom` | The primary model runs out of memory, and the small model works | V10 |
| `oomall` | Every model runs out of memory | V11 |
| `downloadfail` | The download fails while the model is not stored | V12 |
| `empty` | The model answers with no text | V13 |
| `html` | The model answers with HTML-looking text, which the popup must show as plain text | V14 |
| `slow` | Each answer takes at least 1.5 seconds | Not used by the browser test file |
| `longprompt` | Returns the window-size error for a part, to test the halving | V25 |
| `crash` | Fails in the way that shows the technical detail line | V27 |

The fake download runs eight steps of 120 milliseconds, reporting each step as progress. The pretend model records that a model is stored in the page's `localStorage`, under one key per model. It does not use IndexedDB, so it says nothing about the real cache. The pretend model also never sends the "Loading the model into the graphics card" message at the point where the screenshot `ui-03` is taken. That picture was made by writing the job record by hand into session storage, and its caption says so.

The test seam ships with the extension. `loadSettings` accepts any stored `engineMode` that starts with `mock`, and the page reads the `?mock=` address. No screen sets these values, but the code path is in the product that the client receives. The repository does not remove it.

**What this means in plain words.** The pretend model copies the real steps with fixed answers, chosen by an address. It makes failures repeatable, and it is also code that ships with the extension.

## Design decisions

Table: Design decisions for the offscreen page and the messages

| Decision | Options considered | Choice | Why | Trade-off accepted |
|---|---|---|---|---|
| Where the model runs | Service worker; popup; offscreen page | Offscreen page (DECISIONS D1, item 2) | The service worker stops when idle, and the popup closes when the reader clicks away | The page reaches the rest of the extension only by messages |
| Where the job lives | In the page; in the service worker | Service worker, with the job record in session storage | The job must survive a closed popup and be readable by the popup | Every progress update is a message and a storage write |
| Generation order | Parallel; queued | Queued, one at a time | The card does one job at a time (manager comment) | A second tab waits for the first tab's current part |
| Keepalive | None; every 10 seconds | Every 10 seconds while busy, and each one refreshes the running job records | A load can take minutes, and the worker must not stop in the middle | Messages are sent for as long as the job runs |
| Idle close | Never close; close after each job; close after 5 minutes idle, and never while a message runs | Close after 5 minutes idle, with the in-flight rule | Frees the card's memory, and a reload from the browser takes seconds | A reader who returns after five minutes waits for the load again |
| Pretend model | A separate test build; an address parameter | Address parameter | One code path for the real and pretend engines | The test seam ships with the extension |

**What this means in plain words.** The offscreen page trades simplicity for survival. It works only through messages, but it lives as long as the job needs it.

## Failure cases and how each is handled

Table: Failures in the messaging path

| Failure | What the code does | What the reader sees |
|---|---|---|
| The page cannot be reached (the message call rejects) | `call()` throws `SERVICE_ERROR`, "offscreen page not reachable" | "Something went wrong inside the extension. Try again." |
| The page gives no answer | `call()` throws `SERVICE_ERROR`, "the offscreen page did not answer" | The same message |
| The page receives an unknown message type | The page answers `SERVICE_ERROR`, "unknown message" | The same message |
| A handler throws, for example `requestAdapter()` | The `catch` sends `SERVICE_ERROR` with the error text | The same message, with the detail kept for the console |
| A generation hangs | After `generateTimeoutMs` (10 minutes) the page calls `interruptGenerate` and reports `TIMEOUT` | "The model took too long to answer. Try again, or use a shorter page." |
| The page closed between two jobs | The next request calls `ensure()` and creates the page again, and the model reloads from IndexedDB | No message, only a slower start |
| A quick message finishes while a load is still running | The countdown does not start, and `close()` refuses to run while a message is in progress | No effect on the load (unit test only) |
| The service worker stops during a job | `sweepOrphans` marks the job `INTERRUPTED` when the worker starts again (browser test V20) | "The summary was interrupted. Press Summarize to try again." |
| A job with no update for 5 minutes, because the page has stopped sending KEEPALIVE | The popup and the service worker treat it as dead | "The summary was interrupted." |
| Two requests create the page at once | The shared `creating` promise lets both wait for one creation | No visible effect |

The stale limit is 5 minutes in the service worker and the popup. It was 3 minutes before the fix, when it matched the old 180-second answer limit. The answer limit is now 10 minutes, so a single answer longer than 5 minutes is kept alive by the KEEPALIVE refresh (DEVLOG, 2026-10-21 and 2026-10-24). A load has no timeout of its own, and the same refresh covers it while the page is busy.

None of the browser tests named in this chapter runs two tabs at once, so the queued case is covered only by the unit test.

**What this means in plain words.** Every message failure ends as a short, generic message. For `SERVICE_ERROR` and `MODEL_LOAD_FAILED` the popup also shows the first 240 characters of the technical detail, in a line that starts "Technical detail:". The page now stays open while a message is in progress, so a quick request cannot cut off a running load.

## What went wrong while building it

The developer log records these problems in this part (DEVLOG, 2026-10-21).

- The first spike printed nothing for two minutes. The offscreen page has only `chrome.runtime`, so the logging call that used `chrome.storage` failed silently. A later edit that broke the test script's syntax added to the confusion. The page now reports through messages, and the log's lesson is that an offscreen page works by messages only.
- The first try of WebLLM inside the offscreen page failed because Cache Storage does not work there. IndexedDB was used instead (see the storage section of the previous chapter).
- Code reading, not a failing test, found the in-flight problem. The countdown could start from a quick status check during a load, and the page could then close under the load. The fix is the in-flight counter and a unit test ("V2 review while writing the report", item 1).

**What this means in plain words.** The offscreen page has fewer tools than a normal page. The first problems came from forgetting that, and the last one came from rereading the code, not from a test that failed.

## How it was tested

The unit tests in `tests/unit/local-engine.test.js` cover the manager. They check that the manager creates the page once, with the `WORKERS` reason, and reuses it. They also check that the mock mode puts its choice and delay in the page address, that generation runs one answer at a time and in order, that the page closes after the idle time, that a quick status check does not start the countdown while a load is still running, and that progress reaches subscribers until they unsubscribe.

The browser tests in `tests/e2e/pipeline.test.js` cover the same path with the real extension. V15 closes the popup in the middle of a job and reopens it. V20 stops the service worker in the middle of a job. V22 closes the tab during a job. V23 closes the page after the idle time, with `idleCloseMs` set to 400 ms, and then checks that the next summary still works. V24 checks that nothing opens except the popup window: no tab and no options page.

The whole suite has 76 unit tests and 29 browser tests, all passing, and 15 Windows script checks (B1 to B10c). Scenario V26 checks that KEEPALIVE keeps a 16-second pretend answer from showing as interrupted, and V27 checks the technical detail line.

**What this means in plain words.** The unit tests check the manager's rules, and the browser tests check the same rules through the whole extension. The in-flight rule has only the unit test.

## Limitations

- The in-flight rule is checked at unit level only. No browser test closes the page during a load.
- The keepalive interval is the project's own choice. It is not measured against Chrome's actual idle limit on the test laptop.
- The one-at-a-time rule applies to generation only, and it is enforced in the service worker. A caller that bypassed the manager could overlap.
- The load has no timeout of its own. Its job record is refreshed only while the page sends KEEPALIVE, so a stopped page still shows as interrupted after 5 minutes.
- The test seam ships with the extension.
- The reason for the `*.hf.co` host permission is not written down in the repository.

## Questions this chapter answers

**Why not run the model inside the service worker?**
Chrome can stop a service worker that is idle, and the page's header comment says a stopped worker would lose a model that took seconds to load. The offscreen page stays alive while the model is in use. The popup cannot hold the model either, because it closes when the reader clicks away.

**Why does only one answer run at a time?**
The graphics card does one job at a time, and the manager puts every `LOCAL_GENERATE` on one promise chain, so the parts of two jobs take turns. A unit test checks the order with three requests. Loading has its own guard inside the page.

**What keeps the page alive during a long download, and when does it close?**
The page sends `KEEPALIVE` every 10 seconds while a request is in progress, and the service worker receives it and refreshes the running job records. The page closes five minutes after the last request has finished, and never while a request is still running. The model stays in IndexedDB, so the next use reloads it.

**What happens if the page disappears during a job?**
The next message fails, and the call reports `SERVICE_ERROR`. The job then shows the generic message, and the reader can press the button again. A later job creates the page and loads the model from IndexedDB.

**Why do these permissions and the content security policy exist?**
Each permission serves one part of the flow: `scripting` reads the page, `storage` keeps settings and progress, `offscreen` creates the model page, `unlimitedStorage` protects the stored model, and the host entries allow the first download. The policy allows only the extension's own scripts and the WebAssembly that WebLLM needs.
