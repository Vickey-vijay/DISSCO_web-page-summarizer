// Splits long page text into chunks no longer than maxChars (FR3).
// Pure functions with no browser APIs, so V2 reuses them unchanged and tests run in Node.
//
// Strategy, from coarse to fine:
//   1. paragraphs (blank-line separated) are packed together up to maxChars
//   2. a paragraph longer than maxChars is split at sentence ends
//   3. a sentence longer than maxChars is split at the last space before the limit
//   4. a "word" longer than maxChars (no spaces at all) is cut hard
// Chunks are never empty, never longer than maxChars, and keep the original order.

/** Normalises line endings and whitespace; keeps paragraph breaks as a blank line. */
export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(paragraph) {
  // Split after . ! ? (optionally followed by a closing quote or bracket) and a space.
  return paragraph.split(/(?<=[.!?]["')\]]?)\s+/).filter((s) => s.length > 0);
}

function hardSplit(piece, maxChars) {
  const out = [];
  let rest = piece;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut < Math.floor(maxChars * 0.5)) cut = maxChars; // no usable space: cut hard
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out.filter((p) => p.length > 0);
}

/** Breaks one paragraph into pieces that each fit in maxChars. */
function splitParagraph(paragraph, maxChars) {
  if (paragraph.length <= maxChars) return [paragraph];
  const pieces = [];
  for (const sentence of splitSentences(paragraph)) {
    if (sentence.length <= maxChars) pieces.push(sentence);
    else pieces.push(...hardSplit(sentence, maxChars));
  }
  return pieces;
}

/**
 * @param {string} text   page text
 * @param {number} maxChars maximum characters per chunk
 * @returns {string[]}
 */
export function chunkText(text, maxChars) {
  if (!Number.isFinite(maxChars) || maxChars < 1) {
    throw new RangeError('maxChars must be a positive number');
  }
  const clean = normalizeText(text);
  if (clean.length === 0) return [];
  if (clean.length <= maxChars) return [clean];

  const units = [];
  for (const paragraph of clean.split(/\n{2,}/)) {
    const p = paragraph.trim();
    if (p.length === 0) continue;
    units.push(...splitParagraph(p, maxChars));
  }

  const chunks = [];
  let current = '';
  for (const unit of units) {
    if (current.length === 0) {
      current = unit;
    } else if (current.length + 2 + unit.length <= maxChars) {
      current += '\n\n' + unit;
    } else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
