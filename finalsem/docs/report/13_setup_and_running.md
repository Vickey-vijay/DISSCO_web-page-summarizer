# Setup and running the extension

This chapter explains how a client gets Version 2 running on a Windows laptop. The client does not use a command line. Two batch files do the work. `setup.bat` runs once and checks the computer. `run.bat` opens Chrome at the right page. Three PowerShell scripts do the checks that `setup.bat` calls. The chapter follows that order, then covers the optional graphics switch and the messages the client sees when something is missing.

Every message quoted here was copied from the script that prints it, so the wording matches what the client reads. Where the chapter shows a real run, the text comes from `setup.log` in the project folder, written during a setup run on 21 October 2026.

## Where the pieces sit on the laptop

The summary runs inside Chrome. The batch files and scripts run before Chrome is used and then finish. The figure below shows the running parts: the page the reader has open, the extension's service worker that owns the summary job, the hidden offscreen page that holds the model, the graphics card that does the arithmetic, and the model files kept by the browser on disk.

![What runs where on the client laptop](../figures/V12_deployment.png)

Reading the figure: the popup starts the job through the service worker, which sends messages to the offscreen page. The offscreen page holds the model and passes the work to a web worker, which runs WebLLM on Chrome's GPU part and the graphics card. The model files are kept on disk in IndexedDB. A dashed arrow from Hugging Face and GitHub marks the first download only. The figure's footer says that the client's laptop has not been tested yet, and that Chrome's own process layout is not measured. The setup and run scripts are not in the picture, because they finish before the extension is used. The manifest lists Hugging Face and GitHub raw addresses as the hosts the extension may read from, which is where the model files come from. The manifest does not list any address that would receive page text, and the code passes page text only between the extension's own pages.

### What this means in plain words

The parts that write the summary all sit inside Chrome on the laptop. The internet is used for the first model download, and that download carries no page text.

## The steps the client follows

Table: The four steps and the file that handles each

| Step | Who acts | What happens |
|---|---|---|
| 1. Setup | Client runs `setup.bat` once | Finds Chrome, checks its version and the project files, checks the computer, and writes a marker file that `run.bat` reads |
| 2. Run | Client runs `run.bat` | Copies the folder path to the clipboard, opens Chrome's extensions page and a sample article, and prints four steps |
| 3. Load | Client follows the four steps in Chrome | Turns on Developer mode, loads the folder and pins the extension. Chrome does this part, not a script |
| 4. Summarize | Client presses the button in the popup | The first time, the main model (about 695 MB) downloads and loads. After that the button says "Summarize this page" |

Steps 1 and 2 are scripted. Step 3 is manual, for a reason explained in the `run.bat` section. Step 4 is the normal use of the product.

### What this means in plain words

The client double-clicks two files and makes a few clicks in Chrome. The scripts check everything they can before the browser is opened.

## The client's laptop

The client's laptop was described from three photos of its screen, which are not stored in the repository. The facts are in `docs/CLIENT_LAPTOP.md`. It is an HP 15 laptop with a 13th Gen Intel Core i7-1355U processor, 16 GB of memory, and Intel Iris Xe graphics built into the processor. It has no separate graphics card. Windows reports 363 GB free on the system drive. Chrome is version 156, and `chrome://gpu` lists WebGPU as hardware accelerated.

Three things follow for setup. The built-in graphics path is the main path for this client, not an edge case. On the facts in the photos, the setup checks would pass: Chrome is newer than 116, the memory and free disk space are far above what the checks ask for, and WebGPU is hardware accelerated. `setup.bat --gpu` has nothing to switch on, because there is only one graphics chip. The photos do not show whether the chip offers the 16-bit shader feature (`shader-f16`). The developer laptop's Intel chip of the same generation does, and chapter 16 lists this as open.

The first use downloads the main model, about 695 MB, then loads and warms it up. On the developer laptop's Intel chip, the warm-up on the first answer took about 28 to 37 seconds. The extension has not been run on the client's laptop, or in a visible Chrome window, so these are expectations and not measurements (chapter 14).

### What this means in plain words

On this client's laptop the built-in chip is the only chip, so the first download and the first warm-up are the costs the client will meet first. The setup has room for both.

## The folder the client works in

The client works in one folder, `finalsem\project`. The two batch files and `manifest.json` sit in its root, the PowerShell checks and the real-model script sit in `scripts`, and the extension itself sits in `src`. The figure below shows the same layout with a short note beside each part.

![Folder tree of finalsem with one-line notes](../figures/V13_repo_tree.png)

