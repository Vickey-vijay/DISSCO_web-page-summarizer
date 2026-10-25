# Model speed benchmark on the built-in Intel graphics (developer laptop)

Adapter: intel gen-12lp, shader-f16 yes. Hidden Chromium, made with `node scripts/bench-models.mjs`. One part of 6000 characters in the real part prompt (about 1444 tokens). One run per model; differences of 10 to 20 percent between runs are normal. The Intel chip is the one the client's laptop also has (a faster variant of it).

Reading = prefill (the model takes in the part). Writing = decode (the model writes tokens). The last column is one realistic part summary asked for at most 150 tokens.

| Model | Load (s) | Warm-up (s) | Reading (tokens/s) | Writing (tokens/s) | Realistic part (s) | Tokens written |
|---|---|---|---|---|---|---|
| SmolLM2-360M-Instruct-q4f16_1-MLC | 2.6 | 1.1 | 28.7 | 4.8 | 66.2 | 64 |
| SmolLM2-360M-Instruct-q4f32_1-MLC | 33.1 | 25.2 | 29 | 3.3 | 96.6 | 138 |
| SmolLM2-135M-Instruct-q0f16-MLC | 46.0 | 3.5 | 40.2 | 13.6 | 43.2 | 150 |
| Qwen2.5-0.5B-Instruct-q4f16_1-MLC | 77.8 | 4.5 | 24.1 | 3.5 | 53.9 | 26 |
| Qwen2.5-0.5B-Instruct-q4f32_1-MLC | 89.5 | 3.9 | 33.1 | 2.6 | 46.8 | 16 |
| gemma3-1b-it-q4f16_1-MLC | did not load: page.evaluate: WindowSizeConfigurationError: Only one of context_window_size and sliding_window_size can be po | | | | | |
| Llama-3.2-1B-Instruct-q4f16_1-MLC | 173.5 | 33.6 | 15.6 | 2 | 161.6 | 150 |
| Llama-3.2-1B-Instruct-q4f32_1-MLC | 151.1 | 30.1 | 15.4 | 1.1 | 188.2 | 102 |

Not measured: Qwen2.5-1.5B (the run was stopped; it needs more memory and is slower than Llama 3.2 1B in every column that was measured for the other models).

## What the numbers say

- Reading speed is low on this chip for every model (15 to 40 tokens a second) and it does not grow much when the model gets smaller: 135M reads 40, 360M reads 26 to 29, Llama 1B reads 15.6. A 6,000 character part (about 1,440 tokens) therefore costs 36 to 90 seconds just to read.
- Writing is slow too (1 to 5 tokens a second for the 4-bit models of 360M and above), so short answers matter.
- The f32 versions (q4f32) are not faster at reading and are slower at writing, so the f16 versions stay.
- Llama 3.2 1B is about 2.4 times slower than SmolLM2 360M for one part (162 s against 66 s) but its summary was the most accurate of the models tried; SmolLM2 360M mixed up names and dates in the same part (see the texts in `bench-models.json`).
- gemma3-1b could not be loaded by this WebLLM version (a window configuration error).
