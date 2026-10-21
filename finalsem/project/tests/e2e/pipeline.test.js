// Browser tests for Version 2: the whole pipeline in a real Chrome with the extension loaded
// (popup -> service worker -> page extraction -> offscreen page -> model -> popup).
// The model is the fake in src/offscreen/mock-engine.js, chosen per scenario through the test
// seam (engineMode 'mock' or 'mock:<mode>'). Everything runs hidden. Scenario IDs V01..V24 follow
// the test plan; V18b is the second half of V18.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFixtureServer } from '../helpers/fixtures-server.mjs';
import { launchExtension, summarize } from '../helpers/extension.mjs';

let fixtures;
let ext;

before(async () => {
  fixtures = await startFixtureServer();
  ext = await launchExtension();
});

after(async () => {
  await ext?.close();
  await fixtures?.close();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PRIMARY_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const FALLBACK_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';
// The order in which a job may pass through its phases (checking may be skipped, nothing may go back).
const PHASE_ORDER = ['extracting', 'checking', 'downloading', 'loading', 'summarizing', 'merging', 'done'];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/**
 * The offscreen page reads engineMode and mockDelayMs only when it is created, so a scenario
 * that changes them must close the page first. The next job creates it again.
 */
async function restartOffscreen() {
  await ext.run(async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) await chrome.offscreen.closeDocument();
  });
}

/** Clears the state a previous scenario may have left behind, then writes the settings this one needs. */
async function resetScenario(extra = {}, { cached = false } = {}) {
  for (const page of ext.context.pages()) {
    if (page !== ext.bridge) await page.close().catch(() => {});
  }
  await ext.setSettings({ engineMode: 'mock', mockDelayMs: 50, ...extra });
  await ext.clearJobs();
  await restartOffscreen();
  await ext.setMockModelCached(cached);
}

const storedValue = (key) => ext.run(async (k) => (await chrome.storage.local.get(k))[k] ?? null, key);
const modelCached = (id) => ext.run((key) => localStorage.getItem(`page-summarizer-mock-model-cached:${key}`) === '1', id);
const offscreenCount = () =>
  ext.run(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length);

/** Opens a fixture page in a new tab. */
async function openTarget(pathWithQuery) {
  const page = await ext.context.newPage();
  await page.goto(`${fixtures.origin}/${pathWithQuery}`);
  return page;
}

/** The popup aimed at a page's tab. */
async function popupFor(page) {
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  return { tabId, popup };
}

/** Waits until the popup's model line matches a pattern (the line is written after the start-up check). */
async function waitForModelLine(popup, pattern) {
  await popup.waitForFunction(
    (source) => new RegExp(source).test(document.getElementById('model-line').textContent),
    pattern.source,
    { timeout: 15000 },
  );
}

/**
 * Records, inside the popup page, every progress text it shows while the progress box is visible.
 * The observer runs in the page, so a state lasting only a few hundred milliseconds is not missed.
 */
async function installRecorder(popup) {
  await popup.evaluate(() => {
    const seen = { progress: [] };
    window.__seen = seen;
    const record = () => {
      if (document.getElementById('progress').hidden) return;
      const text = document.getElementById('progress-text').textContent;
      if (seen.progress[seen.progress.length - 1] !== text) seen.progress.push(text);
    };
    new MutationObserver(record).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    record();
  });
}

/** Waits until the popup shows a summary or an error, and returns which one, with its text. */
async function waitOutcome(popup, timeoutMs = 60000) {
  const done = popup.locator('#result:not([hidden])');
  const failed = popup.locator('#error:not([hidden])');
  await Promise.race([done.waitFor({ timeout: timeoutMs }), failed.waitFor({ timeout: timeoutMs })]);
  if ((await done.count()) > 0) {
    return { outcome: 'done', text: await popup.locator('#summary').innerText() };
  }
  return { outcome: 'error', text: await popup.locator('#error-text').innerText() };
}

/**
 * Lets the popup finish its start-up read of chrome.storage.session. The popup issued its own read
 * earlier, and its render runs when that read answers; this read is issued after it.
 */