Reading the figure: the tree lists the folders of `finalsem/`. Its `project` folder holds `manifest.json`, the two batch files, the `src` folder with the extension's parts (background, content, core, engines, lib, offscreen and ui), the `tests` folder, and the `scripts` folder for the computer check, the Chrome graphics setting and the real-model run. The `docs` folder holds the decision record, the figures, the screenshots and the test runs. The real-model script in `scripts` also deletes a browser profile's old service worker folders before each launch, which chapter 14 explains; the downloaded model is kept in IndexedDB and is not touched.

### What this means in plain words

The client needs only this folder. Chrome is the one program that setup needs from outside it, and Node.js is needed only for the developer tools.

## Design decisions for setup

The table records the main choices, with the reasons the repository gives for them.

Table: Options considered for loading the extension and changing the graphics setting

| Question | Options considered | Choice | Why the others were rejected | Trade-off accepted |
|---|---|---|---|---|
| How does the extension get into Chrome? | Start Chrome with `--load-extension`; or guide the client through Load unpacked | Guide the client | The flag was removed from branded Chrome in version 137, so it cannot be used on the client's Chrome | One manual step remains |
| Should the stronger graphics chip be chosen for Chrome? | Run it by default; run it only on request (`--gpu`); leave it to the client | Opt-in `--gpu`, with the Windows setting as the manual route | The project owner asked that Windows settings not be changed without asking | The client may need to make the change by hand |
| How much free disk space is required? | No check; a fixed minimum of 3 GB | Fixed minimum of 3 GB, checked in step 4 | Not recorded in the repository. The README gives the reason for leaving room: Chrome keeps extra copies while it unpacks the model | The 3 GB figure is a margin, not a measured peak |

### What this means in plain words

The choices keep Windows settings under the client's control and keep the disk check simple. The costs are one manual step in Chrome and one margin figure that has not been measured.

## setup.bat, step by step

`setup.bat` accepts three options and one environment setting.

Table: Options accepted by setup.bat

| Option | What it does |
|---|---|
| none | Runs steps 1 to 4. Step 5, the developer tools, is skipped. |
| `--dev` | Also installs the developer test tools. Needs Node.js 20 or newer. |
| `--gpu` | After the computer check, asks Windows to run Chrome on the separate graphics card. Opt-in, see the graphics section. On the client's laptop, which has one graphics chip, it has nothing to switch on. |
| `--reset` | Deletes `node_modules` and the marker file, then sets up again from the start. |

The environment setting `SETUP_NOPAUSE=1` skips the final pause. The automated Windows checks use it.

**Step 1, find Chrome.** The script looks for `chrome.exe` in the `Program Files` folder, the `Program Files (x86)` folder and the user's local application data folder. If none of them has it, the script reads the Windows registry entry where installed programs record their paths. If Chrome is still not found, setup stops.

**Step 2, check the version.** The version comes from the registry key `HKCU\Software\Google\Chrome\BLBeacon`. Chrome 116 or newer passes. If the version cannot be read, setup prints a note and continues. The check is written as separate subroutines, not as an `if` block. The development log explains why: a variable set inside a block cannot be read again inside that same block.

`setup.bat` (the `:check_chrome_version` subroutine)

```
:check_chrome_version
set "CHROME_VER="
set "CHROME_MAJOR="
for /f "tokens=3" %%V in ('reg query "HKCU\Software\Google\Chrome\BLBeacon" /v version 2^>nul') do set "CHROME_VER=%%V"
if not defined CHROME_VER goto :cv_unknown
for /f "delims=." %%M in ("%CHROME_VER%") do set "CHROME_MAJOR=%%M"
call :say "  Chrome version %CHROME_VER%"
if %CHROME_MAJOR% lss 116 goto :cv_old
exit /b 0
```

**Step 3, check the extension files.** `setup.bat` calls `scripts\check-extension.ps1`. It checks that `manifest.json` exists and can be read, that the manifest is Manifest V3, and that every file the manifest names is present. It also checks six files the extension needs directly, including the two scripts injected into pages and the offscreen page, such as `src/lib/web-llm.js` and `src/offscreen/engine-worker.js`. When everything is present, it prints "Extension files look complete (extension version 2.0.0)."

**Step 4, look at the computer.** `scripts\check-computer.ps1` describes the computer. It is covered in its own section below. This is the only step that stops setup for a reason about the hardware.

**Step 5, developer tools (optional).** Without `--dev`, the script says the test tools are not needed for normal use. With `--dev`, it checks that Node.js is installed and is version 20 or newer. It then runs `npm install` up to three times, waiting five seconds between tries, and `npx playwright install chromium` up to three times. The script's own message says the browser download needs about 200 MB.

