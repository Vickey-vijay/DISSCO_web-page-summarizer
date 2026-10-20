# How to run the extension and give the demo

This chapter takes you from a clean Windows computer to a working summary. It then gives a demo script for the viva and a table of messages, with what each one means and what to do. Do the steps yourself at least twice before the viva, so the screens are familiar.

## What you need

- A Windows computer with Google Chrome 116 or newer. `setup.bat` checks the version.
- The whole project folder, `midsem\project`. Do not copy only some files. `setup.bat` checks that the files are there.
- A free Gemini API key from `https://aistudio.google.com/apikey`. Keep the key private. Do not paste it into a document or a chat.
- An internet connection.

You do not need Node.js to use the extension. Node.js is needed only for the developer tests, which you run with `setup.bat --dev`.

## Step 1: run setup.bat

Double-click `setup.bat` in the project folder. It does four things and says each one in plain words.

1. It looks for Google Chrome in the usual install folders and in the Windows registry.
2. It reads the Chrome version. If the version is older than 116, setup stops. If the version cannot be read, setup continues and says so.
3. It runs `scripts\check-extension.ps1`. That script checks that `manifest.json` reads, that it is Manifest V3, and that every file the manifest names is present.
4. It skips the developer tools, unless you typed `--dev`. It says that you do not need them.

When it succeeds, the window ends with "SETUP COMPLETE." and "Next step: double-click run.bat". Setup writes a log file, `setup.log`, and a marker file, `.setup-ok`, that holds the Chrome path. The window waits for a key press at the end. Set `SETUP_NOPAUSE=1` to skip the wait, which only the automated checks do.

## Step 2: run run.bat

Double-click `run.bat`. It first checks that `.setup-ok` exists. Then it copies the project folder path to the clipboard, opens Chrome on `chrome://extensions`, waits two seconds, and opens a Wikipedia article about lighthouses. It prints four steps.

Chrome no longer lets a script load an extension by itself. The project's own log says the branded Chrome build removed the command-line flag that did this (see `DEVLOG.md`, the first entry). So `run.bat` opens the page and shows you the steps.

## Step 3: load the extension in Chrome

1. On the extensions page, turn on **Developer mode** (top right).
2. Click **Load unpacked**. Press Ctrl+V to paste the folder path, then click **Select Folder**.
3. Click the puzzle-piece icon in the toolbar and pin **Page Summarizer**.

The Page Summarizer card should appear with no red "Errors" button. The results of this step on a real Chrome are not yet recorded in the repository. See the last section of this chapter.

## Step 4: add your key

Click the Page Summarizer icon. If no key is saved, the popup opens the Key box and says "Paste your Gemini key to begin." Paste the key into the field and click **Save key**. The popup then says "Key saved. Now press Summarize." The field hides the key as you type, and the key stays in this browser only.

You can also right-click the icon, choose Options, paste the key and click Save. Either place saves the same key.

## The viva demo

Run this once in the order shown, with the Lighthouse article open. The timings are the last measured values for this page in the live runs of 20 October 2026 (`docs/test-runs/live-measurements.md`). Your times will differ.

| Step | What to open | What to press | What to say |
|---|---|---|---|
| 1 | The Chrome extensions page, with the card loaded | Nothing | "Chrome loads this folder as an extension. Setup checked every file before this step." |
| 2 | The Wikipedia Lighthouse article | The icon, then "Summarize this page" | "The popup only asks the service worker to start. The progress lines show each part as it is done." |
| 3 | The same popup while progress shows | Click on the article so the popup closes, wait ten seconds, then click the icon | "The job keeps running in the background. The popup reads the same stored record, so the progress is still there." |
| 4 | The finished summary | Point at the line under the summary | "This line shows the parts, the requests and the seconds. The last measured run for this page had 5 parts, 6 requests and about 18 seconds." |
| 5 | The Chrome extensions page | The icon, then "Summarize this page" | "Chrome does not let extensions read its own pages, so the job stops before any request. The error code is RESTRICTED_PAGE." |
| 6 | A page with only a sentence or two | "Summarize this page" | "Under 200 characters of text, so no request is sent. The code is TOO_LITTLE_TEXT." |
| 7 | The Lighthouse article | Open the Key box, type the word wrong, Save key, then Summarize | "The service rejects the key. In the last measured run this took about half a second. The popup says the key was rejected and opens the Key box." Then paste the real key again. |

