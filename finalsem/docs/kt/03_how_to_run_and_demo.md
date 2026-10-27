# How to run the extension and give the demo (Version 2)

*Purpose: this chapter takes you from a clean Windows computer to a working local summary, covers the client's laptop and its known specs, gives the demo script (including what to say about a shortened long page), the timing run in a visible Chrome, the offline demo, the messages you may see with what to do, and how to run the tests.*

Do the first model download at least a day before the demo, because it downloads about 695 MB and takes minutes. The developer's Intel chip took 118 s for the download alone, and 200.6 s for the whole first use of the short fixture.

## What you need

| Item | What is needed | How to check |
|---|---|---|
| Windows | Windows 10 or 11 | `scripts\check-computer.ps1` prints the version |
| Chrome | Google Chrome 116 or newer | `setup.bat` reads the version |
| Graphics | A chip that WebGPU can use, with `shader-f16` | `chrome://gpu` shows WebGPU. The popup says the card lacks 16-bit math if the feature is missing |
| Memory | Under 8 GB uses the smaller model by rule | `check-computer.ps1` prints the memory |
| Disk | About 3 GB free (the model is about 695 MB) | `check-computer.ps1` prints the free space on drive C and warns below 3 GB |
| Internet | Only for the first model download | The popup's model line says "Downloaded" when it is done |

Built-in graphics is the normal case now. The extension uses the main model, Llama 3.2 1B, on every chip, and it keeps answers short and shortens long pages on built-in graphics.

## The client's laptop

The client sent photos of the laptop. The facts below are read from the photos (`finalsem/docs/CLIENT_LAPTOP.md`).

| Item | Value |
|---|---|
| Model | HP Laptop 15 |
| Processor | Intel Core i7-1355U, 15-watt, with 2 fast cores and 8 efficient cores |
| Memory | 16 GB (15.7 GB usable) |
| Graphics | Intel Iris Xe, built into the processor. No separate card. The "128 MB" is reserved memory that shares the main memory |
| Disk | 477 GB, Windows (C:) with 363 GB free |
| Chrome | 156.0.8078.48 |
| WebGPU | Hardware accelerated |

Three things are not known. The photos do not show whether the Iris Xe chip has the `shader-f16` feature. If it does not, the popup shows the NO_SHADER_F16 message and Version 2 cannot run there. The speed of this chip has not been measured on that laptop, and the processor is a 15-watt part whose sustained speed is not known. And the extension has not been run on that laptop. The visible-window timing was made only on the developer's laptop. The developer's Intel chip is of the same generation (Gen 12), and its numbers are the nearest guide, not a promise. `setup.bat --gpu` has nothing to switch on there, because the laptop has one graphics chip.

## Step by step on a fresh computer

1. **Get the project.** Clone or copy the whole folder. Do not copy only some files.
2. **Check the computer (recommended).** Open PowerShell in `finalsem\project` and run `powershell -File scripts\check-computer.ps1`.
3. **Run setup.** Double-click `setup.bat`. It checks the Chrome version and the files, and ends with "SETUP COMPLETE." and "Next step: double-click run.bat". If it says "SETUP FAILED.", the window says what is missing, and the details are in `setup.log`.
4. **Run the launcher.** Double-click `run.bat`. It copies the folder path to the clipboard, opens `chrome://extensions`, and prints four steps.
5. **Load the extension.** Turn on Developer mode, click Load unpacked, press Ctrl+V to paste the path, and click Select Folder. Pin Page Summarizer from the puzzle-piece menu.
6. **Reload after any update.** When you pull new code, click the reload arrow on the Page Summarizer card on `chrome://extensions` before you test. Until you do, Chrome keeps running the code it loaded before, so the new behaviour does not appear.
7. **Check the graphics card.** Open `chrome://gpu`. WebGPU should say "Hardware accelerated".
8. **Make the first summary.** Open an article and click the icon. The popup says "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." Press "Download model and summarize" and wait. Later, the button says "Summarize this page".

![Screenshot, pretend model: the popup before the first download, with the button "Download model and summarize" and the model line "Not downloaded yet"](../screenshots/ui-01-not-downloaded.png)

Caption: pretend model, not the real one. This is the first-use state. The model line's "about 664 MB" is the fake model's number. The real popup reports about 695 MB for Llama 3.2 1B.

