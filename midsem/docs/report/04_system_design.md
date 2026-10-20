# System design

## The big picture

The extension is a set of small files that Chrome runs together. The popup shows the button and the summary. A service worker, the background script that Chrome runs for the extension, does the work. A small extractor script reads the page. The Gemini engine calls Google's service. Chrome's storage keeps the key and the state of the current job.

![Context: the popup, the service worker, the web page, storage and the Gemini API](../figures/F01_context.png)

Reading the figure: the web page supplies its text to the extension. Inside the box labelled "Your computer" sit the popup, where the user presses Summarize and reads the result, the service worker, which runs the job and writes progress, and Chrome's storage, which holds the key and the job record. The Gemini API sits outside the computer. A solid arrow carries the request to it, and a dashed arrow carries the answer back. Red outlines mark what V1 builds.

![Deployment: what runs on the user's Windows computer and what runs on the internet](../figures/F13_deployment.png)

Reading the figure: the left box, labelled "Your computer (Windows, Chrome)", holds the page, the extractor, the popup, the service worker and two storage areas. Local storage holds only the API key. Session storage holds the job record. The right box, labelled "The internet", holds the Gemini API. The arrow labelled "page text + prompt" is the only data that leaves the machine, and the caption adds that the key goes in a header and never in the web address.

### What this means in plain words

The popup only shows things. The service worker does the real work. The only traffic that leaves the computer is the page text and the instructions.

## The layers

The code is split into five layers, and each layer calls only the one below it.

![Layers of the extension, from the user interface down to Chrome's platform calls](../figures/F02_layers.png)

Reading the figure: five bands run from top to bottom. The UI layer holds the popup, the Options page and the summary formatter. Orchestration holds the service worker, which owns the job. The core layer holds the extractor, pipeline, errors, chunker, merger, prompts and config. The engine band holds the built Gemini engine, with a dashed box beside it for a planned local engine that belongs to the later stage. The platform band lists the Chrome calls the code uses. Arrows point down the figure.

The core layer does not know about Chrome, so its logic can be tested in plain Node.js. Only the engine knows the details of the cloud service.

### What this means in plain words

The code works like floors in a building. The top floor shows things to the user, the middle floors do the work, and the bottom floor talks to Chrome. The part that talks to Google sits on one floor, so it can be swapped without touching the rest.

## The components

The first component figure covers the files the user sees and the files that reach into the page.

![Components of the user interface and the files that reach into the tab](../figures/F03_a_components_ui.png)

Reading the figure: the popup script sends a message to the service worker, shown dashed. The service worker imports the config file and calls the tab helper, which injects the extractor script and the vendored Readability library into the page. The popup imports the summary formatter. The options script saves the key through the config file. Solid arrows are imports. Dashed arrows are messages or injections.

The second component figure covers the core files.

![Core components: the pipeline, chunker, merger, errors, prompts and the Gemini engine](../figures/F03_b_components_core.png)

Reading the figure: the pipeline file runs the whole flow. It imports the chunker, which splits the text, the merger, which joins the part summaries, and the errors file, which holds the codes and plain messages. The Gemini engine imports the errors file and the prompts file. It is the only file in the figure that makes a network call.

### What this means in plain words

Each file has one main job. A reader who opens any file can see which other files it depends on.

## One summary, step by step

The sequence figure shows the order of messages for one summary.

![Sequence from the Summarize click to the summary on screen](../figures/F04_sequence.png)

Reading the figure: seven lanes run across the top, from the user to the session storage. The user clicks Summarize, and the popup sends a start message. The service worker writes a job marked running, replies "ok", and injects the extractor, which returns the page text. The pipeline then sends one request for each part, and a merge request follows if there is more than one part. The service worker writes the job as done, storage tells the popup, and the popup shows the summary. The pipeline and engine run inside the service worker.

The steps, in order, are these.

1. The user clicks the toolbar icon and presses Summarize this page. The popup reads the id of the active tab.
2. The popup sends a START_SUMMARY message with the tab id. The service worker refuses a second start for the same tab at the same moment. If an unfinished job for the same page exists, the popup shows its progress. Otherwise the service worker writes a new job record with status "running" and replies "ok".
3. The service worker loads the key and settings from Chrome's local storage and builds the Gemini engine.
4. The extractor runs. The service worker first checks that the page is not one that Chrome forbids extensions to read, such as a settings page or the Chrome Web Store. It then injects the Readability library and the extractor. The extractor runs Readability on a copy of the page and turns the article into plain text, with blank lines between paragraphs and table cells joined by " | ". If the result is under 200 characters and the visible text is longer, the visible text is used instead. This covers pages such as dashboards.
5. Text under 200 characters stops the run with a "too little readable text" message. No request is sent.
6. The text is split into parts of at most 8,000 characters. A page that needs more than 30 parts stops with a "too long" message, again before any request.
7. One request is sent for each part. A one-part page gets a prompt for the final summary. A longer page gets a prompt for a short summary of that part. After each part, the job record is updated, so the popup can show "Summarizing part 2 of 4".
8. If there is more than one part, the part summaries are merged. They are packed into groups that fit one request, and the groups are merged until one summary remains.
9. The service worker writes the job as done, with the summary, the title and the statistics: parts, requests and elapsed time.
10. The popup receives the change, and shows the summary as numbered points with the statistics line.

### A worked example

The fixture page article-long.html, at the default part size, shows the flow. The extractor returns 10,532 characters. The chunker makes two parts, of 7,960 and 2,570 characters. The pipeline sends two part requests and one merge request. The live run on this page, recorded as L02, took 5.9 seconds. Its summary begins: "This page provides a short history of lighthouses, covering their evolution from ancient fires to modern automated navigation backups and preservation efforts." Five bullet points follow, each with a fact from the page.

### What happens when a step fails

- **Wrong key.** The first request is refused. There is no retry, and the popup shows the key message with a button to open the key box. The live run L09 stopped after 0.5 seconds. Test T04 checks that only one request is sent.
- **Service busy.** A busy reply (HTTP 429) or a server error (HTTP 5xx) is retried after 2, 4 and 8 seconds, or after the wait the service names. The popup shows, for example, "The service is busy. Trying again in 2 s (attempt 1 of 3)." Tests T05 and T06 check this.
- **Quota used up.** If the service asks for a wait longer than 25 seconds, the extension stops at once and tells the reader how long to wait. A short retry cannot help when the quota returns hours later. The unit test "a 429 with a long RetryInfo is QUOTA_EXHAUSTED at once, with no pointless retries" checks this. Browser test T24 covers it end to end, and it has no recorded run yet.
- **Model too slow.** A request with no answer within 25 seconds is stopped and reported as taking too long. Test T08 checks this.
- **Chrome stops the worker.** The next worker marks an unfinished job as interrupted, and the popup says so. Test T18 checks this.
- **Popup closed.** The job keeps running in the service worker, and reopening the popup shows it. Test T11 checks this.

### What this means in plain words

One click starts a chain of steps. Each step can stop the chain, and the reader is told why in plain words.

### The pipeline code

The pipeline file makes the checks in steps 5 and 6 and runs the loop in step 7. The first block below shows the two checks, which run before any request.

Source: midsem/project/src/core/pipeline.js, lines 33 to 42. The text check and the page-length limit, before any request is sent.

```javascript
  const text = normalizeText(page.text);
  if (text.length < settings.minTextChars) {
    throw new AppError(ERROR_CODES.TOO_LITTLE_TEXT, `${text.length} readable characters`);
  }

  const chunks = chunkText(text, settings.chunkChars);
  const total = chunks.length;
  if (settings.maxChunks && total > settings.maxChunks) {
    throw new AppError(ERROR_CODES.TOO_LONG, `${total} parts needed, the limit is ${settings.maxChunks}`);
  }
```

Reading the code: the errors are thrown, so the job stops and the service worker writes the error to the job record. The second block is the loop that sends one request for each part.

Source: midsem/project/src/core/pipeline.js, lines 47 to 58. The loop that sends one request for each part and records progress after each one.

```javascript
  for (let i = 0; i < total; i += 1) {
    throwIfAborted(signal);
    const summary = await engine.summarizeChunk(chunks[i], {
      title: page.title,
      index: i + 1,
      total,
      signal,
    });
    calls += 1;
    partials.push(summary);
    onProgress({ phase: 'summarizing', current: i + 1, total });
  }
```

Reading the code: the loop checks for cancellation before each request. It counts each call for the statistics line, and the progress callback after each part is what moves the popup's "part N of M" line forward.

### What this means in plain words

The two checks stop a bad job before it costs a request. The loop sends the parts one at a time and reports each one as it finishes.

## What leaves the computer in V1

![Data flow: what leaves the computer in V1, and the later-stage design drawn dashed](../figures/F14_data_flow.png)

Reading the figure: the left box, labelled "V1 (built): cloud engine", shows the page text feeding the extension. An arrow labelled "sent" carries the text and the prompt to the Gemini API, and a dashed arrow returns the summary. The API key is stored on the computer and read by the extension. A box labelled "Leaves the machine" lists the text, the prompt and the key. The dashed box on the right is the later-stage design, in which the page text would stay on the machine. The caption says the left side is built and tested, and the right side is planned.

On every request in V1, the following leave the computer.

- The extracted main text of the page, in parts of up to 8,000 characters. Menus and advertisements are removed first. The examples file shows that none of the noise phrases from the test article reached the model.
- The page title and a fixed instruction text, which tells the model to treat the page as material, not as instructions.
- For a merge, the part summaries that earlier requests produced. They are sent again.
- The key, in a request header, and only to Google.

The page's HTML, the page address and the job record do not leave the computer. The web address of the request names only the model.

The point to make to a tutor is plain. The page text is not private in V1. It reaches Google for each part.

### What this means in plain words

The main text of the page, the instructions and the key go to Google. Nothing else from the page is sent. The text is not kept private in this version.

## The seam where the model can be swapped

![The engine seam: one contract that the Gemini engine fills in V1, and a planned second engine](../figures/F10_engine_seam.png)

Reading the figure: a green frame at the top lists the parts that stay unchanged when a second engine is added at a later stage: extraction, the chunker, the merger, the pipeline and the user interface. Two arrows run down to a red box, the engine contract, which lists the two methods. Below it, the solid box is the Gemini engine, built in V1. The dashed box is a local engine planned for the later stage, which would offer the same two methods. The figure's point is that only the engine changes.

The contract has two methods. summarizeChunk takes one part and returns its summary. mergeSummaries takes a list of part summaries and returns one. The pipeline calls only these methods, and its header comment says it knows nothing about Chrome or any one provider. A new engine would need to offer the same two methods, and a one-part page would need the final summary format. This is a design property. The report does not claim that a second engine has been built or tested.

### What this means in plain words

The flow asks the engine for two things: a summary of one part, and a merge of several summaries. Any engine that answers those two requests can take the Gemini engine's place.

### Questions this chapter answers

**Why does the service worker run the job and not the popup?**
A popup closes as soon as the reader clicks elsewhere, which would stop a summary halfway. The service worker keeps running, and the popup reads the job record when it is opened again. Test T11 checks this.

**What would break first in this design?**
The service worker. Chrome can stop it during a job. The design writes progress, marks unfinished jobs as interrupted, and tests this in T18. The 30-part limit is also a cost control, because a very long page could use up a free-tier quota quickly.

**Where does the page text go?**
To Google, in parts of up to 8,000 characters, with the page title and the instructions. Nothing else from the page is sent.
