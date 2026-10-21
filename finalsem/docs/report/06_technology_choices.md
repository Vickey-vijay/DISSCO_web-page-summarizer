# Technology choices

This chapter records the big choices behind Version 2 as decision records. The records come from `finalsem/docs/DECISIONS.md`, which holds decisions D1 to D6. Each record gives the question, the options, the choice, why the others were rejected, the trade-off accepted, and what was measured afterwards. Where a choice changed after measuring, the record says so.

## Plain terms used in these records

- **Language model**: a program that has learned, from a large amount of text, to guess the next piece of text. "1 billion parameters" means about a billion numbers that the model learned, stored in its file.
- **Token**: a piece of text the model reads or writes, such as a word, part of a word or a punctuation mark. Speed is counted in tokens per second.
- **Context window**: how much text the model can look at in one go. The Llama 3.2 1B model has a 4,096-token window (D1).
- **Quantization (4-bit)**: storing each number in fewer bits, so the file is much smaller, at the cost of a little accuracy.
- **Prefill and decode**: prefill reads the prompt and is fast. Decode writes the answer one token at a time and is slower.
- **Warm-up**: the first answer compiles the graphics card's programs, which took about 30 seconds on the first run.

## How the first choice was checked before building

The first choice was whether a model could run inside a Chrome extension at all, and how. Before any code was written, the question was put in writing to a second, stronger model. The decision record calls it "Opus". Its answer gave a confidence level of medium, with high for three of the six items.

The question covered the library, the place the model runs, the model, the size of each piece of text, whether to keep the cloud engine, and the biggest risk. The developer laptop then was an Acer Aspire Lite with an Intel i5-12450H, 15.7 GB of memory, an Intel built-in graphics chip and an NVIDIA RTX 3050 with 6 GB, running Chrome 155. The client's laptop was unknown.

Table: The first choice, question by question, from decision D1

| # | Question | Advice given | What was done |
|---|---|---|---|
| 1 | Library | WebLLM 0.2.86, pinned, one file copied in; Transformers.js only as plan B | Followed. The spike worked |
| 2 | Where it runs | An offscreen page with one module web worker; the job stays in the service worker; keepalive messages; close after about five idle minutes | Followed. Keepalive every 10 s, idle close after five minutes |
| 3 | Which model | Llama 3.2 1B by default, SmolLM2 360M as fallback; choose by computer | Followed, with one rule added after measuring (D3) |
| 4 | Piece size and prompt | 6,000 characters a part; at most 300 tokens an answer; page text first; temperature 0.2; halve the part if the window is exceeded | Followed, except the halving step, which was **not built** |
| 5 | Keep the cloud engine? | Local only; remove the key box | Followed |
| 6 | Biggest risk | Run WebLLM without a bundler in an offscreen page, on a weak chip; test first in a throw-away extension | Done as a spike. It found the storage problem in D2 |

The advice named three conditions under which it would change. The first was a client laptop without WebGPU, which would bring back a cloud engine. The second was a failed spike, which would switch to Transformers.js. The third was one part taking more than about 60 seconds, which would make SmolLM2 the default.

The first two did not happen. The spike worked, and the clean NVIDIA runs took 4.6 to 16.6 s per part. The third did happen on the Intel chip, where the first part of the two-part article took about 65 s with SmolLM2. The response was narrower than the advice. SmolLM2 became the default on integrated graphics only (D3), not everywhere. The halving step was never built, because no real run hit a window error. The client's laptop is still unknown.

**What this means in plain words.** Most of the advice was followed. One condition came true, and the answer was a rule for one kind of chip, not a change for every computer.

## Decision records

### Library: WebLLM, pinned in one file

- **Options.** WebLLM, or Transformers.js. DECISIONS.md kept Transformers.js only as plan B if the spike failed.
- **Choice.** WebLLM 0.2.86, copied as one file into `src/lib/web-llm.js`, with no bundler.
- **Why the other was rejected.** The spike worked, so the fallback was not needed. DECISIONS.md records no other reason.
- **Trade-off accepted.** Upgrades are manual, because the file is copied by hand.
- **Measured afterwards.** The spike ran, and all five real-model runs used the library.