**What setup writes.** Two files appear in the project folder. `.setup-ok` holds the Chrome path and the date, and `run.bat` reads it. `setup.log` holds every line that was printed, each with a time stamp. If setup fails, the marker is deleted, so `run.bat` refuses to start with a broken setup.

The lines below are a real excerpt from `setup.log` for the run on 21 October 2026, recorded before a fix. The line "Free space on C::" has a doubled colon, because the script wrote `$env:SystemDrive` followed by a colon, and that value already ends in a colon. The check itself was right. The script now prints "Free space on drive C:" and the doubled colon is gone.

`setup.log` (real output from step 4 to the end, recorded before the fix; the time stamps and the `[computer]` source tags are removed)

```
Step 4 of 5: looking at this computer (graphics card, memory, free disk space)...
  Windows: Microsoft Windows 11 Home Single Language (build 26300)
  Processor: 12th Gen Intel(R) Core(TM) i5-12450H
  Memory: 15.7 GB
  Graphics: Intel(R) UHD Graphics (2048 MB reported)
  Graphics: NVIDIA GeForce RTX 3050 6GB Laptop GPU (4095 MB reported)
  Free space on C:: 379.9 GB (the model download is about 700 MB)
  Tip: this computer has built-in AND separate graphics. Chrome may pick the slow built-in one.
SETUP COMPLETE.
Next step: double-click run.bat
```

**When setup fails.** The `:fail` block prints `SETUP FAILED.`, then a line starting "What failed:", then a line starting "How to fix:", and then a note to send `setup.log` to the developer. The fix line is written for the client. It names the next action, such as installing Chrome and running setup again. The messages are listed in the table further on.

### What this means in plain words

Setup checks Chrome, the project files and the computer, in that order. It stops with a plain message and a fix when one of them is wrong, and it keeps a log for the developer.

## run.bat and why the extension is loaded by hand

`run.bat` does five things. It stops if the marker file is missing. It reads the Chrome path from the marker and checks that Chrome is still there. It checks that `manifest.json` exists. It copies the folder path to the clipboard, so the client can paste it into Chrome's dialog. Then it opens Chrome's extensions page, waits two seconds, opens a sample article, and prints the four steps.

`run.bat` (the clipboard and the two browser windows)

```
rem Put the folder path on the clipboard so it can be pasted into the "Load unpacked" dialog.
if not "%RUN_NOCLIP%"=="1" <nul set /p ="%EXT%" | clip

start "" "%CHROME%" chrome://extensions
timeout /t 2 /nobreak >nul
start "" "%CHROME%" https://en.wikipedia.org/wiki/Lighthouse
```

The manual step is needed because of a change in Chrome. The development log records that Chrome 137 removed the `--load-extension` command-line flag from the normal, branded Google Chrome build. The flag still works in Playwright's Chromium, which is why the automated browser tests can load the extension at start-up. The client uses the branded build, so `run.bat` cannot put the extension into Chrome itself. It sends the client to the extensions page and prints the steps.

The steps are printed by `run.bat` as real output. Each line is copied from the script:

```
1. On the extensions page, turn on "Developer mode" (top right).
2. Click "Load unpacked", paste this folder path (it is already on your clipboard)
   and press Select Folder:
3. Click the puzzle-piece icon in Chrome and pin "Page Summarizer".
4. Open any article, click the Page Summarizer icon and press "Download model and summarize".
```

No automated test covers this step on the client's Chrome. A test on Chromium does not prove the install path in the branded build, so a manual Load unpacked check is still needed (chapter 16).

### What this means in plain words

`run.bat` takes the client as far as Chrome allows a script to go. Chrome must be told to load the folder, so the client does that step by hand.

## check-computer.ps1: what it reports and the 3 GB rule

`check-computer.ps1` prints the Windows edition and build, the processor, the memory, each graphics chip with the memory Windows reports for it, and the free space on the system drive. It then gives advice. With both a separate card and a built-in chip, it suggests `setup.bat --gpu`. With only the built-in chip, it prints a note that says Version 2 works, but reading a page is slow: a long page is shortened first (about two minutes), and the first use downloads the model (about 695 MB).

Only one rule can stop setup here: free disk space. The script exits with code 1 when the free space is below `MinFreeGB`, which defaults to 3.

`scripts/check-computer.ps1` (the rule and the exit codes)

