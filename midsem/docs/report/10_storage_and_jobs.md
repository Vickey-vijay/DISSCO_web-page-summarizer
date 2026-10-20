# Storage and jobs

## What this part does and why it exists

A summary can take a while. The reader may close the popup or change tabs while it runs. This part explains where the extension keeps its data, how long each kind lasts, and how a summary keeps running after the popup closes.

The service worker (the background script Chrome runs for the extension) owns the job. It writes the job's progress into a record in browser storage. The popup only reads that record. Because the popup keeps no state of its own, closing it cannot lose the summary.

## Where data is kept

The extension uses two storage areas. Both belong to the extension, not to the page.

![Storage model: local storage for the key, session storage for the job record](../figures/F11_storage_model.png)

Reading the figure: the left box is `chrome.storage.local`. It holds the saved key (`apiKey`) and a box of test-only settings that the reader never sees. The right box is `chrome.storage.session`, which holds one job record per tab, keyed `job:<tabId>`. The service worker writes and deletes these records, and the popup reads them. The caption says local storage survives restarts and session storage is cleared when the browser closes. Two details differ from the code. The figure says the Options page saves the key, but the popup's Key box also saves it (`popup.js`). The figure also leaves out `jobId`, which the code stores in every record.

Table: What is stored, where, and for how long

| Data | Storage area | How long it lasts |
|---|---|---|
| The Gemini key | `chrome.storage.local` | Until the reader removes it. Survives browser restarts. |
| The job record for a tab | `chrome.storage.session` | Until the tab closes, the browser closes, or a new summary starts on that tab. |
| Test-only settings | `chrome.storage.local` | Written by the tests, never by the reader. |

The key is stored without encryption on this computer. It is sent only to the Gemini service.

### What this means in plain words

The key lasts until it is removed. A summary lasts only while the browser session and the tab last. Nothing is kept on a server.

## The job record

`startJob` in `midsem/project/src/background/service-worker.js` creates the record when a summary starts. Each later step adds to it.

Table: Main fields of the job record

| Field | Set when | Meaning |
|---|---|---|
| `jobId` | At start | A random id for this job (`crypto.randomUUID()`). |
| `status`, `phase` | At start, then at each step | `running`, `done` or `error`, and the step name. |
| `current`, `total` | Per part | Parts finished, and parts in the page. |
| `parts` | At each merge step | Summaries combined in that step. |
| `notice` | On a retry | The retry notice, or `null`. |
| `summary`, `stats` | When done | The final summary text, and the run's numbers. |
| `error` | On failure | An object with `code`, `message` and `detail`. |
| `url`, `title` | At start | The tab's address and title. The title is replaced when done. |
| `pageUrl` | When done | The address the page text came from. |
| `startedAt`, `updatedAt` | At start; `updatedAt` on every write | Start time, and time of the last write. |

Every write goes through one function that checks the job id first:

midsem/project/src/background/service-worker.js, lines 34 to 37:

```js
      if (closedTabs.has(tabId)) return;
      const current = (await chrome.storage.session.get(key))[key];
      if (!current || current.jobId !== jobId) return; // replaced by a newer job, or removed
      await chrome.storage.session.set({ [key]: { ...current, ...patch, updatedAt: Date.now() } });
```

A write is applied only if the stored record still belongs to this job. This stops an old job from overwriting a newer one. The first line handles closed tabs.

![Job states from idle to done, error or interrupted](../figures/F12_job_states.png)

Reading the figure: a job starts from idle, which means no record for the tab. It moves through extracting, summarizing and merging, then ends as done or as an error. The stale box is a popup view. After three minutes with no update, the popup shows the job as interrupted. An arrow runs from that box back to the running box. In the code, the stale view writes nothing, so the stored record stays "running" until the worker restarts or a new summary replaces it.

### What this means in plain words

Every step updates one record for the tab. The job-id check makes sure only the current job can change it. The record ends as done, as an error, or as interrupted.

## Interrupted jobs and the three-minute rule

Chrome can stop an idle service worker. If that happens during a summary, the record still says "running", but nothing is working on it. Two checks deal with this.

When the worker starts, `sweepOrphans` looks for records that are still running and were last updated before the worker started. It marks each one as an error with the code INTERRUPTED.

The three-minute rule covers the rest. A running record with no update for three minutes counts as dead. The constant `STALE_MS` is three minutes in both the service worker and the popup. A new summary on the same page is refused while the record is alive. On a different page, the old job is replaced. The popup re-checks every five seconds, so an open popup does not keep showing a dead job as busy.

