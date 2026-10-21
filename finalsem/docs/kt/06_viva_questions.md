# Viva questions and honest answers (Version 2)

*Purpose: this chapter gives thirty likely viva questions in eight groups, each with a direct answer of two to five sentences that uses the real numbers in the repository, including the awkward questions.*

Say each answer in your own words, in under a minute. Where the repository has no evidence, the answer says so. Where a number is taken from the DEVLOG or the decision record rather than a clean run, the answer names the source.

## The idea and the need

**1. What does Version 2 do, in one sentence?**

Page Summarizer Version 2 summarizes the page you are reading with a small language model that runs inside Chrome, on your computer's graphics card. It needs no key and no account, and the page text does not leave the computer. Only the first download of the model needs the internet, which the popup reports as about 695 MB for Llama 3.2 1B.

**2. What problem does it solve that Version 1 did not?**

Version 1 sends each page to Google, so every summary needs a key, an internet connection and trust in a cloud service. Version 2 removes all three from the summary itself, after the first download. The Version 1 quota probe also showed the limits of Google's free tier: the chosen model allowed 15 requests a minute, and the bigger model 20 a day.

**3. Why not keep Gemini? It was fast, and it worked.**

Gemini was fast. The model Version 1 chose answered in about 1.6 to 2.0 seconds per request. But every page went to Google, and the bigger model's free allowance stopped at 20 requests a day. The project chose local-only instead (decision 3 in chapter 04), and it kept Version 1 as the cloud version. The cost of that choice is that a computer without the right graphics support cannot run Version 2.

## AI basics

**4. What is a language model, and what does "1B" mean?**

A language model is a program that has learned, from a large amount of text, which piece of text is likely to come next. It writes an answer by making that guess again and again. "1B" means the model has about one billion parameters, which are learned numbers stored in its file. The repository does not describe how the model was trained, so that part is general background.

**5. What is a token, and why is speed counted in tokens?**

A token is the piece of text that the model reads and writes. It is often a word, or part of a word, or a punctuation mark. A part of 6,000 characters is about 1,500 tokens, according to the comment in `config.js`. Speed is counted in tokens a second because each token needs one full pass through the model, and the clean NVIDIA runs wrote 34 to 53 tokens a second.

**6. What is the context window, and why are the parts 6,000 characters?**

The context window is how much text the model can take in one request, including the instructions and the answer. The decision record gives 4,096 tokens for Llama 3.2 1B. A part of about 1,500 tokens leaves room for the instructions and a 300-token answer. A page longer than one part is cut, each part is summarized, and the summaries are merged.

**7. What is quantization, and why is the file about 695 MB?**

Quantization stores each weight in fewer bits, so the file and the memory it needs are smaller. This model is 4-bit, as the name `q4f16_1` says, and its files add up to about 695 MB, which is what the popup reports. The cost is a small loss of accuracy, which the project does not measure. A copy with 16-bit weights would be several times larger, which is general background and not a measured figure here.

## Design

**8. Why does the popup not run the model?**

A popup closes when the user clicks elsewhere, and that would stop a long job. The service worker owns the job, and the model is held in a hidden offscreen page. The popup only redraws from the job record in session storage, so closing it does not lose the summary.

**9. Why use an offscreen page, and not the service worker, for the model?**

The offscreen page's own comment gives the reason. Chrome stops the service worker when it is idle, and a stopped worker would lose a model that takes seconds to load. The offscreen page has no window, works only by messages, and is closed after five minutes idle, which gives the card's memory back.

**10. Why is the model kept in IndexedDB and not in Cache Storage?**

WebLLM's default store, Cache Storage, failed inside the hidden page with "UnknownError: Failed to execute 'open' on 'CacheStorage'". IndexedDB worked there, with about 10.7 GB of quota in the test. The extension also asks for the `unlimitedStorage` permission, so Chrome does not delete the model when disk space runs low.

**11. Why switch to SmolLM2 on the Intel chip?**

