---
name: college-project-workflow
description: Vignesh's end-to-end workflow for BITS Pilani college projects he builds for clients (CoH cohorts, viva-based). Use this whenever Vignesh describes a college project idea, mentions a client project, CoH, outline/abstract, midsem, final sem, V1/V2, KT document, viva, setup.bat/run.bat, or asks for feasibility, scope, documents, repo structure or tracking for a client project, even if he does not say "college project" explicitly.
---

# College Project Workflow (Vignesh)

Vignesh builds AI-powered college projects for clients and delivers the full lifecycle: idea, feasibility, code, documents, deployment on the client's machine. This skill keeps every project consistent so he never has to re-explain the process. He communicates casually (often Tanglish) and wants direct, concise answers.

## 0. Stay inside the scope he gives

The idea Vignesh states is the **final product**. Do not add features, integrations or "nice to have" extras on your own. If he lists what V2 contains, that list is the whole scope. (Lesson learned: suggesting Calendar/Notion/Trello/email exports for a meeting summarizer was out of scope and annoyed him.) If something seems missing, ask in one line instead of adding it.

## 1. At the start of every project

Check memory and the Notion tracker first (client, idea, status), then confirm only what is missing:
- Client name and the exact author/submitted-by name to print on documents
- GitHub repo. If none is given, ask: "Shall we create a new repository for this project?" and suggest a repo name.
- Client laptop configuration (OS, Python version, RAM, GPU) if it affects V2 (local models).
- Notion project page (the "Client & Project Tracker").

**Session model:** one Claude Code session (and one repo) per client. Vignesh uploads the client's PRD in that session. The flow inside a session is strictly in this order, and Claude does not jump ahead until Vignesh says go:
1. Abstract (from the PRD)
2. V1 application, then V1 documents (report, KT, PPT, wiki)
3. V2 application, then V2 documents

**Reference exemplar (the quality bar):** the DISSCO web-page-summarizer repo (`Vickey-vijay/DISSCO_web-page-summarizer`) is the finished sample. Before drafting anything, look for sample material in this order: the repo's own `abstract/`, `midsem/docs/`, `finalsem/docs/` (report chapters, KT, figures, PPT builders, `WRITING_GUIDE.md`, `DECISIONS.md`); then memory (BITS abstract template); then Notion. If no samples are reachable, say so in one line and ask Vignesh to upload samples. Never start the abstract or a report from a blank page when a sample exists. Copy structure and rigor, never content or facts from another client's project.

## 2. Feasibility discussion (idea stage)

When Vignesh pitches an idea, answer in this order, concisely:
1. Feasibility (one short paragraph, name the real risk).
2. V1 scope vs V2 scope (see section 3).
3. Difference from existing tools, led by **cost**, then data/privacy, input flexibility, customization.
4. Defense points he can say to the tutor.
5. Honest limitations (he prefers to state weaknesses first).
Never present a list of extras beyond what he described.

## 3. V1 / V2 chunking

- **V2 = the full product** he described. **V1 = a working partial slice** that can be submitted first.
- Default pattern: V1 uses a hosted LLM API (Gemini or NVIDIA keys, free tier friendly); V2 goes offline with local models (Llama or similar via Ollama) where the idea allows it.
- V1 must be genuinely working end to end on the core flow, just smaller. State clearly what is in V1, what is deferred to V2, and why.
- Default mapping: V1 is the midsem deliverable, V2 is the final-sem deliverable. Confirm if the client's timeline differs.

## 4. Project stages and documents

Stages: **Outline/Abstract, then Midsem, then Final sem.**

| Stage | Deliverables |
|---|---|
| Abstract | Abstract document in the saved BITS template |
| Midsem | Submission report (.docx), KT document (.md first, then PDF after Vignesh verifies), PPT (.pptx), V1 project |
| Final sem | Same set, updated for V2 |

