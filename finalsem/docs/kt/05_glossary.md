# Glossary

*Purpose: this glossary gives the plain meaning of each technical word in Version 2, in one to three sentences, with this project's number where the repository has one.*

The entries are in alphabetical order. Where a number comes from the repository, the entry names the file. Where the entry is general background about how models work, it says so.

**Attention.** Attention is the part of a language model that lets each word piece look back at the others in the text while it chooses the next, and this project neither changes nor measures it.

**Cache Storage.** The browser's default store for files that a web page or extension keeps, which WebLLM uses by default. It failed inside this project's offscreen page with an "UnknownError", so the project stores the model in IndexedDB instead.

**Chunk (part).** A piece of the page text of at most 6,000 characters (`chunkChars` in `config.js`), sent to the model as one request. The screens call it a part. A page that needs more than 12 parts is refused with TOO_LONG (`maxChunks`).

**Context window.** The number of tokens a model can look at in one go, including the prompt and the answer. The decision record gives the window of Llama 3.2 1B as 4,096 tokens, and the part size is set to fit inside it. A dense part can still exceed it. WebLLM then refuses the prompt with "Prompt tokens exceed context window size", and the extension halves the part (see Halving).

**Decode.** The step in which the model writes its answer, one token at a time. Each token needs a full pass through the model, so decode is slower than prefill. The saved clean NVIDIA runs decoded at 34 to 53 tokens a second. An unsaved speed test, recorded in the DEVLOG, gave about 63.

**fp16 and shader-f16.** fp16 means a number stored in 16 bits, instead of 32, which is faster and smaller. `shader-f16` is the graphics feature that lets the card's small programs use those 16-bit numbers. The models in this project need it, and a card without it gets the NO_SHADER_F16 message.

**Graphics card (GPU).** The chip that does many small calculations at the same time, built for pictures and games. This project runs the model on it, through WebGPU. The developer's laptop has an NVIDIA RTX 3050 with 6 GB.

**Halving (halve and retry).** When WebLLM refuses a part because it does not fit the context window, the extension cuts the part in half at a paragraph or sentence break and summarizes each half. This is repeated up to three levels deep, and never for text under 600 characters. It was added on 24 October, after a dense Wikipedia part was refused in the real Chrome.

**IndexedDB.** A store inside the browser where a web page or extension keeps larger data by name. The model files are kept here, and the project asks for unlimited storage so the browser does not delete them. In the test, the quota was about 10.7 GB.

**Integrated graphics.** A graphics chip built into the processor, instead of a separate card. Intel's built-in chip on the developer's laptop is much slower for this model. The 1B model wrote about 2 tokens a second on it, and the extension chooses the small model there.

**Job record.** The data stored for one summary, under the key `job:<tab id>` in session storage. It holds the status, the phase, the progress, the summary, any error and the stats. The popup redraws from it.

**Keepalive.** A message the offscreen page sends to the service worker every 10 seconds while it is busy. It keeps the service worker from being stopped in the middle of a job. The interval is set in `offscreen.js`. Since 24 October, each keepalive also refreshes the update time of every running job record, so a long answer is not shown as dead.

**Llama 3.2 1B.** The primary model, with the id `Llama-3.2-1B-Instruct-q4f16_1-MLC`. "1B" means about one billion parameters. The popup says the download is about 695 MB, and WebLLM's list gives 879 MB of graphics memory for it.

**Manifest.** The file `manifest.json` that tells Chrome the extension's name, files and permissions. Version 2's manifest has version 2.0.0, and it allows Hugging Face as the model's host.

**Merge.** The step that joins several part summaries into one, with one more model call, which may write at most 320 tokens. The Lighthouse article's seven parts used one merge level, so eight requests in all.

**MLC.** The name in the model ids (for example `-MLC` at the end) marks the compiled form that WebLLM's model list uses. The name comes from the MLC project, on which WebLLM is built. This is background; the repository does not measure it.

**Mock (pretend model).** A stand-in model that answers from fixed text and can fail on purpose. It is selected with `?mock=<mode>` on the offscreen page. The browser tests use it, and its twelve modes include `nowebgpu`, `oom`, `downloadfail`, `longprompt` and `crash`.

**Model weights.** The numbers a model learned, stored in a file. The 1B model's weights are about 695 MB in this project, because they are stored in 4-bit form.

