// Tests added after the first browser test run (docs/test-runs/run-1.md): they pin the
// behaviour of the fixes for the bugs and risks that run found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samePage } from '../../src/core/url.js';
import { runPipeline } from '../../src/core/pipeline.js';
import { createGeminiEngine } from '../../src/engines/gemini.js';
import { loadSettings } from '../../src/core/config.js';
import { toAppError } from '../../src/core/errors.js';

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
