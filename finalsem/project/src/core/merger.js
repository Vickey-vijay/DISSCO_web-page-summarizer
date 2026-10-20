// Joins the per-chunk summaries into one summary (FR3).
//
// If all partial summaries fit in one request, a single merge call is made.
// If they do not, they are merged in groups first and the results are merged again
// (a small merge tree), so a very long page still ends in one summary.

/** Packs consecutive parts into groups whose joined length stays within maxChars. */
export function groupBySize(parts, maxChars) {
  const groups = [];
  let current = [];
  let size = 0;
  for (const part of parts) {
    const extra = current.length === 0 ? part.length : part.length + 2;
    if (current.length > 0 && size + extra > maxChars) {
      groups.push(current);
      current = [];
      size = 0;
    }
    size += current.length === 0 ? part.length : part.length + 2;
    current.push(part);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * @param {string[]} parts partial summaries, in page order
 * @param {{
 *   engine: {mergeSummaries: (parts: string[], ctx: object) => Promise<string>},
 *   maxChars: number,
 *   title?: string,
 *   signal?: AbortSignal,
 *   onStep?: (info: {parts: number}) => void
 * }} options
 * @returns {Promise<{summary: string, calls: number, levels: number}>}
 */
export async function mergeAll(parts, { engine, maxChars, title = '', signal, onStep = () => {} }) {
  if (parts.length === 0) return { summary: '', calls: 0, levels: 0 };
  let level = parts.slice();
  let calls = 0;
  let levels = 0;

  while (level.length > 1) {
    let groups = groupBySize(level, maxChars);
    // Every part is too big to share a request: merge them all at once instead of looping forever.
    if (groups.length === level.length) groups = [level];

    const next = [];
    for (const group of groups) {
      if (group.length === 1) {
        next.push(group[0]);
        continue;
      }
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      onStep({ parts: group.length });
      next.push(await engine.mergeSummaries(group, { title, signal }));
      calls += 1;
    }
    level = next;
    levels += 1;
  }
  return { summary: level[0], calls, levels };
}