async function settle(popup) {
  await popup.waitForFunction(() => !document.getElementById('page-title').hidden, null, { timeout: 10000 });
  await popup.evaluate(() => chrome.storage.session.get('job:0'));
}

/** Polls the stored job for a tab until it is done or failed, or the time runs out. */
async function waitJobEnd(tabId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let job = null;
  while (Date.now() < deadline) {
    job = await ext.getJob(tabId);
    if (job?.status === 'done' || job?.status === 'error') return job;
    await sleep(250);
  }
  return job;
}

/** Numbers in the download progress lines the popup showed, in the order they were shown. */
function downloadPercents(lines) {
  return lines
    .map((t) => t.match(/Downloading the model.*?(\d+)%/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

// ---------------------------------------------------------------------------------------------
// First run and the job's phases
// ---------------------------------------------------------------------------------------------

test('V01 first run: model line, download with percentages that never go down, a warm-up, a summary; then the model shows as downloaded', async () => {
  await resetScenario({}, { cached: false });
  const page = await openTarget('article-short.html');
  const { tabId, popup } = await popupFor(page);

  await waitForModelLine(popup, /Not downloaded yet/);
  assert.match(await popup.locator('#model-line').innerText(), /Llama 3\.2 1B.*Not downloaded yet.*664 MB/);
  assert.equal(await popup.locator('#summarize').innerText(), 'Download model and summarize');

  await installRecorder(popup);
  await popup.click('#summarize');
  // Screenshot while the download is part way (not 0 and not 100), so the picture shows it moving.
  await popup.waitForFunction(
    () =>
      window.__seen.progress.some((t) => {
        const m = t.match(/Downloading the model.*?(\d+)%/);
        return m && Number(m[1]) > 0 && Number(m[1]) < 100;
      }),
    null,
    { timeout: 30000, polling: 20 },
  );
  await ext.shot(popup, 'V01-downloading');

  const { outcome, text } = await waitOutcome(popup, 90000);
  await ext.shot(popup, 'V01-done');
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  assert.match(text, /This page is about/);
  assert.match(await popup.locator('#stats').innerText(), /Llama 3\.2 1B/);

  const lines = await popup.evaluate(() => window.__seen.progress);
  const percents = downloadPercents(lines);
  assert.ok(percents.length >= 2, `expected several download percentages, the popup showed: ${JSON.stringify(lines)}`);
  for (let i = 1; i < percents.length; i += 1) {
    assert.ok(percents[i] >= percents[i - 1], `download percentage went down: ${percents.join(' -> ')}`);
  }
  const firstDownload = lines.findIndex((t) => /Downloading the model/.test(t));
  const warmUp = lines.findIndex((t) => /Warming up|Loading the model/.test(t));
  assert.ok(firstDownload >= 0 && warmUp > firstDownload, `download should come before the warm-up: ${JSON.stringify(lines)}`);

  await popup.close();
  const again = await ext.openPopup(tabId);
  await waitForModelLine(again, /Downloaded, runs on this computer/);
  assert.equal(await again.locator('#summarize').innerText(), 'Summarize this page');
  await ext.shot(again, 'V01-next-popup');
});

test('V02 job phases in a first run appear in order: extracting, (checking), downloading, (loading), summarizing', async () => {
  await resetScenario({}, { cached: false });
  const page = await openTarget('article-short.html');
  const { tabId, popup } = await popupFor(page);
  await waitForModelLine(popup, /Not downloaded yet/);
  await popup.click('#summarize');

  const phases = [];
  const deadline = Date.now() + 90000;
  let job = null;
  while (Date.now() < deadline) {
    job = await ext.getJob(tabId);
    const phase = job?.phase ?? null;
    if (phase && phase !== phases[phases.length - 1]) phases.push(phase);
    if (job?.status === 'done' || job?.status === 'error') break;
    await sleep(40);
  }
  console.log(`V02 phases seen, in order: ${phases.join(' > ')}`);

  assert.equal(job?.status, 'done', `the job should finish, record was: ${JSON.stringify(job)}`);
  const indexes = phases.map((p) => PHASE_ORDER.indexOf(p));
  assert.ok(indexes.every((i) => i >= 0), `unknown phase in: ${phases.join(', ')}`);
  for (let i = 1; i < indexes.length; i += 1) {
    assert.ok(indexes[i] > indexes[i - 1], `phases out of order: ${phases.join(' > ')}`);
  }
  assert.equal(phases[0], 'extracting', `the first phase should be extracting: ${phases.join(' > ')}`);
  assert.ok(phases.includes('downloading'), `a first run must show downloading: ${phases.join(' > ')}`);
  assert.ok(phases.includes('summarizing'), `the summary must show summarizing: ${phases.join(' > ')}`);
});

test('V03 long article in parts: parts go out in order, they are merged, the stats say 4 parts', async () => {
  await resetScenario({ chunkChars: 3000, mockDelayMs: 400 }, { cached: true });
  const page = await openTarget('article-long.html');
  const { popup } = await popupFor(page);
  await installRecorder(popup);
  await popup.click('#summarize');

  await popup.waitForFunction(() => window.__seen.progress.some((t) => /part 2 of/.test(t)), null, {
    timeout: 60000,
    polling: 50,
  });
  await ext.shot(popup, 'V03-part-2');

  const { outcome, text } = await waitOutcome(popup, 90000);
  await ext.shot(popup, 'V03-done');
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  assert.match(text, /Combined overview/, 'the final text is the merged summary');

  const lines = await popup.evaluate(() => window.__seen.progress);
  const parts = lines
    .map((t) => t.match(/Summarizing part (\d+) of (\d+)/))
    .filter(Boolean)
    .map((m) => [Number(m[1]), Number(m[2])]);
  const totals = [...new Set(parts.map(([, total]) => total))];
  assert.equal(totals.length, 1, `every progress line should give the same total, saw: ${JSON.stringify(lines)}`);
  const total = totals[0];
  const shownPart = parts.map(([k]) => k);
  for (let i = 1; i < shownPart.length; i += 1) {
    assert.ok(shownPart[i] >= shownPart[i - 1], `parts were shown out of order: ${shownPart.join(', ')}`);
  }
  assert.equal(total, 4, `expected 4 parts for this article at 3000 characters, progress said ${total}`);
  assert.equal(shownPart[shownPart.length - 1], total, `the last shown part should be the last one: ${shownPart.join(', ')}`);

  const stats = await popup.locator('#stats').innerText();
  assert.match(stats, /\b4 parts\b/, `stats line: ${stats}`);
  assert.match(stats, /\b5 requests\b/, `4 part requests plus one merge request was expected, stats line: ${stats}`);
});

test('V04 near-empty page: refused as too little text, and the model is not downloaded', async () => {
  await resetScenario({}, { cached: false });
  const page = await openTarget('near-empty.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await waitForModelLine(popup, /Model: /);
  await ext.shot(popup, 'V04-near-empty');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /too little readable text/i);
  assert.equal(await modelCached(PRIMARY_ID), false, 'a refused page must not download or load the model');
});

test('V05 restricted page (chrome://version): refused before any model call', async () => {
  await resetScenario({}, { cached: false });
  const page = await ext.context.newPage();
  try {
    await page.goto('chrome://version', { timeout: 10000 });
  } catch (err) {
    // Fallback so the scenario still runs if Playwright cannot open chrome:// pages.
    console.log(`V05 note: chrome://version could not be opened (${String(err.message).split('\n')[0]}); using about:blank`);
    await page.goto('about:blank');
  }
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'V05-restricted');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /does not allow/i);
  assert.equal(await modelCached(PRIMARY_ID), false, 'no model download may happen for a restricted page');
});

test('V06 page that needs more parts than maxChunks: refused as too long, no model download', async () => {
  await resetScenario({ chunkChars: 500, maxChunks: 5 }, { cached: false });
  const page = await openTarget('article-long.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'V06-too-long');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /too long/i);
  assert.equal(await modelCached(PRIMARY_ID), false, 'a refused page must not download or load the model');
});

// ---------------------------------------------------------------------------------------------
// Computers that cannot run the model
// ---------------------------------------------------------------------------------------------

test('V07 no WebGPU: the model line says so, the button is disabled and a press does nothing', async () => {
  await resetScenario({ engineMode: 'mock:nowebgpu' });
  const page = await openTarget('article-short.html');
  const { tabId, popup } = await popupFor(page);

  await popup.waitForFunction(() => document.getElementById('model-line').classList.contains('bad'), null, { timeout: 15000 });
  assert.match(await popup.locator('#model-line').innerText(), /WebGPU is not available/);
  assert.equal(await popup.locator('#summarize').isDisabled(), true, 'the button must be disabled');
  await ext.shot(popup, 'V07-no-webgpu');

  // A script click on a disabled button does nothing, so no job may start.
  await popup.evaluate(() => document.getElementById('summarize').click());
  await sleep(1500);
  assert.equal(await ext.getJob(tabId), null, 'no job may start on a computer without WebGPU');
  assert.equal(await popup.locator('#progress').isVisible(), false, 'no progress may show');
});

test('V08 no 16-bit shader support: the model line says so and the button is disabled', async () => {
  await resetScenario({ engineMode: 'mock:nof16' });
  const page = await openTarget('article-short.html');
  const { tabId, popup } = await popupFor(page);

  await popup.waitForFunction(() => document.getElementById('model-line').classList.contains('bad'), null, { timeout: 15000 });
  assert.match(await popup.locator('#model-line').innerText(), /16-bit math/);
  assert.equal(await popup.locator('#summarize').isDisabled(), true, 'the button must be disabled');
  await ext.shot(popup, 'V08-no-f16');

  await popup.evaluate(() => document.getElementById('summarize').click());
  await sleep(1500);
  assert.equal(await ext.getJob(tabId), null, 'no job may start on a computer without shader-f16');
});

test('V09 integrated graphics: the note names Intel, the small model is used, and a summary works', async () => {
  await resetScenario({ engineMode: 'mock:intel' });
  const page = await openTarget('article-short.html');
  const { popup } = await popupFor(page);

  await waitForModelLine(popup, /SmolLM2 360M/);
  assert.equal(await popup.isVisible('#gpu-note'), true, 'the graphics note must be visible');
  const note = await popup.locator('#gpu-note').innerText();
  assert.match(note, /Intel/, `the graphics note should name Intel, it says: ${note}`);
  await ext.shot(popup, 'V09-intel-before');

  await popup.click('#summarize');
  const { outcome, text } = await waitOutcome(popup, 90000);
  await ext.shot(popup, 'V09-intel-done');
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  assert.match(await popup.locator('#stats').innerText(), /SmolLM2 360M/);
});

// ---------------------------------------------------------------------------------------------
// Model out of memory, download failure, empty and hostile answers
// ---------------------------------------------------------------------------------------------

test('V10 primary model out of memory: a summary still works with SmolLM2, the choice is saved, the next popup shows it', async () => {
  await resetScenario({ engineMode: 'mock:oom' }, { cached: false });
  const page = await openTarget('article-short.html');
  const { tabId, popup } = await popupFor(page);
  await waitForModelLine(popup, /Not downloaded yet/);
  await popup.click('#summarize');

  const { outcome, text } = await waitOutcome(popup, 90000);
  await ext.shot(popup, 'V10-fallback-done');
  assert.equal(outcome, 'done', `expected a summary after the fallback, popup said: ${text}`);
  assert.match(await popup.locator('#stats').innerText(), /SmolLM2 360M/);
  assert.match(await popup.locator('#result-notice').innerText(), /smaller model wrote this summary/, 'the user is told the smaller model was used');
  assert.equal(await storedValue('modelOverride'), 'fallback', 'the fallback choice must be saved');

  await popup.close();
  const again = await ext.openPopup(tabId);
  await waitForModelLine(again, /SmolLM2 360M/);
  await ext.shot(again, 'V10-next-popup');
});

test('V11 every model runs out of memory: the error says so, the choice is saved, Summarize is enabled again', async () => {
  await resetScenario({ engineMode: 'mock:oomall' }, { cached: false });
  const page = await openTarget('article-short.html');
  const { popup } = await popupFor(page);
  await waitForModelLine(popup, /Not downloaded yet/);
  await popup.click('#summarize');

  const { outcome, text } = await waitOutcome(popup, 90000);
  await ext.shot(popup, 'V11-all-out-of-memory');
  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /ran out of memory/);
  assert.equal(await storedValue('modelOverride'), 'fallback', 'the switch to the smaller model was tried and saved');
  assert.equal(await popup.isEnabled('#summarize'), true, 'Summarize must be enabled again');
});

test('V12 download fails: the error says so, nothing is saved, and a later press succeeds once the download works', async () => {
  await resetScenario({ engineMode: 'mock:downloadfail' }, { cached: false });
  const page = await openTarget('article-short.html');
  const { popup } = await popupFor(page);
  await waitForModelLine(popup, /Not downloaded yet/);
  await popup.click('#summarize');

  const first = await waitOutcome(popup, 60000);
  await ext.shot(popup, 'V12-download-failed');
  assert.equal(first.outcome, 'error', `expected an error, popup said: ${first.text}`);
  assert.match(first.text, /download stopped/);
  assert.equal(await storedValue('modelOverride'), null, 'a failed download must not switch the model');
  assert.equal(await modelCached(PRIMARY_ID), false, 'nothing may be marked as downloaded');
  assert.equal(await popup.isEnabled('#summarize'), true, 'Summarize must be enabled again');

  await popup.close();
  await ext.setSettings({ engineMode: 'mock', mockDelayMs: 50 });
  await restartOffscreen();
  const retry = await summarize(ext, page, { timeoutMs: 90000 });
  await ext.shot(retry.popup, 'V12-retry-done');
  assert.equal(retry.outcome, 'done', `the retry should succeed, popup said: ${retry.text}`);
});

test('V13 empty answer from the model: reported as no summary', async () => {
  await resetScenario({ engineMode: 'mock:empty' }, { cached: true });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 60000 });
  await ext.shot(popup, 'V13-empty-answer');
  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /no summary/i);
});

