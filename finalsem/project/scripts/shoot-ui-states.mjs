// Takes screenshots of the Version 2 popup in each important state, for the college report.
//
// Everything runs HIDDEN: the same headless Chromium harness as the browser tests
// (tests/helpers/extension.mjs). The model is the PRETEND model in src/offscreen/mock-engine.js,
// so nothing is downloaded. Each picture is the popup's own content area at 2x pixel density
// (760 px wide), never the desktop and never a window frame.
//
// Usage, from the project folder (do not set HEADED):
//   node scripts/shoot-ui-states.mjs                 shoot all 18 states into ../docs/screenshots/
//   node scripts/shoot-ui-states.mjs ui-04 ui-09     shoot only those states (for a re-shoot)
//
// How each state is produced is written down in ../docs/screenshots/UI_STATES.md. In short:
//   - most states: the pretend model runs with the settings for that state (mockDelayMs, engineMode,
//     chunkChars, modelCached, a restricted or too-short page, a service worker stopped mid-job);
//   - ui-02 and ui-04: the pretend model passes through these in about a second or 120 ms. The
//     popup's script is paused at the moment the text appears, the picture is taken while the
//     screen is frozen, and the popup then carries on. Nothing else about the popup changes;
//   - ui-03 only: the pretend model never reports "Loading the model into the graphics card", so
//     that one job record is written into chrome.storage.session in the same shape the service
//     worker writes it. The popup code then draws it as it would for a real load.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchExtension } from '../tests/helpers/extension.mjs';
import { startFixtureServer } from '../tests/helpers/fixtures-server.mjs';

if (process.env.HEADED === '1') {
  console.error('This script runs hidden only. Remove HEADED from the environment and run it again.');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
// The project is finalsem/project, the report's screenshots are in finalsem/docs/screenshots.
const OUT_DIR = path.resolve(here, '..', '..', 'docs', 'screenshots');
const WANTED = new Set(process.argv.slice(2));
const wanted = (...ids) => WANTED.size === 0 || ids.some((id) => WANTED.has(id));

const POPUP_W = 380; // the popup page is 380 px wide (body rule in ui.css)
const POPUP_H = 600; // the popup window's page area height (the harness window size)
const FILES = {
  'ui-01': 'ui-01-not-downloaded',
  'ui-02': 'ui-02-downloading',
  'ui-03': 'ui-03-loading',
  'ui-04': 'ui-04-warming',
  'ui-05': 'ui-05-summarizing-parts',
  'ui-06': 'ui-06-merging',
  'ui-07': 'ui-07-result',
  'ui-08': 'ui-08-ready-to-use',
  'ui-09': 'ui-09-intel-note',
  'ui-10': 'ui-10-no-webgpu',
  'ui-11': 'ui-11-no-shader-f16',
  'ui-12': 'ui-12-fallback-after-out-of-memory',
  'ui-13': 'ui-13-out-of-memory-all',
  'ui-14': 'ui-14-download-failed',
  'ui-15': 'ui-15-too-little-text',
  'ui-16': 'ui-16-restricted-page',
  'ui-17': 'ui-17-interrupted',
  'ui-18': 'ui-18-hostile-output-as-text',
};

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Clears the previous state: closes old pages, writes this state's settings, forgets the offscreen page. */
async function reset(ext, settings, { cached }) {
  for (const page of ext.context.pages()) {
    if (page !== ext.bridge) await page.close().catch(() => {});
  }
  await ext.setSettings({ engineMode: 'mock', mockDelayMs: 50, ...settings });
  await ext.clearJobs();
  // The offscreen page reads engineMode and mockDelayMs only when it is created, so close it.
  await ext.run(async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) await chrome.offscreen.closeDocument();
  });
  await ext.setMockModelCached(cached);
}

async function openFixture(ext, fx, pathWithQuery) {
  const page = await ext.context.newPage();
  await page.goto(`${fx.origin}/${pathWithQuery}`);
  return page;
}

async function popupFor(ext, page) {
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);
  return { tabId, popup };
}

// The CDP session of each popup that was set to 2x. Every picture is taken through that session,
// because Playwright's own element screenshot does not use the 2x setting.
const sessions = new Map();

