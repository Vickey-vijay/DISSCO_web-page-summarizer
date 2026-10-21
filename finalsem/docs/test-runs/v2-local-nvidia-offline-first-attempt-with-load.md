# V2 local model run: nvidia-offline

> Note: kept as a record. Done while other programs were using the processor, so it is slower than the clean run in [v2-local-nvidia-offline.md](v2-local-nvidia-offline.md).

Hidden Chromium, V2 extension, real model. Flags: `--force_high_performance_gpu --host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`. Outside websites blocked (cache only).

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 13.4 | Llama 3.2 1B | nvidia ampere | 1 | 1 | 7749 | 48 |
| Long article (fixture) | summary | 32.2 | Llama 3.2 1B | nvidia ampere | 2 | 3 | 0 | 29 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0.1 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 2 s: Loading the model into the graphics card: 0%
- 5.4 s: Downloading the model (first time only): 0%
- 6.2 s: Loading the model into the graphics card: 26%
- 6.6 s: Loading the model into the graphics card: 37%
- 7 s: Loading the model into the graphics card: 46%
- 7.5 s: Loading the model into the graphics card: 57%
- 7.9 s: Loading the model into the graphics card: 70%
- 8.3 s: Loading the model into the graphics card: 80%
- 8.7 s: Loading the model into the graphics card: 89%
- 9.1 s: Warming up the model (first time can take about 30 seconds)...
- 9.7 s: Summarizing...

### Long article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 2.4 s: Summarizing part 1 of 2...
- 8.2 s: Summarizing part 2 of 2...
- 19.1 s: Combining 2 summaries...