### Quality: Better or Fast

The popup has a closed Settings section with one choice, Quality. "Better: Llama 3.2 1B (more accurate, slower)" is the default. "Fast: SmolLM2 360M (about 2 times quicker, but summaries are often muddled or wrong)" is the other. The choice is stored in this browser. The model line follows it. Fast is kept as a visible choice, not a default, because its summaries were often wrong. The Fast Lighthouse run in the saved records, made before a fix, gave an answer that was only the prompt's own safety sentence. A fix now reports that as "The model returned no summary for this page."

### Preloading

When the popup opens on a normal web page and the model is already stored, the popup asks the service worker to load and warm the model. This costs nothing on the page and never downloads anything. The warm-up, about 28 to 37 seconds on the developer's Intel chip, then happens while you read the popup, not after you press the button. If the first download has not happened yet, nothing is preloaded.

### Two graphics chips (the developer's laptop only)

Some laptops have a built-in chip and a separate card, and Chrome may pick the built-in one. On the developer's NVIDIA laptop, `setup.bat --gpu` or the Windows Graphics setting (Settings, System, Display, Graphics, add Chrome, Options, High performance) makes Chrome use the card, which wrote 34 to 53 tokens a second with Llama 3.2 1B in the saved runs. Undo with `powershell -File scripts\set-chrome-gpu.ps1 -Remove`, which finds Chrome by itself. The client's laptop has one chip, so none of this applies there.

## The viva demo

Run this with the model downloaded, on the developer's laptop, with the chip it was measured on. The timings are from saved runs. Your times will differ.

| Step | What to open or press | What to say |
|---|---|---|
| 1 | `chrome://extensions` with the card loaded | "Chrome loads this folder. There is no key, and nothing is sent to a cloud service." |
| 2 | An article, then the icon | "The model line says the model is downloaded. The button says Summarize this page. The model is preloaded while the popup is open." |
| 3 | The Wikipedia Lighthouse article, then press the button | "The page is cut to its opening and the first sentences of each section, about one part. The popup says how much was read. On this chip it took 124.6 s with the model loaded, in one part." |
| 4 | Point at the notice above the summary | "This is a long page. The notice says about a fifth of the text was read, and that reading all of it would take roughly 12 minutes. The button 'Read the whole page (slower)' does that." |
| 5 | Click the button only if there is time | "This reads the whole page. It is the slow choice, and the popup says so first." |
| 6 | Close the popup, reopen it, and point at the stats line | "The job kept running, and the stats line shows the parts, the requests, the seconds, the model and how much was read." |
| 7 | `chrome://version`, then press Summarize | "Chrome does not let extensions read its own pages, so the job stops before any model step. The code is RESTRICTED_PAGE." |
| 8 | A page with only a sentence or two | "Under 200 characters of readable text, so the model is not called. The code is TOO_LITTLE_TEXT." |

![Screenshot, real model, NVIDIA card, Lighthouse article: the finished summary with the stats line "7 parts · 8 requests · 101.2 s · Llama 3.2 1B"](../screenshots/v2-nvidia-wikipedia-popup.png)

Caption: real model, NVIDIA card, the Wikipedia Lighthouse article, from a run before 26 October, made while other programs were using the processor. Use it only to show the stats line, and say that the same article on the built-in chip now takes about two minutes.

Cautions. Do not demo the first download on stage. Do not quote the 616 s or 704 s runs as current; they used the SmolLM2 default before 26 October. Do not quote the 15.3 s offline figure as a current measurement of the built-in chip; it was made on the NVIDIA card before a label fix. The Lighthouse summary on built-in graphics is short and checked for accuracy, but its text is not the same as the whole article's.

## The visible-window timing (developer laptop done; client's to do)

The visible-window timing was made on the developer's laptop on 28 October, on mains power, with the Lighthouse page three times in a row: 118.7 s, 101.7 s and 116.7 s, against 124.6 s in the hidden browser. No slowdown showed over the three runs. The steps below repeat it, and say what to write down on the client's laptop, which still needs its own timing.

