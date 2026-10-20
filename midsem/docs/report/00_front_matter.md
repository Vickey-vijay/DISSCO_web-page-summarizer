<div align="center">

<img src="../../../assets/bits-logo.png" alt="BITS Pilani logo" width="113">

<br>

**AI-Powered Web Page Summarizer**

*A Chrome Extension with a Cloud Engine (V1) and an In-Browser Local Model (V2)*

**Mid-Semester Report (Version 1)**

</div>

| Field | Details |
|---|---|
| Student Name | [Insert Student Name] |
| BITS ID | [Insert BITS ID] |
| Degree Program | [Insert Degree Program] |
| Course No. | [Insert Course No.] |
| Project Carried Out At | [Insert Organization Name & Location] |

<div align="center">

**BIRLA INSTITUTE OF TECHNOLOGY & SCIENCE, PILANI (RAJASTHAN)**

Pilani, Rajasthan 333031

[Insert Month and Year]

</div>

<div style="page-break-after: always"></div>

<div align="center">

**CERTIFICATE**

</div>

This is to certify that the [Insert Course Title] entitled "AI-Powered Web Page Summarizer" and submitted by [Insert Student Name], having BITS ID No. [Insert BITS ID], for the partial fulfillment of the requirements of the [Insert Degree Program] degree programme of BITS, embodies the Bonafide work done by him/her under my supervision.

<br>
<br>
<br>
<br>

<div align="center">

Signature of the Mentor

Name, Designation & Organization & Location: [Insert]

Place: [Insert]

Date: [Insert]

</div>

<div style="page-break-after: always"></div>

<div align="center">

**Mid-Semester Progress Report**

</div>

**Work Completed So Far:**

**Planning and abstract**

- The abstract, with the cover details and eight references, is written. The V1 plan is approved (midsem/V1_PLAN.md).
- The product requirements are written (prd.md). They fix the scope of V1 and V2 and the requirements FR1 to FR8.

**Version 1 build**

- The Chrome extension (Manifest V3) has a toolbar popup with a Summarize button, a service worker that runs the job, a text extractor, a chunker, a merger, and a Gemini engine.
- The page text is read with Mozilla Readability. Long pages are split into parts, each part is summarized, and the part summaries are merged into one summary.
- The Gemini key is entered once, in the popup or on the Options page, and is kept in the browser.
- The model is gemini-3.5-flash-lite with the thinking setting low. This was chosen by measuring speed on the real task, not by guessing.
- Errors have plain English messages: missing or rejected key, busy service, network, timeout, restricted pages, too little text, and pages that need too many parts.

**Testing**

- Unit tests (node:test, no browser) and browser tests (Playwright Chromium with the extension loaded, against a mock Gemini service) are in the repository.
- The latest run passed 65 unit tests and 28 browser scenarios, with no failures (midsem/docs/test-runs/run-3.md).
- Browser tests found four product bugs in the first run. All four were fixed and the second run passed (midsem/docs/test-runs/run-1.md and run-2.md).
- Live runs on real pages used the real Gemini service. Seven pages were summarized and two error cases were checked (midsem/docs/test-runs/live-measurements.md).

**Setup scripts**

- setup.bat checks that Chrome is installed and new enough, checks that the extension files are complete, and writes setup.log. It ended with SETUP COMPLETE on the development machine.
- run.bat opens Chrome's extensions page, copies the folder path, and shows the four steps to load the extension by hand.
- A test script runs both .bat files on their success and failure paths (midsem/project/tests/bat/test-bat-scripts.ps1).

**Remaining Tasks:**

**Version 2: in-browser model**

- Study small models of about 1 to 3 billion parameters for speed, memory and summary quality, and choose one for the client's laptop.
- Build the local engine with a first-run download, a progress bar, and caching in the browser.
- Add the WebGPU check at startup and its clear messages.
- Make summaries work with no network once the model is cached.
- Confirm the client laptop's operating system, memory and graphics card, because they set the model size.

**Comparison and final documents**

- Run the cloud engine and the local engine on the same pages and compare speed, summary quality and memory use.
- Final testing, the final report, the presentation and the knowledge-transfer document for the final semester.

**Evaluation:**

| EC No. | Component | Excellent | Good | Fair | Poor |
|---|---|---|---|---|---|
| 1. | Design Project Outline |  |  |  |  |
| 2. | Work Progress & Achievements |  |  |  |  |
| 3. | Initiative and Originality |  |  |  |  |
| 4. | Documentation & Expression |  |  |  |  |
| 5. | Research & Innovation |  |  |  |  |
| 6. | Relevance to the work environment |  |  |  |  |

<br>

Signature of the Mentor: ____________________        Date: [Insert]

<div style="page-break-after: always"></div>

# [nonum] Table of Contents

The page numbers are added when the report is converted to PDF.

1. Introduction
2. Background and survey
3. Requirements
4. System design
5. Technology choices
6. Text extraction
7. Long pages
8. The cloud model and errors
9. The user interface
10. Storage and jobs
11. Setting up and running the extension
12. Testing and results
13. Problems and solutions
14. Limitations and next steps
15. Conclusion
16. References
- Appendix A: Repository File Guide
- Appendix B: Messages and Settings

# [nonum] List of Figures

This list is generated when the report is converted to PDF.

# [nonum] List of Tables

This list is generated when the report is converted to PDF.
