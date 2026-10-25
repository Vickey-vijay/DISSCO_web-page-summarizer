# [nonum] Appendix B: Messages, settings and error codes

This appendix is a reference for the three parts that talk to each other: the popup, the service worker and the offscreen page. It lists every message type with its payload, the fields of the job record, every stored setting with its default, the constants that are not stored, the popup elements that carry messages and choices, every error code with its exact message, and the modes of the pretend model. Each row was checked against the source named in its heading.

## Messages between the popup and the service worker

Source: `src/ui/popup.js` (the senders) and `src/background/service-worker.js` (the listener). The popup sends these with `chrome.runtime.sendMessage`.

Table: Messages from the popup to the service worker

| Type | Payload fields | Reply or effect |
|---|---|---|
| `START_SUMMARY` | `tabId` (a whole number); `full` (true for "Read the whole page", otherwise absent) | `{ok: true}` when a job starts. `{ok: false, reason: "already_running"}` when this page is already being summarized. `{ok: false, reason: <error code>}` when starting fails for another reason. With `full: true` the page is read without shortening, and the budgets are set to 0 for that job |
| `GET_MODEL_STATE` | none | `{ok: true, model, switchReason, cached, downloadMB, gpu}` with `model` set to the chosen model object. `{ok: false, error: {code, message, detail}}` when the check fails |
| `PRELOAD_MODEL` | none | `{ok: true}` at once. The worker loads and warms the model in the background, but only when it is already stored. It never downloads, and it does nothing while a job or another preload is running. The popup sends it when it opens on a normal page, when the model is stored and the page is not a browser page |

The service worker also receives two messages from the offscreen page, `MODEL_PROGRESS` and `KEEPALIVE`, which are listed in the next table. A test-only message, `{type: "noop"}`, is sent by test V20 to wake the worker. The worker ignores it.

## Messages between the service worker and the offscreen page

Source: `src/engines/local.js` (the calls), `src/background/offscreen-manager.js` (the sender) and `src/offscreen/offscreen.js` (the listener). Every message to the offscreen page carries `target: 'offscreen'`. The page ignores any message without that field.

Table: Messages between the service worker and the offscreen page

| Direction | Type | Payload fields | Reply or effect |
|---|---|---|---|
| Worker to page | `LOCAL_STATUS` | `modelId` | `{ok: true, gpu: {vendor, architecture, integrated}, deviceMemoryGB, cached, downloadMB, model: {id}}`, or `{ok: false, error: {code, detail}}` |
| Worker to page | `LOCAL_LOAD` | `modelId` | `{ok: true, loadMs}`, or `{ok: true, alreadyLoaded: true, loadMs: 0}` when the model is already loaded. Or `{ok: false, error}`. A model that is loaded and is not the one asked for is unloaded first, which happens when the Quality choice changes. The page checks whether the model is stored before loading, so a stored model is reported as loading, not downloading |
| Worker to page | `LOCAL_GENERATE` | `prompt`, `maxTokens`, `temperature`, `timeoutMs` | `{ok: true, text, finishReason, stats: {promptTokens, completionTokens, prefillTps, decodeTps}}`, or `{ok: false, error}`. `finishReason` is the model's stop reason, and `'length'` means it stopped at the length limit. The worker then ends the answer at its last full stop (`endAtSentence`) and removes copied page markers. A part whose prompt does not fit the window fails with `CONTEXT_TOO_LONG` |
| Page to worker | `MODEL_PROGRESS` | `phase`, `percent`, `text` | No reply. The worker passes it on to the job. Phases are `downloading` and `loading`. A download is reported only when the model is not stored. The warm-up is sent as `loading` at 100% with the text "Warming up the model (first time only)" |
| Page to worker | `KEEPALIVE` | none | No reply. Sent every 10 seconds while the page works. The worker keeps itself awake, and it refreshes the `updatedAt` time of every running job record, so one long answer is not shown as dead |