Why three minutes? Working from the code's own limits, each request attempt has a 25-second timeout, and a rate-limit wait is capped at 25 seconds. A notice is written before each wait, and a progress line after each part. The gap between writes should therefore stay near 50 seconds at most. Three minutes is a wide margin. One gap in this reasoning is a server-given wait on a 500-level error, which has no cap. A wait that long could look like a dead job.

Test T18 stops the worker during a job, wakes it, and checks that the record becomes INTERRUPTED and the popup says so. Test T20 stops the worker while the popup is open and checks that the popup stops showing progress after the limit.

### What this means in plain words

A stopped worker leaves its job marked interrupted. A job silent for three minutes counts as dead, and the reader can press Summarize again.

## Fixes for bugs B1 and B4

Bugs B1 and B4 concerned the job record. Both were found in run 1 and fixed, and run 2 passed their tests. Bug B2, the stale popup, is covered by the three-minute rule above.

Bug B1: pressing Summarize on a new page while the old summary was still running did nothing, and the popup stayed blank. The service worker refused the new job, and the popup ignored the refusal. The fix gives each job an id. If the tab has moved to another page, the old job is aborted and replaced, and its later writes are dropped. The popup now shows the running job or an error. Test T19 checks this.

Bug B4: after a tab was closed during a summary, a record holding the full summary stayed in storage. The close handler deleted the record, but the job kept running and wrote it back. The fix remembers closed tabs, aborts their job, and applies a write only when the job id still matches. Test T22 checks this.

### What this means in plain words

A replaced job or a closed tab can no longer write to the tab's record. The popup shows either the current job or a clear error.

## Why a finished summary is still shown

The record stays in session storage after the job is done. When the reader reopens the popup, the popup reads the record and shows the summary again, with no new request. The record is removed when the tab closes, or replaced when a new summary starts. Test T16 checks that a second popup shows the finished summary with no new model call. If the tab has moved to another page, the popup compares addresses and hides the old summary (test T17).

### What this means in plain words

The finished summary waits in the tab's record. Reopening the popup shows it again, and closing the tab or starting a new summary clears it.

## Failure cases

- **Popup closed mid-run.** The job keeps running. Test T11 checks that a reopened popup shows the progress or the result.
- **Tab closed mid-run.** The job is aborted and its record removed (T22).
- **Worker stopped mid-run.** The record becomes INTERRUPTED at the next worker start (T18).
- **Browser closed mid-run.** Session storage is cleared, so the job is lost. The key is kept.
- **Two presses at the same moment, for example from two popups.** A per-tab lock refuses the second start. The lock was added after a review. No test is recorded for it.

## What went wrong while building it

The popup's check for a dead job ran only when the popup opened or storage changed. A dead worker writes nothing, so the check never ran. The popup now re-checks every five seconds (DEVLOG, bug B2). The lesson recorded is that a timeout checked only on events never fires when the thing it guards has stopped sending events.

A cleanup handler could not win against a job that kept running. The fix stopped the work as well as the cleanup (DEVLOG, bug B4).

## How it was tested

- `midsem/project/tests/e2e/pipeline.test.js`: T11, T16, T17, T18, T19, T20 and T22. T19, T20 and T22 failed in run 1 and passed in run 2.
- The service worker has no unit test file. Its logic depends on Chrome's storage and tab APIs, so it is tested only through the browser scenarios.

## Limitations

- A summary running when the browser closes is lost, because session storage is cleared.
- The key is stored unencrypted on this computer.
- The three-minute rule can wrongly mark a healthy job as dead when a server asks for a very long wait on a 500-level error.
- Only one job runs per tab. A second press on the same page shows the current job. A press on a new page replaces it.
- The "Cancelled." message is never shown. A cancelled job stops without writing a message.

## Questions this chapter answers

**Why are there two storage areas?**
The key must last across restarts, so it goes in local storage. The job record is temporary, so it goes in session storage, which is cleared when the browser closes.

**What happens if the browser closes mid-summary?**
The job record is cleared, so the summary is lost. The reader must press Summarize again. The key is kept.

**Why three minutes?**
Each request attempt has a 25-second timeout, and a rate-limit wait is capped at 25 seconds. A healthy job should therefore write progress at most about 50 seconds apart. Three minutes is a wide margin above that.

**Why does a finished summary still show after reopening the popup?**
The finished record stays in session storage until the tab closes, the browser closes, or a new summary replaces it. The popup reads the record when it opens.
