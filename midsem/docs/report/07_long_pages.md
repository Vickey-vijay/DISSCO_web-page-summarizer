# Long pages

## What this part does and why it exists

Many pages are too long to summarize in one request. The extension splits a long page into parts, summarizes each part, and combines the part summaries into one summary.

The project splits pages for two reasons. The requirement list asks for it (FR3 in `midsem/V1_PLAN.md`). Each request must also finish within 25 seconds. The plan says plainly that a large-context cloud model does not strictly need splitting. The step is kept so that the path is built and tested, and the part size is a setting. The popup shows progress as it goes: "Summarizing part 2 of 4..." and then "Combining 4 summaries...".

## How it works

The splitting and merging code is pure logic with no browser code in it. It lives in `midsem/project/src/core/chunker.js`, `merger.js` and `pipeline.js`, so it can be tested on its own.

**Step 1: check the size.** The default part size is 8,000 characters (`chunkChars` in `config.js`). A page that fits in one part skips splitting.

**Step 2: split into parts.** The splitter works from coarse to fine. Paragraphs (separated by blank lines) are packed together until the next one would exceed the limit. A paragraph that is too long is split at sentence ends. A sentence still too long is cut at the last space before the limit, unless that space sits in the first half of the limit, in which case the cut is at the limit. A run of characters with no spaces is cut at the limit. No part is empty or too long, and the order is kept.

midsem/project/src/core/chunker.js, lines 72 to 81:

```js
  for (const unit of units) {
    if (current.length === 0) {
      current = unit;
    } else if (current.length + 2 + unit.length <= maxChars) {
      current += '\n\n' + unit;
    } else {
      chunks.push(current);
      current = unit;
    }
  }
```

**Step 3: summarize each part.** The parts go to the cloud service one at a time, in page order. Each prompt names the part ("This is part 2 of 4 of one long web page") and asks for three to six short sentences with no bullets.

**Step 4: combine the summaries.** If the part summaries fit together in one request, one merge request makes the final summary. If they do not, the code merges them in groups, merges the group results, and repeats until one summary is left. Every request stays within the part size.

![Chunking flow, from the full text to a list of parts](../figures/F06_chunking_flow.png)

Reading the figure: the top box normalizes the whitespace. The first question is whether the whole text fits the limit. If it does, the text is one part. If not, it is split into paragraphs. Each paragraph over the limit is split at sentence ends, and each sentence still over the limit is cut at a space or at the limit. The "yes" arrow on the left carries the pieces to the packing box, which joins them back up to the limit in order. The last box returns the parts.

![Merge tree for eight part summaries](../figures/F07_merge_tree.png)

Reading the figure: this is an illustration, not a real run. It assumes a limit of 1,000 characters and parts of 400 characters, so two parts fit in one merge request. Eight parts make four merges, then two, then one. The total is 15 requests: 8 for the parts and 7 for the merges.

### What this means in plain words

A long page is cut into pieces no bigger than the limit. Each piece is summarized. The piece summaries are combined in small groups until one summary is left. Each request stays small enough to finish in time.

## Design decisions

Table: Options considered for long pages

| Option | Decision | Reason |
|---|---|---|
| Split by paragraph, then sentence, then word | Chosen | Cuts fall at natural breaks where possible. |
| Cut the text every N characters | Rejected | Cuts fall mid-sentence, so part summaries start and stop in odd places. |
| Send the whole page in one request | Rejected | One large request must finish within 25 seconds, and the requirement list asks for splitting. |
| Merge the part summaries in small groups, repeated as needed | Chosen | Each merge request stays within the part size. |
| Merge all part summaries in one request | Rejected | On a long page the request can grow past the part size. |
| Refuse pages over 30 parts | Chosen | Protects the free quota. |

The trade-off is that a page over the limit is refused rather than partly summarized.

### What this means in plain words

The extension cuts at natural breaks, keeps each request within the part size, and refuses pages that would need too many requests.

## Worked example

The fixture page `article-long.html` has 10,532 characters of text. The tables below come from `midsem/docs/test-runs/examples.md`. The summary text in that file came from a mock server, but the page text, the splitting and the prompts are real.

Table: Parts at 3,000 characters per part (examples.md; the start and end of each part are cut short in the file)

| Part | Characters | Starts with | Ends with |
|---|---|---|---|
| 1 of 4 | 2720 | Join The Coastal Review Members Club today and receive a fre... | run low might be fined or dismissed. The Eddystone problem |
| 2 of 4 | 2580 | Building a lighthouse on land is hard enough, but the most d... | still turn on their original mechanisms. The keeper's life |
| 3 of 4 | 2656 | Behind every lamp was a keeper, and often a family. A keeper... | ar weather and is only a guide. Radio, radar and satellites |
| 4 of 4 | 2570 | For most of the twentieth century, lighthouses were joined b... | l remain on the coast long after their original job is done. |