**What this means in plain words.** One library, copied in as one file, so nothing has to be built before the extension runs.

### Where the model runs: an offscreen page with a worker

- **Options.** The service worker alone, or a hidden offscreen page that hosts a web worker. The offscreen page's header comment gives the reason against the service worker: Chrome stops an idle worker, and a stopped worker would lose the loaded model.
- **Choice.** An offscreen page, with reason WORKERS, hosting one module web worker. The job and its record stay in the service worker.
- **Trade-off accepted.** One more page to manage. Chrome can still stop the service worker, so an INTERRUPTED state is needed.
- **Measured afterwards.** Browser test V20 (worker stopped mid-job) and V23 (idle close, then a working summary) pass.

**What this means in plain words.** The model lives in a hidden page that stays alive while there is work, and that page closes after five quiet minutes.

### Which model: Llama 3.2 1B, with SmolLM2 360M as fallback

- **Options.** Four models, shown in the table below.
- **Choice.** Llama 3.2 1B by default. SmolLM2 360M is used when memory is under 8 GB, when the card is an Intel built-in chip, or after the primary model fails to load.
- **Why the others were rejected.** DECISIONS.md skips Qwen2.5 0.5B as bigger than the 1B model and weaker. It skips Qwen3 0.6B because it needs the most graphics memory of the four and has a thinking mode.
- **Trade-off accepted.** A 1B model writes weaker summaries than a large cloud model, as the PRD states. Summary quality was not compared with the other models.
- **Measured afterwards.** On the NVIDIA chip the clean runs decoded at 34 to 53 tokens a second. On the Intel chip the 1B model decoded at about 2 tokens a second (DEVLOG), and SmolLM2 at 4 to 5.

Table: The four models considered, with the graphics memory from DECISIONS.md

| Model | Graphics memory | Outcome |
|---|---|---|
| Llama 3.2 1B | 879 MB | Chosen as the default; 4,096-token window |
| Qwen2.5 0.5B | 945 MB | Skipped: bigger than the 1B model and weaker |
| SmolLM2 360M | 376 MB | Chosen as the fallback |
| Qwen3 0.6B | 1,403 MB | Skipped: the largest of the four, and it has a thinking mode |

**What this means in plain words.** The 1B model runs on a normal computer, and the smaller model is used where memory or the chip is short.

### Piece size and prompt

- **Options.** Version 1 used 8,000 characters a part. DECISIONS.md does not record the other sizes that were considered.
- **Choice.** 6,000 characters a part, about 1,500 tokens, which sits inside the 4,096-token window with room for the instructions. Part answers are capped at 300 tokens, the final answer at 320, and the temperature is 0.2.
- **Trade-off accepted.** Long pages need more requests. Pages needing more than 12 parts are refused (`maxChunks`).
- **Measured afterwards.** The two-part article took 15.9 s and the seven-part article 74.1 s in clean NVIDIA runs. No real run hit a window error.
- **Not built.** The halve-and-retry step. The 12-part limit caps how long a page can be, but it does not handle one part that is too long for the window.

**What this means in plain words.** Each piece is small enough for the model to read at once, and very long pages are refused before the wait starts.

### Keep a cloud engine, or go local only

- **Options.** Keep the cloud engine selectable, with the key box, or make Version 2 local only.
- **Choice.** Local only. Version 1 remains the cloud version. The key box goes, and first use shows one download button.
- **Why the other was rejected.** The PRD goal is no API key and no page text leaving the machine. A selectable cloud engine would break that goal in the same product.
- **Trade-off accepted.** A computer without WebGPU gets no summary. The advice said it would bring the cloud engine back on such a laptop, so this stays open until the client's laptop is known.
- **Measured afterwards.** The browser tests for no WebGPU and no 16-bit support pass (V07, V08).

**What this means in plain words.** The product makes no outside call for a summary and needs no key, so a laptop it cannot run on gets a clear message.

### The spike: the riskiest step, tested first

