# V2 local model run: intel

Hidden Chromium, V2 extension, real model. Flags: `none`. Outside websites allowed.

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 199.2 | SmolLM2 360M | intel gen-12lp | 1 | 1 | 122438 | 4 |
| Long article (fixture) | summary | 149.1 | SmolLM2 360M | intel gen-12lp | 2 | 3 | 0 | 5 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: SmolLM2 360M. Not downloaded yet (about 204 MB, first use only). | button: Download model and summarize | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.1 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 0.9 s: Downloading the model (first time only): 0%
- 59 s: Downloading the model (first time only): 33%
- 59.4 s: Downloading the model (first time only): 65%
- 69 s: Downloading the model (first time only): 82%
- 79.1 s: Downloading the model (first time only): 98%
- 81.2 s: Downloading the model (first time only): 100%
- 81.6 s: Loading the model into the graphics card: 16%
- 82 s: Loading the model into the graphics card: 33%
- 82.5 s: Loading the model into the graphics card: 65%
- 82.9 s: Loading the model into the graphics card: 82%
- 83.3 s: Loading the model into the graphics card: 100%
- 83.7 s: Warming up the model (first time can take about 30 seconds)...
- 123.1 s: Summarizing...

### Long article (fixture)

- Before: Model: SmolLM2 360M. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0 s: Reading the page...
- 0.5 s: Checking your graphics card...
- 0.9 s: Summarizing part 1 of 2...
- 65.7 s: Summarizing part 2 of 2...
- 122.6 s: Combining 2 summaries...
