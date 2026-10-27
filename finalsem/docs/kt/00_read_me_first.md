# Read me first: the knowledge transfer guide for Page Summarizer, Version 2

*Purpose: this page says what Version 2 is, how it differs from Version 1, how to use the seven-file KT pack, and the five things to remember before the viva.*

## What this document is

This is the knowledge transfer (KT) guide for Page Summarizer, Version 2. It is for the student who explains the project at the viva, and for whoever maintains the extension later. Every number comes from the repository: the code in `finalsem/project`, the saved runs in `finalsem/docs/test-runs`, `finalsem/docs/DECISIONS.md`, `finalsem/docs/CLIENT_LAPTOP.md` and `DEVLOG.md`. Where a number is missing, the pack says `[to be measured]`.

The pack has been revised four times, after a code review, a failure in the real Chrome (24 October), the client's laptop photos and the speed work (26 October). Where an older chapter statement conflicts with a later one, the later one is the true one.

## What the project is

Page Summarizer is a Chrome extension. You click its icon on an article, press a button, and a short summary appears in the popup. Version 2 makes the summary with a small language model that runs inside Chrome, on your computer's graphics card. There is no account and no API key, and the page text does not leave the computer.

## How Version 2 differs from Version 1

| Item | Version 1 (`midsem`) | Version 2 (`finalsem`) |
|---|---|---|
| Where the summary is written | Google's Gemini service | Your computer's graphics card |
| What you need to start | A free Gemini key | Nothing to paste. The first use downloads the model (about 695 MB) |
| Internet | Needed for every summary | Needed once, for the download |
| Part size and limit | 8,000 characters, at most 30 parts | 6,000 characters, at most 12 parts |
| Automated tests | 65 unit and 28 browser (its run 3) | 93 unit, 31 browser scenarios, 15 script checks |

Version 1 is untouched in its own folder, so the midterm submission stays as it was.

## How to use this KT pack

| File | Read it when |
|---|---|
| `01_how_it_works.md` | Day 1: the walk from the button press to the summary |
| `02_module_by_module.md` | Day 2: every source file and what breaks without it |
| `03_how_to_run_and_demo.md` | Day 3, and the day before the viva: setup, demo, the client's laptop, errors, tests |
| `04_decisions_in_your_words.md` | Day 4: the decisions, each with a sentence to say |
| `05_glossary.md` | Day 5: plain definitions |
| `06_viva_questions.md` | Days 6 and 7: thirty questions with answers |

## A ten-minute reading path

1. **Two minutes.** Read "What the project is" above, then the first section of chapter 01.
2. **Three minutes.** Read the steps under "One summary, from the click to the screen" in chapter 01, including the condense step.
3. **Three minutes.** Read decision 7 in chapter 04 (the built-in graphics and the model choice) and say it aloud.
4. **Two minutes.** Read the questions "Why is it fast now?", "Why not a smaller model?", "What was not measured?" in chapter 06.

## The five things to remember

1. **The model runs on the laptop.** The page text stays on the computer. The network is used only for the first download, about 695 MB for Llama 3.2 1B.
2. **The client's laptop has only built-in graphics.** It is an Intel Iris Xe chip on a 15-watt processor. The extension has never been run on that laptop. On the developer's laptop it was timed in a visible Chrome window on 28 October, with results close to the hidden run.
3. **Long pages are shortened on built-in graphics.** The default reads the opening of the page and the first sentences of each section, about one part of 6,000 characters. The popup says how much was read, and offers "Read the whole page (slower)". The Wikipedia Lighthouse page took 124.6 s on the developer's built-in chip, against about 10 minutes before.
4. **Answers are short on built-in graphics, and the big model is the default.** SmolLM2 is available only as a visible choice, Settings > Quality > Fast, because its summaries were often muddled or wrong.
5. **Some things are not verified.** Timing on the client's laptop, a second runtime, and any language other than English.

*If asked about evidence, say: "The numbers come from saved runs on the developer's laptop and from pretend-model scenarios. None of them is from the client's laptop, and the repository does not score summary quality."*