Do not show the key on screen. The field is a password field, so the characters do not show, but a screen recording might still catch the key box. Close the box before recording.

## If something fails

Every message below comes from `src/core/errors.js`, or from the setup scripts. The code in capitals is what the job record stores. The popup shows the message.

| What you see | Code | What it means | What to do |
|---|---|---|---|
| No API key yet. Paste your Gemini key in the Key box and save it. | NO_KEY | No key is saved. | Paste the key and click Save key. |
| Your API key was rejected. Paste a correct key in the Key box. | INVALID_KEY | Google refused the key. | Paste the right key. |
| The free tier is busy right now. Wait a minute and try again. | RATE_LIMIT | Google said busy, and four tries did not work. | Wait a minute, then press Summarize again. |
| The free-tier limit for your API key is used up for now. Try again in about 7 hours, or use a different key. | QUOTA_EXHAUSTED | Google asked for a wait longer than 25 seconds. | Wait for the time shown, or use another key. |
| Cannot reach the service. Check your internet connection. | NETWORK | The request did not reach Google. | Check the internet connection. |
| The service took too long to answer. Try again. | TIMEOUT | No answer within 25 seconds. | Press Summarize again. |
| The service had a problem. Try again in a moment. | SERVICE_ERROR | Google had a server error, or a non-key error such as a location block. | Wait and try again. |
| This page has too little readable text to summarize. | TOO_LITTLE_TEXT | Fewer than 200 characters were found. | Try a page with more text. If the text loads late, wait and try again. |
| This page is too long for Version 1 to summarize. Try a shorter page. | TOO_LONG | The page needs more than 30 parts. | Try a shorter page. |
| Chrome does not allow extensions to read this page. | RESTRICTED_PAGE | The address is a Chrome, file or Web Store address. | Use a normal web page. |
| Could not read the text of this page. | EXTRACT_FAILED | The reader script could not run in the page. | Reload the page and try again. |
| The model returned no summary for this page. | EMPTY_OR_BLOCKED | Google returned an empty answer or blocked it. | Try again, or try another page. |
| The summary was interrupted. Press Summarize to try again. | INTERRUPTED | Chrome stopped the background worker during the job. | Press Summarize again. |

The code CANCELLED is different. It marks a job that was stopped because the page changed or the tab closed. The service worker writes nothing for that job, so the user never sees a "Cancelled" message. It appears only in the browser console.

Setup and run messages are shorter. `setup.bat` prints "SETUP FAILED", then "What failed" and "How to fix". The common ones are these.

- **Google Chrome was not found on this computer.** Install Chrome, then run setup again.
- **Chrome is too old.** Update Chrome to 116 or newer, then run setup again.
- **The extension files are incomplete or damaged.** Download or copy the whole folder again, then run setup again.
- **Node.js was not found** (only with `--dev`). Install Node.js 20 or newer, then run `setup.bat --dev` again.
- **Setup has not been completed yet.** This comes from `run.bat`. Run `setup.bat` first.
- **The setup record is out of date.** Chrome was moved or removed. Run `setup.bat` again.

## Known gaps before the viva

Three things are not finished in the repository, so check them yourself.

- **The manual check in the real Chrome has no results.** `docs/MANUAL_SMOKE_TEST.md` lists eleven steps, and its results column is empty. The screenshots it asks for, M01 to M06, are not in `docs/screenshots`. Run the steps once on your computer and record the results. Until then, say that the Load unpacked path was checked on Playwright's Chromium, and that the real-Chrome check is planned.
- **The wording in that manual document is older than the code.** Step 4 expects "Add your key in Options first", and step 10 expects "Check it in Options". The popup now says "Paste your Gemini key in the Key box" and "Paste a correct key in the Key box". Use the wording the popup shows.
- **The test script for setup has no recorded results.** `tests/bat/test-bat-scripts.ps1` has eight checks. Its results are not in the repository: [to be measured]. The script itself says it does not cover the clipboard step or the Chrome-not-found branch.
