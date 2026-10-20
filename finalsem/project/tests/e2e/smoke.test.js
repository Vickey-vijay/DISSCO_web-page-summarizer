// Smoke test for Version 2: proves the whole chain works in a real browser with the extension
// loaded: fixture page -> extraction -> offscreen page -> (fake) model download with progress ->
// answers -> popup shows the summary. The fake model stands in for the real one so the test takes
// seconds; the real model is measured separately by scripts/local-run.mjs.
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

test('first run: model line, download progress, then a summary; second run skips the download', async () => {
  await ext.setSettings({ engineMode: 'mock', mockDelayMs: 50 });
  await ext.setMockModelCached(false);
  await ext.clearJobs();

  const page = await ext.context.newPage();
  await page.goto(`${fixtures.origin}/article-short.html`);
  const tabId = await ext.tabIdOf(page);
  const popup = await ext.openPopup(tabId);

  // Before pressing anything the popup already says what it will do.
  await popup.waitForFunction(() => /Not downloaded yet/.test(document.getElementById('model-line').textContent), null, { timeout: 15000 });
  assert.match(await popup.locator('#model-line').innerText(), /Llama 3\.2 1B.*about 664 MB/);
  assert.equal(await popup.locator('#summarize').innerText(), 'Download model and summarize');
  await ext.shot(popup, 'v2-first-run-before');

  await popup.click('#summarize');
  await popup.waitForFunction(() => /Downloading the model/.test(document.getElementById('progress-text').textContent), null, { timeout: 15000, polling: 30 });
  await ext.shot(popup, 'v2-first-run-downloading');
  await popup.locator('#result:not([hidden])').waitFor({ timeout: 30000 });
  const text = await popup.locator('#summary').innerText();
  assert.match(text, /This page is about/);
  assert.match(await popup.locator('#stats').innerText(), /1 part · 1 request/);
  await ext.shot(popup, 'v2-first-run-done');

  // Second run: the model is now "downloaded", so the popup says so and no download happens.
  await popup.close();
  const again = await ext.openPopup(tabId);
  await again.waitForFunction(() => /Downloaded, runs on this computer/.test(document.getElementById('model-line').textContent), null, { timeout: 15000 });
  assert.equal(await again.locator('#summarize').innerText(), 'Summarize this page');
  await again.close(); // the helper below opens its own popup for the page
  const second = await summarize(ext, page, { timeoutMs: 30000 });
  assert.equal(second.outcome, 'done', `second run said: ${second.text}`);
});
