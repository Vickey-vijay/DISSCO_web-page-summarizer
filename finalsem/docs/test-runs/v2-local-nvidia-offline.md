# V2 local model run: nvidia-offline

Hidden Chromium, V2 extension, real model. Flags: `--force_high_performance_gpu --host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`. Outside websites blocked (cache only).

| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |
|---|---|---|---|---|---|---|---|---|
| Short article (fixture) | error | 1 | - | - | - | - | - | - |
| Long article (fixture) | error | 0.5 | - | - | - | - | - | - |

## Timelines (seconds after pressing the button)

### Short article (fixture)

- Before: Model: Llama 3.2 1B. Not downloaded yet (about several hundred MB, first use only). | button: Download model and summarize
- 0.2 s: Reading the page...
- 0.6 s: Downloading the model (first time only): 0%

### Long article (fixture)

- Before: Model: Llama 3.2 1B. Not downloaded yet (about several hundred MB, first use only). | button: Download model and summarize
- 0.1 s: Reading the page...
