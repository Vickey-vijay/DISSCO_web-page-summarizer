# Read me first: the knowledge transfer guide for Page Summarizer

## What this document is

This is the knowledge transfer (KT) guide for Page Summarizer, Version 1. Its purpose is to help you explain the whole project in the viva, in your own words. It covers how the project works, module by module, how to run it, how to explain each decision, and the likely viva questions with honest answers.

Version 1 is the version that is built now. It is a Chrome extension that sends the text of the page you are reading to Google's Gemini service, using your own free key, and shows a summary in a popup. Version 2, which would run a model in the browser, is planned and is not covered here.

Every statement in this guide comes from the files in the project, the planning documents, the test reports and the live measurements. Where a number is not in the repository, the guide says `[to be measured]`. It does not guess.

## Who it is for

It is written for Jeffy, the client, who has to explain the project at the viva. It assumes no computer science background. Technical words are explained the first time they appear, and the glossary has them all.

## How to use it in one week

- **Day 1.** Read this page and chapter 01. Draw the four parts of the system on paper: popup, service worker, page reader and pipeline.
- **Day 2.** Read chapter 02. Open each named file in `midsem/project` and find the lines the chapter quotes.
- **Day 3.** Follow chapter 03. Run `setup.bat` and `run.bat` on a computer with Chrome, load the extension, and summarize one article.
- **Day 4.** Read chapter 04. Say each decision aloud in one sentence, then check it against the chapter.
- **Day 5.** Learn the glossary. Explain five terms from memory.
- **Day 6.** Answer the questions in chapter 06 out loud. Cover the answers and try again.
- **Day 7.** Run the demo from chapter 03 twice, from start to finish, without notes.

## The one-sentence summary

Page Summarizer is a Chrome extension that copies the main text of the page you are reading, sends it to Google's Gemini service with your own free key, and shows a short summary in a popup.

## Map of the other files

| File | What it covers | When to read it |
|---|---|---|
| `01_how_it_works.md` | The walkthrough of one summary, from the button press to the screen | Day 1 |
| `02_module_by_module.md` | Each module, its inputs and outputs, the lines a tutor may ask about, and its limits | Day 2 |
| `03_how_to_run_and_demo.md` | Setup, run, loading the extension, the demo script, and what to do when a message appears | Day 3 and Day 7 |
| `04_decisions_in_your_words.md` | Eleven big decisions, the reasons, the trade-offs and a sentence to say | Day 4 |
| `05_glossary.md` | Every technical term, in one or two plain sentences | Day 5 |
| `06_viva_questions.md` | Forty-two likely questions, grouped by topic, with answers | Day 6 |

## Three things to check before the viva

1. **The real-Chrome install check has no results yet.** `docs/MANUAL_SMOKE_TEST.md` describes the steps, but its results column is empty. Run the steps yourself and record what you see.
2. **The newest test report is older than the test files.** Run `npm test` and `npm run test:e2e` in `midsem/project`, then write down the results. Chapter 06 explains why.
3. **Two messages in the manual test document are out of date.** The popup now says "Paste your Gemini key in the Key box", not "Add your key in Options first". Use the wording the popup shows.
