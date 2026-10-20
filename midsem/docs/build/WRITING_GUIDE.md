# Writing guide for the report and the KT document

This guide is for anyone (person or agent) writing chapter text. Follow it exactly; the chapters are compiled by `md2docx.py` into the Word report.

## Plain English, humanized (rule from the project owner)
- Write so a viva panel member and the client can follow without a computer science background. Short sentences. Everyday words first.
- The first time a technical term appears, say what it means in a plain phrase in brackets or in the next sentence, for example "a content script (a small program that Chrome runs inside the page you are reading)". After that, use the term.
- Depth stays. Explain every step, the reason for each choice, what the user sees, and what happens when something fails. Plain words are not a reason to skip detail.
- Never use these words or phrases: delve, seamless, seamlessly, robust, leverage, game-changer, cutting-edge, "it is important to note", "in today's world", "in conclusion" at the start of a paragraph, "navigate the landscape", "unlock", "empower". No emojis. No dash chains.
- Sound like a student who did the work: "I" is allowed in the first-person places (for example, "I chose..."), but keep the focus on the system and the evidence.
- Every technical section ends with a short "What this means in plain words" paragraph.

## Voice and style
- Write as the student describing their own project: plain, concrete sentences. Prefer "the extension reads..." and "this project uses..." over "we". Never write "I".
- Explain every technical term the first time it appears, in one short clause (for example, "a service worker, the background script Chrome runs for an extension").
- No hype or filler: do not use words such as seamless, robust, powerful, cutting-edge, leverage, delve, game-changing, revolutionary, "in today's world", "it is important to note". Avoid chains of em dashes. No emojis.
- Short paragraphs (3 to 6 sentences). Use lists and tables when they make a comparison clearer, and a paragraph when reasoning has to be followed.
- Be honest. State limitations and failures plainly. A weakness stated first is better than one a tutor finds.

## Keep Version 1 simple (instruction from the project owner)
Version 1 is the simple version: the extension takes the text of the page, sends it to a cloud service (Gemini), gets a summary back and shows it. The V1 documents must read that way.
- Explain V1 in plain language that a college viva panel and the client can follow: "the extension reads the page text", "it asks the cloud service for a summary", "if the page is long it is split into parts, each part is summarized, and the part summaries are combined".
- Do NOT explain AI internals in the V1 documents: no tokenization or tokens, context windows, embeddings, attention, transformers, quantization, model weights, GPU inference or prompt-engineering theory. One plain sentence is enough to say what the model is ("a language model hosted by Google that writes summaries"). The only place such topics may appear is a short, clearly marked "What Version 2 adds" section in the remaining-work chapter, in two or three sentences each, because they belong to the Version 2 documents.
- Engineering topics (extension structure, messages, errors, retries, tests, setup) are fine and expected, but explain each in everyday words and keep every explanation short and concrete.
- Describe the user interface as it is: a toolbar popup with a Summarize button, an inline Gemini key box, progress text and a numbered summary. Everything happens in the popup; nothing opens in a new tab (the Options page exists but is only a second place to change the key).

## Facts: where they may come from
- Every statement about the system must be true of the code in `midsem/project/` as it exists now. Read the source before writing about it. Do not describe a feature that is not there; V2 items must be called "planned for V2".
- Every number (test counts, timings, sizes, characters, requests, percentages) must come from a file in the repository: `midsem/docs/test-runs/*` (examples, model benchmark, test run reports, live measurements), `DEVLOG.md`, the code, or `midsem/V1_PLAN.md`. If a number is not available, write `[to be measured]` instead of guessing.
- Struggles and lessons come from `DEVLOG.md` only. Do not invent problems.
- Do not copy text, names or numbers from other students' projects.
- Unknown personal details stay as `[Insert ...]` placeholders. Do not invent supervisor remarks, dates or names.

## Every module chapter contains
1. What this part does and why it exists (2 to 3 paragraphs).
2. How it works, step by step, with a figure from `docs/figures/` and a paragraph that explains the figure ("Reading the figure: ...").
3. Design decisions: a table of the options considered, the choice, why the others were rejected, and the trade-off accepted.
4. A worked example with real input and output taken from `docs/test-runs/examples.md` or a live run.
5. Failure cases and how they are handled.
6. What went wrong while building it (from DEVLOG).
7. How it was tested (name the real test files and scenario IDs).
8. Limitations.
9. A short section **Questions this chapter answers**: 3 to 5 questions a tutor could ask, each as a bold question followed by a direct answer in 2 to 4 sentences ("Why X and not Y?", "What would break first?", "What did we measure?", "Why is this in V1 and not V2?").

## Markdown subset (what the builder understands)
```
# Chapter title            Heading 1, new page, numbered automatically (do not type numbers)
## Section / ### Subsection numbered automatically
# [nonum] References        Heading 1 without a number
plain paragraphs, **bold**, *italic*, `inline code`
- bullet                   numbered items:  1. first
> call-out sentence        (shaded box, use sparingly)
Table: caption text        (put this line directly above a pipe table)
| a | b |
|---|---|
| x | y |
![Caption text](figures/F04_sequence.png)     figure with auto-numbered caption
```
Fenced code blocks (three backticks) are allowed for short code or text samples. Do not use HTML. Do not type "Figure 3" or "Table 2" as numbers in the text (they are generated); say "the figure above" or "the table below".

## Length
Each chapter has a word budget in its brief. Reach it with substance (explanations, reasoning, examples, tables), never with repetition or padding.
