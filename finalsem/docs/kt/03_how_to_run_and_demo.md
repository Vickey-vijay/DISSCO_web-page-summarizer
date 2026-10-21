# How to run the extension and give the demo (Version 2)

*Purpose: this chapter takes you from a clean Windows computer to a working local summary, gives the demo script and the offline demo, lists the messages you may see with what to do, and shows how to run the tests and check the client's laptop.*

Do the steps yourself at least twice before the viva. Do the first model download at least a day before you need it, because it takes about three minutes on the developer's connection.

## What you need

| Item | What is needed | How to check |
|---|---|---|
| Windows | Windows 10 or 11 | `scripts\check-computer.ps1` prints the version |
| Chrome | Google Chrome 116 or newer | `setup.bat` reads the version |
| Graphics | A graphics chip that WebGPU can use, with `shader-f16` | `chrome://gpu` shows WebGPU; the popup says the card lacks 16-bit math if the feature is missing |
| Memory | Under 8 GB of memory uses the smaller model by rule | `check-computer.ps1` prints the memory |
| Disk | About 3 GB free (the model is about 695 MB) | `check-computer.ps1` compares the free space with 3 GB |
| Internet | Only for the first model download | The popup's model line says "Downloaded" when it is done |

The developer's laptop is an Acer Aspire Lite with an Intel i5-12450H processor, 15.7 GB of memory, a built-in Intel graphics chip and an NVIDIA RTX 3050 with 6 GB. Every clean real-model number in this pack comes from that laptop.

## Step by step on a fresh computer

1. **Get the project.** Clone or copy the whole folder. The README names the repository. Do not copy only some files.
2. **Check the computer (optional, recommended).** Open PowerShell in `finalsem\project` and run `powershell -File scripts\check-computer.ps1`. It prints the Windows version, the processor, the memory, the graphics chips and the free disk space, and says what to change.
3. **Run setup.** Double-click `setup.bat`. It looks for Chrome, checks the version, runs `scripts\check-extension.ps1` and `scripts\check-computer.ps1`, and ends with "SETUP COMPLETE." and "Next step: double-click run.bat". If it says "SETUP FAILED", the window says what is missing, and the details are in `setup.log`.
4. **Run the launcher.** Double-click `run.bat`. It checks the setup record, copies the folder path to the clipboard, opens `chrome://extensions`, and prints four steps.
5. **Load the extension.** Turn on Developer mode, click Load unpacked, press Ctrl+V to paste the path, and click Select Folder. Pin Page Summarizer from the puzzle-piece menu.
6. **Check the graphics card.** Open `chrome://gpu`. The line WebGPU should say "Hardware accelerated". If the computer has two chips, see the section on the separate card below.
7. **Make the first summary.** Open an article and click the icon. The popup says "Model: Llama 3.2 1B. Not downloaded yet (about 695 MB, first use only)." and the button says "Download model and summarize". Press it. On the developer's laptop the first run took about 197 s. Later, the button says "Summarize this page".

### If the computer has two graphics chips

Chrome often uses the built-in chip on a laptop with two. The extension then switches to the smaller model on its own, and the popup shows the note "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster."

To make Chrome use the separate card, do one of these.

- Run `setup.bat --gpu`. The script writes one value under `HKEY_CURRENT_USER` that affects only this Windows user. It is never run by default.
- Or do it by hand: Windows Settings, System, Display, Graphics, add Chrome, Options, High performance.

Then restart Chrome and check `chrome://gpu` again. To undo the script, run `powershell -File scripts\set-chrome-gpu.ps1 -Remove`.

## The viva demo

Run this once in the order shown, with the model already downloaded and an article open. The timings are from the clean runs. Your times will differ.