test('V14 hostile model output: markup is shown as text, never rendered', async () => {
  await resetScenario({ engineMode: 'mock:html' }, { cached: true });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 60000 });
  await ext.shot(popup, 'V14-hostile-output');

  assert.equal(outcome, 'done', `expected the summary to render, popup said: ${text}`);
  assert.equal(await popup.locator('#summary img').count(), 0, 'no <img> element may be created');
  assert.equal(await popup.locator('#summary b').count(), 0, 'no <b> element may be created');
  assert.notEqual(await page.title(), 'hacked', 'the page title must not be changed');
  assert.notEqual(await popup.title(), 'hacked', 'the popup title must not be changed');
  assert.ok((await popup.locator('#summary').innerText()).includes('<img'), 'the markup is shown as literal text');
});

// ---------------------------------------------------------------------------------------------
// Popup closed, reopened, navigation
// ---------------------------------------------------------------------------------------------

test('V15 popup closed mid-job: a reopened popup shows the same job, then the summary', async () => {
  await resetScenario({ chunkChars: 3000, mockDelayMs: 1000 }, { cached: true });
  const page = await openTarget('article-long.html');
  const tabId = await ext.tabIdOf(page);
  const first = await ext.openPopup(tabId);
  await first.click('#summarize');
  await first.waitForSelector('#progress:not([hidden])', { timeout: 15000 });
  const jobId = (await ext.getJob(tabId))?.jobId;
  await first.close();
  await sleep(1500);

  const second = await ext.openPopup(tabId);
  await second.waitForSelector('#progress:not([hidden]), #result:not([hidden])', { timeout: 10000 });
  await ext.shot(second, 'V15-reopened');

  const { outcome, text } = await waitOutcome(second, 90000);
  await ext.shot(second, 'V15-done');
  assert.equal(outcome, 'done', `expected a summary in the reopened popup, it said: ${text}`);
  assert.match(text, /Combined overview/);
  assert.equal((await ext.getJob(tabId))?.jobId, jobId, 'the reopened popup must follow the same job, not start another');
});

