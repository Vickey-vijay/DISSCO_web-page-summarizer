# Viva questions and honest answers (Version 2)

*Purpose: this chapter gives thirty likely viva questions in eight groups, each with a direct answer of two to five sentences that uses the real numbers in the repository, including the awkward questions.*

Say each answer in your own words, in under a minute. Where the repository has no evidence, the answer says so. Where a number comes from the DEVLOG or from an unsaved speed test rather than a saved run, the answer says so. Numbers from before 26 October used the small model on built-in graphics; the answers say so when they matter.

## The idea and the need

**1. What does Version 2 do, in one sentence?**

Page Summarizer Version 2 summarizes the page you are reading with a language model that runs inside Chrome, on your computer's graphics card. It needs no key and no account, and the page text does not leave the computer. Only the first download of the model needs the internet, which the popup reports as about 695 MB for Llama 3.2 1B.

**2. What problem does it solve that Version 1 did not?**

Version 1 sends each page to Google, so every summary needs a key, an internet connection and trust in a cloud service. Version 2 removes all three from the summary itself, after the first download. The Version 1 quota probe also showed the limits of Google's free tier: the chosen model allowed 15 requests a minute, and the bigger model 20 a day.

**3. Why not keep Gemini? It was fast, and it worked.**

Gemini was fast. The model Version 1 chose answered in about 1.6 to 2.0 seconds per request. But every page went to Google, and the bigger model's free allowance stopped at 20 requests a day. The project chose local-only instead (decision 3 in chapter 04), and it kept Version 1 as the cloud version. The cost is that a computer without the right graphics support cannot run Version 2.

## AI basics

**4. What is a language model, and what does "1B" mean?**

A language model is a program that has learned, from a large amount of text, which piece of text is likely to come next. It writes an answer by making that guess again and again. "1B" means the model has about one billion parameters, which are learned numbers stored in its file. The repository does not describe how the model was trained, so that part is general background.

**5. What is a token, and why is speed counted in tokens?**

A token is the piece of text that the model reads and writes. It is often a word, or part of a word, or a punctuation mark. A part of 6,000 characters is about 1,500 tokens, according to the comment in `config.js`. Speed is counted in tokens a second because each token needs one full pass through the model. The saved clean NVIDIA runs wrote 34 to 53 tokens a second. On the built-in chip Llama 3.2 1B wrote 2 tokens a second in the saved run.

**6. What is the context window, and why are the parts 6,000 characters?**

The context window is how much text the model can take in one request, including the instructions and the answer. The decision record gives 4,096 tokens for Llama 3.2 1B. A part of about 1,500 tokens leaves room for the instructions and a short answer. A part that still does not fit is cut in half, and each half is summarized.

**7. What is quantization, and why is the file about 695 MB?**

Quantization stores each weight in fewer bits, so the file and the memory it needs are smaller. This model is 4-bit, as the name `q4f16_1` says, and its files add up to about 695 MB, which is what the popup reports. The cost is a small loss of accuracy, which the project does not measure. A copy with 16-bit weights would be several times larger, which is general background and not a measured figure here.

## Design

**8. Why does the popup not run the model?**

A popup closes when the user clicks elsewhere, and that would stop a long job. The service worker owns the job, and the model is held in a hidden offscreen page. The popup only redraws from the job record in session storage, so closing it does not lose the summary.

**9. Why use an offscreen page, and not the service worker, for the model?**

The offscreen page's own comment gives the reason. Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load. The offscreen page has no window and works only by messages. It is never closed while a message is running, and it closes after five minutes with no work, which gives the card's memory back.

**10. Why is the model kept in IndexedDB and not in Cache Storage?**

WebLLM's default store, Cache Storage, failed inside the hidden page with "UnknownError: Failed to execute 'open' on 'CacheStorage'". IndexedDB worked there, with about 10.7 GB of quota in the test. The extension also asks for the `unlimitedStorage` permission, so Chrome does not delete the model when disk space runs low.

**11. Why not a smaller model on the built-in chip?**

Until 26 October the extension did switch to SmolLM2 by itself on built-in graphics. That was the wrong default. Its summaries were often muddled or wrong, and on the Wikipedia article its summary contained invented facts. The 1B model was the only one whose summary of the same part had no invented details in the benchmark. So the default is Llama 3.2 1B on every chip. SmolLM2 remains a visible choice in Settings > Quality, labelled Fast, and it is used after a memory failure or on a computer with under 8 GB of memory.

**12. Why not a different runtime, such as Transformers.js?**

Nothing measured so far says the runtime is the cause. The adviser's advice was to measure in a visible Chrome window on mains power first. That was done on the developer's laptop on 28 October: three runs in a row took 118.7 s, 101.7 s and 116.7 s, against 124.6 s in the hidden browser, so the hidden window is not the cause. A Transformers.js test, half a day at most, is needed only if a shorter time is wanted, and then only if it reads at least two times faster. That test has not been made. Switching runtimes now would also mean new code and new tests, which the project has not budgeted for.

