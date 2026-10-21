# V2 local model run: nvidia

> Note: this run was done while other programs were using the processor, so the first-use time (207 s) and the seven-part time (101.6 s) are slower than a clean run. The clean first-use run (196.8 s, seven-part article 74.1 s) is in [v2-local-nvidia-cold-first-attempt.md](v2-local-nvidia-cold-first-attempt.md).

Hidden Chromium, V2 extension, real model. Flags: `--force_high_performance_gpu`. Outside websites allowed.

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 207 | Llama 3.2 1B | nvidia ampere | 1 | 1 | 200316 | 38 |
| Long article (fixture) | summary | 17 | Llama 3.2 1B | nvidia ampere | 2 | 3 | 0 | 44 |
| Wikipedia: Lighthouse | summary | 101.6 | Llama 3.2 1B | nvidia ampere | 7 | 8 | 0 | 39 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only). | button: Download model and summarize
- 0.1 s: Reading the page...
- 1.8 s: Downloading the model (first time only): 0%
- 8.6 s: Loading the model into the graphics card: 0%
- 24.2 s: Downloading the model (first time only): 2%
- 24.6 s: Downloading the model (first time only): 7%
- 43.5 s: Downloading the model (first time only): 11%
- 44.3 s: Downloading the model (first time only): 18%
- 68.2 s: Downloading the model (first time only): 23%
- 69.1 s: Downloading the model (first time only): 27%
- 69.6 s: Downloading the model (first time only): 32%
- 89.4 s: Downloading the model (first time only): 36%
- 91.5 s: Downloading the model (first time only): 45%
- 93.6 s: Downloading the model (first time only): 64%
- 107.1 s: Downloading the model (first time only): 67%
- 110.1 s: Downloading the model (first time only): 71%
- 114.4 s: Downloading the model (first time only): 80%
- 120.9 s: Downloading the model (first time only): 85%
- 122.2 s: Downloading the model (first time only): 87%
- 131.1 s: Downloading the model (first time only): 95%
- 138.7 s: Downloading the model (first time only): 100%
- 140.4 s: Loading the model into the graphics card: 21%
- 140.9 s: Loading the model into the graphics card: 26%
- 141.3 s: Loading the model into the graphics card: 30%
- 141.7 s: Loading the model into the graphics card: 37%
- 142.1 s: Loading the model into the graphics card: 41%
- 142.6 s: Loading the model into the graphics card: 50%
- 143 s: Loading the model into the graphics card: 57%
- 143.4 s: Loading the model into the graphics card: 61%
- 143.9 s: Loading the model into the graphics card: 70%
- 144.3 s: Loading the model into the graphics card: 77%
- 144.7 s: Loading the model into the graphics card: 85%
- 145.1 s: Loading the model into the graphics card: 89%
- 145.5 s: Loading the model into the graphics card: 94%
- 146 s: Loading the model into the graphics card: 100%
- 146.4 s: Warming up the model (first time can take about 30 seconds)...
- 202.4 s: Summarizing...

### Long article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0.1 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 2.6 s: Summarizing part 1 of 2...
- 7.7 s: Summarizing part 2 of 2...
- 12 s: Combining 2 summaries...

### Wikipedia: Lighthouse

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0.1 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 5.1 s: Summarizing part 1 of 7...
- 12.4 s: Summarizing part 2 of 7...
- 21.7 s: Summarizing part 3 of 7...
- 30.6 s: Summarizing part 4 of 7...
- 37.2 s: Summarizing part 5 of 7...
- 50.1 s: Summarizing part 6 of 7...
- 65.8 s: Summarizing part 7 of 7...
- 80.5 s: Combining 7 summaries...
