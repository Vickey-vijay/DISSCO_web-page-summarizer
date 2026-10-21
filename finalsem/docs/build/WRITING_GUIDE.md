# Writing guide for the Version 2 report and KT document

For anyone (person or agent) writing chapter text. It is the Version 1 guide ([../../../midsem/docs/build/WRITING_GUIDE.md](../../../midsem/docs/build/WRITING_GUIDE.md)) with one big difference: **Version 2 is where the AI topics are explained.** Version 1 left them out on purpose. Here each one gets a plain, careful explanation.

## Plain English, humanized (rule from the project owner)
- Write so a viva panel member and the client can follow without a computer science background. Short sentences. Everyday words first.
- The first time a technical term appears, say what it means in a plain phrase, in brackets or in the next sentence. After that, use the term.
- Depth stays. Explain every step, the reason for each choice, what the user sees, and what happens when something fails. Plain words are not a reason to skip detail.
- Never use: delve, seamless, seamlessly, robust, leverage, game-changer, cutting-edge, "it is important to note", "in today's world", "navigate the landscape", "unlock", "empower", "harness", "paradigm", "state-of-the-art". Do not start a paragraph with "In conclusion". No emojis. No chains of dashes.
- Sound like a student who did the work. Write about the system and the evidence. Do not write "I" or "we"; prefer "the extension reads...", "this project uses...".
- Short paragraphs (3 to 6 sentences). Lists and tables where they make a comparison clearer; a paragraph when reasoning has to be followed.
- Every technical section ends with a short **What this means in plain words** paragraph.

## The AI topics that belong in Version 2 (explain each with an everyday comparison, then the exact numbers from this project)
- **What a language model is** (a program that has read a huge amount of text and learned to guess the next piece of text), and what "1 billion parameters" means (about a billion numbers that it learned, stored in a file).
- **Tokens**: the pieces a model reads and writes (a word, part of a word, or punctuation). Why the speed is counted in tokens per second. Use the measured values.
- **The context window**: how much text the model can look at in one go, and why a long page is cut into parts of about 6000 characters (`chunkChars`) and then merged.
- **Weights and 4-bit compression (quantization)**: why the file is about 700 MB and not several GB, and what is given up (a little accuracy).
- **Prefill and decode**: reading the page (fast) versus writing the answer one token at a time (slower); use the measured numbers (about 600 and about 40 to 63 tokens per second on the NVIDIA chip).
- **WebGPU and the graphics card**: why a graphics chip is used, what `shader-f16` is, why an integrated chip is slow (about 2 tokens per second measured), and what the shader warm-up is (about 30 s on the first answer).
- **Caching and offline use**: where the model is stored (IndexedDB), why Cache Storage did not work here, and the offline proof.
- **Prompting a small model**: why the V2 prompts ask for plain text first and why the answer is shaped afterwards.
Do not claim anything about how the model was trained, how large the training data was, or its benchmark scores unless a source file in the repository says so. If a fact is not in the repository, say it is general background and keep it short.

## Facts: where they may come from
- Every statement about the system must be true of the code in `finalsem/project/` as it exists now. Read the source before writing about it. Do not describe a feature that is not there; later ideas must be called "not built".
- Every number (test counts, timings, sizes, speeds, megabytes) must come from a file in the repository: `finalsem/docs/test-runs/*`, `DEVLOG.md`, `finalsem/README.md`, `midsem/docs/test-runs/*` for Version 1 numbers, or the code. If a number is not available, write `[to be measured]`.
- Struggles and lessons come from `DEVLOG.md` and the test-run files only. Do not invent problems.
- Runs that were disturbed by other programs are labelled "while other programs were running". Never present them as clean.
- Unknown personal details stay as `[Insert ...]` placeholders.
- Do not touch anything under `midsem/`.

## Every module chapter contains
1. What this part does and why it exists (2 to 3 paragraphs).
2. How it works, step by step, with a figure from `docs/figures/` and a paragraph that explains the figure ("Reading the figure: ...").
3. Design decisions: a table of the options considered, the choice, why the others were rejected, and the trade-off accepted.
4. A worked example with real input and output from `docs/test-runs/` or a short code snippet from the real source.
5. Failure cases and how they are handled.
6. What went wrong while building it (from DEVLOG).
7. How it was tested (name the real test files and scenario IDs).
8. Limitations.
9. **Questions this chapter answers**: 3 to 5 questions a tutor could ask, each as a bold question followed by a direct answer in 2 to 4 sentences.

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
![Caption text](figures/F01_context.png)     figure with auto-numbered caption
```
Fenced code blocks are allowed for short code or text samples (copy real lines from the source; keep them under 25 lines). Do not use HTML. Do not type "Figure 3" or "Table 2" as numbers in the text (they are generated); say "the figure above" or "the table below".

## Length
Each chapter has a word budget in its brief. Reach it with substance (explanations, reasoning, examples, tables), never with repetition or padding.
