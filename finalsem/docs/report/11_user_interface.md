# User interface

The popup is the only screen the reader sees. It opens from the toolbar, is 380 pixels wide, and holds one button, a line about the model, and the result. It contains no logic for summarizing. It asks the service worker to start a job, reads the job record from Chrome's session storage, and draws what it finds (`src/ui/popup.js`). This chapter lists what the popup shows in each state, explains why nothing opens in a new tab, and describes the look that `src/ui/ui.css` gives it. Where the code changed after a review, the chapter describes the code as it is now. The earlier behaviour is kept only as "what was seen before the fix".

The popup holds eight parts, in this order from top to bottom (`src/ui/popup.html`). Each one is shown or hidden with its `hidden` attribute.

Table: The parts of the popup

| Element | When it is visible | What it says |
|---|---|---|
| Header | Always | "Page Summarizer", and "Version 2 · on this computer" |
| Page title | When the tab has a title | The page title, in one truncated line |
| Button | Always | "Download model and summarize", "Summarize this page", or disabled while a job runs |
| Model line | Always | The model name, whether it is stored, and its size, or a blocking message |
| Graphics note | Only on integrated graphics | The note about the built-in Intel chip |
| Progress block | While a job runs | A label and a thin bar |
| Error block | After a failure, or for an interrupted job | The plain message for the error code, and for two vague codes a technical detail line |
| Result block | After a finished job | A notice when the small model wrote the summary, then the summary and a stats line |

**What this means in plain words.** The reader sees one button and one line about the model. Below them appears whichever of progress, error or result applies now.

## What the popup shows, state by state

### Opening the popup

The popup first shows "Checking this computer..." in the model line. Then it asks the service worker for the model state, which gives the model name, whether the model is stored in the browser, and the size of the download. The button reads "Summarize this page" when the model is stored, and "Download model and summarize" when it is not. Opening the popup also starts the hidden page that holds the model, so that the graphics card can be checked. It does not load the model.

![Pretend model: the first-use state before any download, with the size the pretend model reports (664 MB, not the real 695 MB)](../screenshots/ui-01-not-downloaded.png)

The real model reports "about 695 MB" for the same download. The pretend model reports 664 MB, which is why its picture shows a different size.

![Pretend model: the ready state on the dashboard fixture page, with the button Summarize this page](../screenshots/ui-08-ready-to-use.png)

### Progress labels and the bar

Each phase has its own label. The bar is measured only where the label has a percentage or a part count. Elsewhere it is indeterminate, which the stylesheet draws as a red sweep moving along a grey track.

![The job phases in order, with the downloading step drawn dashed and skipped by a stored model](../figures/V06_job_phases.png)

Reading the figure: the phases run from top to bottom in the order the popup shows them. The downloading box is dashed and labelled "first time only", and an arrow leaves checking straight for loading, which is the path a stored model takes. "Combining" is drawn grey, because it runs only for a page with more than one part. The footnote gives the downloading line that one offline run showed as about one second. The DEVLOG row gives 0.8 seconds. The table below gives the wording and the bar for each phase.

Table: Progress labels and the bar, from `progressLabel` in `src/ui/popup.js`

| Phase | Label the reader sees | Bar |
|---|---|---|
| Extracting | Reading the page... | Indeterminate |
| Checking | Checking your graphics card... | Indeterminate |
| Downloading | Downloading the model (first time only): N% | Measured, 0 to 100 |
| Loading | Loading the model into the graphics card: N% | Measured, 0 to 100 |
| Warming up | Warming up the model (first time can take about 30 seconds)... | Indeterminate |
| Summarizing, one part | Summarizing... | Measured, but empty until the part is done |
| Summarizing, several parts | Summarizing part k of n..., where k is the part in progress | Measured by finished parts |
| Merging | Combining N summaries... | Indeterminate |

The bar for a single-part page stays empty for the whole answer, because its count moves only when the answer is complete. For several parts, the label names the part in progress, but the bar counts the parts already finished.

### First use: download, load and warm up

The first use goes through the download. The button is grey and cannot be pressed while the download runs. The real screenshot shows 32 percent, and the pretend one shows 25 percent.

![Real model: the download at 32 percent on the NVIDIA card, from the run recorded as v2-local-nvidia (done while other programs were running)](../screenshots/v2-nvidia-short-downloading.png)

![Pretend model: the download at 25 percent, with the button disabled](../screenshots/ui-02-downloading.png)