Rules:
- **Abstract:** use the repo's `abstract/abstract.md` as the sample and follow the saved BITS abstract template in memory (structure: Cover, Broad Area, Background, Objectives, Scope, 14-week Plan, 8 References, Supervisor Remarks; student tone, Background opens with a real-world frustration, no AI-sounding phrases, Times New Roman justified, placeholders in [square brackets]).
- **Report (Word):** covers progress, the problems faced and how they were solved, and walkthrough screenshots of the working app. Look at earlier chats and memory for past reports and decks before drafting, and reuse their structure.
- **KT document:** explains how the whole project works end to end so the client can explain it in the viva. Write Markdown first. Only export to PDF once Vignesh says it is verified.
- **PPT:** build with the pptx skill, matching earlier decks.
- **BITS submission format** (from earlier client messaging): PDF, filename is the 11-digit BITS ID, max 10 MB, Turnitin similarity report uploaded separately.
- Use the docx, pptx and pdf skills for the actual files.
- Fill author and submitted-by fields with exactly the name Vignesh gives. Do not invent statements about who built what or how.

## 4A. Document quality standard (final-semester level, mandatory)

These are final-semester projects, so effort and output are maximised. A short document is a failure.

**Length and structure**
- Report: **30 to 50+ pages minimum** (the reference exemplar is about 31k words for V1 and 77k for V2). KT document: also substantial (about 13k to 21k words in the exemplar), split into chapters plus one merged `KT_full.md`.
- A **table of contents is mandatory** in the report and in the KT document, with numbered chapters, sections and subsections. Also a list of figures and a list of tables.
- Every chapter goes deep: sections and subsections, not a few paragraphs. Do not pad; add real explanation, reasoning and evidence.
- Chapters to cover at minimum: introduction, background and survey, requirements, system design and architecture, technology choices, one chapter per major module, UI, storage, setup and running, testing and results, problems and solutions, limitations and next steps, conclusion, references, appendices (file guide, messages/settings).

**Drawings (more is better)**
- Many diagrams, not decoration: context, layers/architecture, components, sequence diagrams, data flow, flow charts for each major algorithm, state/job-phase diagrams, error flow, storage model, deployment, repo tree, V1-vs-V2 comparison, reuse map, dev loop, plan chart. Aim for roughly 15 to 20 per version.
- Every figure is followed by a short "Reading the figure: ..." paragraph that explains it.
- Build figures as SVG then PNG (script in `docs/figures/build-figures.mjs`), consistent palette, all text legible when printed, no clipped text. Open every PNG and check it before use. Keep a `FIGURES.md` (ID, file, caption, source files) and a contact sheet.
- Every box and arrow must be true of the real code (use real file, message and error names).

**Explain how things work, and why**
- Explain each part step by step: what it does, why it exists, what the user sees, what happens when it fails.
- Self-questioning is required. Ask "why this stack and not that one?", "what did we compare?", "what matters here and what does not, and why did we prioritise it?", "what if X fails?", then answer each in the document.
- Every module chapter contains: purpose; step-by-step working with a figure; **design-decision table** (options considered, choice, why others were rejected, trade-off accepted); a worked example with real input and output; failure cases; what went wrong while building (from DEVLOG); how it was tested (real test names); limitations; and **"Questions this chapter answers"** (3 to 5 viva-style questions with direct answers).
- Include a technology comparison chapter (alternatives, criteria, result) and a "what we prioritised and what we left out" discussion.
- Struggles are real ones from `DEVLOG.md` and test-run files only. Never invent problems.
- AI topics (how a model works, tokens, context window, quantization etc.) are explained in plain language with an everyday comparison, then the exact numbers measured in this project.

**Writing style**
- Plain, humanised English a viva panel and the client can follow. Short paragraphs, first use of a technical term explained. Student voice, system-focused ("the extension reads..."), no "I/we".
- Banned words: delve, seamless, robust, leverage, game-changer, cutting-edge, "it is important to note", "in today's world", unlock, empower, harness, paradigm, state-of-the-art. No emojis.
- Every number comes from a file in the repo (test runs, DEVLOG, code); if unavailable write `[to be measured]`. Unknown personal details stay as `[Insert ...]` placeholders.
- Each technical section ends with **"What this means in plain words"**.
- Keep a `WRITING_GUIDE.md` in `docs/build/` for each version so any helper agent writes to the same rules.

