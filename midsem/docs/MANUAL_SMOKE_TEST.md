# Manual smoke test in the real Google Chrome

The automated browser tests run in Playwright's Chromium and give the extension an extra host permission, because a test cannot click the toolbar icon. This 10-minute check covers what those tests cannot: installing the **unmodified** extension into the real Chrome with "Load unpacked", and using it through the toolbar icon.

Do it once on the developer laptop, and once on the client's laptop before the viva.

## Before you start
- Windows, Google Chrome 116 or newer.
- A free Gemini API key from <https://aistudio.google.com/apikey>.
- The repository cloned, and `midsem\project\setup.bat` run once (it must end with `SETUP COMPLETE`).

## Steps and what you should see

| # | Do this | Expected | Result (pass / fail, note) |
|---|---|---|---|
| 1 | Double-click `run.bat` | Chrome opens on `chrome://extensions` and on a Wikipedia article; the window lists 4 steps | |
| 2 | Turn on Developer mode, click Load unpacked, paste the folder path (already on the clipboard), Select Folder | "Page Summarizer" card appears with no red "Errors" button | |
| 3 | Pin the extension (puzzle icon, pin) | The icon is visible in the toolbar | |
| 4 | Click the icon with **no key saved**, press Summarize | Red message "No API key yet. Add your key in Options first." and an Open Options button | |
| 5 | Click Open Options, paste the key, Save | "Saved." and "A key is saved in this browser." | |
| 6 | Open `en.wikipedia.org/wiki/Lighthouse`, click the icon, press Summarize | Progress ("Summarizing part N of M"), then an overview sentence and bullets; a small line shows parts, requests and seconds | |
| 7 | Press Summarize, then click on the page so the popup closes, wait 10 s, click the icon again | The finished summary (or the running progress) is still there | |
| 8 | Open `chrome://extensions`, click the icon, press Summarize | "Chrome does not allow extensions to read this page." | |
| 9 | Open a nearly empty page (for example `about:blank` is blocked; use a tab with a few words) and press Summarize | "This page has too little readable text to summarize." | |
| 10 | In Options, replace the key with `wrong`, summarize an article | "Your API key was rejected. Check it in Options." | |
| 11 | Put the correct key back | Summaries work again | |

## Screenshots to keep (for the report)
Take them with Windows + Shift + S and save into `midsem/docs/screenshots/` using these names:
`M01-extensions-page.png` (card loaded), `M02-popup-no-key.png`, `M03-options-saved.png`, `M04-popup-progress.png`, `M05-popup-summary.png`, `M06-popup-restricted.png`.

## Known limits of this check
It does not cover other Chrome versions, other operating systems, or a locked-down corporate Chrome that blocks Developer mode.
