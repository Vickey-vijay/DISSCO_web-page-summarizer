# Glossary

Each entry gives the plain meaning in one or two sentences. The terms follow the order in which the other chapters use them. If a tutor uses a word that is not here, look first in the chapter where it appears.

## The browser and the extension

- **Extension**: a small program you add to Chrome. It has its own folder, its own permissions and its own toolbar icon. Page Summarizer is one.
- **Manifest**: the file called `manifest.json`. It tells Chrome the extension's name, its files and what it is allowed to do.
- **Manifest V3**: the current version of the rules for the manifest. This project's manifest says `"manifest_version": 3`. The main change for this project is that its background code runs as a service worker.
- **Popup**: the small window that opens when you click the toolbar icon. Here it holds the Summarize button, the Key box and the summary.
- **Options page**: a settings page for the extension. Here it holds only the key.
- **Service worker**: a background script that Chrome runs for an extension. It keeps running when no window is open, and Chrome can stop it when it is idle.
- **Injected script**: a script that an extension places into a web page for one job. Here the page reader is injected to copy the page text. The project uses chrome.scripting to inject it, and it is not a content script that the manifest lists.
- **Content script**: a script that Chrome runs inside a web page, usually listed in the manifest. This project does not use that form, so it uses the term injected script.
- **DOM**: the tree of elements that the browser builds from a web page. The page reader works on a copy of it.
- **Tab**: one open page in the browser window.
- **Tab id**: the number Chrome gives each tab. The job record is stored under this number.
- **Message**: a short note that one part of the extension sends to another. The popup sends a START_SUMMARY message to the service worker.
- **Restricted page**: a page that Chrome does not let extensions read, such as its own settings pages and the Web Store.

## Storage

- **Storage**: a place where an extension keeps data. Chrome offers three kinds, described below.
- **Local storage (chrome.storage.local)**: storage on this computer that survives a restart. The project keeps the key here. It is not the web page's own localStorage, which the project does not use.
- **Session storage (chrome.storage.session)**: storage that is cleared when the browser closes. The project keeps the job records here.
- **chrome.storage.sync**: storage that Chrome copies to the user's Google account. The project does not use it, on purpose.
- **JSON**: a plain text format for data made of named values, in braces and square brackets. The Gemini service sends its answers as JSON, and the job records are stored as JSON.
- **Job**: one run of the summary, from the button press to the result.
- **Job record**: the data stored for one job, with its status, its phase, its progress, the summary and any error.
- **Stale job**: a running job that has not been updated for three minutes. The popup treats it as dead.
- **Interrupted job**: a job that Chrome stopped in the middle. The next start of the service worker marks it with the code INTERRUPTED.

## The cloud service and the model

- **API**: a set of rules that lets one program ask another program for something. Here the other program is Google's Gemini service.
- **REST**: a common way to build an API, where each action is a web address that takes a request and gives an answer.
- **HTTPS**: the secure form of web addresses. The request and answer are encrypted on the way.
- **HTTP status code**: the three-digit number in an answer. 200 means success. 400, 401 and 403 mean the request was refused. 429 means busy or over a limit. 500 to 504 mean a server problem.
- **Header**: an extra label attached to a request. The project sends the key in a header, not in the web address.
- **API key**: a secret string that identifies you to the service. The service counts your requests against it.
- **Model**: a language model that Google hosts and that writes the summary. The project uses `gemini-3.5-flash-lite`.
- **Engine**: the part of the code that talks to the model. The Version 1 engine is the Gemini engine.
- **Prompt**: the instructions and the page text sent together in one request.
- **Free tier**: the free level of Google's service. It has limits on how many requests you may make.
- **Quota**: the limit on how many requests your key may make in a time window. The free tier has a per-minute limit and a daily limit.
- **Timeout**: the time after which the project gives up waiting for an answer. Here it is 25 seconds.
- **Retry**: sending the same request again after a failure that may pass, such as a busy service.
- **Back-off**: waiting longer before each retry. Here the waits are 2, 4 and then 8 seconds, unless the service says how long to wait.

## How the summary is built

- **Chunk (part)**: a piece of the page text of at most 8,000 characters, sent in one request. The screens call it a part.
- **Chunking**: cutting the page text into parts at natural breaks.
- **Merge**: joining several summaries into one, with one more request to the model.
- **Pipeline**: the fixed order of steps for one job: read the page, check the length, cut, summarize each part, merge.
- **Readability**: a library that finds the main article in a web page and drops the menus and adverts. The copy in this project is licensed under Apache-2.0.
- **Vendored**: copied into the project as a file, instead of installed with a package tool. Readability is vendored.
- **Hard cut**: cutting text at a fixed character count with no regard to words. It is the last resort for a word with no spaces.

## Building and testing

- **Batch file (.bat)**: a text file of commands that Windows runs when you double-click it. `setup.bat` and `run.bat` are batch files.
- **Node.js**: a program that runs JavaScript outside a browser. It is needed only for the developer tests.
- **npm**: the package installer that comes with Node.js. `npm test` runs the unit tests.
- **Mock**: a stand-in for a real service, used in tests. The project's mock Gemini server answers like the real service, runs on this computer, and costs nothing.
- **Fixture**: a saved test page or data file that the tests use again and again. The project's fixture pages are small local web pages.
- **Unit test**: a small test that checks one function alone, with set inputs and an expected result. The project's unit tests run in Node.
- **End-to-end test**: a test that runs the whole flow in a real browser, from the button press to the text on the screen.
- **Chromium**: the open-source browser that Chrome is built from. Playwright bundles a copy for the tests.
- **Playwright**: a free tool that drives a browser from code. The project uses it for the browser tests.
- **Headless**: a browser that runs without showing a window. The browser tests run headless unless you set HEADED=1.