1. Plug the laptop into mains power. Close other programs, and keep the same window open.
2. Open Chrome in the normal window (not the test browser). Load the folder, and reload it if the code changed.
3. Confirm the model line says "Downloaded, runs on this computer". If not, do the first download and wait.
4. Open the Lighthouse article. Open the popup and wait about one minute, so the preload warm-up finishes.
5. Press "Summarize this page". When the summary appears, write down the stats line.
6. Close the popup, wait one minute, open it again on the same page, and press Summarize. Write down the stats line.
7. Repeat once more. You now have three summaries in a row, with their times.
8. Repeat steps 4 to 7 with Settings > Quality set to Fast. Use the same page. Write the times and say which summary was accurate.

Keep the three times and the chip name, the power state and the Chrome version in one place. Those are the numbers the viva should quote for the client's laptop. Until they exist, say `[to be measured]`. The target from the adviser was about 2 minutes warm, and about 3 minutes with the first-answer warm-up.

## The offline demo

1. Make sure the model is downloaded. The popup must say "Downloaded, runs on this computer."
2. Turn off Wi-Fi or unplug the network cable.
3. Open an article and press "Summarize this page".
4. Note the time and the line under the summary. The saved offline run on the NVIDIA card before a label fix took 15.3 s for the short article.
5. Turn the network back on.

The saved offline runs block the outside websites with the Chromium flag `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`, which keeps the local test server reachable. That is not the same as a laptop with no network, so say which you did.

## If something goes wrong

Every message below comes from `src/core/errors.js`, from the popup, or from the setup scripts. The code in capitals is what the job record stores.

| What you see | Code | What it means | What to do |
|---|---|---|---|
| Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check. | NO_WEBGPU | Chrome has no WebGPU for this page | Open `chrome://gpu` and check WebGPU |
| Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2. | NO_SHADER_F16 | The card lacks the `shader-f16` feature | Nothing in this version fixes it. Say so |
| The graphics card ran out of memory. Close other heavy tabs or programs and try again. | GPU_MEMORY | The card ran out of memory, and the smaller model also failed, or the smaller model was the one that failed | Close other tabs and try again |
| The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept. | MODEL_DOWNLOAD_FAILED | The download failed | Reconnect and press the button again |
| The model could not be started. Press the button to try again. | MODEL_LOAD_FAILED | The model did not load | Press again. The extension had already tried the smaller model once if the main model was the one that failed |
| The model took too long to answer. Try again, or use a shorter page. | TIMEOUT | No answer within 10 minutes (`generateTimeoutMs`) | Wait, or use a shorter page |
| The model returned no summary for this page. | EMPTY_ANSWER | The answer was empty, or only the prompt's own wording | Press again, or try another page |
| This page has too little readable text to summarize. | TOO_LITTLE_TEXT | Under 200 characters after cleanup | Use a page with more text |
| This page is too long for the local model on this computer. Try a shorter page. | TOO_LONG | More than 12 parts (not on built-in graphics, where the page is shortened first) | Use a shorter page |
| A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page. | CONTEXT_TOO_LONG | A part still did not fit the window after halving | Use a shorter page |
| Chrome does not allow extensions to read this page. | RESTRICTED_PAGE | Chrome's own page, a local file or the Web Store | Use a normal web page |
| Could not read the text of this page. | EXTRACT_FAILED | The page reader could not run | Reload the page and try again |
| Something went wrong inside the extension. Try again. | SERVICE_ERROR | An unexpected failure | Read the "Technical detail" line. For more, use the console (below) |
| The summary was interrupted. Press Summarize to try again. | INTERRUPTED | Chrome stopped the worker, or the job had no update for 5 minutes | Press Summarize again |
| The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed. | (notice) | A summary written by SmolLM2 after a memory or load failure | Explain it. It is shown above the summary |
| This is a long page. To keep it quick on this computer, the opening of each section was read: about N% of the text. | (notice) | The page was shortened before reading, on built-in graphics | Explain it. The button reads the whole page |

Vague messages. When the popup shows SERVICE_ERROR or MODEL_LOAD_FAILED, it also shows a "Technical detail: ..." line with the first 240 characters of the cause. That is the first thing to read, and it is enough for a bug report. For more, open `chrome://extensions`, find Page Summarizer, click the "service worker" link, and read the Console tab. The line that starts with `[PageSummarizer] failed` gives the code and the full detail.

The code CANCELLED is not shown to the user.

Setup and launcher messages are these.

