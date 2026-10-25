import { test } from 'node:test';
import assert from 'node:assert/strict';
import { condenseText, isHeading } from '../../src/core/condense.js';

const sentence = (n, k) => `Sentence ${k} of paragraph ${n} has some useful words in it.`;
const paragraph = (n) => [1, 2, 3].map((k) => sentence(n, k)).join(' ');
const page = (count) =>
  Array.from({ length: count }, (_, i) => (i % 5 === 0 ? [`Section ${i / 5 + 1}`, paragraph(i)] : [paragraph(i)])).flat().join('\n\n');

test('a page that fits the budget is left alone, and a budget of 0 means no limit', () => {
  const text = page(10);
  assert.deepEqual(condenseText(text, text.length), { text, condensed: false, pageChars: text.length, readChars: text.length });
  assert.equal(condenseText(text, 0).condensed, false);
});

test('a long page is cut to the budget, keeps its opening, and stays in page order', () => {
  const text = page(120);
  const budget = 6000;
  const r = condenseText(text, budget);
  assert.equal(r.condensed, true);
  assert.ok(r.text.length <= budget, `read ${r.text.length} of a budget of ${budget}`);
  assert.equal(r.readChars, r.text.length);
  assert.equal(r.pageChars, text.length);
  assert.ok(r.text.startsWith('Section 1') && r.text.includes(paragraph(0)), 'the opening is kept in full');
  const numbers = [...r.text.matchAll(/paragraph (\d+)/g)].map((m) => Number(m[1]));
  for (let i = 1; i < numbers.length; i += 1) assert.ok(numbers[i] >= numbers[i - 1], 'page order is kept');
  assert.ok(Math.max(...numbers) > 90, 'the end of the page is represented, not only the start');
});

test('the openings of paragraphs are used (first sentences), not the endings', () => {
  const r = condenseText(page(120), 6000);
  assert.ok(!r.text.includes('Sentence 3 of paragraph 100'));
  assert.ok(/Sentence 1 of paragraph (6\d|7\d|8\d)/.test(r.text));
});

test('the heading of a kept section comes with it', () => {
  const r = condenseText(page(120), 6000);
  const headings = r.text.split('\n\n').filter(isHeading);
  assert.ok(headings.length > 3, `headings kept: ${headings.length}`);
});

test('a page that is one huge paragraph is cut by sentences up to the budget', () => {
  const text = Array.from({ length: 400 }, (_, i) => sentence(1, i + 1)).join(' ');
  const r = condenseText(text, 3000);
  assert.ok(r.text.length <= 3000 && r.text.length > 2500, `read ${r.text.length}`);
  assert.ok(r.text.endsWith('in it.'), 'it ends at a full sentence');
});

test('when only a few paragraphs are over the budget, more sentences are kept per paragraph', () => {
  const text = page(24);
  const r = condenseText(text, Math.floor(text.length * 0.7));
  assert.ok(r.text.length <= text.length * 0.7);
  assert.ok(r.text.includes('Sentence 2 of paragraph'), 'second sentences survive when there is room');
});
