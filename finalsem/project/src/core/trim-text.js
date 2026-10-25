// Takes out the parts of a page that are not worth reading to a small model: the back matter
// (See also, Notes, References, Bibliography, External links) and the little markers that
// encyclopedia pages put inside sentences ([12], [a], [edit], [citation needed]).
//
// Why: on a slow graphics chip the cost of a summary is almost all the time spent READING the
// text (measured: about 26 tokens a second on built-in Intel graphics), so every character that
// is not read is time saved. On the 36,752 character Wikipedia "Lighthouse" page the back matter
// is about a quarter of the text.
//
// Pure functions with no browser APIs, so they are tested in Node.

const BACK_MATTER = /^(see also|references|notes|footnotes|endnotes|citations|sources|bibliography|further reading|external links|works cited|general references)(\s*\[edit\])?$/i;
const MARKERS = /\[(?:\d{1,3}|[a-z]|edit|citation needed|clarification needed|when\?|who\?|dubious[^\]]{0,20})\]/gi;

// The back matter only counts when it starts well into the page, and enough text is left before it.
const MIN_START_FRACTION = 0.4;
const MIN_KEPT_CHARS = 800;

/**
 * @param {string} text normalized page text (paragraphs separated by a blank line)
 * @returns {{text: string, removedChars: number}}
 */
export function cleanPageText(text) {
  const original = String(text ?? '');
  const paragraphs = original.split('\n\n');
  let offset = 0;
  let keep = paragraphs;
  for (let i = 1; i < paragraphs.length; i += 1) {
    offset += paragraphs[i - 1].length + 2;
    if (BACK_MATTER.test(paragraphs[i].trim()) && offset >= original.length * MIN_START_FRACTION && offset >= MIN_KEPT_CHARS) {
      keep = paragraphs.slice(0, i);
      break;
    }
  }
  const cleaned = keep
    .join('\n\n')
    .replace(MARKERS, '')
    .replace(/ {2,}/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    .trim();
  return { text: cleaned, removedChars: original.length - cleaned.length };
}