- **"SETUP COMPLETE."** followed by "Next step: double-click run.bat". Setup finished.
- **"SETUP FAILED."**. Setup stopped. The details are in `setup.log`.
- **"The graphics setting was NOT changed (see the message above). Setup goes on..."** from `setup.bat --gpu`.
- **"Setup has not been completed yet. Please double-click setup.bat first..."** from `run.bat`.
- **"Not enough free disk space"** from `check-computer.ps1`. Free at least 3 GB.

## How to run the tests

Setup with `setup.bat --dev` installs Playwright and its browser, and it needs Node.js 20 or newer. Run these in `finalsem\project`.

| Command | What it does | What you should see |
|---|---|---|
| `npm test` | Runs the unit tests in Node. No browser, no network | 93 tests across eight files, all passing |
| `npm run test:e2e` | Runs the browser scenarios in hidden Chromium with the pretend model | 31 scenarios (smoke, V01 to V29, V18b), all passing |
| `powershell -File tests\bat\test-bat-scripts.ps1` | Checks the setup and launcher scripts | 15 checks (B1 to B10c), all passing |
| `node scripts/bench-models.mjs` | Measures reading and writing speed for each model on the chip (downloads several models; slow) | Writes `docs/test-runs/bench-models.json` and `.md` |
| `node scripts/dump-page-text.mjs <url>` | Prints the text the extension would read from a page | Use it to check what is cut before reading |
| `node scripts/local-run.mjs intel-better` | Real model on built-in graphics: the short fixture, the Lighthouse page and the long fixture | Writes `v2-local-intel-better` files. Slow |
| `node scripts/local-run.mjs intel-fast` | The same cases with Quality: Fast | Writes `v2-local-intel-fast` files |
| `node scripts/local-run.mjs nvidia` | Real model on the NVIDIA card, a cold start then repeats. Downloads about 660 MB once | Writes `v2-local-nvidia` files |
| `node scripts/secret-scan.mjs` | Checks the repository for the Version 1 key before a push | Exit code 1 if a key is found |

The browser scenarios run hidden. Set `HEADED=1` to watch them. Each scenario uses the pretend model, selected with `?mock=<mode>` on the offscreen page. There are twelve modes: `ok`, `nowebgpu`, `nof16`, `intel`, `oom`, `oomall`, `downloadfail`, `empty`, `html`, `slow`, `longprompt` and `crash`.

Do not run the real-model scripts in the days before the viva unless you want new numbers. They download the model and write files into `docs/test-runs`.

## The checklist for the client's laptop

Use this list on the day, and write the results down.

1. Run `check-computer.ps1`. Record the Windows version, the processor, the memory, the graphics chip and the free space on drive C. The known values are in the table above.
2. Confirm Chrome is 156 or newer, or at least 116. Run `setup.bat`, then `run.bat`, then load the folder.
3. Open `chrome://gpu`. WebGPU should say "Hardware accelerated". The repository does not say whether that page lists `shader-f16`, and the photos did not show it. The popup's NO_SHADER_F16 message is the real check.
4. Plug in the mains power. Download the model once while connected, and wait until the popup says "Downloaded, runs on this computer."
5. Run the timing run described above, in a visible Chrome window, with three summaries in a row on the Lighthouse page, first with Better and then with Fast.
6. Turn off the network and summarize one short article. Write the time down.
7. Turn the network back on. `setup.bat --gpu` is not needed on this laptop.

## Not verified yet

- The extension has not been run on the client's laptop. The visible-window timing was made only on the developer's laptop.
- The client's Iris Xe chip has not been checked for `shader-f16`.
- A second runtime (Transformers.js) has not been tried. The visible-window run showed no slowdown, so it is needed only if a shorter time is wanted, and then only if it is at least two times faster.
- Qwen2.5-1.5B was not measured (the benchmark run stopped), and gemma3-1b did not load with this WebLLM version.
- Languages other than English.

## What this means in plain words

Setup checks the computer and the files. The launcher opens the extensions page. The first summary downloads about 695 MB, and that takes minutes. Later summaries run on the card with the network off. On built-in graphics a long page is shortened and answered briefly, the popup says how much was read, and the Quality choice is there for anyone who wants speed over accuracy. The client's laptop is the one that matters, and the numbers for it are still to be measured.
