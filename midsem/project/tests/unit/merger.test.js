import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupBySize, mergeAll } from '../../src/core/merger.js';

// An engine that records each merge call and returns a short, predictable summary.
function fakeEngine() {
  const calls = [];
  return {
    calls,
    async mergeSummaries(parts) {
      calls.push(parts);
      return `M(${parts.length})`;
    },
  };
}

test('groupBySize keeps order and respects the limit', () => {
  const groups = groupBySize(['aaaa', 'bbbb', 'cccc', 'dddd'], 10);
  // 4 + 2 + 4 = 10 fits; the third part starts a new group.
  assert.deepEqual(groups, [['aaaa', 'bbbb'], ['cccc', 'dddd']]);
  assert.deepEqual(groupBySize([], 10), []);
});

test('no parts gives an empty summary and no calls', async () => {
  const engine = fakeEngine();
  const out = await mergeAll([], { engine, maxChars: 100 });
  assert.deepEqual(out, { summary: '', calls: 0, levels: 0 });
});

test('a single part is returned as is, without calling the model', async () => {
  const engine = fakeEngine();
  const out = await mergeAll(['only one'], { engine, maxChars: 100 });
  assert.equal(out.summary, 'only one');
  assert.equal(engine.calls.length, 0);
});

test('parts that fit together are merged with one call', async () => {
  const engine = fakeEngine();
  const out = await mergeAll(['a', 'b', 'c'], { engine, maxChars: 100 });
  assert.equal(engine.calls.length, 1);
  assert.deepEqual(engine.calls[0], ['a', 'b', 'c']);
  assert.equal(out.calls, 1);
  assert.equal(out.levels, 1);
});

test('parts that do not fit are merged in groups, then merged again', async () => {
  const engine = fakeEngine();
  const parts = Array.from({ length: 8 }, (_, i) => `part${i}-` + 'x'.repeat(20)); // ~26 chars each
  const out = await mergeAll(parts, { engine, maxChars: 60 }); // two parts per group
  assert.equal(out.summary.startsWith('M('), true);
  assert.ok(out.levels >= 2, `expected a merge tree, got ${out.levels} level(s)`);
  assert.ok(out.calls > 1);
  assert.equal(engine.calls.at(-1).every((p) => p.startsWith('M(')), true, 'final call merges earlier merges');
});

test('parts too big to share a request are merged at once instead of looping forever', async () => {
  const engine = fakeEngine();
  const parts = ['y'.repeat(60), 'z'.repeat(60), 'w'.repeat(60)];
  const out = await mergeAll(parts, { engine, maxChars: 100 });
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].length, 3);
  assert.equal(out.summary, 'M(3)');
});

test('an engine failure is passed up', async () => {
  const engine = {
    async mergeSummaries() {
      throw new Error('boom');
    },
  };
  await assert.rejects(() => mergeAll(['a', 'b'], { engine, maxChars: 100 }), /boom/);
});

test('an aborted signal stops the merge', async () => {
  const engine = fakeEngine();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => mergeAll(['a', 'b'], { engine, maxChars: 100, signal: controller.signal }));
  assert.equal(engine.calls.length, 0);
});
