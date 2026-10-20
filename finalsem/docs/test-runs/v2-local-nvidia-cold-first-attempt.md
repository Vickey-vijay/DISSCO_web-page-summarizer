# V2 local model run: nvidia

Hidden Chromium, V2 extension, real model. Flags: `--force_high_performance_gpu`. Outside websites allowed.

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 196.8 | Llama 3.2 1B | nvidia ampere | 1 | 1 | 192580 | 47 |
| Long article (fixture) | summary | 15.9 | Llama 3.2 1B | nvidia ampere | 2 | 3 | 0 | 53 |
| Wikipedia: Lighthouse | summary | 74.1 | Llama 3.2 1B | nvidia ampere | 7 | 8 | 0 | 34 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only). | button: Download model and summarize
- 0.1 s: Reading the page...
- 0.5 s: Downloading the model (first time only): 0%
- 5.1 s: Loading the model into the graphics card: 0%
- 21.9 s: Downloading the model (first time only): 7%
- 48.6 s: Downloading the model (first time only): 11%
- 49 s: Downloading the model (first time only): 15%
- 49.5 s: Downloading the model (first time only): 18%
- 81.1 s: Downloading the model (first time only): 23%
- 82.4 s: Downloading the model (first time only): 32%
- 106.7 s: Downloading the model (first time only): 36%
- 107.5 s: Downloading the model (first time only): 45%
- 109.2 s: Downloading the model (first time only): 64%
- 124.6 s: Downloading the model (first time only): 67%
- 129.2 s: Downloading the model (first time only): 71%
- 131.7 s: Downloading the model (first time only): 76%
- 133 s: Downloading the model (first time only): 80%
- 139.2 s: Downloading the model (first time only): 85%
- 139.6 s: Downloading the model (first time only): 87%
- 150.4 s: Downloading the model (first time only): 91%
- 150.8 s: Downloading the model (first time only): 95%
- 158 s: Downloading the model (first time only): 100%
- 158.8 s: Loading the model into the graphics card: 21%
- 159.2 s: Loading the model into the graphics card: 30%
- 159.6 s: Loading the model into the graphics card: 41%
- 160.1 s: Loading the model into the graphics card: 50%
- 160.5 s: Loading the model into the graphics card: 61%
- 160.9 s: Loading the model into the graphics card: 70%
- 161.3 s: Loading the model into the graphics card: 85%
- 161.7 s: Loading the model into the graphics card: 96%
- 162.2 s: Loading the model into the graphics card: 100%
- 162.6 s: Warming up the model (first time can take about 30 seconds)...
- 193.1 s: Summarizing...

### Long article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0 s: Reading the page...
- 0.6 s: Checking your graphics card...
- 1.7 s: Summarizing part 1 of 2...
- 6.3 s: Summarizing part 2 of 2...
- 10.5 s: Combining 2 summaries...

### Wikipedia: Lighthouse

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page
- 0 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 3.2 s: Summarizing part 1 of 7...
- 7.8 s: Summarizing part 2 of 7...
- 17 s: Summarizing part 3 of 7...
- 22.5 s: Summarizing part 4 of 7...
- 30.1 s: Summarizing part 5 of 7...
- 38.1 s: Summarizing part 6 of 7...
- 54.7 s: Summarizing part 7 of 7...
- 60.2 s: Combining 7 summaries...
