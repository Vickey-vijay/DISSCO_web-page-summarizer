# [nonum] Appendix A: Repository File Guide

This appendix is a map of the repository. It says where each part lives and what it does. Figure A1 shows the folder tree. The tables below list the extension source, the scripts and the tests, one file per row.

Some terms are used below. A **popup** is the small window that opens when the toolbar icon is clicked. A **service worker** is the background script that Chrome runs for an extension, even when no window is open. A **content script** is a small program that Chrome runs inside the page being read. **Options page** is the settings page of the extension. A **fixture** is a saved test page that the browser tests load instead of a live site.

![Repository tree. The top level holds abstract, midsem, DEVLOG.md, README.md and prd.md. The extension itself is in midsem/project.](../figures/F17_repo_tree.png)

## A.1 Top-level files

| Path | What it is for |
|---|---|
| README.md | Setup steps for the client, status of each stage, and developer commands. |
| DEVLOG.md | The real problems met during the build, with symptom, cause, fix and lesson. |
| prd.md | The product requirements, the Version 1 and Version 2 scope, and the risks. |
| abstract/abstract.md | The project abstract, with the cover fields and the eight references. |
| assets/bits-logo.png | The BITS Pilani logo used on the report cover. |
| midsem/V1_PLAN.md | The approved plan for Version 1: scope, milestones, error table and test plan. |
| midsem/docs/ | Figures, screenshots, test-run reports, the manual smoke test list and the build scripts for the documents. |
| midsem/project/ | The extension. Load this folder in Chrome. It also holds setup.bat, run.bat and the tests. |
| .gitignore, .gitattributes | Keep keys, dependencies and logs out of Git, and set line endings. |

## A.2 Extension source (midsem/project/src)

| File | Job |
|---|---|
| manifest.json (project root) | Tells Chrome the extension name, its permissions, its popup, its options page and its service worker. |
| background/service-worker.js | Runs each summary job in the background, so the job continues when the popup closes. |
| background/extract-tab.js | Injects the extractor into the open tab and refuses pages Chrome does not allow. |
| content/extract.js | Runs in the page, copies it, keeps the main text and table cells, and falls back to the visible text. |
| lib/readability.js | Mozilla Readability, copied in as one file, which finds the article body of a page. |
| lib/READABILITY_LICENSE.md | The Apache-2.0 licence text for the copied Readability file. |
| core/config.js | Holds the default settings and the names of the keys stored in the browser. |
| core/errors.js | Defines the error codes and the plain English message for each one. |
| core/pipeline.js | Runs the whole flow: extract, split, summarize each part, merge, and record the statistics. |
| core/chunker.js | Splits long text into parts no longer than the limit, at paragraph, sentence or word breaks. |
| core/merger.js | Joins the part summaries into one summary, in groups first if there are many. |
| core/prompts.js | Holds the text of each prompt and the markers that wrap the page text. |
| core/url.js | Decides whether two addresses are the same page, ignoring the part after the #. |
| engines/gemini.js | Calls the Gemini service, applies the time limit and retries, and turns each failure into an error code. |
| ui/popup.html | The layout of the popup: the Summarize button, the key box, progress, errors and the result. |
| ui/popup.js | Starts jobs, shows progress and results, saves or removes the key, and handles errors. |
| ui/options.html | The layout of the Options page, with the key field. |
| ui/options.js | Saves or removes the key from the Options page. |
| ui/summary-format.js | Turns the plain-text summary into paragraphs and list items, without reading it as HTML. |
| ui/ui.css | The styles for the popup and the Options page. |

## A.3 Scripts (midsem/project/scripts)

| File | Job |
|---|---|
| check-extension.ps1 | Called by setup.bat. Checks that manifest.json and every file it names are present. |
| secret-scan.mjs | Checks that the real key appears in no file in the repository, before a push. |
| live-check.mjs | Lists the Gemini models the key can use and times one small request. |
| live-run.mjs | Runs the extension on real pages with the real service and records the results. |
| model-bench.mjs | Sends the same request to several models and thinking settings, and records the time. |
| quota-probe.mjs | Sends small requests until the service answers 429, to read the free-tier limit. |
| collect-examples.mjs | Records real extraction, chunking and prompt examples against the mock service. |
| activetab-spike.mjs | Checks the toolbar permission path in automation, as a one-off test. |

## A.4 Tests (midsem/project/tests)

| File | Job |
|---|---|
| unit/chunker.test.js | Checks the splitting rules: order, size limits, empty input and very long paragraphs. |
| unit/merger.test.js | Checks the grouping of part summaries and the merge steps. |
| unit/pipeline.test.js | Checks the whole flow with a fake extractor and a fake engine. |
| unit/gemini.test.js | Checks the Gemini engine against a fake fetch: the key header, retries, and each error code. |
| unit/fixes.test.js | Checks later fixes: the page limit, the 403 location rule, the quota wait and the abort rules. |
| unit/small.test.js | Checks small rules: summary format, settings, messages, prompts and restricted addresses. |
| e2e/pipeline.test.js | Runs browser scenarios T01 to T25 in Chromium with the extension loaded. |
| e2e/smoke.test.js | Runs one browser check on a short article. |
| e2e/chrome-flag-check.mjs | An early check of whether branded Chrome loads an extension through a flag (DEVLOG, first entry). |
| bat/test-bat-scripts.ps1 | Runs setup.bat and run.bat in copies of the project, on success and failure paths. |
| helpers/extension.mjs | Starts Chromium with the extension loaded. It runs hidden unless HEADED=1 is set. |
| helpers/mock-gemini.mjs | A stand-in for the Gemini service that can delay, rate-limit, fail or return empty answers. |
| helpers/fixtures-server.mjs | Serves the fixture pages on localhost for the browser tests. |
| helpers/key.mjs | Finds the live key from the environment or a git-ignored file, and never prints it. |
| fixtures/*.html | Six saved pages: short and long articles, a near-empty page, late content, a dashboard and a table article. |

## A.5 Setup scripts and generated folders

| File | Job |
|---|---|
| setup.bat | Checks Chrome, its version and the extension files, optionally installs the developer tools, and writes setup.log. |
| run.bat | Opens Chrome's extensions page, copies the folder path, and shows the four manual steps. |
| package.json, package-lock.json | Name the developer tools (Playwright) and the test commands. |
| .setup-ok | A record written by setup.bat, read by run.bat to find Chrome. |
| setup.log | The log of the last setup run, for the developer or the client. |
| test-output/ | Screenshots taken by the browser tests. |

## What this means in plain words

The repository has three layers. The first is the extension in src, which is what runs in Chrome. The second is the set of scripts and tests, which check it and measure it. The third is the documentation: the README, the devlog, the requirements and the report folder. A reader who wants to change the summary can start in core/prompts.js. A reader who wants to change how a failure looks can start in core/errors.js.
