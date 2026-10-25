# V2 local model run: intel-better

Hidden Chromium, V2 extension, real model. Flags: `none`. Outside websites allowed.

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 200.6 | Llama 3.2 1B | intel gen-12lp | 1 | 1 | 148978 | 2 |
| Wikipedia: Lighthouse | summary | 124.6 | Llama 3.2 1B | intel gen-12lp | 1 | 1 | 0 | 2 |
| Long article (fixture) | summary | 103.8 | Llama 3.2 1B | intel gen-12lp | 1 | 1 | 0 | 2 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only). | button: Download model and summarize | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.1 s: Reading the page...
- 0.5 s: Downloading the model (first time only): 0%
- 13.7 s: Downloading the model (first time only): 7%
- 26.2 s: Downloading the model (first time only): 11%
- 27.8 s: Downloading the model (first time only): 15%
- 28.2 s: Downloading the model (first time only): 18%
- 42.6 s: Downloading the model (first time only): 23%
- 45.5 s: Downloading the model (first time only): 32%
- 61.6 s: Downloading the model (first time only): 36%
- 65.7 s: Downloading the model (first time only): 45%
- 66.1 s: Downloading the model (first time only): 64%
- 83.9 s: Downloading the model (first time only): 67%
- 85.6 s: Downloading the model (first time only): 71%
- 90.5 s: Downloading the model (first time only): 76%
- 91.3 s: Downloading the model (first time only): 80%
- 98.7 s: Downloading the model (first time only): 87%
- 109.4 s: Downloading the model (first time only): 91%
- 109.8 s: Downloading the model (first time only): 95%
- 118 s: Downloading the model (first time only): 100%
- 118.8 s: Loading the model into the graphics card: 26%
- 119.3 s: Loading the model into the graphics card: 41%
- 119.7 s: Loading the model into the graphics card: 55%
- 120.1 s: Loading the model into the graphics card: 65%
- 120.5 s: Loading the model into the graphics card: 80%
- 120.9 s: Loading the model into the graphics card: 89%
- 121.4 s: Loading the model into the graphics card: 100%
- 121.8 s: Warming up the model (first time can take about 30 seconds)...
- 149.5 s: Summarizing...

### Wikipedia: Lighthouse

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.1 s: Reading the page...
- 6.6 s: Summarizing...

### Long article (fixture)

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.1 s: Reading the page...
- 3.5 s: Summarizing...