/** Sets the popup to 2x pixel density, so every picture is 760 px wide. */
async function twoX(ext, popup) {
  const cdp = await ext.context.newCDPSession(popup);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: POPUP_W, height: POPUP_H, deviceScaleFactor: 2, mobile: false });
  sessions.set(popup, cdp);
  return cdp;
}

async function waitModelLine(popup, pattern) {
  await popup.waitForFunction(
    (source) => new RegExp(source).test(document.getElementById('model-line').textContent),
    pattern.source,
    { timeout: 15000 },
  );
}

async function waitProgress(popup, pattern, timeout = 60000) {
  await popup.waitForFunction(
    (source) => !document.getElementById('progress').hidden && new RegExp(source).test(document.getElementById('progress-text').textContent),
    pattern.source,
    { timeout, polling: 25 },
  );
}

/** Waits for the summary or the error to show, and returns which one, with its text. */
async function waitOutcome(popup, timeout = 90000) {
  await popup.waitForFunction(
    () => !document.getElementById('result').hidden || !document.getElementById('error').hidden,
    null,
    { timeout, polling: 100 },
  );
  if (await popup.locator('#result').isVisible()) {
    return { outcome: 'done', text: await popup.locator('#summary').innerText() };
  }
  return { outcome: 'error', text: await popup.locator('#error-text').innerText() };
}

/** Writes the popup's content area as a PNG at 2x. Every expected text must be on screen after the shot. */
async function capture(id, popup, expectations) {
  const cdp = sessions.get(popup);
  if (!cdp) throw new Error(`${id}: the popup was not set to 2x before the picture`);
  const file = path.join(OUT_DIR, `${FILES[id]}.png`);
  // The mouse was on the button when it was pressed; move it to empty paper so no button shows its hover colour.
  await popup.mouse.move(POPUP_W - 2, POPUP_H - 2);
  // The picture is the body box: the popup's own content, from its top edge to the bottom of the last line.
  const height = Math.ceil(await popup.evaluate(() => document.body.getBoundingClientRect().height));
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: POPUP_W, height, scale: 1 },
  });
  writeFileSync(file, Buffer.from(data, 'base64'));
  const text = await popup.locator('body').innerText();
  for (const re of expectations) {
    if (!re.test(text)) throw new Error(`${id}: expected ${re} on screen; the popup said: ${text.replace(/\n+/g, ' | ')}`);
  }
  console.log(`  ${id} on screen: ${text.replace(/\n+/g, ' | ')}`);
  return file;
}

/**
 * Pauses the popup's script at the moment its progress text matches `pattern`, so the screen stays
 * on that text, takes the picture while it is frozen, then lets the popup carry on. `start` presses
 * the button. The popup's own code draws every frame; only its timing is held.
 */
async function holdAndCapture(ext, popup, cdp, id, pattern, start) {
  await cdp.send('Debugger.enable');
  const paused = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${id}: the popup never showed ${pattern}`)), 60000);
    cdp.once('Debugger.paused', (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
  paused.catch(() => {}); // a rejection is handled below; this stops a stray one from crashing the run

  // Installed before the button is pressed, so no text can be missed.
  await popup.evaluate((source) => {
    const re = new RegExp(source);
    const check = () => {
      if (window.__held) return;
      if (document.getElementById('progress').hidden) return;
      const text = document.getElementById('progress-text').textContent;
      if (!re.test(text)) return;
      window.__held = true;
      window.__heldText = text;
      window.__heldHeight = Math.ceil(document.body.getBoundingClientRect().height);
      debugger; // with the debugger attached this pauses the popup right here
    };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  }, pattern.source);

  await start();
  const event = await paused;
  try {
    const { result } = await cdp.send('Debugger.evaluateOnCallFrame', {
      callFrameId: event.callFrames[0].callFrameId,
      expression: 'JSON.stringify({ text: window.__heldText, height: window.__heldHeight })',
      returnByValue: true,
    });
    const { text, height } = JSON.parse(result.value);
    if (!pattern.test(text)) throw new Error(`${id}: the frozen text was "${text}"`);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: POPUP_W, height, scale: 1 },
    });
    const file = path.join(OUT_DIR, `${FILES[id]}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`  ${id} on screen: ${text}`);
    return file;
  } finally {
    await cdp.send('Debugger.resume').catch(() => {});
  }
}