On the built-in Intel chip, the 1B model wrote about 2 tokens a second in the spike, and its first answer took 36 seconds to prepare. The extension detects that case by itself and uses SmolLM2 360M, which needs about 376 MB of graphics memory, and it shows a note on the popup. The clean Intel run took 199.2 s for a short article on first use, and 149.1 s for a two-part article. That is slow, but it finishes, and the decision record prefers a slow answer to a refusal.

**12. Why cap a page at 12 parts?**

Each part is one model call, and on the Intel chip the long article's first part took about 65 seconds, so a large number of parts would take many minutes on a laptop. A page that needs more than 12 parts is refused with TOO_LONG before any download starts. The Lighthouse article, at 36,752 characters, needed seven parts and was accepted.

## Privacy

**13. Does the page text leave the computer?**

No. The model runs on the laptop, and the page text goes only to the model inside the same browser. The offline run is the evidence. With the outside websites blocked, the short article still summarized in 15.3 s from the stored copy of the model.

**14. What does the extension contact on the internet?**

The manifest lists the only hosts it may reach: `huggingface.co`, `*.huggingface.co`, `*.hf.co`, and `raw.githubusercontent.com`. The first download uses them. The summary of a page does not use the network, and the Gemini address is no longer in the manifest.

**15. What happens with no internet?**

After the first download, a summary needs no internet. The clean offline run on the NVIDIA card summarized a short article in 15.3 s and a two-part article in 16.5 s. Before the first download, the download cannot start, and the popup reports MODEL_DOWNLOAD_FAILED. The repository's offline run blocks outside sites with a Chromium flag, not with a cut network cable, so say that if you are asked.

## Performance

**16. Why is the first run slow?**

The clean NVIDIA first run took 196.8 s. About 157 s of that was the download of the 695 MB model, about 3 s was loading it into the card, about 30 s was the warm-up, when the card compiles its programs, and about 4 s was the summary. The download happens once. On the same profile, a later short article took 15.3 s with the outside websites blocked.

**17. Why is the Intel chip so slow, and what can the user do about it?**

The built-in chip wrote 4 to 5 tokens a second with SmolLM2, against 34 to 53 on the separate card. A short article took 199.2 s on first use: about 81 s of download, about 39 s of warm-up and 76 s of writing. The user can run `setup.bat --gpu`, or set Chrome to High performance in the Windows Graphics settings, then restart Chrome.

**18. How fast is it on your laptop?**

On the developer's Acer laptop with the NVIDIA RTX 3050, the clean runs gave 74.1 s for the seven-part Lighthouse article, 16.5 s for a two-part article offline, and 15.3 s for a short article offline. A run done while other programs were busy took 101.6 s for the same Lighthouse article. The client's laptop has not been measured, and the figure there is `[to be measured]`.

**19. What happens to a long page on the card?**

Each part is one model call, and the parts run one after another, because the card does one job at a time. The Lighthouse article made eight requests: seven for the parts and one for the merge. Those eight took 74.1 s on the clean run, and a page of more than 12 parts is refused.

**20. Why does the second summary start faster than the first?**

The model stays loaded in the hidden page for five minutes after its last use. The clean Intel long article started six seconds after the short one ended, so its timeline has no load or warm-up lines. After the idle time, the page closes, and the next summary loads the model again from IndexedDB without a download. The load then took about 7 seconds in the clean offline run. The warm-up was also shorter there, about 0.5 s against about 30.5 s in the cold run. The repository does not explain that difference, so the likely reason, that the card already had its programs compiled, should be given as an inference.

## Errors

**21. What if the laptop has no graphics card support?**

The popup says so in plain words. A card without WebGPU shows NO_WEBGPU, and a card without the `shader-f16` feature shows NO_SHADER_F16. In both cases the model line says so and the button is disabled, which tests V07 and V08 check. Version 2 cannot run on that computer, and nothing is sent to the cloud instead. The client's laptop has not been tested.

**22. What happens if the graphics card runs out of memory?**