## Privacy

**13. Does the page text leave the computer?**

No. The model runs on the laptop, and the page text goes only to the model inside the same browser. The offline run is the evidence. With the outside websites blocked, the short article still summarized from the stored copy of the model, in the run made before a label fix.

**14. What does the extension contact on the internet?**

The manifest lists the only hosts it may reach: `huggingface.co`, `*.huggingface.co`, `*.hf.co` and `raw.githubusercontent.com`. The first download uses them. The summary of a page does not use the network, and the Gemini address is no longer in the manifest.

**15. What happens with no internet?**

After the first download, a summary needs no internet. The saved offline run on the NVIDIA card summarized a short article in 15.3 s and a two-part article in 16.5 s, with outside websites blocked. The repeat after the label fix took 17.7 s and 16 s. Before the first download, the download cannot start, and the popup reports MODEL_DOWNLOAD_FAILED. The offline runs block outside sites with a Chromium flag, not with a cut network cable, so say that if you are asked.

## Performance

**16. Why is the first run slow?**

On the NVIDIA card the clean first run took 196.8 s. The download of the 695 MB model took 158.3 s, the load into the card 3.8 s, the warm-up 30.5 s, when the card compiles its programs, and the summary 3.7 s. On the developer's Intel chip the first use of the short fixture took 200.6 s, including a 118 s download. The download happens once. Preloading moves the warm-up to the moment the popup opens, when the model is already stored.

**17. Why is the built-in chip slow, and why is it fast now?**

The built-in chip reads about 15 tokens a second and writes about 2 with Llama 3.2 1B. Reading takes about 80 percent of the time of one part, so the time is set mostly by how much is read. The project now reads less. On built-in graphics a long page is cut to its opening and the first sentences of each section, which fits in one part of 6,000 characters. The answers are short, three sentences for a single part and two per part, so writing is brief too. The Lighthouse page took 124.6 s this way, against about 616 s before, when the small model read the whole page. The user can still choose "Read the whole page (slower)".

**18. How fast is it on your laptop?**

On the developer's Intel chip, the Lighthouse page took 124.6 s with the model loaded, in one part, with 21 percent of the text read. In a visible Chrome window on mains power, on 28 October, three runs in a row took 118.7 s, 101.7 s and 116.7 s, so the hidden test browser did not make it slower. The long fixture took 103.8 s. On the developer's NVIDIA card, the saved clean runs gave 74.1 s for the seven-part Lighthouse article, 16.5 s for a two-part article offline, and 15.3 s for a short article offline. The client's laptop has a built-in Iris Xe chip and has not been timed, so its figure is `[to be measured]`.

![Speed on the two graphics chips from the saved runs: writing speed in tokens a second, and seconds for one summary, before and after 26 October](../figures/V08_speed_chart.png)

Reading the figure: the left side is writing speed in tokens a second. On the developer's Intel chip, Llama 3.2 1B now writes about 2 tokens a second, against 4 and 5 for the small model before 26 October. The NVIDIA card wrote 34 to 53. The right side is seconds for one summary. The whole Lighthouse page took 616.4 s with the small model before 26 October, and 124.6 s now, with 21 percent read. The client's laptop is not drawn, because it has not been measured.

**19. What is the cost in coverage?**

The shortened summary covers about a fifth of a long page. The popup says so, with the percentage, and it gives a rough time for reading all of it. For the Lighthouse run the popup estimated about 12 minutes. The summary is then of the opening and the first sentences of the sections, not of the whole article. The user can press "Read the whole page (slower)", and on built-in graphics that takes 5 to 12 minutes, depending on the article. Before 26 October, the whole page took about 10 minutes with the small model, and its summary was unreliable, so the trade is a smaller coverage for a usable answer in about two minutes.

**20. Why does the second summary start faster than the first?**

The model stays loaded in the hidden page for five minutes after its last message, and the page is never closed while a message runs. The saved Intel long article started six seconds after the short one ended, so its timeline has no load or warm-up lines. After the idle time, the page closes, and the next summary loads the model again from IndexedDB without a download. The load took about 7 seconds in the saved offline run on the NVIDIA card. The warm-up was about half a second there, against about 30.5 seconds in the cold run. The repository does not explain that difference, so the likely reason, that the card already had its programs compiled, should be given as an inference.

## Errors

**21. What if the laptop has no graphics card support?**

The popup says so in plain words. A card without WebGPU shows NO_WEBGPU, and a card without the `shader-f16` feature shows NO_SHADER_F16. In both cases the model line says so and the button is disabled, which scenarios V07 and V08 check. Version 2 cannot run on that computer, and nothing is sent to the cloud instead. The client's laptop has WebGPU hardware acceleration, but the photos did not show `shader-f16`, so this has not been confirmed there.

**22. What happens if the graphics card runs out of memory?**

