# V2 local model run: intel-visible

**Visible Chrome window** (HEADED=1, SLOWMO=0, the window in front, the developer laptop on mains power at 100 percent charge), V2 extension, real model (Llama 3.2 1B, already stored). Default settings. The Lighthouse page three times in a row, one browser session, 28 October 2026. This is the check that decision D7 asked for: is the hidden test browser slower than a visible window?

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Wikipedia: Lighthouse | summary | 118.7 | Llama 3.2 1B | intel gen-12lp | 1 | 1 | 9323 | 2 |
| Wikipedia: Lighthouse | summary | 101.7 | Llama 3.2 1B | intel gen-12lp | 1 | 1 | 0 | 2 |
| Wikipedia: Lighthouse | summary | 116.7 | Llama 3.2 1B | intel gen-12lp | 1 | 1 | 0 | 2 |

## Timelines (seconds after pressing the button)

### Wikipedia: Lighthouse

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.1 s: Reading the page...
- 2.6 s: Loading the model into the graphics card: 0%
- 6.2 s: Loading the model into the graphics card: 21%
- 6.6 s: Loading the model into the graphics card: 35%
- 7 s: Loading the model into the graphics card: 50%
- 7.4 s: Loading the model into the graphics card: 61%
- 7.8 s: Loading the model into the graphics card: 74%
- 8.3 s: Loading the model into the graphics card: 89%
- 8.7 s: Warming up the model (first time can take about 30 seconds)...
- 10.5 s: Summarizing...

### Wikipedia: Lighthouse

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.1 s: Reading the page...
- 3.2 s: Summarizing...

### Wikipedia: Lighthouse

- Before: Model: Llama 3.2 1B. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.2 s: Reading the page...
- 3.1 s: Checking your graphics card...
- 3.5 s: Summarizing...