- **Options.** Build the whole extension first, or first run a throw-away extension in a hidden browser, measuring download time, cache load time and seconds per part, then again with the network off.
- **Choice.** The spike, as the advice recommended.
- **Why the other was rejected.** DECISIONS.md names this step as the biggest risk, so it was tested before the rest depended on it.
- **Trade-off accepted.** The throw-away extension differs from the real one, so each finding was checked again in the real extension.
- **Measured afterwards.** DECISIONS.md says the spike found two problems and points to D2, which describes only the storage problem. The other problem, a silent offscreen page, is written up in the development log, not in DECISIONS.md.

**What this means in plain words.** The riskiest step was tried in a small copy before the real extension depended on it.

### Where the model files are stored

- **Options.** Cache Storage, WebLLM's default, or IndexedDB.
- **Choice.** IndexedDB, set with `cacheBackend: "indexeddb"`.
- **Why the other was rejected.** Cache Storage failed inside the offscreen page with "UnknownError: Failed to execute 'open' on 'CacheStorage'". IndexedDB worked there, with about 10.7 GB of quota in the test.
- **Trade-off accepted.** The extension needs the `unlimitedStorage` permission, so the browser does not delete the model of about 700 MB when disk space runs low.
- **Measured afterwards.** The offline run's load step took 6.9 s. The spike found a cached load took about 8 to 13 s (DEVLOG).

**What this means in plain words.** The model is kept in the browser's own database, the storage that worked inside the offscreen page.

### A weak graphics chip: a smaller model, chosen by the extension

This record changed after measuring. The first version used the same model on every chip.

- **Options.** Keep the 1B model on integrated graphics, refuse to run, or switch to the smaller model when WebGPU reports an Intel built-in chip.
- **Choice.** Switch to SmolLM2 360M for an Intel built-in chip, and show a one-line note that a separate card is much faster. The check covers Intel only, so other built-in chips would not be switched.
- **Why the others were rejected.** On the Intel chip the 1B model wrote about 2 tokens a second, and the first answer took 36 s to prepare. The development log says the weak chip "is not an error", so it gets a note and a smaller model rather than a refusal.
- **Trade-off accepted.** Answers on this chip are slow, and they come from the smaller model, whose answers were not compared.
- **Measured afterwards.** The Intel short article took 199.2 s on first use: 81 s to download, about 40 s to warm up and 76 s to write. The two-part article took 149.1 s later.

![Real model, Intel built-in graphics: the popup with the note that names the chip](../screenshots/v2-intel-short-popup.png)

This is the single Intel run. The note reads "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The model line names SmolLM2 360M. The note tells the reader why the answer is slow, and it names the chip.

![Speed of the clean runs: NVIDIA against Intel, decode speed and time for the first short answer](../figures/V08_speed_chart.png)
<!-- check against figure -->

Reading the figure: The bars compare the clean NVIDIA runs with the Intel run. The NVIDIA decode speed ran from 34 to 53 tokens a second, and the Intel run with SmolLM2 ran at 4 to 5. The figure plan asks for clean runs only, and the disturbed runs are kept out of the bars.

**What this means in plain words.** On a weak chip the extension trades answer quality for a usable wait, and it tells the reader why the answer is slow.

### Making Chrome use the stronger chip: opt-in only

- **Options.** Set Windows to run Chrome on the separate card by hand, run `setup.bat --gpu`, which writes one per-user registry value, or change nothing.
- **Choice.** Both ways are offered, and neither runs by default. The script runs only when the user passes `--gpu`.
- **Why the default was rejected.** The change alters a Windows setting, and the project owner does not want settings changed without asking.
- **Trade-off accepted.** Most laptops with two chips start on the weak one until someone acts.
- **Measured afterwards.** The registry change was tested only against a throw-away key, not a real Chrome. The `--force_high_performance_gpu` flag moved Chrome to the NVIDIA card in the test runs (DEVLOG). The undo command is `scripts\set-chrome-gpu.ps1 -Remove`.

