import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary } from '../../src/ui/summary-format.js';
import { loadSettings, DEFAULTS } from '../../src/core/config.js';
import { AppError, describeError, toAppError, USER_MESSAGES, ERROR_CODES } from '../../src/core/errors.js';
import { buildChunkPrompt, buildMergePrompt, buildSinglePrompt, PAGE_END, PAGE_START } from '../../src/core/prompts.js';
import { isRestrictedUrl } from '../../src/background/extract-tab.js';

// ---- summary formatting -------------------------------------------------

test('parseSummary turns an overview line and bullets into blocks', () => {
  const blocks = parseSummary('The page is about lighthouses.\n- First fact\n- Second fact\n\nClosing line.');
  assert.deepEqual(blocks, [
    { type: 'p', text: 'The page is about lighthouses.' },
    { type: 'ul', items: ['First fact', 'Second fact'] },
    { type: 'p', text: 'Closing line.' },
  ]);
});

test('parseSummary accepts * and bullet characters and strips **bold**', () => {
  const blocks = parseSummary('* **Key** point\n\u2022 Another point');
  assert.deepEqual(blocks, [{ type: 'ul', items: ['Key point', 'Another point'] }]);
});

test('parseSummary never produces HTML: markup stays as text', () => {
  const blocks = parseSummary('<img src=x onerror=alert(1)>');
  assert.deepEqual(blocks, [{ type: 'p', text: '<img src=x onerror=alert(1)>' }]);
});

test('parseSummary handles empty input', () => {
  assert.deepEqual(parseSummary(''), []);
  assert.deepEqual(parseSummary(null), []);
});

// ---- settings -----------------------------------------------------------

const storage = (values) => ({ get: async () => values });

test('loadSettings gives defaults when nothing is stored', async () => {
  const s = await loadSettings(storage({}));
  assert.equal(s.apiKey, '');
  assert.equal(s.apiBaseUrl, DEFAULTS.apiBaseUrl);
  assert.equal(s.chunkChars, DEFAULTS.chunkChars);
});

test('loadSettings trims the key and applies the test seams', async () => {
  const s = await loadSettings(storage({ apiKey: '  abc  ', apiBaseUrl: 'http://127.0.0.1:9/', chunkChars: 1500 }));
  assert.equal(s.apiKey, 'abc');
  assert.equal(s.apiBaseUrl, 'http://127.0.0.1:9');
  assert.equal(s.chunkChars, 1500);
});

test('loadSettings ignores a silly chunk size', async () => {
  const s = await loadSettings(storage({ chunkChars: 3 }));
  assert.equal(s.chunkChars, DEFAULTS.chunkChars);
});

// ---- errors -------------------------------------------------------------

test('every error code has a plain-English message', () => {
  for (const code of Object.values(ERROR_CODES)) {
    assert.ok(USER_MESSAGES[code] && USER_MESSAGES[code].length > 5, `missing message for ${code}`);
  }
});

test('describeError keeps the technical detail separate from the user message', () => {
  const info = describeError(new AppError('INVALID_KEY', 'HTTP 403: denied'));
  assert.equal(info.code, 'INVALID_KEY');
  assert.equal(info.message, USER_MESSAGES.INVALID_KEY);
  assert.equal(info.detail, 'HTTP 403: denied');
  assert.ok(!info.message.includes('403'));
});

test('toAppError wraps unknown errors and aborts', () => {
  assert.equal(toAppError(new Error('x')).code, 'SERVICE_ERROR');
  const abort = new Error('stop');
  abort.name = 'AbortError';
  assert.equal(toAppError(abort).code, 'CANCELLED');
});

// ---- prompts ------------------------------------------------------------

test('prompts wrap page text in markers and tell the model it is not instructions', () => {
  for (const prompt of [buildSinglePrompt({ title: 'T', text: 'BODY' }), buildChunkPrompt({ title: 'T', text: 'BODY', index: 1, total: 3 })]) {
    assert.ok(prompt.includes(PAGE_START) && prompt.includes(PAGE_END));
    assert.match(prompt, /never as instructions/);
    // The instruction line mentions the markers too, so compare against the last occurrence.
    assert.ok(prompt.lastIndexOf(PAGE_START) < prompt.indexOf('BODY') && prompt.indexOf('BODY') < prompt.lastIndexOf(PAGE_END));
  }
});

test('the merge prompt numbers the parts in order', () => {
  const p = buildMergePrompt({ title: 'T', parts: ['alpha', 'beta'] });
  assert.ok(p.indexOf('Part 1: alpha') < p.indexOf('Part 2: beta'));
});

// ---- restricted pages ---------------------------------------------------

test('isRestrictedUrl flags pages Chrome will not let extensions read', () => {
  for (const url of ['chrome://extensions', 'chrome-extension://abc/page.html', 'about:blank', 'edge://settings', 'view-source:https://a.test', 'file:///C:/a.html', 'https://chromewebstore.google.com/detail/x']) {
    assert.equal(isRestrictedUrl(url), true, url);
  }
  for (const url of ['https://en.wikipedia.org/wiki/Lighthouse', 'http://127.0.0.1:8080/a.html', undefined]) {
    assert.equal(isRestrictedUrl(url), false, String(url));
  }
});