`LOCAL_GENERATE` requests are made one at a time, in the order they were asked. The offscreen manager keeps a chain for them. It also counts the messages in flight, and it closes the page after the idle time only when none is in flight.

## The job record in session storage

Source: `src/background/service-worker.js`. The record is stored under the key `job:<tabId>` in `chrome.storage.session`, which lasts until the browser restarts. The popup reads it and listens for changes to it.

Table: Fields of the job record

| Field | What it holds |
|---|---|
| `jobId` | Random identifier of the job. A newer job for the same tab replaces it, and its writes are dropped |
| `status` | `running`, `done` or `error` |
| `phase` | `extracting`, `checking`, `downloading`, `loading`, `summarizing`, `merging`, `done` or `error` |
| `current`, `total`, `parts` | Parts done and parts in all, while summarizing. The number of parts being merged |
| `percent`, `detail` | The download or loading percentage, and the progress text from the page |
| `notice` | Always `null` in the job record. The fallback notice and the shortened-page notice are worked out in the popup from the stats, so this field is not used for them |
| `summary` | The final summary text, once done |
| `error` | `{code, message, detail}` when the job fails |
| `stats` | `model` (label), `modelSwitchReason` (`null`, `quality-fast`, `GPU_MEMORY` or `MODEL_LOAD_FAILED`), `gpu`, `loadMs`, `decodeTps`, `textChars` (after cleaning), `trimmedChars` (back matter and markers removed), `condensed` (whether the page was shortened), `readChars` (the characters read), `estimateFullSeconds` (a rough time for reading all of the page, when shortened), `halvedParts` (the parts cut in half because they did not fit the window; 0 when none), and the parts, requests and time |
| `url`, `pageUrl`, `title` | The tab's address when the job started, the page's address at the end, and the page title |
| `startedAt`, `updatedAt` | Time stamps in milliseconds. A running job not updated for five minutes counts as stale (`STALE_MS`, in the service worker and in the popup). The heartbeat keeps a running job's `updatedAt` current during a long answer |

## Settings in chrome.storage.local

Source: `src/core/config.js`. `loadSettings()` reads the nine keys listed in `STORAGE_KEYS`, and it accepts a stored value only when it is within the limit shown. Any other stored value is ignored and the default is used.

Table: Stored settings, their defaults and what each does

| Key | Default | Accepted values | What it does |
|---|---|---|---|
| `quality` | `better` | `better` or `fast` | The Quality choice in the popup's Settings. `better` is Llama 3.2 1B; `fast` is SmolLM2 360M, which is quicker and often muddled or wrong. Any other value is ignored |
| `modelOverride` | not set | Only `fallback` | Chooses the smaller model from then on. The worker writes it after a memory error or a failed load with the larger model. No code clears it, so it stays until the stored settings are cleared |
| `readBudgetIntegrated` | 6000 | Whole number, at least 0 | How many characters of a page the model reads on built-in graphics. 0 means the whole page. A long page is shortened to this budget, and the popup says so |
| `readBudgetOther` | 0 | Whole number, at least 0 | The same budget on any other chip. 0 means the whole page |
| `chunkChars` | 6000 | Whole number, at least 500 | Largest number of characters in one part |
| `maxChunks` | 12 | Whole number, at least 1 | Largest number of parts. A page that needs more is refused as too long |
| `engineMode` | `real` | Text starting with `mock` | Test seam. `real` runs the real model. Any `mock` value runs the pretend model in the mode named after the colon |
| `idleCloseMs` | 300000 (five minutes) | Whole number, at least 1 | Idle time after which the offscreen page is closed, counted only when no message is in flight |
| `generateTimeoutMs` | 600000 (ten minutes) | Whole number, at least 1 | Time limit for one answer. An answer past the limit fails with `TIMEOUT`. It was 180000 (three minutes) before 24 October |

