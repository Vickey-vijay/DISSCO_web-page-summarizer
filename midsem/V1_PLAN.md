# V1 Development Plan: AI-Powered Web Page Summarizer (Chrome Extension)

Status: **DRAFT for your approval. No V1 code has been written yet.**
Prepared 2026-10-20 · Client: Jeffy (CoH 11) · Source: [prd.md](../prd.md)

This plan covers V1 (the midsem deliverable): the working extension, its tests, and the full document set (midsem report, KT document, PPT). V2 (in-browser model) is out of this plan and will get its own.

Items marked **(verify)** are things I believe but have not yet confirmed. They get checked during the milestone named next to them, and the result goes into DEVLOG.md.

---

## 1. What I need from you before I start building

| # | Need | Why | My default if you say "go" |
|---|---|---|---|
| A1 | Approve this plan (or mark edits) | Build starts only after this | n/a |
| A2 | **Cloud provider for V1: Gemini or NVIDIA** | The PRD leaves it open (Open question 5) | **Gemini**: one REST call, free tier, simple key |
| A3 | **Author / submitted-by name, BITS ID, course no., degree programme, supervisor and examiner details** | Printed on abstract, report cover and certificate | I leave `[square-bracket]` placeholders |
| A4 | **A free-tier API key**, saved by you into a git-ignored file `midsem/project/.env.test` (`GEMINI_API_KEY=...`) | Needed for the few live end-to-end runs and the real screenshots. Never pasted in chat, never committed. | Without it I can only test against a mock server, and the report's live results stay empty |
| A5 | OK to run `npm install -D playwright` and download its Chromium (a few hundred MB) | Automated browser testing with the extension loaded | Yes |
| A6 | Test-browser choice (section 7.3) | Chrome 155 is installed here. Chromium's team announced in 2025 that branded Chrome from version 137 no longer loads extensions through `--load-extension`. I will confirm this on your Chrome in M0. | Playwright Chromium for the loop, plus one manual smoke test in your real Chrome |
| A7 | Midsem and final-sem dates | Fills the 14-week plan and report dates | Assume V1 = midsem, V2 = final, no dates printed |

Not blocking V1: the client laptop's OS, RAM and GPU (it only sets the V2 model size).

---

## 2. V1 scope (taken from the PRD, nothing added)

| ID | Requirement | In V1? | How V1 meets it |
|---|---|---|---|
| FR1 | Press Summarize in the popup, summary appears | Yes | Popup button, result shown in popup |
| FR2 | Read main text, drop menus, ads, footers | Yes | Mozilla Readability on a clone of the page |
| FR3 | Split long text, summarize chunks, merge | Yes | Chunker, per-chunk call, merge call (recursive if needed) |
| FR4 | Progress indicator | Yes | "Chunk 3 of 5" style progress bar |
| FR5 | User enters own API key once in options page | Yes | Options page, key kept in `chrome.storage.local` |
| FR6, FR7 | Model download, offline summaries | **No, V2** | n/a |
| FR8 | Clear messages for missing/invalid key, rate limit, no WebGPU, too little text | Yes, except "no WebGPU" (V2) | Error-code table in section 4.4 |

Non-functional: Chrome desktop, Manifest V3, installed by "Load unpacked" from the repo.

**Out of scope (same as the PRD):** other browsers, PDFs, video pages, anything beyond summarizing the open page. I will not add history, export, multi-language, settings beyond the key, etc.

---

## 3. How V1 works

### 3.1 Architecture

```
 Popup (UI)  --message-->  Service worker (job owner)
   shows progress            |
   shows summary             |-- 1. inject extractor into the active tab (chrome.scripting)
        ^                    |        -> {title, url, text}
        |                    |-- 2. Chunker splits text           (pure code, shared with V2)
   reads job state           |-- 3. Engine summarizes each chunk  (V1: Gemini over HTTPS)
   from chrome.storage       |-- 4. Merger joins partial summaries (recursive if still long)
        .session             '-- 5. Writes progress + result to chrome.storage.session

 Options page: API key -> chrome.storage.local
```