test('V16 finished job persists: a second popup for the same tab shows the result, and no new job starts', async () => {
  await resetScenario({}, { cached: true });
  const page = await openTarget('article-short.html');
  const first = await summarize(ext, page, { timeoutMs: 60000 });
  assert.equal(first.outcome, 'done', `first run should succeed, popup said: ${first.text}`);
  const before = await ext.getJob(first.tabId);

  const second = await ext.openPopup(first.tabId);
  await second.waitForSelector('#result:not([hidden])', { timeout: 5000 });
  await ext.shot(second, 'V16-persisted');
  assert.equal(await second.locator('#summary').innerText(), first.text, 'the same summary text');

  const after = await ext.getJob(first.tabId);
  assert.equal(after?.jobId, before?.jobId, 'the job id must not change');
  assert.equal(after?.startedAt, before?.startedAt, 'no new job may start when the popup reopens');
  assert.equal(after?.updatedAt, before?.updatedAt, 'the finished job must not be written again');
});

test('V17 stale result after navigation: the old summary is hidden on a different page, Summarize is enabled', async () => {
  await resetScenario({}, { cached: true });
  const page = await openTarget('article-short.html');
  const first = await summarize(ext, page, { timeoutMs: 60000 });
  assert.equal(first.outcome, 'done', `first run should succeed, popup said: ${first.text}`);

  await page.goto(`${fixtures.origin}/near-empty.html`);
  const second = await ext.openPopup(first.tabId);
  await settle(second);
  await ext.shot(second, 'V17-navigated');

  assert.equal(await second.$eval('#result', (el) => el.hasAttribute('hidden')), true, 'the old summary is hidden');
  assert.equal(await second.isEnabled('#summarize'), true, 'Summarize is enabled for the new page');
});

