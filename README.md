# AI-Powered Web Page Summarizer (Chrome Extension)

A Chrome extension that summarizes the page you are reading in one click.

- **V1 (midsem):** sends the page text to Google's Gemini API using your own free key, entered once in the extension's Options page.
- **V2 (final sem):** runs a small model inside the browser, so no API key is needed and the page text stays on your machine. *(not built yet)*

Client: Jeffy (CoH 11) · Product requirements: [prd.md](prd.md)

## Status

| Stage | State |
|---|---|
| Abstract | Done: [abstract/abstract.md](abstract/abstract.md) |
| V1 plan | Approved: [midsem/V1_PLAN.md](midsem/V1_PLAN.md) |
| V1 build (midsem) | In progress: extension, unit tests, setup scripts done; browser tests and documents under way |
| V2 build (final sem) | Not started |

## Install V1 (for the client)

You need Windows and Google Chrome 116 or newer. You do **not** need Python or Node.js.

1. Get the project: `git clone https://github.com/Vickey-vijay/DISSCO_web-page-summarizer.git`
2. Open the folder `midsem\project` and **double-click `setup.bat`**. Wait for `SETUP COMPLETE`. If it says `SETUP FAILED`, it tells you in plain English what is missing and how to fix it; the details are in `setup.log`.
3. **Double-click `run.bat`.** Chrome opens on its extensions page. Follow the four steps shown in the window: turn on Developer mode, click Load unpacked (the folder path is already on your clipboard), pin the extension, and paste your Gemini key in Options.
4. Get a free key at <https://aistudio.google.com/apikey>.
5. Open any article, click the Page Summarizer icon, press **Summarize this page**.

Chrome (version 137 and later) no longer lets a script load an extension by itself, which is why step 3 is manual. See `DEVLOG.md` for how that was found.

## For developers

```
cd midsem\project
setup.bat --dev          # also installs Playwright and its test browser (needs Node.js 20+)
npm test                 # unit tests (no browser, no network)
npm run test:e2e         # browser tests: opens a VISIBLE Chromium window with the extension loaded
```

- Browser tests use a local mock of the Gemini API, so they are fast and free. Set `HEADLESS=1` to hide the window, `SLOWMO=<ms>` to change the pause between actions.
- Live checks against the real API read the key from the environment variable `Gemini_API` (or a git-ignored `midsem/project/.env.test`). The key is never printed or committed: `node scripts/secret-scan.mjs` checks the repository before every push.
- `node scripts/live-check.mjs` lists the Gemini models your key can use; `node scripts/model-bench.mjs` compares models and thinking settings.
- Test-only settings (`apiBaseUrl`, `chunkChars`, `retryBaseDelayMs`, `requestTimeoutMs`) can be put in `chrome.storage.local`; the tests use them to force chunking, retries and timeouts.

## Repository layout

```
README.md          this file
DEVLOG.md          real problems met while building, and how they were fixed
prd.md             product requirements
abstract/          project abstract
midsem/
  V1_PLAN.md       approved plan for V1
  project/         the extension (load this folder in Chrome), setup.bat, run.bat, tests
  docs/            figures, screenshots, test-run reports, report / KT / PPT
finalsem/          V2 (added later)
```