| Step | What to open or press | What to say |
|---|---|---|
| 1 | `chrome://extensions` with the card loaded | "Chrome loads this folder as an extension. There is no key to paste, and nothing is sent to a cloud service." |
| 2 | An article, then the icon | "The popup says the model is downloaded and runs on this computer. The button now says Summarize this page." |
| 3 | Press the button | "The popup only asks the service worker to start. The progress lines show the parts as they are done. The Lighthouse article took 74.1 s on the clean run, in seven parts." |
| 4 | Click on the article so the popup closes, wait five seconds, then open the icon again | "The job keeps running in the background. The popup reads the same stored record, so the progress is still there." |
| 5 | Point at the line under the summary | "It shows the parts, the requests, the seconds and the model. That is the evidence the popup can give." |
| 6 | Turn off Wi-Fi, then summarize a short article | "The summary is made from the copy on this computer. On the developer's NVIDIA card the short article took 15.3 s with the outside websites blocked." |
| 7 | `chrome://version`, then press Summarize | "Chrome does not let extensions read its own pages, so the job stops before any model step. The code is RESTRICTED_PAGE." |
| 8 | A page with only a sentence or two | "Under 200 characters of readable text, so the model is not called. The code is TOO_LITTLE_TEXT." |

Two cautions. First, the popup for the Lighthouse article in the saved screenshot says 101.2 s, because that run was made while other programs were using the processor. If you show that screenshot, say so.

![Screenshot, real model, NVIDIA card, Lighthouse article: the finished summary with the stats line "7 parts · 8 requests · 101.2 s · Llama 3.2 1B"](../screenshots/v2-nvidia-wikipedia-popup.png)

Caption for the screenshot above: real model, NVIDIA card, Wikipedia Lighthouse article, from a run done while other programs were using the processor. The popup shows the title "Lighthouse - Wikipedia", the model line "Model: Llama 3.2 1B. Downloaded, runs on this computer.", the numbered points, and the stats line. Second, do not show the model's download on stage unless you have time to wait. The download of the 695 MB file took about 158 s on the developer's connection.

## The offline demo

The offline claim is proven in two ways. The repository has a measured run with the outside websites blocked, and you can show the same thing by hand.

1. Make sure the model is downloaded. The popup must say "Downloaded, runs on this computer."
2. Turn off Wi-Fi or unplug the network cable.
3. Open an article and press "Summarize this page".
4. Note the time and the line under the summary. On the developer's laptop the short article took 15.3 s and the two-part article 16.5 s.
5. Turn the network back on.

The repository's measured version blocks the outside websites with the Chromium flag `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`. The flag keeps the local test server reachable. It is the way `scripts/local-run.mjs nvidia-offline` runs. It is not the same as a laptop with no network, so say which you did.

## If something goes wrong

Every message below comes from `src/core/errors.js`, from the popup, or from the setup scripts. The code in capitals is what the job record stores. The popup shows the message, and the technical detail goes to the console.

| What you see | Code | What it means | What to do |
|---|---|---|---|
| Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check. | NO_WEBGPU | Chrome has no WebGPU for this page | Open `chrome://gpu`, check WebGPU, and use the separate card (see above) |
| Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2. | NO_SHADER_F16 | The card lacks the `shader-f16` feature | Nothing in this version fixes it. Say so, and show Version 1 if the client needs a summary |
| The graphics card ran out of memory. Close other heavy tabs or programs and try again. | GPU_MEMORY | The card ran out of memory | Close other tabs. The extension already retries once with the smaller model |
| The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept. | MODEL_DOWNLOAD_FAILED | The download failed | Reconnect and press the button again. The partial download is kept |
| The model could not be started. Press the button to try again. | MODEL_LOAD_FAILED | The model did not load | Press again. The extension had already tried the smaller model once before showing this |
| The model took too long to answer. Try again, or use a shorter page. | TIMEOUT | No answer within 180 s (`generateTimeoutMs`) | Try again or use a shorter page |
| The model returned no summary for this page. | EMPTY_ANSWER | The answer was empty | Press again, or try another page |
| This page has too little readable text to summarize. | TOO_LITTLE_TEXT | Under 200 characters | Use a page with more text |
| This page is too long for the local model on this computer. Try a shorter page. | TOO_LONG | More than 12 parts | Use a shorter page |
| Chrome does not allow extensions to read this page. | RESTRICTED_PAGE | Chrome's own page, a local file or the Web Store | Use a normal web page |
| Could not read the text of this page. | EXTRACT_FAILED | The page reader could not run | Reload the page and try again |
| Something went wrong inside the extension. Try again. | SERVICE_ERROR | An unexpected failure, such as the offscreen page not answering | Press again. Check the console for the detail |
| The summary was interrupted. Press Summarize to try again. | INTERRUPTED | Chrome stopped the worker during the job | Press Summarize again |
| Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster. | (note) | The built-in chip was found and the smaller model is used | Explain it, and offer the separate card |