```
if ($hasDiscrete -and $hasIntel) {
    Say "  Tip: this computer has built-in AND separate graphics. Chrome may pick the slow built-in one."
    ...
}
if ($freeGB -lt $MinFreeGB) {
    Say "  Not enough free disk space: $freeGB GB free, at least $MinFreeGB GB is needed."
    exit 1
}
exit 0
```

The model is about 700 MB. The README says Chrome keeps extra copies while it unpacks the model. The 3 GB figure is the project's margin. The README gives the reason, but no file in the repository measures how much disk space the unpacking uses at its peak. The automated check of this rule (test B9b) passes an impossible value of 99999 GB and confirms that the script prints the plain message and exits with code 1.

The script reads Windows. It cannot tell whether Chrome supports WebGPU or the 16-bit shader feature, because only Chrome can answer that. The popup asks Chrome when it opens, through `src/core/gpu-check.js`, and reports the answer in the model line. A computer can therefore pass setup and still fail when the popup opens. The memory figures are also limited. The setup log shows 4095 MB for a card whose name says 6 GB, so the number is what Windows reports, not a measured capacity.

### What this means in plain words

The computer check reads Windows facts. It stops setup only when the disk is nearly full. Whether the graphics card can run the model is decided later, inside Chrome.

## The graphics switch (setup.bat --gpu)