Only step 3 changes in V2. Extraction, chunking, merging, progress, errors and UI are reused.

### 3.2 Why the service worker owns the job (not the popup)
A popup closes the moment the user clicks elsewhere, which would kill a multi-chunk summary half way. The service worker keeps running, and the popup just reads state from `chrome.storage.session` when reopened. Risk: Chrome stops idle service workers, so every chunk call has a timeout, and each progress write is an extension API call that keeps the worker alive **(verify in M5)**.

### 3.3 Engine contract (the V1/V2 seam)
One small interface, so V2 swaps the implementation and nothing else:

```
summarizeChunk(text, { title, index, total, signal }) -> Promise<string>   // total === 1 returns the final-format summary
mergeSummaries(parts, { title, signal })               -> Promise<string>
```

*(As built: the context object carries the page title and the chunk position so the prompt can say "part 2 of 5", and a one-chunk page is summarized directly in the final format with no merge call.)*

### 3.4 Error handling (FR8)

| Code | Cause | User sees | Behaviour |
|---|---|---|---|
| NO_KEY | No key saved | "Add your API key in Options first" + button to open Options | stop |
| INVALID_KEY | Provider rejects the key | "Your API key was rejected. Check it in Options." | stop |
| RATE_LIMIT | HTTP 429 | While retrying the popup shows "The service is busy. Trying again in N s (attempt x of y)". After the retries: "The free tier is busy right now. Wait a minute and try again." | retry with back-off, then stop with a message |
| NETWORK | Offline / DNS failure | "Cannot reach the service. Check your internet connection." | stop |
| TIMEOUT | No answer within the request timeout (added during the build, was grouped with NETWORK in this plan) | "The service took too long to answer. Try again." | stop |
| SERVICE_ERROR | HTTP 5xx after retries, or any other unexpected HTTP error (added during the build) | "The service had a problem. Try again in a moment." | retry 5xx, then stop |
| EXTRACT_FAILED, INTERRUPTED, CANCELLED | Extractor returned nothing; the service worker was stopped mid-job; cancelled (CANCELLED exists in the code but V1 has no cancel button) | plain-English messages in `core/errors.js` | stop |
| TOO_LITTLE_TEXT | Fewer than ~200 characters extracted (threshold tunable) | "This page has too little readable text to summarize." | stop |
| RESTRICTED_PAGE | `chrome://`, Web Store, etc. cannot be scripted | "Chrome does not allow extensions on this page." | stop |
| EMPTY_OR_BLOCKED | Provider returns nothing or a safety block | "The model returned no summary for this page." | stop |

Every message is plain English and the technical detail goes to the log.

---

## 4. Technology choices and the alternatives I considered

Each of these becomes a decision record in the report (question, options, comparison table, choice, why not the others, trade-off).

| Decision | Choice | Main alternatives | Why this one |
|---|---|---|---|
| Language | Plain JavaScript (ES modules), JSDoc types | TypeScript | No build step, so `setup.bat` stays simple and the client cannot break a toolchain. Trade-off: no compiler type checks, so JSDoc and tests carry that load. |
| Text extraction | Mozilla Readability, vendored as one file | Hand-written heuristics; `innerText` of body | Purpose-built to drop menus/ads/footers (FR2); the library behind Firefox Reader View. Vendored so there is no bundler. Apache-2.0 licence (per its GitHub page), which the report will credit. |
| Where the pipeline runs | Service worker | Popup; full-page extension tab | Survives popup closing (3.2). Same pattern carries to V2. |
| Cloud call | Direct HTTPS `fetch` to the provider REST endpoint | Official SDK | SDKs need a bundler and add weight. One endpoint is easy to mock in tests. |
| Key storage | `chrome.storage.local` | `chrome.storage.sync` | `sync` would copy the key to the user's Google account. Honest limit: it is still stored unencrypted on disk, which the report states. |
| Unit tests | Node's built-in `node:test` | Jest, Vitest | Zero dependencies. |
| Browser tests | Playwright + Chromium with the extension loaded | Manual clicking; Selenium | Repeatable, produces screenshots, can run the retest loop. |
| Diagrams | Hand-authored SVG/HTML rendered to PNG with the Playwright browser | Mermaid CLI, Graphviz | Playwright is already installed. Graphviz and LibreOffice are not present on this machine. |
| Docs build | `docx` / `pptxgenjs` (installed) and Microsoft Word + PowerPoint via COM for TOC refresh, PDF export and page counts | LibreOffice | Word is installed here, so page counts come from a real PDF export. |

