# V2 local model run: intel-fast

> Note: the Fast setting (SmolLM2 360M), made BEFORE the fix that removes a repeated safety sentence from answers. The Wikipedia summary in the saved JSON is only the prompt's own safety sentence and an empty "Summary:" label, so it was a failed summary even though the run says "summary". After the fix such an answer is reported as EMPTY_ANSWER ("The model returned no summary for this page.").

Hidden Chromium, V2 extension, real model. Flags: `none`. Outside websites allowed.

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | summary | 39.5 | SmolLM2 360M | intel gen-12lp | 1 | 1 | 4877 | 4 |
| Wikipedia: Lighthouse | summary | 64.7 | SmolLM2 360M | intel gen-12lp | 1 | 1 | 0 | 4 |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: SmolLM2 360M. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.2 s: Reading the page...
- 1.2 s: Loading the model into the graphics card: 0%
- 3.3 s: Loading the model into the graphics card: 33%
- 3.7 s: Loading the model into the graphics card: 65%
- 4.2 s: Loading the model into the graphics card: 100%
- 4.6 s: Warming up the model (first time can take about 30 seconds)...
- 5.9 s: Summarizing...

### Wikipedia: Lighthouse

- Before: Model: SmolLM2 360M. Downloaded, runs on this computer. | button: Summarize this page | note: Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster.
- 0.2 s: Reading the page...
- 1.5 s: Summarizing...