Next comes the label "Loading the model into the graphics card", which moves in steps as the weights are placed on the card. The pretend model shows 45 percent. The job record for that picture was written by hand. The pretend model never sends the loading message, so the test script writes the record itself, in the same shape the service worker writes it.

![Pretend model, with the job record written by hand: the loading label at 45 percent. The pretend model never sends this message.](../screenshots/ui-03-loading.png)

The warm-up follows. The hidden page sends one short request, so that the graphics programs are compiled before the first part. The label says "about 30 seconds", and the bar is indeterminate.

![Pretend model: the warm-up label with an indeterminate bar](../screenshots/ui-04-warming.png)

![Real model: the warm-up on the NVIDIA card, from the run recorded as v2-local-nvidia (done while other programs were running)](../screenshots/v2-nvidia-short-warming.png)

![Real model: the warm-up on the Intel chip with the small model, clean Intel run. The warm-up takes about 40 seconds there.](../screenshots/v2-intel-short-warming.png)

The warm-up in the clean offline run lasted about half a second, against about 30 seconds in the clean first attempt on the same card. The repeat after the label fix lasted about 0.4 seconds, and the repository does not explain the difference. The warm-up runs each time the model is loaded into a new hidden page, which happens after the five-minute idle close. The warm-up after an idle close has not been measured: [to be measured].

A stored model still goes through loading, and the popup now says so. Before the fix, the clean offline run showed "Downloading the model (first time only): 0%" for about 0.8 seconds during the load of a model that was already stored (DEVLOG, 21 October, "V2 popup wording"). The cause was `mapInitProgress`, which treated any progress text containing "fetch" as a download. WebLLM also says "Start to fetch params" when it loads from the browser's own storage. The code now checks `hasModelInCache` before loading and passes the result to `mapInitProgress`. A stored model is always "loading". The repeat of the offline run after the fix shows no such line.

![Real model, after the label fix: warm-up with a stored model. The model line says Downloaded, the button is disabled, and no Downloading line appears.](../screenshots/v2-nvidia-offline-short-warming-after-label-fix.png)

### Summarizing and merging

With several parts, the popup names the part in progress and moves the bar forward after each finished part.

![Pretend model: part 2 of 4 being summarized, with the bar at one of four parts](../screenshots/ui-05-summarizing-parts.png)

The merge follows, with the label "Combining N summaries..." and an indeterminate bar. No real-model screenshot of either state is in the repository.

![Pretend model: four summaries being combined](../screenshots/ui-06-merging.png)

### The result

The result block holds the summary and a stats line, for example "1 part · 1 request · 17.5 s · Llama 3.2 1B". The stats count requests, which are the part answers plus any merge. The field behind the number is still named `apiCalls`, a name kept from Version 1.

The summary sits in a box 360 pixels high that scrolls, so a long list needs scrolling to reach its last points. The pretend result shows the numbered points and the stats line.

![Pretend model: the finished result, with the fixed answer the pretend model gives, numbered points and the stats line](../screenshots/ui-07-result.png)

When the small model wrote the summary because the main model failed to load, a notice sits in ochre above the summary: "The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed." The popup builds that text from the job's stats, so the notice field of the job record stays empty. No notice appears when the small model was chosen for integrated graphics, because that case has its own note. Before the fix, nothing on screen said that the small model had taken over.

![Pretend model, re-shot after the fix: the main model ran out of memory, so SmolLM2 wrote the summary. The notice in ochre sits above it.](../screenshots/ui-12-fallback-after-out-of-memory.png)

![Real model, after the label fix: the result for the short article. The model line says Downloaded, and the stats show 17.5 seconds for the main model.](../screenshots/v2-nvidia-offline-short-popup-after-label-fix.png)

![Real model: the result for the two-part article, clean offline run, recorded before the label fix](../screenshots/v2-nvidia-offline-long-popup.png)

After every job ends, success or error, the popup asks for the model state once more (`refreshModelLineOnce`), so the model line is current. Before this change, the line was refreshed only after a successful job. Two first-use results still show the old line, because they were recorded before the refresh was added. `v2-nvidia-short-popup.png` shows "Not downloaded yet" under a finished summary. `v2-intel-short-popup.png` shows the same, and it also shows the page markers that are now removed.

![Real model, recorded before the fix: the model line still says Not downloaded yet, and the page markers show as text. Both are fixed in the code now.](../screenshots/v2-intel-short-popup.png)