**What this means in plain words.** The project offers the faster chip but does not change the computer's settings on its own.

### Pretend model for most tests, one real run for proof

- **Options.** Test only with the real model, or use a pretend model for most tests and real runs for proof.
- **Choice.** Both. Most browser tests use a pretend model selected with `?mock=<mode>`, and separate real-model runs prove the real thing works.
- **Why the first option was rejected.** A real model cannot be made to fail on demand, and the failure cases must be forced on purpose.
- **Trade-off accepted.** The pretend model says nothing about summary quality or real memory limits.
- **Measured afterwards.** 65 unit tests pass, and 26 browser tests passed in each of three runs in a row. There are five real-model runs, three of them clean.

**What this means in plain words.** Most tests are quick and repeatable, and a few real runs show that the model works on the developer's laptop.

### Version 1 stays untouched

- **Options.** Link the shared code between versions, copy it, or change Version 1 in place.
- **Choice.** Copy the shared parts into `finalsem/`, and leave `midsem/` as it was.
- **Why the others were rejected.** DECISIONS.md says the shared parts were copied, not linked, so each version can run by itself from its own folder. Version 1's submission was not to change.
- **Trade-off accepted.** Shared code exists in two places, so a fix has to be made twice by hand.
- **Measured afterwards.** Eight of the 19 Version 1 source files are byte-for-byte the same in Version 2, eight changed, three were removed and ten are new (system design chapter).

**What this means in plain words.** Each version runs from its own folder, at the cost of keeping two copies of the shared code.

## Why the interface keeps the Version 1 look

The popup keeps the printed-page style of Version 1: a paper background, dark ink, one red accent, a serif font for the summary and numbered points. Version 2 changed the stylesheet by five lines (system design chapter).

DECISIONS.md holds no record about the look, so the reasons come from two other sources. The PRD states that "Only the summarization engine differs between versions." The Version 1 development log records that the owner said the first design looked AI-made, and that the design was then redrawn in the printed-page style. The look has not been tested with readers, so whether it reads clearly is still unknown.

![Pretend model screenshot: the popup in the not-downloaded state, in the printed-page style](../screenshots/ui-01-not-downloaded.png)
<!-- check against screenshot -->

**What this means in plain words.** Version 2 looks like Version 1 because the PRD changes only the engine, and the look had already been accepted.

## Why no cloud engine remains

Decision D1 answered the question of keeping the cloud engine with "local only". The reason follows the PRD goal of no key and no page text leaving the machine. Version 1 stays as the cloud version, so `engines/gemini.js`, the Options page and the key form are not in Version 2.

The trade-off is the one the advice named. A laptop without WebGPU, or without 16-bit support, cannot run Version 2, and the extension says so. Whether that matters depends on the client's laptop, which has not been tested.

**What this means in plain words.** The cloud engine was removed on purpose, so the product makes no outside call for a summary and needs no key.

## Questions this chapter answers

**Why WebLLM and not Transformers.js?**
WebLLM was the first answer, and the spike ran, so Transformers.js was kept only as plan B. The library is copied into one file, so there is no build step. Upgrades are manual, which is the cost.

**Why did the team change its choice of model after measuring?**
On the Intel chip the 1B model wrote about 2 tokens a second, and the first answer took 36 s to prepare. The extension now switches to SmolLM2 when it sees integrated graphics, and the Intel run took 199.2 s on first use. The change is recorded as D3.

**Why is the model stored in IndexedDB?**
Cache Storage failed inside the extension's offscreen page, and IndexedDB worked there. The extension asks for the `unlimitedStorage` permission so the browser keeps the model when disk space runs low.

**Why no cloud engine?**
The PRD sets the goal of no API key and no page text leaving the machine, and a cloud engine would break both. Version 1 remains the cloud version, and a laptop without WebGPU gets a clear refusal rather than a fallback.

**Did another model check the first choice, and was its advice followed?**
Yes. The question went to a stronger model in writing before building, with a stated confidence of medium. Most of the advice was followed. One condition came true on the Intel chip, and the response was a rule for that chip only, while the halving step was not built.