**Writing workflow:** chapters are written as separate `.md` files, assembled into `*_full.md`, then converted to .docx by the build scripts (`assemble_md.py`, `md2docx.py`, `build_report.py`). Read the real source before describing a module. Never describe a feature that is not built; call it "not built".

**PPT standard**
- Clean, disciplined, consistent: one idea per slide, same layout grid, same palette and fonts as the figures, large readable text, no clutter, real diagrams and screenshots. About 20 to 25 slides.
- Build from a JSON deck spec plus a builder script so it is repeatable. Render every slide to PNG (`preview/`) and inspect each one for overflow, overlap and alignment before delivering.
- Deck flow: title, problem, goals, scope, architecture, how it works (with diagrams), demo screenshots, tests and results, problems and fixes, V1 vs V2, limitations, conclusion.

**Decision record:** keep `DECISIONS.md` (decision, options, answer, what was actually done, why it changed) so the report's "why" text is drawn from it.

**Test evidence:** save real test-run outputs under `docs/test-runs/`, UI screenshots under `docs/screenshots/` (including error states), and a manual smoke-test checklist.

**Self-check before delivering any document set:** TOC present; page/word target met; figure count met and each explained; every chapter has decision table and viva questions; no invented facts; placeholders listed back to Vignesh.

## 5. Repository layout (one GitHub repo per project)

```
<project-repo>/
  README.md                 # setup, run, structure, versions, in plain steps
  abstract/                 # abstract document
  midsem/
    docs/                   # report/, kt/, figures/, screenshots/, test-runs/, ppt/, build/
    project/                # V1 application
  finalsem/
    docs/                   # report, KT, PPT for final
    project/                # V2 application
```
Keep V1 and V2 in separate folders so neither overwrites the other. Keep the README accurate as things change.

## 6. Setup and run scripts (every version)

The client must be able to clone the repo, double-click `setup.bat`, then double-click `run.bat`. Vignesh should never have to debug the client machine by hand.

**setup.bat** must:
- Check Python (correct version) and install guidance if missing; check/create the virtual environment (uv or venv) and install requirements.
- Check other dependencies the project needs (for example ffmpeg, Ollama and model pulls for V2) and the `.env` file / API keys.
- Log everything to `setup.log`.
- Catch every failure and print a clear plain-English message: what failed and the exact manual step to fix it (for example: "install Python 3.11 from python.org, tick Add to PATH, then run setup.bat again").
- Retry flaky steps (network installs) before giving up, and offer a reset path (delete the `.venv` folder and rebuild from scratch).
- Never close the window silently; end with `pause` and a clear success or failure summary.

**run.bat** must: activate the environment, verify setup was completed (and say "run setup.bat first" if not), start the app, and open the browser at the right address.

Windows .bat files cannot be executed in the Linux workspace, so review them line by line and ask Vignesh to test on a clean machine or the client's configuration.

## 7. Dev journal (real struggles only)

Keep `DEVLOG.md` in the repo during development, written as things actually happen. Each entry: date, what broke or was hard, symptom or error, root cause, fix, what was learned. Include real technical problems (model accuracy, dependency conflicts, rate limits, performance, environment issues). Record only what actually occurred in the project; never invent struggles. This log feeds the report's problems-and-solutions section and gives the client honest material for the viva.

## 8. Handover wiki for Vignesh

When a version is done, create a wiki artifact for Vignesh (not the client) covering: how the project is structured, how to hand over the KT to the client, how to set it up on their machine, the journal of struggles and solutions, and likely viva questions with answers.

## 9. Notion tracking

The "Client & Project Tracker" in Notion is the source of truth (Notion MCP is connected). Read it at the start of a project session and update it as work moves: for example "V1 done, V2 in progress", documents delivered, repo link, deadlines. Update as you go, not at the end.

## 10. Client communication

If asked to message clients on WhatsApp, keep it clear and scannable, include portal links where relevant, and sign every AI-sent message with "— AI (Assistant)". No emojis like 🙏 unless Vignesh asks.
