# V2 local model run: nvidia-offline

> Note: this is the clean offline run made before the popup label fix. Its short-article timeline has one line, "Downloading the model (first time only): 0%" at 3.9 s, that was a wrong label: the model was already stored. The repeat after the fix is in [v2-local-nvidia-offline-after-label-fix.md](v2-local-nvidia-offline-after-label-fix.md).

Hidden Chromium, V2 extension, real model. Flags: `--force_high_performance_gpu --host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`. Outside websites blocked (cache only).

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 15.3 | Llama 3.2 1B | nvidia ampere | 1 | 1 | 6890 | 40 |
| Long article (fixture) | summary | 16.5 | Llama 3.2 1B | nvidia ampere | 2 | 3 | 0 | 42 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0 s: Reading the page...
- 0.6 s: Checking your graphics card...
- 1.3 s: Loading the model into the graphics card: 0%
- 3.9 s: Downloading the model (first time only): 0%
- 4.7 s: Loading the model into the graphics card: 21%
- 5.1 s: Loading the model into the graphics card: 35%
- 5.6 s: Loading the model into the graphics card: 46%
- 6 s: Loading the model into the graphics card: 55%
- 6.4 s: Loading the model into the graphics card: 65%
- 6.8 s: Loading the model into the graphics card: 77%
- 7.2 s: Loading the model into the graphics card: 89%
- 7.6 s: Loading the model into the graphics card: 100%
- 8.1 s: Warming up the model (first time can take about 30 seconds)...
- 8.6 s: Summarizing...

### Long article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0.1 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 2.4 s: Summarizing part 1 of 2...
- 7.4 s: Summarizing part 2 of 2...
- 12.3 s: Combining 2 summaries...
