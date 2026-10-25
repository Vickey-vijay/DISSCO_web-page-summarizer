import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPageText } from '../../src/core/trim-text.js';

const prose = (n) => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} of the article says something useful about the subject.`.repeat(3)).join('\n\n');

test('the back matter of a long page is cut off', () => {
  const body = prose(20);
  const page = `${body}\n\nSee also\n\nCrib lighthouse\n\nDay beacon\n\nNotes\n\n1. Something cited.\n\nBibliography\n\nA book.`;
  const { text, removedChars } = cleanPageText(page);
  assert.equal(text, body);
  assert.equal(removedChars, page.length - body.length);
});

test('a heading called "Notes" near the start of the page is not back matter', () => {
  const page = `Intro paragraph.\n\nNotes\n\n${prose(20)}`;
  const { text } = cleanPageText(page);
  assert.ok(text.includes('Notes'));
  assert.ok(text.includes('Paragraph 20'));
});

test('nothing is cut when too little text would be left', () => {
  const page = 'Short intro.\n\nReferences\n\nA long list of references that is much longer than the intro. '.repeat(20);
  const { text } = cleanPageText(page);
  assert.ok(text.length > 800);
});

test('sentence markers such as [12], [a], [edit] and [citation needed] are removed', () => {
  const page = `Fresnel built a lens in 1822[12] that was lighter[a] than before [citation needed]. History [edit]\n\n${prose(5)}`;
  const { text } = cleanPageText(page);
  assert.ok(text.startsWith('Fresnel built a lens in 1822 that was lighter than before. History'));
  assert.ok(!/\[\w+\]/.test(text));
});

test('text without back matter or markers comes back unchanged', () => {
  const page = prose(8);
  assert.deepEqual(cleanPageText(page), { text: page, removedChars: 0 });
});

test('ordinary words in brackets are kept', () => {
  const { text } = cleanPageText(`The name is written [sic] in the letter, and [the lamp] was lit.\n\n${prose(3)}`);
  assert.ok(text.includes('[sic]'));
  assert.ok(text.includes('[the lamp]'));
});
