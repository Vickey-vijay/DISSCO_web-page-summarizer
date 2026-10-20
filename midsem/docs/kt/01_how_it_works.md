# How the extension works, step by step

This chapter follows one summary from the moment you press the button to the moment the text appears on screen. Each step names the file that does the work, so you can find the code when a tutor asks. Read the chapter once slowly, then say the walkthrough out loud without notes.

## The four parts

The extension has four parts that work together.

- **The popup** is the small window you see when you click the toolbar icon. It shows the button, the progress and the summary.
- **The service worker** is a background script that Chrome runs for the extension. It keeps running when the popup is closed, so it owns the job.
- **The page reader** is a small script that the service worker places into the page you are reading. It copies the main text of the page.
- **The pipeline** is the code that cuts the text into parts, sends the parts to the cloud service, and joins the answers into one summary.

The cloud service is Google's Gemini service. It runs on Google's computers, not on yours. It reads the text you send and writes the summary.

![The context of the system: your computer, the web page and the Gemini service](../figures/F01_context.png)

Reading the figure: the web page sits outside the extension. The extension, running on your computer, reads the page's text. The page text and your key leave the computer for Gemini, and the summary comes back. The key and the job record are kept in Chrome's storage on your computer.

![Layers of the code, from the screen at the top to Chrome's own features at the bottom](../figures/F02_layers.png)

Reading the figure: read it from the top. The top layer is the screen. The service worker runs the job. Most of the core layer is plain code that does not use Chrome or Google: the chunker, the merger, the pipeline, the prompts and the errors. The Gemini engine is the only part that calls the cloud. The dashed box is the Version 2 engine, which is planned and not built. The bottom layer is the set of Chrome features the code uses.

## Before the first summary

You save your key once. You can paste it in the popup's Key box or on the Options page. The key is saved in `chrome.storage.local`, which is storage in this browser only. It is not synced to your Google account. Saving the key does not contact Google. The key is checked only when you press Summarize.

## One summary, step by step

1. **You open the popup.** You open an article and click the Page Summarizer icon. Chrome opens the popup (`src/ui/popup.html` and `src/ui/popup.js`). The popup asks Chrome for the active tab and shows its title. If no key is saved, the Key box opens and says "Paste your Gemini key to begin."

2. **You press the button.** The popup turns the button off and sends a message to the service worker. A message is a short note that one part of the extension sends to another. The message says "START_SUMMARY" and gives the tab number. The popup does not call Gemini itself.

3. **The service worker starts a job.** The function `startJob` in `src/background/service-worker.js` runs. It checks that a job for this tab is not already running on this page. It creates a job id and writes a job record called `job:<tab id>` into `chrome.storage.session`. The record says the job is "running" and the phase is "extracting". Then it replies "ok" to the popup. Session storage is cleared when the browser closes.

4. **The job reads the settings.** The job loads the model name, the limits and the key from `chrome.storage.local` (`src/core/config.js`). If there is no key, the job stops with the NO_KEY error at this point. The popup may show "Reading the page..." for a moment before the error appears, because the record was already written in step 3.

5. **The page reader copies the text.** The function `extractFromTab` in `src/background/extract-tab.js` checks the tab's address first. Chrome's own pages, the Chrome Web Store, local files and a few other address types are refused with RESTRICTED_PAGE. For other pages, the service worker places two scripts into the page: Readability, a library that finds the main article, and `src/content/extract.js`. The second script works on a copy of the page, so the page itself is not changed. It turns the copy into plain text with a blank line between blocks. If the article text is shorter than 200 characters, it uses the visible text of the whole page, but only when that text is longer. The reader returns the title, the address, the text and the method it used.

6. **The pipeline checks the length and cuts the text.** `runPipeline` in `src/core/pipeline.js` first checks the length. If the text is under 200 characters, the job stops with TOO_LITTLE_TEXT and no request is sent. Then `chunkText` in `src/core/chunker.js` cuts the text into parts of at most 8,000 characters. If the page needs more than 30 parts, the job stops with TOO_LONG before any request is sent.

7. **Each part is sent, one after another.** For a page that fits in one part, the request asks for the final summary straight away. For a longer page, each request asks for a short summary of one part, and the instructions say which part it is ("part 2 of 5"). Each finished part updates the job record, and the popup shows "Summarizing part 2 of 5...".

8. **The Gemini engine makes each request.** The code in `src/engines/gemini.js` sends the text to Google with the key in a header. It waits up to 25 seconds for each answer. If Google says it is busy (HTTP 429) or has a server problem (HTTP 500, 502, 503 or 504), it waits and tries again, up to three more times. The waits are 2, 4 and 8 seconds, unless Google sends its own wait time. The popup shows each wait as "The service is busy. Trying again in N s". If Google says the quota is used up for hours, the job stops at once instead of waiting.

9. **The parts are merged.** If there was more than one part, `mergeAll` in `src/core/merger.js` joins the part summaries. It packs neighbouring summaries into groups that fit in 8,000 characters, sends each group to Gemini with the merge instructions, and repeats until one summary is left. In the live run of the Wikipedia Lighthouse article, the text was cut into 5 parts. The run made 6 requests and needed one merge level.

10. **The job is marked done.** The service worker writes the summary, the title, the address and the stats into the job record. The stats are the number of parts, the number of requests, the number of merge levels, the extraction method, the model name and the time taken. The page text itself is not written to storage.

11. **The popup shows the result.** The popup listens for changes to the job record through `chrome.storage.onChanged`. When the job is done, the popup turns the summary into paragraphs and bullet points with `src/ui/summary-format.js`. It writes the text with `textContent`, so the summary is shown as plain text and never run as HTML. A line under the summary reads, for example, "4 parts · 5 requests · 7.2 s".

12. **You close the popup.** Nothing stops. The service worker keeps the job going. When you open the popup again on the same page, it reads the same job record and shows either the progress or the finished summary. Tests T11 and T16 check this.

![The message order from the button press to the summary on screen](../figures/F04_sequence.png)

Reading the figure: the columns are the parts of the system, and time runs down the page. The popup sends the start message. The service worker first writes "job: running" to storage, and then it answers the popup. The service worker then asks the page reader for the text. Each part goes to Gemini, and the merge step follows only when there is more than one part. The last message is the storage event that tells the popup to show the summary. The dashed arrows are replies and events. The solid arrows are requests.

## When something fails

Every failure becomes an error with a code. The file `src/core/errors.js` holds the codes and the plain messages. The code and the message go into the job record with status "error". The technical detail, such as the HTTP status number, goes only to the browser console. The popup shows the message. For key problems, the popup also opens the Key box and shows an "Open the Options page" button.

Three other events change the flow.

- **You move the tab to another page while a job runs.** The old job is stopped, and any later writes from it are dropped. The new page can be summarized at once.
- **You close the tab.** The service worker stops the job and removes the record for that tab.
- **Chrome stops the service worker in the middle of a job.** The job record still says "running". When the worker starts again, it marks that old job as INTERRUPTED, and the popup asks you to press Summarize again.

## What this means in plain words

The popup is only a window. The service worker does the real work and keeps notes in storage, so the popup can close and come back without losing the job. The page reader copies the text, the pipeline cuts it and asks Gemini for a summary of each part, and the merge step joins them. Every failure ends with a short message and a code, and the technical detail stays in the console.