test('V18 content that arrives late: after 1.5 s the page is summarized with the text that arrived', async () => {
  await resetScenario({}, { cached: true });
  const page = await openTarget('late-content.html?delay=500');
  await sleep(1500);

  const { popup, tabId, outcome, text } = await summarize(ext, page, { timeoutMs: 60000 });
  await ext.shot(popup, 'V18-late-content');
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  const job = await ext.getJob(tabId);
  assert.ok((job?.stats?.textChars ?? 0) >= 300, `the text that arrived late should be read, textChars was ${job?.stats?.textChars}`);
});

test('V18b content still missing when Summarize is pressed: refused as too little text', async () => {
  await resetScenario({}, { cached: false });
  // 20 s rather than 4 s: the timer starts at page load, and a slow machine must still press in time.
  const page = await openTarget('late-content.html?delay=20000');
  assert.match(await page.locator('#root').innerText(), /Loading the report/, 'precondition: the text has not arrived yet');

  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'V18b-too-early');
  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /too little readable text/i);
  assert.equal(await modelCached(PRIMARY_ID), false, 'no model download may happen for a refused page');
});

test('V19 article with a table: summarized without failure', async () => {
  await resetScenario({}, { cached: true });
  const page = await openTarget('table-article.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 60000 });
  await ext.shot(popup, 'V19-table-article');
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
});

test('V20 service worker stopped mid-job: the job becomes INTERRUPTED and the popup says so', async () => {
  await resetScenario({ mockDelayMs: 4000 }, { cached: true });
  const page = await openTarget('article-short.html');
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  await popup.click('#summarize');
  await popup.waitForSelector('#progress:not([hidden])', { timeout: 15000 });
  await sleep(800);

  const cdp = await ext.context.newCDPSession(popup);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');

  // Waking the worker runs its start-up sweep, which marks orphaned jobs as interrupted.
  await ext.run(() => chrome.runtime.sendMessage({ type: 'noop' }).catch(() => null));

  const deadline = Date.now() + 15000;
  let job = null;
  while (Date.now() < deadline) {
    job = await ext.getJob(tabId);
    if (job?.status === 'error' || job?.status === 'done') break;
    await sleep(250);
  }
  await ext.shot(popup, 'V20-interrupted');

  assert.equal(job?.status, 'error', `job should be marked error, record was: ${JSON.stringify(job)}`);
  assert.equal(job?.error?.code, 'INTERRUPTED', `error code should be INTERRUPTED, was: ${job?.error?.code}`);
  await popup.waitForSelector('#error:not([hidden])', { timeout: 15000 });
  assert.match(await popup.locator('#error-text').innerText(), /interrupted/i);
});

test('V21 Summarize pressed on a new page while the old page is still summarized: the press gets a reply within 4 s', async () => {
  await resetScenario({ chunkChars: 3000, mockDelayMs: 1500 }, { cached: true });
  const page = await openTarget('article-long.html');
  const { tabId, popup: first } = await popupFor(page);
  await first.click('#summarize');
  await first.waitForSelector('#progress:not([hidden])', { timeout: 15000 });

  await page.goto(`${fixtures.origin}/near-empty.html`);
  await first.close();
  const second = await ext.openPopup(tabId);
  await settle(second);

  let acknowledged = false;
  try {
    await second.click('#summarize');
    await second.waitForFunction(
      () => ['progress', 'error', 'result'].some((id) => !document.getElementById(id).hidden),
      null,
      { timeout: 4000 },
    );
    acknowledged = true;
  } catch {
    acknowledged = false;
  }
  await ext.shot(second, 'V21-new-page-press');
  // Let the old run finish so its work does not leak into the next scenario.
  await waitJobEnd(tabId);

  assert.equal(
    acknowledged,
    true,
    'pressing Summarize on the new page must show progress, a message or a summary within 4 s; the popup stayed blank',
  );
});

test('V22 tab closed while summarizing: no job record is left behind for that tab', async () => {
  await resetScenario({ chunkChars: 3000, mockDelayMs: 1000 }, { cached: true });
  const page = await openTarget('article-long.html');
  const { tabId, popup } = await popupFor(page);
  await popup.click('#summarize');
  await popup.waitForSelector('#progress:not([hidden])', { timeout: 15000 });

  await popup.close();
  await page.close();

  // The abandoned job still has several answers to wait for (about 4 seconds). Watch for a record
  // for the closed tab for 10 seconds after the close; none may appear.
  await sleep(1000);
  const seen = [];
  const deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    const job = await ext.getJob(tabId);
    if (job) seen.push(job.status);
    await sleep(500);
  }
  assert.deepEqual(seen, [], `the job record for a closed tab should be removed, but records were seen with status: ${seen.join(', ')}`);
  assert.equal(await ext.getJob(tabId), null);
});