The code CANCELLED is not shown to the user. It marks a job stopped because the page changed or the tab closed.

Setup and launcher messages are these.

- **"SETUP COMPLETE."** followed by "Next step: double-click run.bat". Setup finished.
- **"SETUP FAILED"**. Setup stopped. The window says what failed and how to fix it. The details are in `setup.log`.
- **"Setup has not been completed yet. Please double-click setup.bat first..."** from `run.bat`. Run `setup.bat` first.
- **"manifest.json is missing from this folder..."** from `run.bat`. Copy the whole folder again.
- **"Not enough free disk space"** from `check-computer.ps1`. Free at least 3 GB.

## How to run the tests

Setup with `setup.bat --dev` installs Playwright and its browser. It needs Node.js 20 or newer. Run these in `finalsem\project`.

| Command | What it does | What you should see |
|---|---|---|
| `npm test` | Runs the unit tests in Node. No browser, no network | 65 tests across six files, all passing |
| `npm run test:e2e` | Runs the browser tests in hidden Chromium with the pretend model | 26 scenarios, all passing. Run 1 took about 77 s |
| `node scripts/local-run.mjs nvidia` | Real model on the NVIDIA card: a cold start, then repeats. Downloads about 660 MB once | Writes `docs/test-runs/v2-local-nvidia.json` and `.md`. Slow, so run it on purpose |
| `node scripts/local-run.mjs nvidia-offline` | Real model with the outside websites blocked | Writes `v2-local-nvidia-offline` files |
| `node scripts/local-run.mjs intel` | Real model on the built-in Intel chip | Writes `v2-local-intel` files. Slow |
| `node scripts/secret-scan.mjs` | Checks the repository for the API key before a push | Exit code 1 if a key is found |
| `powershell -File tests\bat\test-bat-scripts.ps1` | Checks the setup and launcher scripts | 14 checks in run 1, all passing |

The browser tests run hidden. Set `HEADED=1` to watch them. Each browser scenario uses the pretend model, selected with `?mock=<mode>` on the offscreen page, so the tests do not need a graphics card.

Do not run `scripts/local-run.mjs` in the days before the viva unless you want new numbers. It downloads the model and writes files into `docs/test-runs`.

## The checklist for the client's laptop

The client's laptop has not been tested. Its graphics chip, memory and free disk were requested and not returned. Use this list on the day, and write the results down.

1. Run `check-computer.ps1`. Record the Windows version, the processor, the memory, the graphics chips and the free disk.
2. If the memory is under 8 GB, expect the smaller model by rule. Say so before the demo.
3. Confirm Chrome is 116 or newer. Run `setup.bat`, then `run.bat`, then load the folder.
4. Open `chrome://gpu`. WebGPU should say "Hardware accelerated". If it does not, the summary may be very slow or refused. The repository does not test that case.
5. If the computer has two chips, run `setup.bat --gpu` (or set Chrome by hand in Windows Graphics settings), restart Chrome, and check `chrome://gpu` again.
6. Download the model once while connected. The popup must say "Downloaded, runs on this computer."
7. Turn off the network and summarize one short article. Write the time down. The developer's NVIDIA figure was 15.3 s, and the client's figure is `[to be measured]`.
8. Turn the network back on and undo the separate-card setting if you changed it, with `scripts\set-chrome-gpu.ps1 -Remove`.

## Not verified yet

- The client's laptop. Nothing has been run on it.
- `setup.bat --gpu` against a real Chrome. It was tried only against a throw-away registry key.
- A click-through in the visible, daily Chrome. Every browser test and every real-model run used hidden Chromium.
- Languages other than English. The model is small and was meant for English text.

## What this means in plain words

Setup checks the computer and the files. The launcher opens the extensions page. The first summary downloads the model, which takes minutes, and every later summary runs on the card with the network off. If a message appears, the table says what it means and what to do. The tests prove the extension's logic on a pretend model, and the measured runs prove the real model on one laptop.
