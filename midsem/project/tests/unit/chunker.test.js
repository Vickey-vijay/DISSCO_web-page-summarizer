import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, normalizeText } from '../../src/core/chunker.js';

const words = (s) => s.split(/\s+/).filter(Boolean);

test('empty or whitespace-only text gives no chunks', () => {
  assert.deepEqual(chunkText('', 100), []);
  assert.deepEqual(chunkText('   \n\n  \t ', 100), []);
  assert.deepEqual(chunkText(undefined, 100), []);
});

test('text that fits stays in one chunk', () => {
  assert.deepEqual(chunkText('One short paragraph.', 100), ['One short paragraph.']);
});

test('paragraphs are packed together up to the limit', () => {
  const para = 'a'.repeat(40);
  const chunks = chunkText([para, para, para, para].join('\n\n'), 100);
  // 40 + 2 + 40 = 82 fits; adding a third (124) does not.
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((c) => c.length <= 100));
});

test('no chunk is empty or longer than the limit', () => {
  const sentence = 'The quick brown fox jumps over the lazy dog. ';
  const text = Array.from({ length: 60 }, (_, i) => sentence.repeat(1 + (i % 4))).join('\n\n');
  for (const max of [60, 120, 500, 2000]) {
    const chunks = chunkText(text, max);
    assert.ok(chunks.length > 0);
    for (const c of chunks) {
      assert.ok(c.length > 0, 'empty chunk');
      assert.ok(c.length <= max, `chunk of ${c.length} > ${max}`);
    }
  }
});

test('a long paragraph is split at sentence ends', () => {
  const sentences = Array.from({ length: 10 }, (_, i) => `This is sentence number ${i + 1} of the paragraph.`);
  const chunks = chunkText(sentences.join(' '), 120);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.match(c, /[.]$/, 'chunk should end at a sentence end');
});

test('a sentence with no punctuation is split at spaces', () => {
  const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
  const chunks = chunkText(text, 100);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= 100);
    assert.ok(!/\bword\d+word/.test(c), 'a word was cut in half');
  }
  assert.deepEqual(words(chunks.join(' ')), words(text));
});

test('a single word longer than the limit is cut hard', () => {
  const chunks = chunkText('x'.repeat(250), 100);
  assert.deepEqual(chunks.map((c) => c.length), [100, 100, 50]);
});

test('no words are lost and order is kept', () => {
  const text = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} says something short. And one more thing.`).join('\n\n');
  const chunks = chunkText(text, 700);
  assert.deepEqual(words(chunks.join('\n\n')), words(text));
});

test('invalid limits are rejected', () => {
  assert.throws(() => chunkText('abc', 0), RangeError);
  assert.throws(() => chunkText('abc', NaN), RangeError);
});

test('normalizeText cleans line endings, tabs and non-breaking spaces', () => {
  assert.equal(normalizeText('a\r\nb\t\tc d\n\n\n\ne'), 'a\nb c d\n\ne');
});
