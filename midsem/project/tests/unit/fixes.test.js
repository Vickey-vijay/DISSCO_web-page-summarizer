// Tests added after the first browser test run (docs/test-runs/run-1.md): they pin the
// behaviour of the fixes for the bugs and risks that run found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samePage } from '../../src/core/url.js';
import { runPipeline } from '../../src/core/pipeline.js';
import { createGeminiEngine, parseDurationSeconds } from '../../src/engines/gemini.js';
import { loadSettings } from '../../src/core/config.js';
import { describeError, humanizeWait, toAppError } from '../../src/core/errors.js';

test('samePage ignores the #fragment but not the path or query', () => {
  assert.equal(samePage('https://a.test/x#top', 'https://a.test/x#end'), true);
  assert.equal(samePage('https://a.test/x', 'https://a.test/y'), false);
  assert.equal(samePage('https://a.test/x?id=1', 'https://a.test/x?id=2'), false);
  assert.equal(samePage(undefined, undefined), true);
});

test('O2: a page that needs more parts than maxChunks is refused before any model call', async () => {
  const calls = [];
  const engine = {
    async summarizeChunk() {
      calls.push('chunk');
      return 's';
    },
    async mergeSummaries() {
      calls.push('merge');
      return 'm';
    },
  };
  const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${'word '.repeat(30)}`).join('\n\n');
  await assert.rejects(
    () =>
      runPipeline({
        extract: async () => ({ title: 'T', url: 'u', text }),
        engine,
        settings: { chunkChars: 500, minTextChars: 100, maxChunks: 5 },
      }),
    (err) => err.code === 'TOO_LONG',
  );
  assert.deepEqual(calls, []);
});

test('O2: maxChunks can be set through storage like the other test seams', async () => {
  const s = await loadSettings({ get: async () => ({ maxChunks: 3 }) });
  assert.equal(s.maxChunks, 3);
});

test('O4: a 403 about the caller location is a service problem, not a bad key', async () => {
  const settings = {
    apiKey: 'k', apiBaseUrl: 'https://example.test', model: 'm', requestTimeoutMs: 200,
    maxRetries: 0, retryBaseDelayMs: 1, temperature: 0.2, thinkingLevel: '',
  };
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: 'User location is not supported for the API use.' } }), { status: 403 });
  const engine = createGeminiEngine(settings, { fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(
    () => engine.summarizeChunk('t', { total: 1 }),
    (err) => toAppError(err).code === 'SERVICE_ERROR',
  );
});

// ---- found by the first live run: the free tier allowed only 20 requests a day -------------

const quotaSettings = {
  apiKey: 'k', apiBaseUrl: 'https://example.test', model: 'm', requestTimeoutMs: 200,
  maxRetries: 3, retryBaseDelayMs: 1000, temperature: 0.2, thinkingLevel: '',
};
const tooMany = (body, headers = {}) => async () =>
  new Response(JSON.stringify(body), { status: 429, headers: { 'Content-Type': 'application/json', ...headers } });

test('parseDurationSeconds reads the formats Google uses', () => {
  assert.equal(parseDurationSeconds('6h54m7.15s'), 6 * 3600 + 54 * 60 + 7.15);
  assert.equal(parseDurationSeconds('41s'), 41);
  assert.equal(parseDurationSeconds('0.5s'), 0.5);
  assert.equal(parseDurationSeconds('2m'), 120);
  assert.equal(parseDurationSeconds('soon'), null);
  assert.equal(parseDurationSeconds(''), null);
});

test('humanizeWait gives a short human phrase', () => {
  assert.equal(humanizeWait(30), 'a minute');
  assert.equal(humanizeWait(20 * 60), '20 minutes');
  assert.equal(humanizeWait(3600), 'an hour');
  assert.equal(humanizeWait(24800), '7 hours');
});

test('a 429 with a long RetryInfo is QUOTA_EXHAUSTED at once, with no pointless retries', async () => {
  let calls = 0;
  const base = tooMany({ error: { message: 'You exceeded your current quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '24800s' }] } });
  const fetchImpl = async (...a) => (calls++, base(...a));
  const engine = createGeminiEngine(quotaSettings, { fetchImpl, sleepImpl: async () => { throw new Error('must not sleep'); } });
  await assert.rejects(
    () => engine.summarizeChunk('t', { total: 1 }),
    (err) => {
      const info = describeError(err);
      return info.code === 'QUOTA_EXHAUSTED' && /about 7 hours/.test(info.message) && /different key/.test(info.message);
    },
  );
  assert.equal(calls, 1);
});

test('the same is detected from the "Please retry in 6h54m7s" sentence when there is no RetryInfo', async () => {
  const fetchImpl = tooMany({ error: { message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 20. Please retry in 6h54m7.15s.' } });
  const engine = createGeminiEngine(quotaSettings, { fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(() => engine.summarizeChunk('t', { total: 1 }), (err) => toAppError(err).code === 'QUOTA_EXHAUSTED');
});

test('a short RetryInfo is honoured as the retry delay instead of the back-off', async () => {
  let n = 0;
  const fetchImpl = async () =>
    n++ === 0
      ? new Response(JSON.stringify({ error: { details: [{ retryDelay: '2s' }] } }), { status: 429 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
  const slept = [];
  const engine = createGeminiEngine(quotaSettings, { fetchImpl, sleepImpl: async (ms) => slept.push(ms) });
  assert.equal(await engine.summarizeChunk('t', { total: 1 }), 'ok');
  assert.deepEqual(slept, [2000]);
});