The extension tries the smaller model once. If that loads, it saves the choice in local storage (`modelOverride`), so the next popup uses the smaller model too. If every model fails, the popup shows the GPU_MEMORY message and asks the user to close other programs. Tests V10 and V11 check these cases.

**23. What if the model download stops halfway?**

The popup shows MODEL_DOWNLOAD_FAILED: "The model download stopped. Check your internet connection and press the button again." The message also says that what was downloaded is kept. Test V12 checks that nothing is saved and that a later press succeeds once the download works. The repository does not measure how much of a partial download is kept.

**24. What if Chrome stops the service worker during a job?**

The job record still says "running", so the next start of the worker marks it INTERRUPTED. The popup then tells the user to press Summarize again, which test V20 checks. The keepalive message every 10 seconds is meant to keep the worker awake during work. The repository does not measure how often Chrome stops it in practice.

## Testing

**25. How did you test it?**

There are three layers. The 65 unit tests run in Node, in six files. The 26 browser scenarios run in hidden Chromium with the pretend model. The 14 script checks test the setup and launcher files. Run 1, dated 21 October 2026, passed all of them. The real model was run separately with `scripts/local-run.mjs`, and that produced the three clean runs.

**26. Why use a pretend model in the tests?**

A real model cannot be made to fail on demand, and it is slow and needs a graphics card. The pretend model can produce no WebGPU, no shader-f16, out-of-memory errors, a failed download, an empty answer, and markup in the answer. The real-model runs prove that the real model works, and the tests prove the extension's logic.

**27. Did the tests find real bugs?**

Yes. Test V09 found that the popup printed "intel" in lowercase, and `vendorName` in `popup.js` fixed it. Test V22 found that a job record came back after its tab was closed, because a queued write finished late. The fix waits for the queued writes and removes the record after them. Both are recorded in the DEVLOG.

## Honesty about the limits

**28. How good is a 1B model, really?**

The repository does not score summary quality, so the honest answer is that it is not measured. The saved outputs show faults. The Intel summary began with the page's own marker text, "<<<PAGE TEXT START>>>". The long-article summary from the NVIDIA run said "These are summaries of consecutive parts of one web page", which describes the process instead of the article. The Lighthouse summary named the Sumburgh Head lighthouse twice, for two different firsts. A person should compare each summary with its page before any quality claim is made.

![Screenshot, real model, Intel built-in chip, short article: the popup shows the SmolLM2 model line, the Intel graphics note, and a summary that begins with the marker text](../screenshots/v2-intel-short-popup.png)

Caption for the screenshot above: real model, Intel built-in chip, the short article. The popup reads "Model: SmolLM2 360M. Not downloaded yet (about 204 MB, first use only)." and shows the Intel note. The summary's first line is the marker "<<<PAGE TEXT START>>>", followed by the answer as plain text.

**29. What was not tested?**

The client's laptop has not been run. The visible daily Chrome has not been used, because every browser test and real-model run used hidden Chromium. `setup.bat --gpu` was tried only against a throw-away registry key. Only English text was tried. Summary quality was not compared with any other model, and the "halve the part and retry" step in the plan was not built. The offline runs blocked outside websites with a flag, not with a cut network.

**30. Why do the decode speeds differ between documents? The DEVLOG says 63 tokens a second, the runs say 34 to 53.**

The 63 tokens a second comes from an early spike that the DEVLOG records, not from a clean run. The clean NVIDIA runs gave 34, 40, 42, 47 and 53, and the runs done while other programs were busy gave 29 to 48. The real figure is the range of the measured runs, and the decision record's 40 to 63 range is not what the files show. Say the range from the files, and say that 63 came from the spike.

## What this means in plain words

The answers come back to three points. The model runs on the laptop, so the page stays private and the summary needs no network after the download. The first run is slow because of the download and the warm-up, and the Intel chip is slow because it writes few tokens a second. The quality and the client's laptop are not measured yet, and you should say so before anyone asks.