test('V23 idle close: the offscreen page is closed after the idle time, and the next summary still works', async () => {
  await resetScenario({ idleCloseMs: 400 }, { cached: true });
  const page = await openTarget('article-short.html');
  const first = await summarize(ext, page, { timeoutMs: 60000 });
  assert.equal(first.outcome, 'done', `first summary should succeed, popup said: ${first.text}`);
  await first.popup.close();

  await sleep(1500);
  let count = await offscreenCount();
  const deadline = Date.now() + 5000;
  while (count !== 0 && Date.now() < deadline) {
    await sleep(250);
    count = await offscreenCount();
  }
  assert.equal(count, 0, 'the offscreen page must be closed after the idle time');

  const second = await summarize(ext, page, { timeoutMs: 60000 });
  await ext.shot(second.popup, 'V23-after-idle-close');
  assert.equal(second.outcome, 'done', `a summary after the idle close should still work, popup said: ${second.text}`);
});

test('V24 nothing opens: a normal summary adds only the popup window (no tab, no options page)', async () => {
  await resetScenario({}, { cached: true });
  const page = await openTarget('article-short.html');
  const tabId = await ext.tabIdOf(page);
  const urlsBefore = ext.context.pages().map((p) => p.url());

  const popup = await ext.openPopup(tabId);
  await popup.click('#summarize');
  const { outcome, text } = await waitOutcome(popup, 60000);
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);

  // Pages that appeared since the start: a multiset difference of the URL lists.
  const added = ext.context.pages().map((p) => p.url());
  for (const url of urlsBefore) {
    const at = added.indexOf(url);
    if (at >= 0) added.splice(at, 1);
  }
  console.log(`V24 pages added during the summary: ${added.join(' | ')}`);
  const isPopup = (u) => /\/src\/ui\/popup\.html\?/.test(u);
  const isOffscreen = (u) => /\/src\/offscreen\/offscreen\.html/.test(u);
  const unexpected = added.filter((u) => !isPopup(u) && !isOffscreen(u));
  assert.deepEqual(unexpected, [], `pages opened during a summary: ${unexpected.join(', ')}`);
  assert.equal(added.filter(isPopup).length, 1, 'exactly one popup window was opened by the test');
});