Code defaults that are not in the stored list, so they cannot be changed through storage: `minTextChars` (200, a page with less readable text is refused), `maxTokensPart` (300), `maxTokensFinal` (320, the longest final summary and the one-part answer on a fast card), `briefTokensSingle` (130, a one-part answer on built-in graphics), `briefTokensPart` (90, a part of a long page on built-in graphics), `briefTokensMerge` (180, the merge on built-in graphics), and `temperature` (0.2, low values make the answers more predictable). On built-in graphics the short "brief" prompts are used, and the brief limits apply. A fast card keeps the richer format and the older limits. A fifth value, `mockDelayMs`, is read directly by the offscreen manager and not by `loadSettings()`. It sets the pause in milliseconds for each pretend answer, and its default is 0. Two more constants sit in the code: `MIN_HALVING_CHARS` (600, the shortest text that is cut in half) and `MAX_HALVING_DEPTH` (3, the number of times a part may be cut).

Table: The two models, their sizes, and when each is chosen, from `src/core/config.js` and `src/core/gpu-check.js`

| Role | Model identifier | Label | Graphics memory listed by WebLLM | When it is chosen |
|---|---|---|---|---|
| Primary (default on every chip) | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | Llama 3.2 1B | 879 MB | When the Quality choice is `better`, the computer has at least 8 GB of memory, and there is no earlier failure |
| Fallback | `SmolLM2-360M-Instruct-q4f16_1-MLC` | SmolLM2 360M | 376 MB | When the Quality choice is `fast`, after a memory or load failure with the primary model (`modelOverride`), or when the browser reports under 8 GB of memory |

## Popup elements that carry messages and choices

Source: `src/ui/popup.html` and `src/ui/popup.js`. The model line is always shown. Every other element below starts hidden, and the script shows it only when its state applies.

Table: The popup elements for messages, notices and choices

| Element ID | When it is shown | What it carries |
|---|---|---|
| `model-line` | Always | The model name, whether it is stored, and its size. Refreshed when a job ends, and when the popup opens |
| `settings` | Always, as a closed "Settings" section | Holds the Quality choice |
| `quality` | Inside Settings | A select box with two values: "Better: Llama 3.2 1B (more accurate, slower)" and "Fast: SmolLM2 360M (about 2 times quicker, but summaries are often muddled or wrong)". The choice is stored as `quality` |
| `gpu-note` | Integrated graphics | The graphics note that names the chip and says that answers are slow |
| `error`, `error-text` | A failed job, a stale job, or a refused start | The message for the error code, from the table below |
| `error-detail` | A failed job with the code SERVICE_ERROR or MODEL_LOAD_FAILED | "Technical detail: " followed by the first 240 characters of the error's detail, with spaces collapsed |
| `condense-notice` | A finished summary of a page that was shortened | "This is a long page. To keep it quick on this computer, the opening of each section was read: about N% of the text." followed, when an estimate exists, by "Reading all of it would take roughly M minutes." |
| `read-all` | With the shortened-page notice | The button "Read the whole page (slower)", which starts a job with `full: true` |
| `result-notice` | A finished summary made by the smaller model after a memory failure or a failed load | "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." Not shown for the Quality choice |
| `notice` | Never shown in Version 2 | Reserved; the job record's `notice` field is always `null` |

## Error codes and the messages the reader sees

Source: `src/core/errors.js` for the codes and messages, and `src/core/engine-errors.js` for the classification. The table also says where each code is raised. Every message below is shown exactly as written in the code.

Table: The 15 error codes, their exact messages and when each is raised

