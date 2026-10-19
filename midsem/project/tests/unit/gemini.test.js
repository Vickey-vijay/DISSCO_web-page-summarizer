import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiEngine } from '../../src/engines/gemini.js';
import { PAGE_START } from '../../src/core/prompts.js';
import { toAppError } from '../../src/core/errors.js';

const SETTINGS = {
  apiKey: 'test-key-123',
  apiBaseUrl: 'https://example.test',
  model: 'test-model',
  requestTimeoutMs: 200,
  maxRetries: 2,
  retryBaseDelayMs: 1000,
  temperature: 0.2,
  thinkingLevel: 'low',
};

const okBody = (text) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** fetch stub that plays a list of responses (or functions) in order and records the calls. */
function scriptedFetch(steps) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (typeof step === 'function') return step(url, init);
    // A Response body can be read once; the last step may be replayed, so hand out a clone.
    return step.clone();
  };
  fn.calls = calls;
  return fn;
}

const noSleep = () => {
  const slept = [];
  const fn = async (ms) => {
    slept.push(ms);
  };
  fn.slept = slept;
  return fn;
};

async function code(promise) {
  try {
    await promise;
  } catch (err) {
    return toAppError(err).code;
  }
  return 'NO_ERROR';
}

test('sends the key in a header, not in the URL, and returns the text', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(200, okBody('  Hello summary  '))]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  const out = await engine.summarizeChunk('Some page text', { title: 'T', index: 1, total: 1 });
  assert.equal(out, 'Hello summary');

  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://example.test/v1beta/models/test-model:generateContent');
  assert.ok(!url.includes('test-key-123'), 'key must not be in the URL');
  assert.equal(init.headers['x-goog-api-key'], 'test-key-123');
  const body = JSON.parse(init.body);
  assert.match(body.contents[0].parts[0].text, /Some page text/);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
});

test('no thinking setting means no thinkingConfig is sent', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(200, okBody('ok'))]);
  const engine = createGeminiEngine({ ...SETTINGS, thinkingLevel: '' }, { fetchImpl, sleepImpl: noSleep() });
  await engine.summarizeChunk('t', { total: 1 });
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body).generationConfig.thinkingConfig, undefined);
});

test('a one-chunk page uses the final-format prompt, a long page uses the chunk prompt', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(200, okBody('ok'))]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  await engine.summarizeChunk('text', { title: 'T', index: 1, total: 1 });
  await engine.summarizeChunk('text', { title: 'T', index: 2, total: 5 });
  const prompt = (i) => JSON.parse(fetchImpl.calls[i].init.body).contents[0].parts[0].text;
  assert.match(prompt(0), /Summarize this web page/);
  assert.match(prompt(1), /part 2 of 5/);
  assert.ok(prompt(1).includes(PAGE_START));
});

test('merge sends all partial summaries in order', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(200, okBody('merged'))]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  const out = await engine.mergeSummaries(['first part', 'second part'], { title: 'T' });
  assert.equal(out, 'merged');
  const text = JSON.parse(fetchImpl.calls[0].init.body).contents[0].parts[0].text;
  assert.ok(text.indexOf('first part') < text.indexOf('second part'));
});

test('no key: NO_KEY and no request is made', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(200, okBody('x'))]);
  const engine = createGeminiEngine({ ...SETTINGS, apiKey: '' }, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'NO_KEY');
  assert.equal(fetchImpl.calls.length, 0);
});

test('HTTP 400 "API key not valid" is INVALID_KEY and is not retried', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } })]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'INVALID_KEY');
  assert.equal(fetchImpl.calls.length, 1);
});

test('HTTP 403 is INVALID_KEY', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(403, { error: { message: 'denied' } })]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'INVALID_KEY');
});

test('HTTP 429 then success: retries with back-off and reports a notice', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(429, { error: { message: 'quota' } }), jsonResponse(200, okBody('fine'))]);
  const sleep = noSleep();
  const notices = [];
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: sleep, onNotice: (n) => notices.push(n) });
  assert.equal(await engine.summarizeChunk('t', { total: 1 }), 'fine');
  assert.equal(fetchImpl.calls.length, 2);
  assert.deepEqual(sleep.slept, [1000]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].code, 'RATE_LIMIT');
  assert.equal(notices[0].attempt, 1);
});

test('back-off doubles on each retry', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(429, {}), jsonResponse(429, {}), jsonResponse(200, okBody('ok'))]);
  const sleep = noSleep();
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: sleep });
  await engine.summarizeChunk('t', { total: 1 });
  assert.deepEqual(sleep.slept, [1000, 2000]);
});

test('HTTP 429 every time: RATE_LIMIT after the retries are used up', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(429, { error: { message: 'quota' } })]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'RATE_LIMIT');
  assert.equal(fetchImpl.calls.length, SETTINGS.maxRetries + 1);
});

test('a Retry-After header is respected', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(429, {}, { 'Retry-After': '7' }), jsonResponse(200, okBody('ok'))]);
  const sleep = noSleep();
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: sleep });
  await engine.summarizeChunk('t', { total: 1 });
  assert.deepEqual(sleep.slept, [7000]);
});

test('HTTP 500 every time: SERVICE_ERROR', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(500, { error: { message: 'oops' } })]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'SERVICE_ERROR');
});

test('HTTP 404 (unknown model) is SERVICE_ERROR and not retried', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(404, { error: { message: 'model not found' } })]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'SERVICE_ERROR');
  assert.equal(fetchImpl.calls.length, 1);
});

test('fetch rejecting (offline) is NETWORK', async () => {
  const fetchImpl = scriptedFetch([() => Promise.reject(new TypeError('Failed to fetch'))]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'NETWORK');
});

test('no answer within the timeout is TIMEOUT', async () => {
  // Never answers, but honours the abort signal like the real fetch does.
  const hanging = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  const engine = createGeminiEngine({ ...SETTINGS, requestTimeoutMs: 50 }, { fetchImpl: scriptedFetch([hanging]), sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'TIMEOUT');
});

test('an empty answer is EMPTY_OR_BLOCKED', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(200, { candidates: [] })]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'EMPTY_OR_BLOCKED');
});

test('a safety block is EMPTY_OR_BLOCKED and the reason is kept in the detail', async () => {
  const fetchImpl = scriptedFetch([jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })]);
  const engine = createGeminiEngine(SETTINGS, { fetchImpl, sleepImpl: noSleep() });
  try {
    await engine.summarizeChunk('t', { total: 1 });
    assert.fail('should have thrown');
  } catch (err) {
    const e = toAppError(err);
    assert.equal(e.code, 'EMPTY_OR_BLOCKED');
    assert.match(e.detail, /SAFETY/);
  }
});

test('an abort by the caller is not reported as a timeout or network error', async () => {
  const controller = new AbortController();
  const hanging = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  const engine = createGeminiEngine({ ...SETTINGS, requestTimeoutMs: 5000 }, { fetchImpl: scriptedFetch([hanging]), sleepImpl: noSleep() });
  const pending = code(engine.summarizeChunk('t', { total: 1, signal: controller.signal }));
  setTimeout(() => controller.abort(), 20);
  assert.equal(await pending, 'CANCELLED');
});
