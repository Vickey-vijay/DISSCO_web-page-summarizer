# Limitations and next steps

## The honest limits of Version 1

These are the limits the report states plainly, so that they are known before anyone finds them.

1. **The browser scenarios use a mock service.** The 28 scenarios run against a stand-in server with fixed answers. They show how each case is handled, such as retries and error messages. They do not show how good a real summary is. Only seven pages reached the real service in the live runs.
2. **The tests use Chromium, not the client's Chrome.** The tests use Playwright's Chromium, with an extra permission for the local test server. The real toolbar path, which uses the activeTab permission, is covered only by the manual smoke test, and that test has not been recorded yet.
3. **Only one cloud provider.** Version 1 calls Google's Gemini service and no other. The engine is one file, `gemini.js`.
4. **Only one language of pages, in practice English.** The prompts and the popup text are in English. No page in another language was tested.
5. **No pages behind a login.** The extension reads what the open tab shows. No login-only page was tested, and the requirements list such pages as a risk.
6. **The free quota can run out.** The quota probe found limits of 5 to 15 requests, depending on the model, and the error text gives no period. When the quota is used up, summaries stop until it resets. The popup then opens the Key box and shows an Options button.
7. **The 30-part limit.** A page that needs more than 30 parts is refused before any request. With the default part size of 8,000 characters, that is about 240,000 characters of page text. The limit protects the free quota, but very long pages get no summary at all.
8. **The key is stored without encryption.** The extension keeps the key in its local storage in this browser, and it does not encrypt it. The key is not synced to the Google account, which is good. But anyone who can read this Windows account's Chrome profile folder could read the key.
9. **Chrome versions and Windows.** setup.bat requires Chrome 116 or newer. The records cover only Chrome 155 on the developer laptop and Chromium 156 for the tests. The setup and run scripts are Windows batch files. The client's Chrome version is [Insert client laptop Chrome version].
10. **Summary quality is not scored.** No one rated the summaries against the source text, and the speed benchmark did not compare answer quality.
11. **Page text can still steer the model.** The prompt tells the model that page text is material to summarize, not instructions. The code comment says this limits the risk but does not remove it. The popup shows replies as plain text, so markup in a reply does not run (test T14).
12. **A rare merge case.** When part summaries are very long, the merge step can send all of them in one request. With the default settings this needs summaries of about 4,000 characters or more, so it is unlikely. The log does not list it as fixed.

Source for limit 8: `midsem/project/src/ui/options.js`, line 39. The popup's Key box makes the same call.

```javascript
  await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: key });
```

**What this means in plain words.** Version 1 works for the cases its tests cover. Its evidence comes from a stand-in service and a handful of live pages. The client should be told which parts are proven and which are not.

## What Version 2 would add

Version 2 is not built. It is the plan for the final semester.

Version 2 keeps the same popup and the same way of reading a page. The change is where the summary comes from. In Version 2, the summarizing model runs inside the browser on the user's own computer. The model downloads once, on first use, with a progress bar, and the browser keeps it for later use. No API key is needed. The page text never leaves the computer, and summaries work with no internet connection once the download is complete.

Everything else stays the same. The extension still reads the main text, splits long text into parts, joins the part summaries, and shows progress and error messages. The new work is the download, a check that the computer can run the model, the stored copy, and a local engine. The local engine gives the same two kinds of answer that the cloud engine gives now.

The requirements expect a small local model to write less good summaries than a large cloud model. The first download is large, and the browser and computer must meet certain requirements. The size of the gap in speed, quality and memory is [to be measured] in the final work. One design question is still open: whether the cloud engine stays selectable in Version 2, or whether Version 2 runs only on the computer.

### The plan for the remaining weeks

![Plan chart: eight pieces of work across 14 weeks, with Version 1 in weeks 1 to 7 and Version 2 in weeks 8 to 14](../figures/F16_plan_chart.png)

**Reading the figure:** The chart has one bar for each piece of work, laid out across 14 weeks. The red bars are Version 1, from week 1 to week 7, and a dashed line marks the midsem at the end of week 7. The grey bars are Version 2, from week 8 to week 14. The local model study takes weeks 8 and 9, and the in-browser engine takes weeks 10 and 11. The cloud-versus-local comparison takes week 12, and final testing and submission take weeks 13 and 14. This is the plan, not a record of progress.

### What stays the same

![What is reused, replaced and new in Version 2, in three columns](../figures/F19_reuse_v1_v2.png)

**Reading the figure:** The figure has three columns. The green column lists five parts that are reused unchanged: the extraction, the chunker and merger, the pipeline and its errors, the service worker, and the popup with its summary formatting. The orange column lists what is replaced: the cloud engine, the API key form (not needed in Version 2), and the cloud settings, where the model and key are set. A prompts box sits in the same column with a dashed border, marked as possibly needing tuning. The grey dashed column lists what is new: the model download with its progress bar, a check that the browser and memory can run the model, the browser cache, and a local engine with the same two methods. The footer says that the engine contract is the only seam, the one place where the two versions meet.

**What this means in plain words.** Most of the work carries over. Only the part that writes the summary is swapped for a version that runs on the user's computer.

## Questions this chapter answers

**What would break first in a live demonstration?** The free quota would. Each free key allows a limited number of requests in a period, and a demonstration that summarizes many pages in a row can use them up. The popup then shows the used-up message and waits for the service to reset the quota. The probe results in chapter 12 show the limits.

**Why is the key stored without encryption?** The extension has to read the key each time it makes a request, and Version 1 has no server to hold it. The key stays in this browser and is not synced to the Google account. Stronger storage is not part of Version 1, and the report states this as a limit.

**Is Version 2 built?** No. It is planned for the final semester, in weeks 8 to 14 of the plan.

**What does Version 2 reuse?** It reuses the extraction, splitting, merging, progress display, error messages and popup. Only the engine that writes the summary changes.

**What has not been tested yet?** The manual smoke test has not been recorded on the client's laptop. The quality of the summaries has not been scored. Other Chrome versions and pages behind a login have not been tested.