Four parts gave five model requests (four parts and one merge).

Table: Parts at 8,000 characters per part (examples.md; text cut short in the file)

| Part | Characters | Starts with | Ends with |
|---|---|---|---|
| 1 of 2 | 7960 | Join The Coastal Review Members Club today and receive a fre... | ar weather and is only a guide. Radio, radar and satellites |
| 2 of 2 | 2570 | For most of the twentieth century, lighthouses were joined b... | l remain on the coast long after their original job is done. |

Two parts gave three model requests (two parts and one merge).

The parts add up to slightly less than the page. At 3,000 characters the parts total 10,526, which is 6 less than 10,532. At 8,000 they total 10,530, which is 2 less. Each gap is the blank line between two parts, and it is dropped when a new part starts. That makes three gaps at the smaller size and one at the larger size.

The live runs show the same pattern on real pages. The Wikipedia article on lighthouses (36,752 characters) gave five parts, six requests and 17.8 seconds. The Wikipedia article on Fresnel lenses (48,289 characters) gave seven parts, eight requests and 23 seconds (`midsem/docs/test-runs/live-measurements.md`, L04 and L05). A one-part page skips the merge. The short article in run L01 made one request in 1.7 seconds.

## The 30-part limit

A page that needs more than 30 parts is refused before any request is sent. The popup shows "This page is too long for Version 1 to summarize. Try a shorter page." At the default part size, 30 parts is about 240,000 characters.

The limit protects the free quota. The quota probe (`midsem/docs/test-runs/quota-probe.json`) sent requests until the service refused one. For the chosen model, the first quota error came after 16 successful requests, and the error named a limit of 15 requests. The probe file does not state the time window. One huge page could therefore use up the quota in a single summary. The live run L08 lowered the limit to 10 parts on a very long article, and the page was refused in 0.6 seconds, before any model call.

The limit counts parts only. The merge requests come on top of that count.

### What this means in plain words

The limit counts parts, not requests. A page at the limit still sends merge requests, so its quota cost is higher than the part count alone.

## What went wrong while building it

A review of the test results found that nothing stopped a huge page from making many requests. DEVLOG records this as a missing guard rather than a defect. The fix was the 30-part limit, which has its own test, T23.

The known weakness is in `midsem/project/src/core/merger.js`, line 46. If no two part summaries fit together, the code merges all of them in one request, even when each fits alone. The probe in run 1 (finding O1) gave three parts of 400 characters with a limit of 500, and the result was one merge request of 1,204 characters. This happens only when part summaries are large, about half the part size (roughly 4,000 characters at the default). That makes it unlikely with the default settings. The code has not been changed. A unit test named "parts too big to share a request are merged at once instead of looping forever" checks that the merge finishes instead of repeating forever.

### What this means in plain words

The limit protects the quota and is the only cap on requests per page. One merge case sends more text than intended, but it is rare with the default settings, and the code does not yet fix it.

## How it was tested

- `midsem/project/tests/unit/chunker.test.js`: 10 tests, including sentence splitting, hard cuts on long words, and the rule that no part is empty or too long.
- `midsem/project/tests/unit/merger.test.js`: 8 tests, including grouped merges and the forced single merge.
- `midsem/project/tests/unit/pipeline.test.js`: 7 tests, including a long page split, summarized part by part and merged in order.
- `midsem/project/tests/e2e/pipeline.test.js`: T01 (four parts go out in order and are merged), T11 (popup closed mid-run, every part sent once) and T23 (over the limit, refused before any model call).
- Live runs L02, L03, L04, L05, L07 and L08.

## Limitations

- The merge step sees only the part summaries, not the page text. A fact that a part summary leaves out cannot come back.
- A cut can fall in the middle of an argument. Each part is summarized alone, so the summary may not connect one part to the next. This has not been measured with readers.
- The effect of other part sizes on summary quality is [to be measured].
- The live runs are single measurements, one row per page.

## Questions this chapter answers

**Why split a page at all?**
The requirement list asks for it, and each request must finish within 25 seconds. The plan also says the cloud model does not strictly need it, so the step is kept as a tested path with an adjustable size.

**Why refuse a 31-part page instead of summarizing part of it?**
A partial summary would look complete while quietly leaving out part of the article. A clear refusal is more honest, and the limit also protects the free quota.

**What happens if one part fails?**
The run stops at that part and nothing is merged. The popup shows the message for that failure. A unit test checks that nothing is merged after a failure.

**Why did the merge need a tree?**
Merging all the part summaries in one request could exceed the part size on a long page. Merging in small groups keeps every request within the part size.
