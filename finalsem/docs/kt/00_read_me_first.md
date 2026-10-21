# Read me first: the knowledge transfer guide for Page Summarizer, Version 2

*Purpose: this page says what Version 2 is, how it differs from Version 1, how to use the seven-file KT pack, and the five things to remember before the viva.*

## What this document is

This is the knowledge transfer (KT) guide for Page Summarizer, Version 2. It is for the student who explains the project at the viva, and for whoever maintains the extension later. Every number in it comes from the repository: the code in `finalsem/project`, the saved runs in `finalsem/docs/test-runs`, `finalsem/docs/DECISIONS.md` and `DEVLOG.md`. Where a number is missing, the pack says `[to be measured]`.

## What the project is

Page Summarizer is a Chrome extension. You click its icon on an article, press a button, and a short summary appears in the popup. Version 2 makes the summary with a small language model that runs inside Chrome, on your computer's graphics card. There is no account and no API key, and the page text does not leave the computer.

## How Version 2 differs from Version 1

| Item | Version 1 (`midsem`) | Version 2 (`finalsem`) |
|---|---|---|
| Where the summary is written | Google's Gemini service | Your computer's graphics card |
| What you need to start | A free Gemini key | Nothing to paste. The first use downloads the model |
| Internet | Needed for every summary | Needed once, for the download |
| Part size and limit | 8,000 characters, at most 30 parts | 6,000 characters, at most 12 parts |
| Tests (run 1 or 3) | 65 unit, 28 browser | 65 unit, 26 browser scenarios, 14 script checks |

Version 1 is untouched in its own folder, so the midterm submission stays as it was.

## How to use this KT pack

| File | Read it when |
|---|---|
| `01_how_it_works.md` | Day 1: the walk from the button press to the summary |
| `02_module_by_module.md` | Day 2: every source file and what breaks without it |
| `03_how_to_run_and_demo.md` | Day 3, and the day before the viva: setup, demo, errors, tests |
| `04_decisions_in_your_words.md` | Day 4: the eleven decisions, each with a sentence to say |
| `05_glossary.md` | Day 5: plain definitions |
| `06_viva_questions.md` | Days 6 and 7: thirty questions with answers |

## A ten-minute reading path

1. **Two minutes.** Read "What the project is" above, then the first section of chapter 01.
2. **Three minutes.** Read the phase steps in chapter 01 under "One summary, from the click to the screen".
3. **Three minutes.** Read decisions 2, 4 and 7 in chapter 04 and say each one aloud.
4. **Two minutes.** Read the questions on the first run, the missing graphics support, Gemini, the 1B model's quality and what was not tested, in chapter 06.

## The five things to remember

1. **The model runs on the laptop.** The page text stays on the computer. The network is used only for the first download, about 695 MB for Llama 3.2 1B.
2. **Speed depends on the graphics chip.** The NVIDIA RTX 3050 wrote 34 to 53 tokens a second in the clean runs. The built-in Intel chip uses a smaller model, writes 4 to 5 tokens a second, and took 199.2 s for a short article on first use.
3. **The first use is slow.** The download took about 157 s, the warm-up about 30 s, and the load about 3 s. Later, the same short article took 15.3 s with the outside websites blocked.
4. **Summary quality was not scored.** The saved outputs show faults, such as a summary that starts with the page's marker text. Say that the quality was read, not measured.
5. **Some things are not verified.** The client's laptop, the visible daily Chrome, `setup.bat --gpu` on a real Chrome, and any language other than English.

*If asked about evidence, say: "The numbers come from three clean runs and the pretend-model tests. The repository does not score summary quality."*