**Offscreen document.** A hidden page that Chrome lets an extension open for a task that needs a page, such as holding a model. This project's offscreen page has no window, can only send messages, and is closed after five minutes idle (`idleCloseMs`), and never while a message is running.

**Parameter.** One of the numbers inside a model that was set during learning. "1B" means about one billion of them. More parameters usually need more memory and time, which is why the project offers a smaller model.

**Pipeline.** The fixed order of steps for one job: read the page, check the length, cut into parts, prepare the model, summarize each part, merge. The same pipeline code is used in Version 1 and Version 2, with a prepare step added in Version 2.

**Prefill.** The step in which the model reads the whole prompt before it writes anything. An unsaved speed test, recorded in the DEVLOG on 21 October, gave about 600 tokens a second on the NVIDIA card, and about 1.5 seconds for a 250-token prompt. The record does not say which text was used. Prefill is faster than decode.

**Prompt.** The text sent to the model in one request: the page text between markers, followed by one fixed instruction. Version 2's prompt layout is `PROMPT_VERSION` `v2.0`. The model reads the prompt and then writes the answer.

**Quantization (4-bit, q4f16_1).** A way of storing the weights in fewer bits, so the file and the memory need are smaller. `q4f16_1` in a model id names a 4-bit form that uses 16-bit numbers for the arithmetic. The cost is a small loss of accuracy, which the project does not measure.

**Readability.** A library that finds the main article in a web page and leaves out the menus and adverts. It is the same file as in Version 1, with an Apache-2.0 licence.

**Service worker.** A background script that Chrome runs for an extension. In this project it owns the job and keeps the job record. Chrome can stop it when it is idle, and a job left running at that moment is marked INTERRUPTED. A job with no update for five minutes counts as dead.

**Session storage.** Chrome's storage for an extension that is cleared when the browser closes. The job records are kept here (`chrome.storage.session`).

**Shader and warm-up.** A shader is a small program that runs on the graphics card. Before the first answer, the card must compile its shaders for the model, which is the warm-up. The cold NVIDIA run's warm-up took about 30.5 seconds, the first Intel run's about 39 seconds, and a later run on the same profile about half a second.

**SmolLM2 360M.** The fallback model, with the id `SmolLM2-360M-Instruct-q4f16_1-MLC`. It needs 376 MB of graphics memory and its download is about 204 MB. The extension chooses it on integrated graphics, on a computer with less than 8 GB of memory, or after the primary model fails to load.

**Stale job.** A job whose record has had no update for five minutes. The popup and the service worker both treat it as dead. The answer timeout is a separate limit, now 10 minutes. Version 1 used three minutes for its own dead-job limit. A running job stays alive while the keepalive refreshes it.

**Temperature.** A setting that controls how much a model varies its choice of next word. The project uses 0.2, so the answer stays close to the most likely words and to the text.

**Timeout (answer limit).** The longest time the extension waits for one model answer. It is 10 minutes (`generateTimeoutMs`, 600,000 ms). It was 180 seconds until 24 October, when answers on the Intel chip ran past three minutes. When it passes, the job stops with TIMEOUT.

**Token.** The piece of text a model reads and writes: a word, part of a word, or a punctuation mark. A page of 6,000 characters is about 1,500 tokens, according to the comment in `config.js`. The repository does not store how many tokens each answer had.

**Tokenizer.** The part that turns text into token numbers for the model, and turns the model's numbers back into text. WebLLM loads it with the model. This is background; the project does not change it.

**Tokens per second.** The speed of decode, written as tokens a second. It is recorded as `decodeTps` in the stats and in the test-run files. Saved clean NVIDIA runs: 34 to 53, each the last request of its job. The repeat run after the label fix gave 65 for the short article and 45 for the two-part article. Saved clean Intel runs with SmolLM2: 4 to 5.

**WebGPU.** A browser feature that lets a web page or extension use the graphics card for calculation. Chrome's `chrome://gpu` page shows whether WebGPU is "Hardware accelerated". The extension asks for an adapter and checks it.

**WebLLM.** The open-source library, version 0.2.86 according to the README, that loads a model and runs it on WebGPU in the browser. It is copied into `src/lib/web-llm.js` with its Apache-2.0 licence.

**Web worker.** A background thread that a web page can start, so heavy work does not block the page. In this project, `engine-worker.js` starts WebLLM's handler in a web worker inside the offscreen page.
