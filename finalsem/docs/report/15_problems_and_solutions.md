# Problems and solutions

This chapter tells the problems met while building Version 2. The sources are kept narrow on purpose. The entries come from the rows of the development log dated 21 October 2026, which are the Version 2 rows, and from the first browser test run, `docs/test-runs/run-1.md`. The rows dated 20 October 2026 belong to Version 1 and are not repeated here.

Each problem is told in the same order: what was seen, the cause, the fix, and then what it means in plain words. The fixes are the ones in the code now. Where the record says a cause was not proved, this chapter says so.

## The model cache refused to open

**What was seen.** The first real attempt to run the model library inside the hidden offscreen page stopped at once. The error was `UnknownError: Failed to execute 'open' on 'CacheStorage': Unexpected internal error`.

**Cause.** The library stores the model in Cache Storage by default. Inside the extension's offscreen page, Cache Storage did not work. IndexedDB did, with about 10.7 GB of quota in the test. A normal extension page had worked, so only this kind of page was affected.

**Fix.** The library is told to keep the model in IndexedDB. The setting is one line in the offscreen page.

`src/offscreen/offscreen.js` (the cache setting)

```
// Cache Storage fails inside an offscreen page ("Unexpected internal error"), IndexedDB works,
// so the model is stored in IndexedDB. (Found by a spike; see DEVLOG.md.)
const APP_CONFIG = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' };
```

The change has a side effect. The extension asks for the `unlimitedStorage` permission, which is listed in `manifest.json`. Without it, the browser could delete the model of about 700 MB when disk space runs low (`docs/DECISIONS.md`, D2).

### What this means in plain words

A library's default storage can fail inside a particular kind of page. Test each browser feature in the exact page type that will use it before building on top of it.

## The spike that printed nothing

**What was seen.** The first spike printed nothing for two minutes. Later runs printed nothing either.

**Cause.** There were two separate causes. First, an offscreen page has only the runtime messaging API. It has no `chrome.storage`, so the logging call failed silently. Second, a later edit put an apostrophe in "lamp's" inside a single-quoted string, which broke the whole script. The first suspicion fell on the offline setting, which was not the cause.

**Fix.** The offscreen page reports through messages, and the service worker stores what it receives. The header of `offscreen.js` states the rule: the page "has only the chrome.runtime API (no chrome.storage, no chrome.tabs), so it works purely by messages". Every script is also checked with `node --check` before a run, which catches syntax faults at once.

### What this means in plain words

A broken script looks like a broken environment. Check the syntax first, and remember that an offscreen page can only talk by messages.

## Chromium chose the weak graphics chip

**What was seen.** The 1 billion parameter model wrote about 2 tokens a second, and the first answer took 36 seconds. A token is a piece of a word, so this was far too slow for a useful summary.

**Cause.** Chromium picked the Intel graphics built into the processor, although the code asked for the high-performance card. The request is made in `offscreen.js` with `powerPreference: 'high-performance'`, but Chromium did not follow it on this laptop. Starting the browser with `--force_high_performance_gpu` made it choose the NVIDIA RTX 3050. The development log records about 63 tokens a second while writing, about 600 tokens a second while reading the prompt, and about 1.5 seconds for a prompt of 250 tokens on that card. The first answer on either card also spends about 30 seconds compiling the graphics programs.

**Fix.** The extension warms the model up right after loading, and it shows the message "Warming up the model". The warm-up is the step that compiles the programs, so the first real part does not look frozen.

`src/offscreen/offscreen.js` (the warm-up after loading)

```
        emitProgress({ phase: 'loading', percent: 100, text: 'Warming up the model (first time only)' });
        await engine.chat.completions.create({ messages: [{ role: 'user', content: 'Say ok.' }], max_tokens: 1, temperature: 0 });
        return { ok: true, loadMs: Math.round(performance.now() - t0) };
```

On built-in graphics the extension switches to the small model on its own and shows a note. The opt-in `setup.bat --gpu` offers the Windows setting that asks for the separate card (chapter 13).

### What this means in plain words

The same laptop can be about thirty times faster or slower depending on which chip Chrome uses. Measure on the path the client will use, and tell the reader on screen which chip is in use.

## The offline check and the moving folder

**What was seen.** With Playwright's offline switch on, the extension's own page never loaded. A second run, with every outside site blocked, reported "Not downloaded yet", even though the model was already stored.

**Cause.** There were two causes. Playwright's offline mode also blocks the extension's own pages. In addition, the test setup copied the extension into a new temporary folder at every launch. Chrome gave the copy a new extension ID, and the browser storage from earlier runs belonged to the old ID, so the new run could not see it.

**Fix.** Outside sites are now blocked with a host-resolver rule, and the local test server stays reachable because it is excluded from that rule. The measuring script also loads the extension from one fixed folder, so its ID stays the same. The two relevant lines are in `scripts/local-run.mjs`.

`scripts/local-run.mjs` (the offline mode and the fixed folder)

```
  'nvidia-offline': { profile: '.model-profile', args: ['--force_high_performance_gpu', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'], online: false, cases: ['short', 'long'] },
  ...
  extensionDir: path.join(root, plan.profile + '-ext'), // fixed folder: same extension id on every run
```

### What this means in plain words

