// Smoke test: proves the whole chain works in a real browser with the extension loaded:
// fixture page -> extraction -> engine (mock Gemini) -> popup shows the summary.
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

test('short article: popup shows a summary, noise is removed before the model sees it', async () => {
  mock.reset();
  await ext.setSettings({ apiKey: mock.validKey, apiBaseUrl: mock.origin });
  await ext.clearJobs();

  const page = await ext.context.newPage();
  await page.goto(`${fixtures.origin}/article-short.html`);

  const { popup, outcome, text } = await summarize(ext, page, { timeoutMs: 30000 });
  await ext.shot(popup, 'smoke-short-article');

  assert.equal(outcome, 'done', `expected a summary, popup said: ${text}`);
  assert.match(text, /This page is about/);

  assert.equal(mock.requests.length, 1, 'a short page needs exactly one model call');
  const sent = mock.requests[0];
  assert.equal(sent.kind, 'single');
  assert.equal(sent.hasKey, true);
  assert.match(sent.prompt, /Fresnel/, 'article text reached the model');
  for (const noise of ['SUBSCRIBE NOW', 'Accept all cookies', 'Related articles', 'Advertise with us']) {
    assert.ok(!sent.prompt.includes(noise), `"${noise}" should have been removed by extraction`);
  }
});
