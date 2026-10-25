# Manual smoke test of Version 2 in the real Google Chrome

The automated tests run in a hidden Chromium and give the extension an extra host permission, because a test cannot click the toolbar icon. This check covers what they cannot: loading the **unmodified** extension into the real Chrome with "Load unpacked", using it through the toolbar icon, and running the real model on the real graphics card of the laptop.

Do it once on the developer laptop and once on the **client's laptop** before the viva (its known details are in [CLIENT_LAPTOP.md](CLIENT_LAPTOP.md): HP 15, Core i7-1355U, 16 GB, Intel Iris Xe built-in graphics only, Chrome 156). Neither has been done yet; every row of the Result column is empty until someone fills it in. Do the timing rows with the laptop **on mains power** and Chrome in front, because the hidden-browser numbers may be slower than a visible window (advice of decision D7).

## Before you start
- Windows, Google Chrome 116 or newer. About 3 GB of free disk space. An internet connection for the first download only.
- The repository cloned, and `finalsem\project\setup.bat` run once (it must end with `SETUP COMPLETE`).
- Run `powershell -File finalsem\project\scripts\check-computer.ps1` and keep its output. It lists the Windows version, memory, graphics chips and free disk space.

## Part A. The computer

| # | Do this | Expected | Result (pass / fail, note) |
|---|---|---|---|
| A1 | In Chrome open `chrome://gpu` and find the **WebGPU** line | It says *Hardware accelerated*. If it says *Disabled* or *Software only*, Version 2 cannot run here and the popup will say so (row 9) | |
| A2 | On `chrome://gpu` find the line that names the graphics chips | Note which chip Chrome uses (for example Intel UHD or NVIDIA). A laptop with two chips: if Chrome uses the weak one, the popup shows a note and the small model is chosen (row 8) | |
| A3 | (Only if the laptop has an NVIDIA or AMD chip and Chrome uses the Intel chip) double-click `setup.bat --gpu` from a command window, restart Chrome, check `chrome://gpu` again | Chrome now uses the stronger chip. Undo with `powershell -File scripts\set-chrome-gpu.ps1 -Remove`. This changes a Windows setting for the current user only; ask the laptop's owner first | |

## Part B. The extension

| # | Do this | Expected | Result (pass / fail, note) |
|---|---|---|---|
| 1 | Double-click `run.bat` | Chrome opens on `chrome://extensions` and on a Wikipedia article; the window lists 4 steps | |
| 2 | Turn on Developer mode, click Load unpacked, paste the folder path (already on the clipboard), Select Folder | "Page Summarizer" card appears with no red "Errors" button | |
| 3 | Pin the extension (puzzle icon, pin) | The icon is visible in the toolbar | |
| 4 | Open `en.wikipedia.org/wiki/Lighthouse`, click the icon, **before** pressing anything | The popup shows the page title, a line "Model: ... Not downloaded yet (about N MB, first use only)." and the button **Download model and summarize**. There is no key box | |
| 5 | Press the button | Progress: "Checking your graphics card...", then "Downloading the model (first time only): N%" (the percentage never goes down), then "Loading the model into the graphics card: N%", then "Warming up the model (first time can take about 30 seconds)...", then "Summarizing part N of M...", then "Combining ... summaries...". Note the total time. No new tab opens | |
| 6 | When it finishes | A one-sentence overview and bullets; a small line with parts, requests, seconds and the model name | |
| 7 | Press Summarize again, then click on the page so the popup closes, wait 10 s, click the icon again | The finished summary (or the running progress) is still there. The button now says **Summarize this page**; the model line says "Downloaded, runs on this computer." | |
| 8 | (Laptops with only built-in graphics, like the client's) read the popup before pressing | A note "Graphics: Intel (built into the processor). Answers can be slow..." and the model line names **Llama 3.2 1B** (Better quality is the default); about 695 MB to download the first time | |
| 9 | (Only if A1 failed) click the icon | The model line says "Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check." and the button is disabled | |
| 10 | Turn off the internet (airplane mode or unplug), open a different article, click the icon and press Summarize | The summary is still made, with no download. This is the offline proof on the real Chrome | |
| 11 | Open `chrome://extensions`, click the icon, press Summarize | "Chrome does not allow extensions to read this page." | |
| 12 | Open a tab with only a few words and press Summarize | "This page has too little readable text to summarize." | |
| 13 | Open Windows Task Manager, Performance, GPU, while a summary is running | GPU usage rises on the chip that Chrome uses. Write down which one | |
| 14 | Wait 6 minutes without summarizing, then look at the GPU memory | Memory used by Chrome falls (the hidden page closes after 5 idle minutes); the next press still works | |
| 15 | Open `en.wikipedia.org/wiki/Lighthouse`, click the icon, press Summarize (model already downloaded, popup open for a few seconds first). **Write down the seconds.** | A summary in about 2 minutes (developer laptop: 124.6 s hidden). Under the summary: "This is a long page. To keep it quick on this computer, the opening of each section was read: about N% of the text. Reading all of it would take roughly M minutes." and a link "Read the whole page (slower)". The stats line says "read N% of the text" | |
| 16 | Do row 15 **three times in a row** (press Summarize again after each result) and write down the three times | Similar times. A 15-watt laptop may get slower when warm; if the third run is much slower, note it | |
| 17 | Press "Read the whole page (slower)" | A longer job with "Summarizing part n of m"; no shortened notice at the end. Expect 5 to 12 minutes on built-in graphics | |
| 18 | Open Settings (under the button), choose Quality: Fast, press Summarize on a short article | The model line changes to SmolLM2 360M and the first press loads it (about 204 MB). Summaries from this model are often muddled; choose Better again afterwards | |

## Numbers to write down on each laptop
- Computer: model name, processor, memory, graphics chips (from `check-computer.ps1`), Chrome version.
- First use: seconds from pressing the button to the summary (row 5), and download size (695 MB for Llama 3.2 1B).
- Long page: the three times of row 16 and the time of row 17.
- Second use of the same article: seconds.
- Offline use: seconds (row 10).
- The `chrome://gpu` WebGPU line, copied exactly.

## Screenshots to keep (for the report)
Take them with Windows + Shift + S and save into `finalsem/docs/screenshots/` using these names:
`M01-extensions-page.png` (card loaded), `M02-popup-not-downloaded.png`, `M03-popup-downloading.png`, `M04-popup-summary.png`, `M05-chrome-gpu-page.png`, `M06-task-manager-gpu.png`.

## Known limits of this check
It does not cover other Chrome versions, other operating systems, or a locked-down corporate Chrome that blocks Developer mode. The extension is English-only in practice (the model is small).