The model line is still not refreshed while a download or a warm-up is running. This is an open limit.

![Real model: the Intel result for the two-part article, where the model line says Downloaded (clean Intel run)](../screenshots/v2-intel-long-popup.png)

### The integrated graphics note

On a computer whose graphics chip is built into the processor, the model line names the small model, and a note appears under it: "Graphics: Intel (built into the processor). Answers can be slow. A separate graphics card is much faster." The note has an ochre bar, which is a different colour from the red progress and error bars. It appears before the download.

![Pretend model: the Intel note under the model line (the pretend model reports 300 MB for the small model)](../screenshots/ui-09-intel-note.png)

![Real model: the Intel note during the first download of the small model, about 204 MB (clean Intel run)](../screenshots/v2-intel-short-downloading.png)

The vendor name is capitalized because WebGPU reports it in lower case. A browser test caught the lower-case name, and `vendorName()` now maps it.

### Errors and the blocked state

Errors appear in the error block below the progress area. For a computer without WebGPU or without 16-bit shader support, the message appears in the model line and the button is disabled. Most errors have a screenshot in the chapter on errors and fallbacks.

For the two vague codes, SERVICE_ERROR and MODEL_LOAD_FAILED, the error block adds a line under the message: "Technical detail:" followed by the first 240 characters of the error detail. The element is `#error-detail`, and the `.detail` rule in `ui.css` sets it as small grey monospace text. Before 24 October the popup showed only the message, so the owner's real Chrome run of the Wikipedia page gave no reason on screen. No screenshot of this line is in the repository, and the picture is described from the code. Scenario V27 forces the case with the pretend-model mode `crash`, which fails with the detail "mock: something unexpected happened", and checks that the line appears under the message.

After a memory failure that switched to the small model, the model line names the model the extension now uses. The re-shot `ui-13` shows the case where that small model also ran out of memory. The model line reads "SmolLM2 360M. Not downloaded yet", the error block gives the memory message, and the button is enabled again. Before the fix, the line still named the main model after both had failed.

![Pretend model, re-shot after the fix: every model ran out of memory. The model line names the small model, which is not downloaded, and the error block gives the memory message.](../screenshots/ui-13-out-of-memory-all.png)

**What this means in plain words.** Each state has one place on the popup. A label that moves tells the reader the job is alive, a notice explains a switch to the smaller model, and a message in the error block says what stopped the job.

## Why everything stays in the popup

The popup is the only window. A summary does not open a tab, and Version 2 has no options page: its manifest has no `options_page` entry, and the key box from Version 1 is gone (`finalsem/docs/DECISIONS.md`, D1). This follows the owner's instruction recorded in the Version 1 DEVLOG of 20 October 2026, that the extension should open in a popup, not in a new tab. Scenario V24 checks it, and confirms that a normal summary adds only the popup window.

**What this means in plain words.** The reader never leaves the page to use the tool, and no extra tab appears in the browser.

## Why the popup can be closed and reopened mid-job

The job runs in the service worker, and the popup only reads its record. The record sits under the key `job:<tabId>` in Chrome's session storage. Every change to that record is written by the worker, and the popup listens for those changes and redraws. A popup opened in the middle of a job therefore shows the same progress as the one that was open before.

`src/background/service-worker.js`

```js
function writeJob(tabId, jobId, patch) {
  if (closedTabs.has(tabId)) return Promise.resolve();
  const key = jobKey(tabId);
  const prev = queues.get(tabId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      if (closedTabs.has(tabId)) return;
      const current = (await chrome.storage.session.get(key))[key];
      if (!current || current.jobId !== jobId) return; // replaced by a newer job, or removed
      await chrome.storage.session.set({ [key]: { ...current, ...patch, updatedAt: Date.now() } });
      // The tab may have closed while this write was in flight: do not leave the record behind.
      if (closedTabs.has(tabId)) await chrome.storage.session.remove(key);
    });
  queues.set(tabId, next);
  return next;
}
```

The popup also redraws every five seconds. Without that, a job whose worker had died would keep looking busy, because a dead worker writes nothing. The Version 1 DEVLOG records that fault. Scenario V15 checks that a reopened popup shows the same job and then the summary. A job that has not been updated for five minutes is shown as interrupted. Version 1 used three minutes, which suited short cloud calls, but a slow local answer needed more room. The answer timeout is now ten minutes, longer than this five-minute limit, so one answer can outlast it. The keep-alive message the hidden page sends every ten seconds while it works also refreshes the record of every running job, so a working job is not shown as interrupted.