An unpacked extension gets its identity from its folder. If the folder changes, the stored data is lost to the new copy. Keep the folder fixed whenever the stored model must survive between runs.

## The vendor name in lowercase

**What was seen.** Browser test V09 failed. The popup showed "Graphics: intel (built into the processor)", with the vendor name in lowercase. Run 1 lists the same fault as its first problem.

**Cause.** WebGPU reports the vendor name in lowercase, and the popup printed it exactly as it came.

**Fix.** The function `vendorName()` in `src/ui/popup.js` maps the known names to their usual spelling, and it capitalizes any other name.

`src/ui/popup.js` (the mapping of vendor names)

```
const VENDOR_NAMES = { intel: 'Intel', nvidia: 'NVIDIA', amd: 'AMD', apple: 'Apple', qualcomm: 'Qualcomm', arm: 'Arm' };
export function vendorName(vendor) {
  const v = String(vendor ?? '').toLowerCase();
  return VENDOR_NAMES[v] ?? (v ? v[0].toUpperCase() + v.slice(1) : 'built-in');
}
```

### What this means in plain words

A string from a system interface is data, not a sentence for the reader. It needs converting before it is shown, and the test that reads the screen is what caught it.

## A job record came back after its tab closed

**What was seen.** Browser test V22 found that after a tab was closed during a model download, a job record for that tab appeared again in `chrome.storage.session`.

**Cause.** The development log says the most likely cause, though the failure was not caught in the act. Version 2 writes progress many times a second, for the download and the loading percentages. A write that was already queued when the tab closed could finish after the record had been removed, and so it wrote the record back. Run 1 notes that Version 1 had a similar fault (B4), which was fixed by remembering closed tabs. Version 2 adds many more writes, so the gap between checking and writing was wide enough to hit.

**Fix.** The handler that runs when a tab closes now removes the record only after the queued writes for that tab have finished. A write that finishes after the tab has closed removes its own record.

`src/background/service-worker.js` (the queued write and its cleanup)

```
      const current = (await chrome.storage.session.get(key))[key];
      if (!current || current.jobId !== jobId) return; // replaced by a newer job, or removed
      await chrome.storage.session.set({ [key]: { ...current, ...patch, updatedAt: Date.now() } });
      // The tab may have closed while this write was in flight: do not leave the record behind.
      if (closedTabs.has(tabId)) await chrome.storage.session.remove(key);
```

### What this means in plain words

Once a fault is found and fixed, look for the same pattern wherever the code now does more of the same work. Here the work was writing progress, and the fix had to cover every write that could still be running when the tab closed.

## The integrated chip is slow

**What was seen.** On the Intel chip, the short article took 199.2 seconds on first use. That time was made up of about 81 seconds of download, about 40 seconds of warm-up and 76 seconds of writing the answer. A two-part article took 149.1 seconds.

**Cause.** The built-in chip writes text slowly. The record shows 4 to 5 tokens a second with the small model SmolLM2, and about 2 tokens a second with the 1 billion parameter model.

**Fix.** The development log records no code change for this run. The automatic switch to the small model was already in place and keeps the chip usable, though not fast. The popup says that a separate graphics card is much faster. `setup.bat --gpu`, or the Windows Graphics setting, moves Chrome to the separate card.

### What this means in plain words

A weak chip is not an error. The extension gives a note and uses a smaller model, instead of refusing to run.

## Three faults in the test setup

Run 1 also found three faults in the tests themselves, not in the extension. Each was fixed in the test code.

**A leftover popup window.** The second summary in the smoke test acted on a popup window that the first one had left open. The helper now asks Chrome which tab is active, and the test closes any other popup windows first.

**A page from Version 1.** The test bridge page of Version 1, `options.html`, does not exist in Version 2. A small page, `src/ui/test-bridge.html`, is now written into the test copy of the extension only.

**A locked folder.** The secret scan failed with a "busy" error on a browser profile folder that Chrome still had open. The scan now skips the `.model-profile*` folders and `test-output`.

### What this means in plain words

A test has to clean up what earlier steps left behind, and a test setup copied from an older version has to be checked against the new files. The scan also has to skip folders that a running program still holds open.

## Questions this chapter answers

**Why was the first answer so slow?**
The code asked for the high-performance card, but Chromium used the built-in chip, which wrote about 2 tokens a second and took 36 seconds for the first answer. The cause was found by forcing the separate card with `--force_high_performance_gpu` and comparing the two speeds.

**Why did the first spike show nothing?**
Two separate faults were at work. The offscreen page cannot use `chrome.storage`, so its logging failed silently, and a stray apostrophe broke a string in the script. The page now reports by messages, and each script is checked with `node --check` first.

**What was the fault in the closed-tab test?**
A progress write that was already queued could finish after the tab closed and write the job record back. The fix makes the cleanup wait for the queued writes, and it removes any record written after the close.

**Why does the graphics note now name the chip with a capital letter?**
WebGPU reports the vendor in lowercase, and the popup printed it as it came. The `vendorName()` function maps the known names to their usual spelling.

**Did every problem come from the product?**
No. Three came from the test setup: a leftover popup window, a page from Version 1, and a folder that was still in use. Their fixes were made in the test code and the secret-scan script, not in the extension.