/** The job record the service worker writes, for a state the pretend model never reports (ui-03). */
async function writeLoadingRecord(ext, tabId, pageUrl, title) {
  const now = Date.now();
  await ext.run(
    async ({ key, record }) => {
      await chrome.storage.session.set({ [key]: record });
    },
    {
      key: `job:${tabId}`,
      record: {
        jobId: 'ui-03-loading-sample',
        status: 'running',
        phase: 'loading',
        current: 0,
        total: 0,
        percent: 45,
        detail: 'Loading model from cache[3/8]',
        notice: null,
        summary: null,
        error: null,
        stats: null,
        url: pageUrl,
        title,
        startedAt: now,
        updatedAt: now,
      },
    },
  );
}

// ---------------------------------------------------------------------------------------------
// The states. Each returns when its pictures are written; a thrown error makes the run try again.
// ---------------------------------------------------------------------------------------------

const SCENARIOS = [
  {
    ids: ['ui-01'],
    async run({ ext, fx }) {
      await reset(ext, {}, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Not downloaded yet/);
      await twoX(ext, popup);
      await capture('ui-01', popup, [/Not downloaded yet/, /Download model and summarize/]);
    },
  },
  {
    ids: ['ui-02'],
    async run({ ext, fx }) {
      await reset(ext, {}, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Not downloaded yet/);
      const cdp = await twoX(ext, popup);
      await holdAndCapture(ext, popup, cdp, 'ui-02', /Downloading the model \(first time only\): (25|38|50|62|75)%/, () =>
        popup.click('#summarize'),
      );
      await waitOutcome(popup); // let the job finish so nothing is left running
    },
  },
  {
    ids: ['ui-03'],
    async run({ ext, fx }) {
      await reset(ext, {}, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { tabId, popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Not downloaded yet/);
      await twoX(ext, popup);
      await writeLoadingRecord(ext, tabId, page.url(), await page.title());
      await waitProgress(popup, /Loading the model into the graphics card: 45%/);
      await capture('ui-03', popup, [/Loading the model into the graphics card: 45%/]);
    },
  },
  {
    ids: ['ui-04'],
    async run({ ext, fx }) {
      await reset(ext, {}, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Not downloaded yet/);
      const cdp = await twoX(ext, popup);
      await holdAndCapture(ext, popup, cdp, 'ui-04', /Warming up the model/, () => popup.click('#summarize'));
      await waitOutcome(popup);
    },
  },
  {
    ids: ['ui-05', 'ui-06'],
    async run({ ext, fx }) {
      // A long page at 3000 characters per part is 4 parts (the same fixture the browser tests use).
      // The pretend model takes 2 s per answer, so each stage stays on screen long enough to shoot.
      await reset(ext, { chunkChars: 3000, mockDelayMs: 2000 }, { cached: true });
      const page = await openFixture(ext, fx, 'article-long.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Downloaded, runs on this computer/);
      await twoX(ext, popup);
      await popup.click('#summarize');
      await waitProgress(popup, /Summarizing part 2 of 4/);
      if (wanted('ui-05')) await capture('ui-05', popup, [/Summarizing part 2 of 4/]);
      await waitProgress(popup, /Combining 4 summaries/);
      if (wanted('ui-06')) await capture('ui-06', popup, [/Combining 4 summaries/]);
      await waitOutcome(popup);
    },
  },
  {
    ids: ['ui-07'],
    async run({ ext, fx }) {
      await reset(ext, {}, { cached: true });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Downloaded, runs on this computer/);
      await twoX(ext, popup);
      await popup.click('#summarize');
      const { outcome, text } = await waitOutcome(popup);
      if (outcome !== 'done') throw new Error(`ui-07: expected a summary, popup said: ${text}`);
      await capture('ui-07', popup, [/This page is about/, /1 part · 1 request/]);
    },
  },
  {
    ids: ['ui-08'],
    async run({ ext, fx }) {
      // Download the model for real (the pretend download) on one page, then open the popup on a
      // different page, which has no job of its own: that is the "after the download" state.
      await reset(ext, {}, { cached: false });
      const first = await openFixture(ext, fx, 'article-short.html');
      const { popup: firstPopup } = await popupFor(ext, first);
      await waitModelLine(firstPopup, /Not downloaded yet/);
      await firstPopup.click('#summarize');
      const { outcome, text } = await waitOutcome(firstPopup);
      if (outcome !== 'done') throw new Error(`ui-08: the download run failed: ${text}`);
      await firstPopup.close();

      const second = await openFixture(ext, fx, 'dashboard.html');
      const { popup } = await popupFor(ext, second);
      await waitModelLine(popup, /Downloaded, runs on this computer/);
      await twoX(ext, popup);
      await capture('ui-08', popup, [/Downloaded, runs on this computer/, /Summarize this page/]);
    },
  },
  {
    ids: ['ui-09'],
    async run({ ext, fx }) {
      await reset(ext, { engineMode: 'mock:intel' }, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /SmolLM2 360M/);
      await popup.waitForFunction(() => !document.getElementById('gpu-note').hidden);
      await twoX(ext, popup);
      await capture('ui-09', popup, [/Graphics: Intel/, /SmolLM2 360M/]);
    },
  },
  {
    ids: ['ui-10'],
    async run({ ext, fx }) {
      await reset(ext, { engineMode: 'mock:nowebgpu' }, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await popup.waitForFunction(() => document.getElementById('model-line').classList.contains('bad'), null, { timeout: 15000 });
      await twoX(ext, popup);
      await capture('ui-10', popup, [/WebGPU is not available/]);
    },
  },
  {
    ids: ['ui-11'],
    async run({ ext, fx }) {
      await reset(ext, { engineMode: 'mock:nof16' }, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await popup.waitForFunction(() => document.getElementById('model-line').classList.contains('bad'), null, { timeout: 15000 });
      await twoX(ext, popup);
      await capture('ui-11', popup, [/16-bit math/]);
    },
  },
  {
    ids: ['ui-12'],
    async run({ ext, fx }) {
      await reset(ext, { engineMode: 'mock:oom' }, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Not downloaded yet/);
      await twoX(ext, popup);
      await popup.click('#summarize');
      const { outcome, text } = await waitOutcome(popup);
      if (outcome !== 'done') throw new Error(`ui-12: expected a summary after the fallback, popup said: ${text}`);
      await popup.waitForFunction(() => /SmolLM2 360M/.test(document.getElementById('stats').textContent), null, { timeout: 15000 });
      await capture('ui-12', popup, [/This page is about/, /SmolLM2 360M/]);
    },
  },
  {
    ids: ['ui-13'],
    async run({ ext, fx }) {
      await reset(ext, { engineMode: 'mock:oomall' }, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Not downloaded yet/);
      await twoX(ext, popup);
      await popup.click('#summarize');
      const { outcome, text } = await waitOutcome(popup);
      if (outcome !== 'error') throw new Error(`ui-13: expected an error, popup said: ${text}`);
      if (!(await popup.isEnabled('#summarize'))) throw new Error('ui-13: Summarize should be enabled again');
      await capture('ui-13', popup, [/ran out of memory/]);
    },
  },
  {
    ids: ['ui-14'],
    async run({ ext, fx }) {
      await reset(ext, { engineMode: 'mock:downloadfail' }, { cached: false });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Not downloaded yet/);
      await twoX(ext, popup);
      await popup.click('#summarize');
      const { outcome, text } = await waitOutcome(popup);
      if (outcome !== 'error') throw new Error(`ui-14: expected an error, popup said: ${text}`);
      await capture('ui-14', popup, [/download stopped/]);
    },
  },
  {
    ids: ['ui-15'],
    async run({ ext, fx }) {
      await reset(ext, {}, { cached: false });
      const page = await openFixture(ext, fx, 'near-empty.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Model: /);
      await twoX(ext, popup);
      await popup.click('#summarize');
      const { outcome, text } = await waitOutcome(popup, 30000);
      if (outcome !== 'error') throw new Error(`ui-15: expected an error, popup said: ${text}`);
      await capture('ui-15', popup, [/too little readable text/]);
    },
  },
  {
    ids: ['ui-16'],
    async run({ ext }) {
      await reset(ext, {}, { cached: false });
      const page = await ext.context.newPage();
      await page.goto('chrome://version', { timeout: 15000 });
      const tabId = await ext.tabIdOf(page);
      // The popup shows the tab's title when it opens, so wait (briefly) for Chrome to set it.
      let title = '';
      for (let i = 0; i < 25 && !title; i += 1) {
        title = await ext.run((id) => chrome.tabs.get(id).then((t) => t.title ?? ''), tabId);
        if (!title) await new Promise((r) => setTimeout(r, 200));
      }
      console.log(`  ui-16 tab title as Chrome reports it: ${JSON.stringify(title)}`);
      const popup = await ext.openPopup(tabId);
      await waitModelLine(popup, /Model: /);
      await twoX(ext, popup);
      await popup.click('#summarize');
      const { outcome, text } = await waitOutcome(popup, 30000);
      if (outcome !== 'error') throw new Error(`ui-16: expected an error, popup said: ${text}`);
      await capture('ui-16', popup, [/does not allow/]);
    },
  },
  {
    ids: ['ui-17'],
    async run({ ext, fx }) {
      // The same way the browser test stops a worker: the job is still running when Chrome stops
      // the service worker, and the next start marks it as interrupted.
      await reset(ext, { mockDelayMs: 4000 }, { cached: true });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { tabId, popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Downloaded, runs on this computer/);
      await twoX(ext, popup);
      await popup.click('#summarize');
      await popup.waitForSelector('#progress:not([hidden])', { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1500));

      const cdp = await ext.context.newCDPSession(popup);
      await cdp.send('ServiceWorker.enable');
      await cdp.send('ServiceWorker.stopAllWorkers');
      await ext.run(() => chrome.runtime.sendMessage({ type: 'noop' }).catch(() => null));

      const deadline = Date.now() + 15000;
      let job = null;
      while (Date.now() < deadline) {
        job = await ext.getJob(tabId);
        if (job?.status === 'error' || job?.status === 'done') break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (job?.error?.code !== 'INTERRUPTED') throw new Error(`ui-17: the job was not marked interrupted: ${JSON.stringify(job)}`);
      await popup.waitForSelector('#error:not([hidden])', { timeout: 15000 });
      await capture('ui-17', popup, [/interrupted/]);
    },
  },
  {
    ids: ['ui-18'],
    async run({ ext, fx }) {
      await reset(ext, { engineMode: 'mock:html' }, { cached: true });
      const page = await openFixture(ext, fx, 'article-short.html');
      const { popup } = await popupFor(ext, page);
      await waitModelLine(popup, /Downloaded, runs on this computer/);
      await twoX(ext, popup);
      await popup.click('#summarize');
      const { outcome, text } = await waitOutcome(popup);
      if (outcome !== 'done') throw new Error(`ui-18: expected a summary, popup said: ${text}`);
      await capture('ui-18', popup, [/Overview line\./, /<img src=x/, /<b>bold<\/b>/]);
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

function pngSize(file) {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const fx = await startFixtureServer();
  const ext = await launchExtension();
  const failed = [];
  try {
    for (const scenario of SCENARIOS) {
      if (!wanted(...scenario.ids)) continue;
      let done = false;
      for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
        try {
          await scenario.run({ ext, fx });
          done = true;
        } catch (err) {
          console.log(`  ${scenario.ids.join('+')} attempt ${attempt} did not give the right picture: ${String(err.message).split('\n')[0]}`);
        }
      }
      console.log(`${done ? 'OK    ' : 'FAILED'} ${scenario.ids.join(', ')}`);
      if (!done) failed.push(...scenario.ids);
    }
  } finally {
    await ext.close();
    await fx.close();
  }

  console.log('\nPictures in ' + OUT_DIR);
  for (const [id, base] of Object.entries(FILES)) {
    if (!wanted(id)) continue;
    const file = path.join(OUT_DIR, `${base}.png`);
    try {
      const { width, height } = pngSize(file);
      console.log(`  ${base}.png  ${width} x ${height} px`);
    } catch {
      console.log(`  ${base}.png  MISSING`);
    }
  }
  if (failed.length) {
    console.log(`\nNot captured after 3 tries: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