Cloud model id: my research check of Google's docs on 2026-10-20 reported `gemini-3.8-flash` as the current stable Flash model, and that the older `gemini-2.0-flash` is shut down (some doc examples still show it). I will re-read the Models page at M4 before using any id, and keep it in one config constant. The rate-limits page publishes **no numeric free-tier limits** (it says they are shown in Google AI Studio), so I will read the real limits from your AI Studio once your key exists, and the report will not quote numbers I cannot source.

---

## 5. Repository layout (V1 part)

```
DISSCO_web-page-summarizer/
  README.md                 setup, run, versions, in plain steps
  DEVLOG.md                 real problems and fixes, written as they happen
  prd.md
  .gitignore                .env*, node_modules, logs, test output
  abstract/abstract.md
  midsem/
    V1_PLAN.md              this file
    project/                the extension (load this folder in Chrome)
      manifest.json
      setup.bat  run.bat
      src/
        background/service-worker.js
        content/extract.js
        lib/readability.js            vendored
        core/{config,chunker,merger,pipeline,errors,prompts}.js
        engines/gemini.js
        background/extract-tab.js     (injects the extractor into the tab)
        ui/{popup,options}.{html,js}, ui/ui.css, ui/summary-format.js
      tests/{unit,e2e,fixtures}/
    docs/
      figures/              diagram sources + PNGs
      screenshots/          real screenshots S01...
      test-runs/            one report per test/fix loop
      MidSem_Report.docx  KT_Document.md  MidSem_Presentation.pptx
```

---

## 6. Milestones, commits and acceptance

I commit at the end of each step, not only each milestone, and push after every milestone. Commit style: `type(scope): message` (`feat`, `fix`, `test`, `docs`, `chore`).

| M | Content | Done when | Docs evidence captured |
|---|---|---|---|
| M0 | Repo, `.gitignore`, README skeleton, abstract, this plan, empty extension that loads | Extension loads in Chromium with no errors; pushed | Screenshot of the empty extension loaded |
| M1 | Popup + service worker messaging skeleton, `chrome.storage.session` job state | Click → fake progress → fake result shown | Popup screenshots; sequence diagram |
| M2 | Extractor (Readability), fixtures, restricted-page and too-little-text handling | Fixture pages give clean text; nav/ads/footer gone | Before/after extraction examples |
| M3 | Chunker + merger with unit tests | All unit tests green incl. edge cases (no punctuation, one huge paragraph, empty) | Test output; chunker flowchart |
| M4 | Gemini engine with timeout, retry/back-off, error mapping, mocked-fetch tests | Each error code reproduced in a test | Error table with real screenshots |
| M5 | Pipeline wiring: extract → chunk → summarize → merge, progress, popup-closed survival | Long fixture page summarizes with "chunk N of M" progress; close and reopen popup mid-job still works | Progress screenshots; latency table |
| M6 | Options page, key storage, NO_KEY / INVALID_KEY flows | Key saved once, survives restart; wrong key shows the right message | Options screenshots |
| M7 | `setup.bat`, `run.bat`, README, clean-clone test | Fresh clone → setup → run works; a failure prints a plain message | Terminal screenshots |
| M8 | Test-and-fix loop (section 7), live runs on real pages | Section 7.4 exit criteria met | Test-run reports, final screenshots |
| M9 | Midsem report, KT document, PPT, handover wiki | Section 8 checks pass; all pushed; tag `v1-midsem` | n/a |

I stop and report after M0 (if you want a check-in), after M8, and after M9, then wait for your go-ahead.

---

## 7. Test and fix loop

