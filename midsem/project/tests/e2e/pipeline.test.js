// End-to-end tests for the whole summarizing pipeline in a real, visible Chrome with the
// extension loaded: popup -> service worker -> injected extractor -> chunks -> Gemini (mock)
// -> merge -> popup. Scenario IDs match the test-run report: T01-T18 are the planned list,
// T19-T22 were added after exploratory probes and failed on the first run (bugs B1-B4 in run-1.md, fixed since), T23 covers the page-length limit added after that run.
//
// Every scenario starts from the same state: the mock is reset, no jobs are stored, the
// settings it needs are written, and the tabs left by the previous scenario are closed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFixtureServer } from '../helpers/fixtures-server.mjs';
import { startMockGemini } from '../helpers/mock-gemini.mjs';
import { launchExtension, summarize } from '../helpers/extension.mjs';

let fixtures;
let mock;
let ext;

before(async () => {
  fixtures = await startFixtureServer();
  mock = await startMockGemini();
  ext = await launchExtension();
});

after(async () => {
  await ext?.close();
  await mock?.close();
  await fixtures?.close();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The settings every scenario starts from. A scenario passes extra values to override them. */
const settings = (extra = {}) => ({
  apiKey: mock.validKey,
  apiBaseUrl: mock.origin,
  retryBaseDelayMs: 50,
  requestTimeoutMs: 10000,
  ...extra,
});

/** Clears the state a previous scenario may have left behind. */
async function resetScenario(values) {
  mock.reset();
  for (const page of ext.context.pages()) {
    if (page !== ext.bridge) await page.close().catch(() => {});
  }
  await ext.clearJobs();
  await ext.setSettings(values);
}

/** Opens a fixture page in a new tab. */
async function openTarget(pathWithQuery) {
  const page = await ext.context.newPage();
  await page.goto(`${fixtures.origin}/${pathWithQuery}`);
  return page;
}

/**
 * Records, inside the popup page, every progress text and retry notice it shows.
 * The observer runs in the page, so a state that lasts only a few hundred milliseconds
 * cannot be missed by a slow polling loop on the test side.
 */
async function installRecorder(popup) {
  await popup.evaluate(() => {
    const seen = { progress: [], notice: [] };
    window.__seen = seen;
    const push = (list, value) => {
      if (list[list.length - 1] !== value) list.push(value);
    };
    const record = () => {
      const progress = document.getElementById('progress');
      const notice = document.getElementById('notice');
      if (progress.hidden) return;
      push(seen.progress, document.getElementById('progress-text').textContent);
      if (!notice.hidden) push(seen.notice, notice.textContent);
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

/** Waits until the popup shows a summary or an error, and returns which one with its text. */
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
 * Lets the popup finish its start-up read of chrome.storage.session. The popup issued its
 * own read earlier, and its render runs when that read answers; this read is issued after it.
 */
async function settle(popup) {
  await popup.waitForFunction(() => !document.getElementById('page-title').hidden, null, { timeout: 10000 });
  await popup.evaluate(() => chrome.storage.session.get('job:0'));
}

const chunkRequests = () => mock.requests.filter((r) => r.kind === 'chunk');
const mergeRequests = () => mock.requests.filter((r) => r.kind === 'merge');

// ---------------------------------------------------------------------------------------------
// Happy paths and chunking
// ---------------------------------------------------------------------------------------------

test('T01 long article: chunks go out in page order, are merged, and the popup shows progress', async () => {
  await resetScenario(settings({ chunkChars: 3000 }));
  mock.configure({ delayMs: 400 });

  const page = await openTarget('article-long.html');
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  await installRecorder(popup);
  await popup.click('#summarize');

  await popup.waitForFunction(
    () => window.__seen.progress.some((text) => text.includes('part 2 of')),
    null,
    { timeout: 60000, polling: 50 },
  );
  await ext.shot(popup, 'T01-progress');

  const { outcome, text } = await waitOutcome(popup);
  await ext.shot(popup, 'T01-done');
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);

  const chunks = chunkRequests();
  const merges = mergeRequests();
  const n = chunks.length;
  assert.ok(n >= 3, `expected at least 3 chunk requests, got ${n}`);
  assert.deepEqual(
    chunks.map((c) => c.index),
    Array.from({ length: n }, (_, i) => i + 1),
    'chunk requests must be sent in page order, one per part',
  );
  assert.ok(chunks.every((c) => c.total === n), 'every chunk request must report the same total');
  assert.ok(merges.length >= 1, 'at least one merge request after the chunks');
  const kinds = mock.requests.map((r) => r.kind);
  assert.ok(kinds.lastIndexOf('chunk') < kinds.indexOf('merge'), `all chunks must come before the merge, order was: ${kinds.join(',')}`);

  assert.match(text, /Combined overview/, 'the popup shows the merged summary');
  const stats = await popup.locator('#stats').innerText();
  assert.match(stats, new RegExp(`\\b${n} parts\\b`), `stats line should say ${n} parts, was: ${stats}`);
  assert.match(stats, new RegExp(`\\b${n + merges.length} requests\\b`), `stats line request count, was: ${stats}`);
});

test('T02 near-empty page: refused before any model call', async () => {
  await resetScenario(settings());
  const page = await openTarget('near-empty.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T02-near-empty');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /too little readable text/i);
  assert.equal(mock.requests.length, 0, 'no request may reach the model');
});

test('T03 no API key: explains the problem and the Options button opens the options page', async () => {
  await resetScenario({ apiBaseUrl: mock.origin });
  // Chrome focuses an options page that is already open instead of opening a new one, and the
  // test bridge is an options page. Move the bridge to another extension page for this scenario.
  await ext.bridge.goto(`${ext.base}/src/ui/popup.html`);
  try {
    const page = await openTarget('article-short.html');
    const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
    await ext.shot(popup, 'T03-no-key');

    assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
    assert.match(text, /No API key/);
    assert.equal(await popup.isVisible('#error-options'), true, 'the Open Options button is visible');
    assert.equal(mock.requests.length, 0, 'no request may reach the model');

    const newPage = ext.context.waitForEvent('page', { timeout: 15000 });
    await popup.click('#error-options');
    const options = await newPage;
    await options.waitForURL(/options\.html$/, { timeout: 15000 });
    assert.ok(options.url().endsWith('options.html'), `opened ${options.url()}`);
  } finally {
    await ext.bridge.goto(`${ext.base}/src/ui/options.html`);
  }
});

test('T04 wrong API key: one request, a clear message, and the Options button', async () => {
  await resetScenario(settings({ apiKey: 'wrong-key' }));
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T04-wrong-key');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /rejected/i);
  assert.equal(await popup.isVisible('#error-options'), true, 'the Open Options button is visible');
  assert.equal(mock.requests.length, 1, 'a rejected key must not be retried');
});

// ---------------------------------------------------------------------------------------------
// Failures from the model side
// ---------------------------------------------------------------------------------------------

test('T05 rate limited twice, then recovers: the popup says it is retrying and the summary arrives', async () => {
  await resetScenario(settings({ retryBaseDelayMs: 1500 }));
  mock.configure({ failStatus: 429, failTimes: 2 });

  const page = await openTarget('article-short.html');
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  await installRecorder(popup);
  await popup.click('#summarize');

  await popup.waitForFunction(() => window.__seen.notice.some((t) => /busy/i.test(t)), null, {
    timeout: 30000,
    polling: 50,
  });
  await ext.shot(popup, 'T05-retry-notice');

  const { outcome, text } = await waitOutcome(popup);
  assert.equal(outcome, 'done', `expected a summary after the retries, popup said: ${text}`);
  assert.equal(mock.requests.length, 3, 'two rejected requests plus the one that worked');
});

test('T06 rate limited every time: stops after four requests with a busy message', async () => {
  await resetScenario(settings({ retryBaseDelayMs: 50 }));
  mock.configure({ failStatus: 429, failTimes: Infinity });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 60000 });
  await ext.shot(popup, 'T06-rate-limit-forever');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /busy|free tier/i);
  assert.equal(mock.requests.length, 4, 'one try plus three retries');
});

test('T07 server error every time: stops after four requests with a problem message', async () => {
  await resetScenario(settings({ retryBaseDelayMs: 50 }));
  mock.configure({ failStatus: 500, failTimes: Infinity });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 60000 });
  await ext.shot(popup, 'T07-server-error-forever');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /problem/i);
  assert.equal(mock.requests.length, 4, 'one try plus three retries');
});

