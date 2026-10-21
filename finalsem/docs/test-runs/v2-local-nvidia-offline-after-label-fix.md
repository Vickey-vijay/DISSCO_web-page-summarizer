# V2 local model run: nvidia-offline

> Note: repeat of the offline run after the popup label fix (a stored model is never labelled "Downloading"). Same laptop, outside websites blocked, nothing else running. The timeline below has no "Downloading" line. The load took longer than in [v2-local-nvidia-offline.md](v2-local-nvidia-offline.md) (11.6 s instead of 6.9 s) and the first answer was written at 65 tokens a second; run-to-run differences of this size are normal on this laptop.

Hidden Chromium, V2 extension, real model. Flags: `--force_high_performance_gpu --host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`. Outside websites blocked (cache only).

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 17.7 | Llama 3.2 1B | nvidia ampere | 1 | 1 | 11621 | 65 |
| Long article (fixture) | summary | 16 | Llama 3.2 1B | nvidia ampere | 2 | 3 | 0 | 45 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0.1 s: Reading the page...
- 0.6 s: Checking your graphics card...
- 1.9 s: Loading the model into the graphics card: 0%
- 8 s: Loading the model into the graphics card: 21%
- 8.4 s: Loading the model into the graphics card: 26%
- 8.8 s: Loading the model into the graphics card: 35%
- 9.3 s: Loading the model into the graphics card: 41%
- 9.7 s: Loading the model into the graphics card: 50%
- 10.1 s: Loading the model into the graphics card: 55%
- 10.6 s: Loading the model into the graphics card: 61%
- 11 s: Loading the model into the graphics card: 65%
- 11.4 s: Loading the model into the graphics card: 74%
- 11.8 s: Loading the model into the graphics card: 80%
- 12.2 s: Loading the model into the graphics card: 85%
- 12.7 s: Loading the model into the graphics card: 96%
- 13.1 s: Warming up the model (first time can take about 30 seconds)...
- 13.5 s: Summarizing...

### Long article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0.1 s: Checking your graphics card...
- 2.4 s: Summarizing part 1 of 2...
- 7 s: Summarizing part 2 of 2...
- 10.8 s: Combining 2 summaries...
