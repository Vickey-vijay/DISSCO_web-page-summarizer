import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../../src/core/pipeline.js';
import { AppError } from '../../src/core/errors.js';

const SETTINGS = { chunkChars: 400, minTextChars: 100, model: 'fake-model' };

const paragraph = (n) => `Paragraph ${n} talks about topic ${n}. It has a few facts, a number like ${n * 7}, and a closing sentence.`;
const longText = (paragraphs) => Array.from({ length: paragraphs }, (_, i) => paragraph(i + 1)).join('\n\n');

function fakeEngine({ failOnChunk = null } = {}) {
  const log = { chunks: [], merges: [] };
  return {
    log,
    async summarizeChunk(text, ctx) {
      if (failOnChunk === ctx.index) throw new AppError('RATE_LIMIT', 'fake 429');
      log.chunks.push({ ...ctx, text });
      return ctx.total === 1 ? `FINAL: ${text.slice(0, 20)}` : `S${ctx.index}`;
    },
    async mergeSummaries(parts) {
      log.merges.push(parts);
      return `MERGED(${parts.join('+')})`;
    },
  };
}

const page = (text) => ({ title: 'Test page', url: 'https://example.test/a', text, method: 'readability' });

test('a short page is summarized in one call with no merge', async () => {
  const engine = fakeEngine();
  const events = [];
  const out = await runPipeline({
    extract: async () => page(longText(2)),
    engine,
    settings: { ...SETTINGS, chunkChars: 5000 },
    onProgress: (p) => events.push(p),
  });
  assert.equal(engine.log.chunks.length, 1);
  assert.equal(engine.log.merges.length, 0);
  assert.match(out.summary, /^FINAL:/);
  assert.equal(out.stats.chunks, 1);
  assert.equal(out.stats.apiCalls, 1);
  assert.deepEqual(events.map((e) => e.phase), ['extracting', 'summarizing', 'summarizing']);
});

test('a long page is split, summarized part by part, then merged in order', async () => {
  const engine = fakeEngine();
  const events = [];
  const out = await runPipeline({
    extract: async () => page(longText(12)),
    engine,
    settings: SETTINGS,
    onProgress: (p) => events.push(p),
  });
  const n = engine.log.chunks.length;
  assert.ok(n > 1, 'expected several chunks');
  assert.deepEqual(engine.log.chunks.map((c) => c.index), Array.from({ length: n }, (_, i) => i + 1));
  assert.ok(engine.log.chunks.every((c) => c.total === n && c.text.length <= SETTINGS.chunkChars));
  assert.ok(engine.log.merges.length >= 1);
  assert.match(out.summary, /^MERGED\(/);
  assert.equal(out.stats.chunks, n);
  assert.equal(out.stats.apiCalls, n + engine.log.merges.length);

  const progress = events.filter((e) => e.phase === 'summarizing').map((e) => e.current);
  assert.deepEqual(progress, Array.from({ length: n + 1 }, (_, i) => i), 'progress counts 0..n');
  assert.ok(events.some((e) => e.phase === 'merging'));
});

test('too little text stops before any model call', async () => {
  const engine = fakeEngine();
  await assert.rejects(
    () => runPipeline({ extract: async () => page('Hello there.'), engine, settings: SETTINGS }),
    (err) => err.code === 'TOO_LITTLE_TEXT',
  );
  assert.equal(engine.log.chunks.length, 0);
});

test('an extraction failure is passed up', async () => {
  const engine = fakeEngine();
  await assert.rejects(
    () =>
      runPipeline({
        extract: async () => {
          throw new AppError('RESTRICTED_PAGE', 'chrome://extensions');
        },
        engine,
        settings: SETTINGS,
      }),
    (err) => err.code === 'RESTRICTED_PAGE',
  );
});

test('an engine failure part way stops the run and nothing is merged', async () => {
  const engine = fakeEngine({ failOnChunk: 2 });
  await assert.rejects(
    () => runPipeline({ extract: async () => page(longText(12)), engine, settings: SETTINGS }),
    (err) => err.code === 'RATE_LIMIT',
  );
  assert.equal(engine.log.chunks.length, 1);
  assert.equal(engine.log.merges.length, 0);
});

test('an aborted signal stops the run between chunks', async () => {
  const engine = fakeEngine();
  const controller = new AbortController();
  await assert.rejects(() =>
    runPipeline({
      extract: async () => page(longText(12)),
      engine,
      settings: SETTINGS,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.phase === 'summarizing' && p.current === 1) controller.abort();
      },
    }),
  );
  assert.equal(engine.log.chunks.length, 1);
});

test('elapsed time uses the injected clock', async () => {
  let t = 1000;
  const out = await runPipeline({
    extract: async () => page(longText(2)),
    engine: fakeEngine(),
    settings: { ...SETTINGS, chunkChars: 5000 },
    now: () => (t += 250),
  });
  assert.ok(out.stats.elapsedMs >= 250);
});