test('T08 model too slow: the request is cut off and reported as taking too long', async () => {
  await resetScenario(settings({ requestTimeoutMs: 400 }));
  mock.configure({ delayMs: 1500 });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T08-timeout');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /too long/i);
  assert.equal(mock.requests.length, 1, 'a timeout is not retried');
});

test('T09 model returns an empty answer: reported as no summary', async () => {
  await resetScenario(settings());
  mock.configure({ special: 'empty' });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T09-empty-answer');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /no summary/i);
  assert.equal(mock.requests.length, 1);
});

test('T09b model blocks the answer (safety block): reported as no summary', async () => {
  await resetScenario(settings());
  mock.configure({ special: 'blocked' });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T09b-blocked');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /no summary/i);
  assert.equal(mock.requests.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Pages the extension cannot or should not read
// ---------------------------------------------------------------------------------------------

test('T10 restricted page (chrome://version): refused before any model call', async () => {
  await resetScenario(settings());
  const page = await ext.context.newPage();
  try {
    await page.goto('chrome://version', { timeout: 10000 });
  } catch (err) {
    // Fallback so the scenario still runs if Playwright cannot open chrome:// pages.
    console.log(`T10 note: chrome://version could not be opened (${String(err.message).split('\n')[0]}); using about:blank`);
    await page.goto('about:blank');
  }
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T10-restricted');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /does not allow/i);
  assert.equal(mock.requests.length, 0, 'no request may reach the model');
});

test('T11 popup closed mid-run: a reopened popup shows the same job and gets the summary', async () => {
  await resetScenario(settings({ chunkChars: 3000 }));
  mock.configure({ delayMs: 1000 });

  const page = await openTarget('article-long.html');
  const tabId = await ext.tabIdOf(page);
  const first = await ext.openPopup(tabId);
  await first.click('#summarize');
  await first.waitForSelector('#progress:not([hidden])', { timeout: 15000 });
  await first.close();
  await sleep(1500);

  const second = await ext.openPopup(tabId);
  await second.waitForSelector('#progress:not([hidden]), #result:not([hidden])', { timeout: 10000 });
  await ext.shot(second, 'T11-reopened');

  const { outcome, text } = await waitOutcome(second, 60000);
  assert.equal(outcome, 'done', `expected a summary in the reopened popup, it said: ${text}`);

  const chunks = chunkRequests();
  const merges = mergeRequests();
  const total = chunks[0]?.total ?? 0;
  assert.ok(total >= 3, `expected a long page with at least 3 parts, got ${total}`);
  assert.equal(chunks.length, total, 'each part is sent exactly once, so reopening did not restart the job');
  assert.deepEqual(
    chunks.map((c) => c.index).sort((a, b) => a - b),
    Array.from({ length: total }, (_, i) => i + 1),
    'every part reached the model',
  );
  assert.ok(merges.length >= 1, 'a merge request was made');
});

test('T12 content that arrives late: waits for the page, then summarizes what arrived', async () => {
  await resetScenario(settings());
  const page = await openTarget('late-content.html?delay=500');
  await sleep(1500);

  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T12-late-content');
  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  assert.equal(mock.requests.length, 1);
  assert.match(mock.requests[0].prompt, /Hill Station/, 'the text that arrived late reached the model');
});

test('T12b content that is still missing when Summarize is pressed: refused as too little text', async () => {
  await resetScenario(settings());
  // The delay is 20 s rather than 4 s: the timer starts when the page loads, and under load the
  // harness took more than 4 s to press Summarize, so the text had already arrived (seen in run 3).
  const page = await openTarget('late-content.html?delay=20000');
  // Precondition: the text must still be missing at this point, or the scenario proves nothing.
  assert.match(await page.locator('#root').innerText(), /Loading the report/, 'precondition: text not yet loaded');

  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T12b-late-content-too-early');

  assert.equal(outcome, 'error', `expected an error, popup said: ${text}`);
  assert.match(text, /too little readable text/i);
  assert.equal(mock.requests.length, 0);
});

test('T13 dashboard page (little article text): still summarized', async () => {
  await resetScenario(settings());
  const page = await openTarget('dashboard.html');
  const { popup, tabId, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T13-dashboard');

  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  const job = await ext.getJob(tabId);
  console.log(`T13 extractMethod: ${job?.stats?.extractMethod ?? 'not recorded'}`);
  assert.ok(job?.stats?.extractMethod, 'the job records how the text was read');
  assert.equal(mock.requests.length, 1);
  assert.match(mock.requests[0].prompt, /Vessels/, 'dashboard figures reached the model');
});

test('T14 hostile model output: markup is shown as text, never rendered', async () => {
  await resetScenario(settings());
  mock.configure({ special: 'html' });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T14-hostile-output');

  assert.equal(outcome, 'done', `expected the summary to render, popup said: ${text}`);
  assert.equal(await popup.locator('#summary img').count(), 0, 'no <img> element may be created');
  assert.equal(await popup.locator('#summary b').count(), 0, 'no <b> element may be created');
  assert.notEqual(await page.title(), 'hacked', 'the page title must not be changed');
  assert.notEqual(await popup.title(), 'hacked', 'the popup title must not be changed');
  assert.ok((await popup.locator('#summary').innerText()).includes('<img'), 'the markup is shown as literal text');
});

// ---------------------------------------------------------------------------------------------
// Options page
// ---------------------------------------------------------------------------------------------

test('T15 options page: save, replace-by-remove, and validation messages', async () => {
  await resetScenario({});
  const options = await ext.openOptions();

  await options.fill('#api-key', 'fake-key-for-test');
  await options.click('#save');
  await options.waitForFunction(() => /Saved/.test(document.getElementById('status').textContent), null, {
    timeout: 10000,
  });
  assert.equal(await options.isVisible('#saved-note'), true, 'the saved note is shown');
  assert.equal(await options.inputValue('#api-key'), '', 'the typed key is cleared from the field');
  const stored = await ext.run(async () => (await chrome.storage.local.get('apiKey')).apiKey);
  assert.equal(stored, 'fake-key-for-test', 'the key is stored in chrome.storage.local');
  await ext.shot(options, 'T15-saved');

  await options.click('#remove');
  await options.waitForFunction(() => document.getElementById('saved-note').hidden, null, { timeout: 10000 });
  const afterRemove = await ext.run(async () => (await chrome.storage.local.get('apiKey')).apiKey);
  assert.equal(afterRemove, undefined, 'the key is removed from storage');

  await options.click('#save');
  await options.waitForFunction(() => /Enter a key/.test(document.getElementById('status').textContent), null, {
    timeout: 10000,
  });
  await ext.shot(options, 'T15-empty-error');

  await options.fill('#api-key', 'bad key');
  await options.click('#save');
  await options.waitForFunction(() => /no spaces/.test(document.getElementById('status').textContent), null, {
    timeout: 10000,
  });
  const afterSpace = await ext.run(async () => (await chrome.storage.local.get('apiKey')).apiKey);
  assert.equal(afterSpace, undefined, 'a key with a space is not stored');
});

// ---------------------------------------------------------------------------------------------
// Results that persist, and results that must not
// ---------------------------------------------------------------------------------------------

test('T16 finished job persists: a second popup for the same tab shows it without a new request', async () => {
  await resetScenario(settings());
  const page = await openTarget('article-short.html');
  const first = await summarize(ext, page, { timeoutMs: 30000 });
  assert.equal(first.outcome, 'done', `first run should succeed, popup said: ${first.text}`);
  const requestsBefore = mock.requests.length;

  const second = await ext.openPopup(first.tabId);
  await second.waitForSelector('#result:not([hidden])', { timeout: 3000 });
  await ext.shot(second, 'T16-persisted');

  assert.equal(await second.locator('#summary').innerText(), first.text, 'same summary text');
  assert.equal(mock.requests.length, requestsBefore, 'opening the popup must not call the model again');
});

test('T17 stale result after navigation: a finished summary is hidden on a different page', async () => {
  await resetScenario(settings());
  const page = await openTarget('article-short.html');
  const first = await summarize(ext, page, { timeoutMs: 30000 });
  assert.equal(first.outcome, 'done', `first run should succeed, popup said: ${first.text}`);

  await page.goto(`${fixtures.origin}/near-empty.html`);
  const second = await ext.openPopup(first.tabId);
  await settle(second);
  await ext.shot(second, 'T17-navigated');

  assert.equal(await second.$eval('#result', (el) => el.hasAttribute('hidden')), true, 'the old summary is hidden');
  assert.equal(await second.isEnabled('#summarize'), true, 'Summarize is enabled for the new page');
});

// ---------------------------------------------------------------------------------------------
// Service worker interrupted
// ---------------------------------------------------------------------------------------------

test('T18 service worker stopped mid-job: the job becomes INTERRUPTED and the popup says so', async () => {
  await resetScenario(settings());
  mock.configure({ delayMs: 4000 });
  const page = await openTarget('article-short.html');
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  await popup.click('#summarize');
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
  await ext.shot(popup, 'T18-interrupted');

  assert.equal(job?.status, 'error', `job should be marked error, record was: ${JSON.stringify(job)}`);
  assert.equal(job?.error?.code, 'INTERRUPTED', `error code should be INTERRUPTED, was: ${job?.error?.code}`);
  await popup.waitForSelector('#error:not([hidden])', { timeout: 15000 });
  assert.match(await popup.locator('#error-text').innerText(), /interrupted/i);
});

// ---------------------------------------------------------------------------------------------
// Added after the first run: behaviour the T01-T18 list does not cover. Each one is a
// probe-confirmed problem and is expected to FAIL until the product is fixed.
// ---------------------------------------------------------------------------------------------

/** Polls the stored job for a tab until it is done or failed, or the time runs out. */
async function waitForJobEnd(tabId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let job = null;
  while (Date.now() < deadline) {
    job = await ext.getJob(tabId);
    if (job?.status === 'done' || job?.status === 'error') return job;
    await sleep(250);
  }
  return job;
}

test('T19 Summarize pressed on a new page while the old page is still summarized: the press gets a reply', async () => {
  await resetScenario(settings({ chunkChars: 3000 }));
  mock.configure({ delayMs: 1500 });

  const page = await openTarget('article-long.html');
  const tabId = await ext.tabIdOf(page);
  const first = await ext.openPopup(tabId);
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
  await ext.shot(second, 'T19-new-page-press');
  // Let the old run finish so its requests do not leak into the next scenario.
  await waitForJobEnd(tabId);

  assert.equal(
    acknowledged,
    true,
    'pressing Summarize on the new page must show progress, a message or a summary within 4 s; the popup stayed blank',
  );
});

test('T20 worker stopped while a popup is open: the popup stops showing progress once the job is stale', async () => {
  await resetScenario(settings());
  mock.configure({ delayMs: 4000 });
  const page = await openTarget('article-short.html');
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  await popup.click('#summarize');
  await sleep(800);

  const cdp = await ext.context.newCDPSession(popup);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');

  // No worker is running now and nothing wakes it. The job is written as last updated 170 s
  // ago (just under the 3-minute limit), so the popup's own staleness check has not fired yet.
  await ext.run(
    async (id) => {
      const key = `job:${id}`;
      const job = (await chrome.storage.session.get(key))[key];
      await chrome.storage.session.set({ [key]: { ...job, updatedAt: Date.now() - 170000 } });
    },
    tabId,
  );
  // Fifteen seconds later the job is clearly past the limit, and nothing has written to storage since.
  await sleep(15000);
  await ext.shot(popup, 'T20-stale-while-open');
  const progressStillShown = await popup.isVisible('#progress');

  // Clean up: waking the worker runs its sweep and marks the orphaned job as interrupted.
  await ext.run(() => chrome.runtime.sendMessage({ type: 'noop' }).catch(() => null));

  assert.equal(
    progressStillShown,
    false,
    'a job last updated more than 3 minutes ago must not keep showing progress in an open popup',
  );
});

test('T21 article with a table: cells stay separate in the text sent to the model', async () => {
  await resetScenario(settings());
  const page = await openTarget('table-article.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T21-table-article');

  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  const prompt = mock.requests[0].prompt;
  // Search for the table cells, not the title: "Quarter" also appears in "Quarterly Figures".
  const body = prompt.slice(prompt.indexOf('<<<PAGE TEXT START>>>'));
  const at = body.indexOf('Q1');
  // Cells are separated by " | " and each row is its own line: "Q1 | 4.5M | 12%".
  assert.match(
    prompt,
    /Q1\s*\|\s*4\.5M\s*\|\s*12%/,
    `table cells run together in the text sent to the model: "${body.slice(Math.max(0, at - 20), at + 40).replace(/\n/g, '\\n')}"`,
  );
  assert.match(prompt, /Q1 \| 4\.5M \| 12%\nQ2 \| 5\.1M \| 14%/, 'table rows should be consecutive lines');
});

test('T22 tab closed while summarizing: no job record is left behind for that tab', async () => {
  await resetScenario(settings({ chunkChars: 3000 }));
  mock.configure({ delayMs: 1000 });
  const page = await openTarget('article-long.html');
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  await popup.click('#summarize');
  await popup.waitForSelector('#progress:not([hidden])', { timeout: 15000 });

  await popup.close();
  await page.close();

  // Wait until the model has answered the merge, then give the final write a moment.
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !mock.requests.some((r) => r.kind === 'merge')) await sleep(250);
  await sleep(1500);

  const leftover = await ext.getJob(tabId);
  assert.equal(
    leftover,
    null,
    `the job record for a closed tab should be removed, but it was kept with status "${leftover?.status}"`,
  );
});

test('T23 a page that needs too many parts is refused before any model call', async () => {
  await resetScenario(settings({ chunkChars: 500, maxChunks: 5 }));
  const page = await openTarget('article-long.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T23-too-long');
  assert.equal(outcome, 'error');
  assert.match(text, /too long/i);
  assert.equal(mock.requests.length, 0, 'no model call may be made for a refused page');
});

test('T24 daily quota used up (long retry time): stops at once and says how long to wait', async () => {
  await resetScenario(settings());
  mock.configure({ failStatus: 429, failTimes: Infinity, retryInfo: '25200s' });
  const page = await openTarget('article-short.html');
  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'T24-quota-used-up');
  assert.equal(outcome, 'error');
  assert.match(text, /free-tier limit.*used up/i);
  assert.match(text, /about 7 hours/);
  assert.equal(mock.requests.length, 1, 'no retries against a quota that will not come back for hours');
  assert.equal(await popup.locator('#error-options').isVisible(), true, 'offer Options so the user can switch key');
});

test('T25 key entered inside the popup: no Options page, no new tab, then a summary', async () => {
  await resetScenario({ apiBaseUrl: mock.origin, retryBaseDelayMs: 50, requestTimeoutMs: 10000 }); // no key saved
  const page = await openTarget('article-short.html');
  const tabId = await ext.tabIdOf(page);
  const pagesBefore = ext.context.pages().length;
  const popup = await ext.openPopup(tabId);

  // With no key saved, the key box is already open and says what to do.
  await popup.locator('#key-form:not([hidden])').waitFor({ timeout: 10000 });
  assert.match(await popup.locator('#key-msg').innerText(), /Paste your Gemini key/);

  // Empty and badly pasted keys are refused with a message.
  await popup.click('#key-save');
  assert.match(await popup.locator('#key-msg').innerText(), /Paste a key first/);
  await popup.fill('#key-input', 'has a space');
  await popup.click('#key-save');
  assert.match(await popup.locator('#key-msg').innerText(), /no spaces/);

  // A good key is saved in the browser and the field is cleared.
  await popup.fill('#key-input', mock.validKey);
  await popup.click('#key-save');
  assert.match(await popup.locator('#key-msg').innerText(), /Key saved/);
  assert.equal(await popup.inputValue('#key-input'), '');
  const stored = await ext.run(async () => (await chrome.storage.local.get('apiKey')).apiKey);
  assert.equal(stored, mock.validKey);
  await ext.shot(popup, 'T25-key-saved-in-popup');

  // The summary works straight away, and nothing else was opened (only the popup window itself).
  await popup.click('#summarize');
  const { outcome } = await waitOutcome(popup, 30000);
  assert.equal(outcome, 'done');
  assert.equal(mock.requests.length, 1);
  assert.equal(ext.context.pages().length, pagesBefore + 1, 'no Options tab or other page may open');

  // The saved key can be removed from the same box.
  if (!(await popup.locator('#key-form').isVisible())) await popup.click('#toggle-key');
  await popup.click('#key-remove');
  assert.match(await popup.locator('#key-msg').innerText(), /removed/);
  assert.equal(await ext.run(async () => (await chrome.storage.local.get('apiKey')).apiKey ?? null), null);
});