| Code | Exact message | When it is raised |
|---|---|---|
| `NO_WEBGPU` | Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check. | No WebGPU interface, or no graphics adapter (`src/core/gpu-check.js`) |
| `NO_SHADER_F16` | Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2. | The adapter lacks the `shader-f16` feature |
| `GPU_MEMORY` | The graphics card ran out of memory. Close other heavy tabs or programs and try again. | An engine error that names memory (the word "oom" counts only as a whole word). The larger model is retried once with the smaller one |
| `MODEL_DOWNLOAD_FAILED` | The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept. | A load error that names a network or fetch problem. Not retried with the other model |
| `MODEL_LOAD_FAILED` | The model could not be started. Press the button to try again. | Other load errors, and a request for an answer before the model is loaded. A failed primary load is retried once with the smaller model |
| `TIMEOUT` | The model took too long to answer. Try again, or use a shorter page. | One answer takes longer than `generateTimeoutMs` (ten minutes) |
| `EMPTY_ANSWER` | The model returned no summary for this page. | The answer is empty after copied markers and copied safety sentences are removed and spaces trimmed (`src/engines/local.js`) |
| `TOO_LITTLE_TEXT` | This page has too little readable text to summarize. | Readable text is shorter than `minTextChars` (`src/core/pipeline.js`) |
| `TOO_LONG` | This page is too long for the local model on this computer. Try a shorter page. | The page needs more parts than `maxChunks` |
| `CONTEXT_TOO_LONG` | A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page. | The model refuses a prompt that does not fit its window ("Prompt tokens exceed context window size"), and cutting the part in half also fails. While halving succeeds, the reader does not see this code |
| `RESTRICTED_PAGE` | Chrome does not allow extensions to read this page. | A browser-internal, file or Chrome Web Store address (`src/background/extract-tab.js`) |
| `EXTRACT_FAILED` | Could not read the text of this page. | The extractor cannot run in the tab for another reason, or returns nothing |
| `SERVICE_ERROR` | Something went wrong inside the extension. Try again. | Any error not covered above, such as an unreachable offscreen page or an unknown message. The popup adds the technical detail line |
| `INTERRUPTED` | The summary was interrupted. Press Summarize to try again. | A job still marked running when the worker starts again. The popup shows the same words for a job not updated for five minutes, but from its own text rather than this code |
| `CANCELLED` | Cancelled. | The job's page changed or its tab closed. The worker writes nothing for it |

The popup shows the message of the code it receives. The technical detail is kept for the console. For SERVICE_ERROR and MODEL_LOAD_FAILED, the popup also shows the first 240 characters of the detail in the `error-detail` line.

## Test counts and the pretend model's modes

Source: `tests/` and `src/offscreen/mock-engine.js`. The product has 93 unit tests (`tests/unit`, run without a browser), 31 browser tests (`tests/e2e`, hidden Chromium, using the pretend model) and 15 Windows script checks (`tests/bat`, B1 to B10c). The unit tests and the script checks do not use the pretend model.

The pretend model's modes are read from the page address, as `offscreen.html?mock=<mode>&delay=<ms>`, and the test sets them through `engineMode`. A mode of `mock` alone means `ok`.

Table: The pretend model's 12 modes and what each one makes the extension do

| Mode | What the pretend model does |
|---|---|
| `ok` | Everything works (the default) |
| `nowebgpu` | The graphics check fails with `NO_WEBGPU` |
| `nof16` | The graphics check fails with `NO_SHADER_F16` |
| `intel` | Reports built-in Intel graphics, so the graphics note appears |
| `oom` | The larger model runs out of memory. The small model works, and the notice appears |
| `oomall` | Every model runs out of memory |
| `downloadfail` | The download fails when the model is not stored |
| `empty` | The model answers with no text |
| `html` | The model answers with markup-looking text, so the test can check that it is shown as plain text |
| `slow` | Each answer takes at least 1.5 seconds |
| `longprompt` | A prompt longer than 3,500 characters is refused with the context-window message, so halving is exercised (scenario V25) |
| `crash` | Every answer fails with SERVICE_ERROR and a technical detail, so the detail line is exercised (scenario V27) |

The pretend download runs in eight steps, 120 milliseconds apart, each with the progress text `Fetching param cache[i/8]`. The pretend sizes are 664 MB for the larger model and 300 MB for the smaller one, and the model line shows them. These are fixed numbers, not measurements. "Stored" is remembered in the extension's own browser storage under a key that starts with `page-summarizer-mock-model-cached:`.

### What this means in plain words

These tables are the contract between the three parts of the extension. A message that is not in the first two tables does not exist in the product, and an error code that is not in the error table cannot reach the reader.
