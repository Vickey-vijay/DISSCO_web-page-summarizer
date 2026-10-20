// Turns the model's plain-text summary into a list of blocks the popup can render safely.
// Kept separate (and free of DOM code) so it can be unit tested in Node.
//
// Lines starting with "- ", "* " or a bullet become list items; everything else is a paragraph.
// The popup builds elements with textContent only, so model output is never parsed as HTML.

/** @returns {Array<{type: 'p', text: string} | {type: 'ul', items: string[]}>} */
export function parseSummary(raw) {
  const blocks = [];
  let list = null;
  for (const rawLine of String(raw ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (line === '') {
      list = null;
      continue;
    }
    const bullet = line.match(/^(?:[-*•]\s+)(.*)$/);
    if (bullet) {
      if (!list) {
        list = { type: 'ul', items: [] };
        blocks.push(list);
      }
      list.items.push(stripEmphasis(bullet[1]));
    } else {
      list = null;
      blocks.push({ type: 'p', text: stripEmphasis(line) });
    }
  }
  return blocks;
}

// Models sometimes add **bold** even when told not to; show the words without the asterisks.
function stripEmphasis(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').trim();
}
