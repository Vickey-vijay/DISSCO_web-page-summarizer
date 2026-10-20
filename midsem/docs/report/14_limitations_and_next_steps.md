# Limitations and next steps

## The honest limits of Version 1

These limits are stated plainly, so they are known before anyone finds them.

1. **Mock-tested scenarios.** The 28 browser scenarios run against a stand-in service with fixed answers. They show how each case is handled, but not how good a real summary is. Only seven pages reached the real service in the live runs.
2. **Chromium, not the client's Chrome.** The tests use Playwright's Chromium with an extra permission for the test server. The real toolbar path, which uses the activeTab permission, is covered only by the manual smoke test, and that test is not yet recorded.
3. **One cloud provider.** Version 1 calls Google's Gemini service only, through one engine file, `gemini.js`.
4. **One language of pages, in practice English.** The prompts and popup text are in English. No page in another language was tested.
5. **No pages behind a login.** The extension reads what the open tab shows. No login-only page was tested. The requirements list such pages as a risk.
6. **The free quota.** The quota probe found limits of 5 to 15 requests, depending on the model, and the error text gives no period. When the quota runs out, summaries stop until it resets. The popup then opens the Key box and an Options button.
7. **The 30-part limit.** A page needing more than 30 parts is refused. At 8,000 characters per part, that is about 240,000 characters. The limit protects the quota, but very long pages get no summary.
8. **Unencrypted key.** The key sits in the extension's local storage in this browser and is not encrypted. It is not synced to the Google account. Anyone who can read this Windows account's Chrome profile folder could read it.
9. **Chrome versions and Windows.** setup.bat requires Chrome 116 or newer. The records cover only Chrome 155 on the developer laptop and Chromium 156 for the tests. The scripts work only on Windows. The client's Chrome version is [Insert client laptop Chrome version].
10. **Quality not scored.** No one rated the summaries against the source, and the speed benchmark did not compare answer quality.
11. **Page text can still steer the model.** The prompt says page text is material, not instructions. The code comment says this limits the risk but does not remove it. Markup in replies is shown as text (test T14).
12. **A rare merge case.** Very long part summaries can be merged in one request. With default settings this needs summaries of about 4,000 characters or more, so it is unlikely. The log does not list it as fixed.

For limit 8, the key is saved by this call in the Options page (the popup's Key box makes the same call). Source: `midsem/project/src/ui/options.js`, line 39.

```javascript
  await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: key });
```

**What this means in plain words.** Version 1 works for the cases its tests cover. Its evidence comes from a stand-in service and a few live pages. The client should be told which parts are proven and which are not.

## What Version 2 would add

Version 2 is not built. It is the plan for the final semester.

Version 2 keeps the same popup and the same way of reading the page. The change is where the summary comes from. The summarizing model runs inside the browser on the user's own computer. It downloads once, on first use, with a progress bar, and the browser keeps it for later use. No API key is needed. Page text never leaves the computer, and summaries work offline once the download is done.

Everything else stays. The extension still reads the main text, splits long text, joins the part summaries, and shows progress and errors. The new work is the download, a check that the computer can run the model, the stored copy, and a local engine that gives the same two kinds of answer as the cloud engine.

The requirements expect a small local model to write less good summaries than a large cloud model. The first download is large, and the computer needs enough graphics support and memory. The size of the gap in speed, quality and memory is [to be measured]. One design question is still open: whether the cloud engine stays selectable.

### The plan for the remaining weeks

![Plan chart: eight pieces of work across 14 weeks, with Version 1 in weeks 1 to 7 and Version 2 in weeks 8 to 14](../figures/F16_plan_chart.png)

**Reading the figure:** Each bar is one piece of work across 14 weeks. The red bars are Version 1, weeks 1 to 7, and a dashed line marks the midsem at the end of week 7. The grey bars are Version 2, weeks 8 to 14. The local model study takes weeks 8 and 9, the in-browser engine takes weeks 10 and 11, the cloud-versus-local comparison takes week 12, and final testing and submission take weeks 13 and 14. This is the plan, not a record of progress.

### What stays the same

![What is reused, replaced and new in Version 2, in three columns](../figures/F19_reuse_v1_v2.png)

**Reading the figure:** The green column lists five parts reused unchanged: extraction, the chunker and merger, the pipeline and its errors, the service worker, and the popup with its formatting. The orange column lists what is replaced: the cloud engine, the API key form, which Version 2 does not need, and the cloud settings. A dashed prompts box in that column is marked as possibly needing tuning. The grey dashed column lists what is new: the model download, a check that the browser and memory can run the model, the browser cache, and a local engine with the same two methods. The footer says the engine contract is the only seam between the two versions.

**What this means in plain words.** Most of the work carries over. Only the part that writes the summary is swapped for a version that runs on the user's computer.

## Questions this chapter answers

**What would break first in a live demonstration?** The free quota. A demonstration that summarizes many pages in a row can use up a free key. The popup then shows the used-up message until the quota resets.

**Why is the key stored without encryption?** The extension reads the key on every request, and Version 1 has no server to hold it. The key stays in this browser and is not synced to the Google account. Stronger storage is not part of Version 1, and the report states this as a limit.

**Is Version 2 built?** No. It is planned for weeks 8 to 14 of the final semester.

**What has not been tested yet?** The manual smoke test is not recorded on either laptop. The summaries have not been scored for quality. Other Chrome versions and pages behind a login have not been tested.
