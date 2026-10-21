<div align="center">

<img src="../../../assets/bits-logo.png" alt="BITS Pilani logo" width="113">

<br>

**AI-Powered Web Page Summarizer**

*A Chrome Extension with a Cloud Engine (V1) and an In-Browser Local Model (V2)*

**Final-Semester Report (Version 2)**

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

**ACKNOWLEDGEMENTS**

</div>

[Insert Acknowledgements. Name the mentor, the client and anyone who helped with the testing, in the student's own words.]

<div style="page-break-after: always"></div>

<div align="center">

**ABSTRACT**

</div>

Version 2 of the AI-Powered Web Page Summarizer keeps the Chrome extension of Version 1 and replaces its cloud model with a small language model that runs inside the browser, on the computer's own graphics card. The reader presses one button on any web page. The extension reads the main text, cuts long text into parts of about 6,000 characters, asks the model for a summary of each part and merges the parts into one summary. No key or account is needed, and the page text does not leave the computer. The model, Llama 3.2 1B in a 4-bit form of about 695 MB, is downloaded once, stored in the browser's IndexedDB and used afterwards with no internet. A computer with a weak built-in graphics chip uses the smaller SmolLM2 360M model and shows a note. On an NVIDIA RTX 3050 a short article took 196.8 seconds on first use and 15.3 seconds with outside websites blocked. On the built-in Intel chip the smaller model took 199.2 seconds on first use. The report explains the model, the browser work, and the choices, faults and limits found on the way.

<div style="page-break-after: always"></div>

<div align="center">

**Final-Semester Progress Report**

</div>

**Work Completed in Version 2:**

**Local engine**

- The summary is made by the Llama 3.2 1B model through the WebLLM library, in a hidden offscreen page and a web worker. The smaller SmolLM2 360M model is used on a weak built-in chip or on a computer with less memory (`finalsem/docs/DECISIONS.md`).
- The model is downloaded once, with a progress bar, and stored in IndexedDB. Later summaries run with no internet.
- The WebGPU and 16-bit math checks run at startup and show plain messages when a computer cannot run the model.

**Testing**

- Unit tests: 65 pass. Browser tests: 26 scenarios with a pretend model passed in three runs (`finalsem/docs/test-runs/run-1.md`).
- Real-model runs on the NVIDIA card and on the built-in Intel chip are recorded in `finalsem/docs/test-runs/`. Two faults in the extension were found by the browser tests and fixed.

**Remaining Tasks:**

- The client's laptop has not been checked. Its operating system, memory and graphics card are still unknown.
- The optional `setup.bat --gpu` switch has not been tried in a real Chrome installation.
- A manual check in the visible Chrome window is still to be done. Every run so far used a hidden Chromium browser.
- No side-by-side comparison of summary quality between Version 1 and Version 2 is recorded in the repository.

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
2. How a language model works
3. Running a model in the browser
4. Requirements
5. System design
6. Technology choices
7. The graphics card check and the choice of model
8. Getting the model onto the laptop
9. The offscreen page and its messages
10. Summarizing with a small model
11. The user interface
12. Errors and fallbacks
13. Setup and running
14. Testing and results
15. Problems and solutions
16. Limitations and next steps
17. Conclusion
18. References
- Appendix A: File Guide
- Appendix B: Messages and Settings

# [nonum] List of Figures

This list is generated when the report is converted to PDF.

# [nonum] List of Tables

This list is generated when the report is converted to PDF.