**What this means in plain words.** The summary belongs to the browser, not to the popup. Closing the popup does not stop it, and reopening the popup shows where it has got to.

## The look: a printed page

The stylesheet sets a small palette on `:root`, and every colour in the popup comes from it.

`src/ui/ui.css`

```css
:root {
  --paper: #fbf8f1;
  --ink: #1c1b1a;
  --muted: #6b665c;
  --rule: #d9d2c3;
  --accent: #b4391f;
  --ochre: #8a5a00;
  --serif: Georgia, "Times New Roman", serif;
  --sans: "Segoe UI", system-ui, sans-serif;
  --mono: Consolas, "Courier New", monospace;
}
```

The paper is a warm off-white and the ink is almost black. The one red accent, a brick colour, marks the hover state of the button, the progress bar, the error bar and the numbers of the points. The ochre marks the integrated graphics note and the memory-switch notice. Sans-serif text is used for the controls and the model line, a serif for the summary, and a monospace for the page title, the progress labels and the stats line. The font stacks start with Windows fonts (Segoe UI and Consolas), with fallbacks.

The spacing is plain. The header has a 2-pixel ink rule underneath. The summary's points are divided by 1-pixel hairlines in the rule colour. The button is full width with a 2-pixel corner. The stylesheet has no shadows, no icons, no images and no dark-mode rules. Its only gradient is the sweep of the indeterminate bar. The rules for the Version 1 key box and Options page have been removed. Three small rules, `.outline`, `.textbtn` and `.fine`, remain in the file, but the popup never uses them. One rule was added for the notice, which gets a 14-pixel gap below it.

The look was chosen after the owner said that the first design looked as if an AI had made it, as `midsem/docs/report/05_technology_choices.md` records. Version 2 keeps the printed-page style.

**What this means in plain words.** The popup uses a few colours, two kinds of type and thin rules. It looks like a printed sheet, and it has no decoration to get in the way of the text.

## Accessibility facts from the markup

The page declares its language (`lang="en"`) and has a viewport tag. The model line and the progress block are marked `aria-live="polite"`, so a change is announced without interrupting. The error block has `role="alert"`. The progress bar is the browser's own `progress` element, not a drawn box. The buttons keep the browser's default focus outline, because the stylesheet does not remove it. The repository has no test of colour contrast or of a screen reader: [to be measured].

**What this means in plain words.** The markup gives the basic signals that assistive software needs. Whether they work with real screen readers has not been checked.

## What went wrong and what is left

Several problems were found in the screenshots and the timelines. Four are fixed. The "Downloading" line showed for a stored model, and the fix is described above. The model line stayed on the main model after both models failed, and the popup now refreshes it after every job. A switch to the small model was silent, and a notice now says so. The vendor name appeared in lower case, which a browser test caught, and the popup now capitalizes it. The DEVLOG rows dated 21 October 2026 tell these stories.

One problem is still open. The model line is not refreshed while a download or warm-up is running. The warm-up label also says "first time" each time a new hidden page loads the model, which is accurate for the first use only.

## Limitations

The popup has a fixed width, and its summary is a scrolling box, so long answers need scrolling. There is no dark mode. The model line can be out of date while a job is running. Colour contrast and screen-reader behaviour have not been measured. The screenshots come from one laptop, not from the client's computer, and the pictures of the first use were recorded before some fixes.

### Questions this chapter answers

**What does the reader see first?**
The reader sees one button and a line about the model. The button says "Download model and summarize" until the model is stored, and "Summarize this page" after that. A progress block, an error block or a result block appears below, depending on the job.

**Why does nothing open in a new tab?**
The tool was built to live in the popup. Version 2 has no options page, and the key box from Version 1 is gone. Scenario V24 checks that a normal summary opens only the popup window.

**Can the reader close the popup during a summary?**
Yes. The job runs in the service worker and writes its progress to session storage. Reopening the popup reads the same record and shows the same progress.

**How does the reader know the small model wrote the summary?**
A notice in ochre sits above the summary when the main model failed to load with a memory error or a load failure. It does not appear for the integrated-graphics switch, which has its own note.

**What does the popup still show poorly?**
The model line is not refreshed while a download or warm-up is running, and the warm-up label says "first time" on each new hidden page. The summary box also hides its last points until the reader scrolls.