### 7.1 Layers
1. **Unit** (`node --test`): chunker, merger, error mapping, prompt builder, engine against a mocked `fetch` (429, 401/403, timeout, empty, blocked).
2. **Integration/E2E** (Playwright, Chromium with the extension loaded): fixture pages served locally (short article, long article, near-empty page, page full of nav/ads, restricted page) and a mock provider server for deterministic runs.
3. **Live runs**: a handful of real pages (news article, Wikipedia, blog, documentation page) against the real API using your key. Results are recorded as measurements (pages, chunks, calls, seconds), never as invented numbers.
4. **Exploratory/visual pass by a Haiku 4.5 test agent**: given a written checklist of scenarios, it drives the browser, captures screenshots, reads them, and files a bug list.

### 7.2 The loop

```
run tests -> Haiku agent writes midsem/docs/test-runs/run-N.md (pass/fail, screenshots, bugs)
   -> I fix each bug (one commit per fix, DEVLOG entry: symptom, root cause, fix, lesson)
   -> retest -> repeat
```

I review the agent's findings against the screenshots myself before fixing, since a cheaper model can misreport.

### 7.3 Test browser (your call, A6)
- **Recommended:** Playwright Chromium for the loop (can load the extension automatically), plus one manual smoke test in your real Chrome 155 using "Load unpacked", with screenshots taken from that run.
- **Alternative:** drive your real Chrome via the Chrome extension tools. It needs you to load the extension by hand, it uses your own browser profile, and extension popups are awkward to drive. I would only do this in a separate empty Chrome profile.
- Test seams I will add, and mention in the report: the popup accepts an optional `?tabId=` so a test page can target another tab, and the API base URL is overridable through storage so tests hit the mock server.

### 7.4 V1 is done when
- All unit tests pass and the E2E suite is green twice in a row.
- Every FR in section 2 marked "Yes" has at least one passing test and one screenshot.
- Every error code in 3.4 has been reproduced for real.
- Two consecutive loop runs find no new high-severity bug.
- `setup.bat` then `run.bat` work from a fresh clone.
- Known limitations are written down, not hidden.

---

## 8. Documentation plan (the heavy part)

Standard from the skill: report 30 to 50 pages, mandatory table of contents, many diagrams, decision records, real struggles only, real screenshots and measured numbers.

### 8.1 Midsem report (target 30 to 40 pages)
Front matter in the BITS format (cover, certificate, mid-semester progress page: work completed, remaining tasks, evaluation table), then table of contents, list of figures, list of tables, and:

1. Introduction (problem, motivation, objectives, scope, out of scope)
2. Literature and tool survey (Copilot-style assistants, Chrome's built-in AI, Readability, LLM APIs; cost-led comparison)
3. Requirements (FR1 to FR8 with V1/V2 mapping)
4. System architecture (layers, components, data flow, deployment, V1→V2 seam)
5. Technology choices and decision records
6. Text extraction module
7. Chunking and merging module (the "long page" problem)
8. Cloud engine module (prompts, retries, errors)
9. User interface and options/key handling
10. Implementation (layout, message sequence, lifecycle of one summary)
11. Testing and validation (inventory, results, requirement traceability, defects found)
12. Deployment and installation (`setup.bat`, `run.bat`)
13. Challenges and how they were solved (from DEVLOG only)
14. Results and discussion (measured; limitations stated plainly)
15. Remaining work and V2 plan
16. Conclusion; references; appendices

### 8.2 Figures (at least 15, drawn as images, each numbered, captioned and explained)
Context diagram · layered architecture · component diagram · deployment diagram · end-to-end sequence (click to summary) · extraction flowchart · chunking flowchart · merge tree · retry/back-off sequence · error-handling flow · engine interface (V1 vs V2 seam) · storage model · test pyramid · test-fix loop · 14-week plan chart · cost/privacy comparison table figure · measured latency chart · repo structure.

### 8.3 Screenshots (real, from the running extension)
Popup idle · options with key field · progress on a long page · finished summary · each error message · extraction before/after · setup.bat and run.bat terminals · unit and E2E results · the GitHub repo page.

### 8.4 KT document (target 25+ pages, Markdown first)
End-to-end walkthrough with the diagrams, module by module, how to run, how to explain each decision in the client's words, glossary, and 30+ viva questions with answers. PDF only after you verify it.

### 8.5 PPT (about 16 slides)
One clean theme, one idea per slide, report diagrams reused, real screenshots, speaker notes as the viva script. Every slide rendered to an image and checked for overflow before delivery.

### 8.6 How I verify the documents
Word updates the table of contents and exports to PDF, so the page count and the file size (BITS limit 10 MB) are measured, not guessed. PowerPoint exports every slide to an image for the layout check.

### 8.7 Handover wiki (for you, not the client)
Structure, how to hand the KT to the client, setup on their machine, the struggles log, likely viva questions.

---

## 9. Risks specific to V1

| Risk | Impact | Mitigation |
|---|---|---|
| Free-tier rate limits during a demo | Summary fails mid-demo | Retry with back-off, small number of calls per page, clear message, live runs spaced out |
| Pages that load text late or sit behind login | Short or empty summary | Read the rendered DOM; TOO_LITTLE_TEXT message |
| Service worker stopped by Chrome mid-job | Lost job | Timeouts, progress in `storage.session`, tested in M5 **(verify)** |
| Key stored unencrypted in the browser | Honest limitation | State it in the report and the viva points |
| `--load-extension` removed from branded Chrome (Chromium team PSA, April 2025, Chrome 137+; confirmed only from 2025 sources, not yet on Chrome 155) | `run.bat` cannot auto-load the extension | `run.bat` opens `chrome://extensions` and prints the exact 4 manual steps; automated tests use Playwright's Chromium, which still supports loading extensions. I confirm the Chrome 155 behaviour in M0 and log it in DEVLOG. |
| Chrome ships its own on-device Summarizer API (documented as stable from Chrome 138; needs about 22 GB free disk and a GPU with over 4 GB VRAM or a 16 GB RAM CPU; five languages) | The tutor may ask "why not just use that?" | Say so in the literature chapter and answer it honestly: this project lets the model, chunking and prompt be chosen and measured, and compares cloud against local on speed, quality and memory. Whether a small WebLLM model has a smaller footprint is measured in V2, not assumed. |
| This folder is inside OneDrive | Sync conflicts with `.git` and `node_modules` | `node_modules` is git-ignored; if sync slows down, move the repo out of OneDrive |
| A small number of API calls cannot show real chunking on short pages | Weak demo of FR3 | Chunk size is a setting; the long fixture and a real long article prove the path, and the report says plainly that a large-context cloud model does not strictly need chunking, which is why chunking matters most in V2 |
| Haiku test agent misreports | False pass or false bug | I check its report against the screenshots before acting |

---

## 10. Git workflow

- Remote: `https://github.com/Vickey-vijay/DISSCO_web-page-summarizer.git`, branch `main` (the remote is empty today).
- Small commits with clear messages, push after every milestone, tag `v1-midsem` at the end.
- Never committed: API keys, `.env*`, `node_modules`, logs, test output folders.
- Everything the client needs is pushed: code, `setup.bat`, `run.bat`, README, and all documents.

---

## 11. `setup.bat` and `run.bat` design

`setup.bat` (logs to `setup.log`, retries network steps, ends with `pause`, plain-English failures):
1. Check Chrome is installed; if not, say where to get it.
2. Check `manifest.json` exists and parses.
3. Check Node.js only if the developer test tooling is wanted (`setup.bat --dev`); the client does not need Node to use the extension.
4. If `--dev`: `npm install` and Playwright browser download, with a reset path (delete `node_modules`, rebuild).
5. Print a clear success or failure summary.

`run.bat`: confirm setup passed, open `chrome://extensions`, print the exact steps (turn on Developer mode, Load unpacked, choose the `project` folder, pin the extension, open the Options page and paste the key), then open a sample article.

I will run both for real on this Windows machine from a fresh clone and say plainly what was and was not tested.
