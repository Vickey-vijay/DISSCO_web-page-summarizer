import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary } from '../../src/ui/summary-format.js';
import { loadSettings, DEFAULTS, MODELS } from '../../src/core/config.js';
import { AppError, describeError, fromWire, toAppError, USER_MESSAGES, ERROR_CODES } from '../../src/core/errors.js';
import { buildChunkPrompt, buildMergePrompt, buildSinglePrompt, PAGE_END, PAGE_START } from '../../src/core/prompts.js';
import { isRestrictedUrl } from '../../src/background/extract-tab.js';
import { samePage } from '../../src/core/url.js';

// ---- summary formatting (unchanged from V1) -----------------------------------------------------

test('parseSummary turns an overview line and bullets into blocks', () => {
  const blocks = parseSummary('The page is about lighthouses.\n- First fact\n- Second fact\n\nClosing line.');
  assert.deepEqual(blocks, [
    { type: 'p', text: 'The page is about lighthouses.' },
    { type: 'ul', items: ['First fact', 'Second fact'] },
    { type: 'p', text: 'Closing line.' },
  ]);
});

test('parseSummary never produces HTML: markup stays as text', () => {
  assert.deepEqual(parseSummary('<img src=x onerror=alert(1)>'), [{ type: 'p', text: '<img src=x onerror=alert(1)>' }]);
});

// ---- settings -----------------------------------------------------------------------------------

const storage = (values) => ({ get: async () => values });

test('loadSettings gives the V2 defaults when nothing is stored', async () => {
  const s = await loadSettings(storage({}));
  assert.equal(s.chunkChars, DEFAULTS.chunkChars);
  assert.equal(s.engineMode, 'real');
  assert.equal(s.modelOverride, null);
  assert.equal(s.apiKey, undefined, 'there is no key in Version 2');
});

test('loadSettings applies the test seams and the saved fallback choice', async () => {
  const s = await loadSettings(storage({ chunkChars: 1500, maxChunks: 3, engineMode: 'mock:slow', modelOverride: 'fallback', idleCloseMs: 50 }));
  assert.equal(s.chunkChars, 1500);
  assert.equal(s.maxChunks, 3);
  assert.equal(s.engineMode, 'mock:slow');
  assert.equal(s.modelOverride, 'fallback');
  assert.equal(s.idleCloseMs, 50);
});

test('loadSettings ignores silly values', async () => {
  const s = await loadSettings(storage({ chunkChars: 3, engineMode: 'whatever', modelOverride: 'something' }));
  assert.equal(s.chunkChars, DEFAULTS.chunkChars);
  assert.equal(s.engineMode, 'real');
  assert.equal(s.modelOverride, null);
});

test('the two models are the ones WebLLM lists, primary first', () => {
  assert.match(MODELS.primary.id, /^Llama-3\.2-1B-Instruct-q4f16_1-MLC$/);
  assert.match(MODELS.fallback.id, /^SmolLM2-360M-Instruct-q4f16_1-MLC$/);
  assert.ok(MODELS.fallback.vramMB < MODELS.primary.vramMB);
});

// ---- errors -------------------------------------------------------------------------------------

test('every error code has a plain-English message', () => {
  for (const code of Object.values(ERROR_CODES)) {
    assert.ok(USER_MESSAGES[code] && USER_MESSAGES[code].length > 5, `missing message for ${code}`);
  }
});

test('describeError keeps the technical detail apart from the user message', () => {
  const info = describeError(new AppError('GPU_MEMORY', 'GPUOutOfMemory in createBuffer'));
  assert.equal(info.code, 'GPU_MEMORY');
  assert.equal(info.message, USER_MESSAGES.GPU_MEMORY);
  assert.equal(info.detail, 'GPUOutOfMemory in createBuffer');
  assert.ok(!info.message.includes('createBuffer'));
});

test('toAppError wraps unknown errors and aborts; fromWire rebuilds a code sent over a message', () => {
  assert.equal(toAppError(new Error('x')).code, 'SERVICE_ERROR');
  const abort = new Error('stop');
  abort.name = 'AbortError';
  assert.equal(toAppError(abort).code, 'CANCELLED');
  assert.equal(fromWire({ code: 'NO_WEBGPU', detail: 'd' }).code, 'NO_WEBGPU');
  assert.equal(fromWire({ code: 'NOT_A_CODE' }).code, 'SERVICE_ERROR');
  assert.equal(fromWire(undefined).code, 'SERVICE_ERROR');
});

// ---- prompts ------------------------------------------------------------------------------------

test('prompts put the page text between markers, first, then one instruction', () => {
  for (const prompt of [buildSinglePrompt({ title: 'T', text: 'BODY' }), buildChunkPrompt({ title: 'T', text: 'BODY', index: 2, total: 5 })]) {
    assert.ok(prompt.includes(PAGE_START) && prompt.includes(PAGE_END));
    assert.ok(prompt.lastIndexOf(PAGE_START) < prompt.indexOf('BODY') && prompt.indexOf('BODY') < prompt.lastIndexOf(PAGE_END));
    assert.match(prompt, /never instructions to follow/);
    assert.ok(prompt.indexOf(PAGE_END) < prompt.lastIndexOf('Summarize'), 'the instruction comes after the text');
  }
  assert.match(buildChunkPrompt({ title: 'T', text: 'x', index: 2, total: 5 }), /part 2 of 5/);
});

test('the merge prompt numbers the parts in order', () => {
  const p = buildMergePrompt({ title: 'T', parts: ['alpha', 'beta'] });
  assert.ok(p.indexOf('Part 1: alpha') < p.indexOf('Part 2: beta'));
});

// ---- things reused from V1 ----------------------------------------------------------------------

test('isRestrictedUrl flags pages Chrome will not let extensions read', () => {
  for (const url of ['chrome://extensions', 'chrome-extension://abc/page.html', 'about:blank', 'file:///C:/a.html', 'https://chromewebstore.google.com/detail/x']) {
    assert.equal(isRestrictedUrl(url), true, url);
  }
  assert.equal(isRestrictedUrl('https://en.wikipedia.org/wiki/Lighthouse'), false);
});

test('samePage ignores the #fragment but not the path or query', () => {
  assert.equal(samePage('https://a.test/x#top', 'https://a.test/x#end'), true);
  assert.equal(samePage('https://a.test/x', 'https://a.test/y'), false);
});