The extension tries the smaller model once, when the main model is the one that failed. If that loads, it saves the choice in local storage (`modelOverride`), and the popup shows the notice "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." If every model fails, the popup shows the GPU_MEMORY message and asks the user to close other programs. Scenario V10 checks the notice, and scenario V11 checks the failure with every model out of memory.

**23. What if the model download stops halfway?**

The popup shows MODEL_DOWNLOAD_FAILED: "The model download stopped. Check your internet connection and press the button again." The message also says that what was downloaded is kept. Scenario V12 checks that nothing is saved and that a later press succeeds once the download works. The repository does not measure how much of a partial download is kept.

**24. What if Chrome stops the service worker during a job?**

The job record still says "running", so the next start of the worker marks it INTERRUPTED. The popup then tells the user to press Summarize again, which scenario V20 checks. A job with no update for five minutes counts as dead in the popup and the service worker. Since 24 October each keepalive also refreshes the update time of every running job, so one long answer is not shown as dead. The repository does not measure how often Chrome stops the worker in practice.

## Testing

**25. How did you test it?**

There are three layers. The 93 unit tests run in Node, in eight files. The 31 browser scenarios run in hidden Chromium with the pretend model, which has twelve modes. The 15 script checks (B1 to B10c) test the setup and launcher files. The test setup passes all of them. The real model was run separately with `scripts/local-run.mjs`, and that produced the saved runs. The run-1 record in the test-run folder predates the later changes, so run the commands again before you quote the counts.

**26. Why use a pretend model in the tests?**

A real model cannot be made to fail on demand, and it is slow and needs a graphics card. The pretend model can produce no WebGPU, no shader-f16, out-of-memory errors, a failed download, an empty answer, markup in the answer, an oversized prompt and a crash. The real-model runs prove that the real model works, and the scenarios prove the extension's logic.

**27. Did the tests and the review find real bugs? What failed in the real Chrome?**

Yes. The real Chrome failed on 24 October. On the Wikipedia Lighthouse article, on the developer's laptop with the Intel chip, the popup said "Something went wrong inside the extension. Try again." with no reason. A hidden run of the same case failed with TIMEOUT, because one answer ran past the 180-second limit. WebLLM's refusal of an oversized prompt also fell through to that vague message, because the extension did not know its text. The fixes were a 10-minute limit, halving of parts that do not fit, a heartbeat for running jobs, and a "Technical detail" line in the popup. Earlier, scenario V09 found that the popup printed "intel" in lowercase, and `vendorName` in `popup.js` fixed it. A code review found more: a stored model was labelled "Downloading" for about 0.8 s, the small model's answers copied the page marker, and the fallback was silent. The DEVLOG rows dated 21 and 24 October tell those stories.

## Honesty about the limits

**28. How good is a 1B model, really?**

The repository does not score summary quality, so the honest answer is that it is not measured. The saved records say that the three summaries of the built-in run were accurate and fluent. Earlier outputs show faults. The Intel summary began with the page's own marker text, "<<<PAGE TEXT START>>>", in a run recorded before the marker fix. The NVIDIA long-article summary said "These are summaries of consecutive parts of one web page", which describes the process, and that line still appears in some answers. The old-code second try of the Wikipedia article, with the small model, invented facts; those are not repeated here and must not be quoted as facts. The current run of that article with the small model gave three short, generic points whose counts were not checked against the page. A person should compare each summary with its page before any quality claim is made.

**29. What was not measured?**

Several things. The client's laptop has not been run, and the chip's `shader-f16` support is not confirmed. The visible-window timing was made on the developer's laptop on 28 October, with no slowdown over three runs. The client's laptop has not been timed, and its three-run timing has not been taken. The Transformers.js runtime has not been tried. Qwen2.5 1.5B was not measured, because the benchmark run stopped, and gemma3-1b did not load with this WebLLM version. The estimate for the whole page is a rough guess. Summary quality beyond three pages was not compared with any other model. Closing the tab during a download does not stop the download. No automated scenario covers the 10-minute timeout path, because the pretend model has no timeout. Only English text was tried.

**30. Why do the decode speeds differ between documents? The DEVLOG says 63 tokens a second, the saved runs say 34 to 53.**

The 63 tokens a second, and the 600 for reading the prompt, come from an earlier speed test on the NVIDIA chip. The DEVLOG records them, but the test was not saved as a run file, and the record does not say which text was used. The saved clean NVIDIA runs gave 34, 40, 42, 47 and 53 tokens a second, each the last request of its job. On the built-in chip the saved run with Llama 3.2 1B wrote 2 tokens a second, and the saved SmolLM2 runs wrote 4 and 5. The runs done while other programs were busy are not used for ranges. So say the saved figures, and say that 63 and 600 came from a speed test that was not saved.

## What this means in plain words

The answers come back to three points. The model runs on the laptop, so the page stays private and the summary needs no network after the download. The built-in chip is slow at reading and writing, so the project reads less of a long page and writes short answers, and the popup says what was left out. What is not yet known is the client's laptop, so its own timing run comes first, and until it is done you should say so.