Some laptops have two graphics chips, and Chrome may use the weaker, built-in one. On this laptop the built-in chip wrote about 2 tokens a second with the 1 billion parameter model in an earlier speed test (chapter 14), while the separate NVIDIA card wrote between 34 and 53 tokens a second in the clean saved runs. The client can change Chrome's choice in the Windows settings by hand, or the developer can run `setup.bat --gpu`. The client's own laptop has one chip, so neither applies there (see the client's laptop section).

`setup.bat --gpu` runs `scripts\set-chrome-gpu.ps1`, which writes one value for the current Windows user. The value sits under `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`. Its name is the full path of `chrome.exe`, and its value is `GpuPreference=2;`, which is the Windows code for "high performance". It needs no administrator rights, and it changes nothing for other users.

`scripts/set-chrome-gpu.ps1` (the write and the messages)

```
    if (-not (Test-Path $RegistryPath)) { New-Item -Path $RegistryPath -Force | Out-Null }
    New-ItemProperty -Path $RegistryPath -Name $ChromePath -Value 'GpuPreference=2;' -PropertyType String -Force | Out-Null
    Say "  Windows will now run Chrome on the high-performance graphics card."
    Say "  Close ALL Chrome windows and open Chrome again for this to take effect."
```

The switch is opt-in. The script runs only when `--gpu` is given, and it is never run by default. The project owner asked that Windows settings are not changed without being asked (`docs/DECISIONS.md`, D4).

To undo it, run the script with `-Remove`:

```
powershell -File scripts\set-chrome-gpu.ps1 -Remove
```

The script finds Chrome itself. It looks in the two Program Files folders and the local application data folder, and then in the Windows registry entry for `chrome.exe`. If it cannot find Chrome, it says so and asks for the path, which is then given with `-ChromePath "C:\...\chrome.exe"`. The script's own message after a change prints the exact undo command with that path.

The switch has three limits. First, the script says to close every Chrome window and reopen Chrome, because the change takes effect only at start-up. Second, `setup.bat` now checks the result. If the script fails, setup prints "The graphics setting was NOT changed (see the message above). Setup goes on; the extension works without it, only slower." and then finishes, so the failure is visible before `SETUP COMPLETE`. Third, the script has been tested only against a throw-away registry key (tests B10, B10b and B10c). It has not been tried against the client's Chrome setting.

The measured NVIDIA runs in chapter 14 did not use this registry value. They used the command-line flag `--force_high_performance_gpu` in the test browser. Those numbers show what the chip can do under that flag. They do not show what the registry value does on the client's Chrome. After any change, `chrome://gpu` should list WebGPU as "Hardware accelerated".

![Two graphics chips and the choice Chrome makes](../figures/V17_two_graphics_chips.png)

Reading the figure: the title says that built-in graphics read slowly, so a long page is shortened first. The Intel box is the client's chip, which reads 15.6 and writes 2 tokens a second with Llama 3.2 1B on the developer laptop, and the NVIDIA box is the developer laptop only. The Lighthouse page took 616.4 s with SmolLM2 before 26 October and 74.1 s on NVIDIA with Llama 3.2 1B, and the green box gives the four things the extension does on built-in graphics, which bring the same page to 124.6 s. The NVIDIA box's reading figure of about 600 tokens a second comes from the earlier speed test, which has no saved run file, and the bottom box says that the Windows Graphics setting or `setup.bat --gpu` has nothing to do on the client's laptop.

### What this means in plain words

The switch tells Windows to run Chrome on the stronger chip, for this user only. It is off unless the client asks for it, and it has not yet been proven on the client's Chrome.

## When something is missing: the messages

The table lists the messages the batch files and checks print, copied from the scripts. Each message names the problem and the next step.

Table: Messages from setup and run, copied from the scripts

| Situation | Where shown | Exact message | What the client does |
|---|---|---|---|
| Chrome not installed | `setup.bat` step 1 | Google Chrome was not found on this computer. Install Chrome from https://www.google.com/chrome and then run setup.bat again. | Installs Chrome and runs setup again |
| Chrome too old | `setup.bat` step 2 | Chrome (version) is too old. The extension needs Chrome 116 or newer. | Updates Chrome, then runs setup again |
| Chrome version unreadable | `setup.bat` step 2 | Could not read the Chrome version. Continuing; the extension needs Chrome 116 or newer. | Nothing. Setup continues |
| Extension files missing or damaged | `setup.bat` step 3 | The extension files are incomplete or damaged (see the message above). Then the specific file, for example "A file the extension needs is missing: src/ui/popup.html" | Downloads the project again, then runs setup |
| Not enough disk space | `setup.bat` step 4 | There is not enough free disk space for the model. Free at least 3 GB on the C: drive (the model is about 700 MB and Chrome keeps it on this drive), then run setup.bat again. | Frees space, then runs setup |
| Node.js missing (`--dev` only) | `setup.bat` step 5 | Node.js was not found, and the developer tools need it. | Installs Node.js 20 or newer |
| Node.js too old (`--dev` only) | `setup.bat` step 5 | Node.js (number) is too old. Version 20 or newer is needed. | Installs a newer Node.js |
| Test tools fail to install | `setup.bat --dev` | npm install failed after 3 tries (see setup.log). Or: Downloading the test browser failed after 3 tries (see setup.log). | Checks the connection and runs setup again |
| `run.bat` before setup | `run.bat` | Setup has not been completed yet. Please double-click setup.bat first, wait for "SETUP COMPLETE", then run this file again. | Runs setup first |
| Setup record out of date | `run.bat` | The setup record is out of date (Chrome was moved or removed). Please run setup.bat again. | Runs setup again |
| Extension folder incomplete | `run.bat` | manifest.json is missing from this folder, so there is nothing to load. | Downloads the project again |

The popup has its own messages for problems that appear only after setup, such as a computer without WebGPU. Those messages are listed in Appendix B. The two pictures below show them. Both are pretend-model screenshots, taken with the test mode that forces each failure. The Summarize button is greyed out and the red line gives the message.

![Popup on a computer without WebGPU (pretend model)](../screenshots/ui-10-no-webgpu.png)

![Popup on a graphics card without 16-bit math support (pretend model)](../screenshots/ui-11-no-shader-f16.png)

Two branches of setup are not covered by the automated Windows checks. The test script says so in its header. The "Chrome not installed" and "Chrome too old" branches need a computer without Chrome, so they were checked by reading the script only.

### What this means in plain words

Each failure names the problem and gives the next step in the words the script prints. The two Chrome branches have been checked only by reading the code.

## Questions this chapter answers

**Why does the client have to load the extension by hand?**
Chrome 137 and later branded builds no longer accept the command-line flag that would load the extension at start. Automated tests run on Playwright's Chromium, which still accepts it, so they cannot show the client's path. `run.bat` opens the extensions page and prints the four steps instead.

**What does `setup.bat` check before it says SETUP COMPLETE?**
It checks that Chrome is installed and is version 116 or newer, that the extension's files are complete, and that the disk has at least 3 GB free. It then prints what the computer has. The optional developer step checks Node.js and installs the test tools.

**What is the 3 GB rule, and what can it not tell us?**
It is the minimum free space on the system drive, checked before the model download. The model is about 700 MB, and the margin allows for Chrome's extra copies during unpacking. The figure is not measured, and the check cannot tell whether the graphics card supports the model, which Chrome decides later.

**What does the graphics switch change, and how is it undone?**
It writes one per-user Windows value, `GpuPreference=2;`, for the full path of `chrome.exe`. It runs only with `--gpu`. Undo it with `set-chrome-gpu.ps1 -Remove`. The script finds Chrome itself, so that short command works as the README gives it.

**What happens when a step fails?**
The script prints `SETUP FAILED.`, the reason, and the fix in plain words, and it keeps `setup.log` for the developer. The marker file is deleted, so `run.bat` refuses to start until setup succeeds again.
