// Shortens a long page BEFORE the model reads it, for computers where reading is slow.
//
// Measured on built-in Intel graphics: the model reads about 26 tokens a second (about 100
// characters a second) whatever its size, and reading is about 80 percent of the time of one
// part. A 36,000 character page therefore costs about 6 minutes of reading alone. Writing the
// summary is cheap in comparison. So the only real way to make a long page quick on such a
// computer is to read less of it.
//
// What is kept, in page order:
//   - the opening of the page, in full, up to about a third of the budget (the lead of an
//     article says what it is about);
//   - from the rest, the first sentences of the paragraphs, evenly spread over the page, and the
//     headings of the sections that were kept.
// A budget of 0 means "read everything". Pure functions, tested in Node.

const LEAD_SHARE = 0.35;
const HEADING_MAX_CHARS = 70;

export function isHeading(paragraph) {
  const p = paragraph.trim();
  return p.length > 0 && p.length <= HEADING_MAX_CHARS && !/[.!?:;]["')\]]?$/.test(p) && !p.includes('\n');
}

function sentencesOf(paragraph) {
  return paragraph.split(/(?<=[.!?]["')\]]?)\s+/).filter((s) => s.length > 0);
}

function firstSentences(paragraph, count, maxChars) {
  let out = '';
  for (const sentence of sentencesOf(paragraph).slice(0, count)) {
    if (out && out.length + sentence.length + 1 > maxChars) break;
    out += (out ? ' ' : '') + sentence;
  }
  return (out || paragraph).slice(0, maxChars);
}

/**
 * @param {string} text normalized page text (paragraphs separated by a blank line)
 * @param {number} budgetChars the most characters the model should read; 0 = no limit
 * @returns {{text: string, condensed: boolean, pageChars: number, readChars: number}}
 */
export function condenseText(text, budgetChars) {
  const pageChars = text.length;
  if (!budgetChars || pageChars <= budgetChars) return { text, condensed: false, pageChars, readChars: pageChars };

  const paragraphs = text.split('\n\n');
  // A page with a single paragraph has no "rest": the opening gets the whole budget.
  const leadBudget = paragraphs.length === 1 ? budgetChars : Math.floor(budgetChars * LEAD_SHARE);

  // 1. The lead: whole paragraphs from the top while they fit; a long first paragraph is cut by sentences.
  const lead = [];
  let used = 0;
  let next = 0;
  while (next < paragraphs.length) {
    const p = paragraphs[next];
    const room = leadBudget - used - (lead.length ? 2 : 0);
    if (p.length <= room) {
      lead.push(p);
      used += p.length + (lead.length > 1 ? 2 : 0);
      next += 1;
    } else {
      if (lead.length === 0) {
        lead.push(firstSentences(p, 99, leadBudget));
        used = lead[0].length;
        next += 1;
      }
      break;
    }
  }

  // 2. The rest: openings of paragraphs, evenly spread, with the heading of each kept section.
  const rest = paragraphs.slice(next);
  const restBudget = budgetChars - used - 2;
  const items = []; // {heading, body}
  let pendingHeading = null;
  for (const p of rest) {
    if (isHeading(p)) {
      pendingHeading = p.trim();
    } else if (p.trim().length > 0) {
      items.push({ heading: pendingHeading, body: p });
      pendingHeading = null;
    }
  }

  const render = (picked, sentences) => {
    const parts = [];
    let lastHeading = null;
    for (const item of picked) {
      if (item.heading && item.heading !== lastHeading) {
        parts.push(item.heading);
        lastHeading = item.heading;
      }
      parts.push(firstSentences(item.body, sentences, 400));
    }
    return parts.join('\n\n');
  };

  let chosen = '';
  if (restBudget > 0 && items.length > 0) {
    // Try keeping every paragraph with 3, then 2, then 1 sentences; otherwise keep a regular selection.
    for (const sentences of [3, 2, 1]) {
      const candidate = render(items, sentences);
      if (candidate.length <= restBudget) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      const full = render(items, 1);
      const fraction = restBudget / full.length;
      let credit = 0;
      const picked = items.filter(() => {
        credit += fraction;
        if (credit >= 1) {
          credit -= 1;
          return true;
        }
        return false;
      });
      chosen = render(picked, 1);
      // Rounding can leave a little too much; drop from the end until it fits.
      let count = picked.length;
      while (chosen.length > restBudget && count > 1) {
        count -= 1;
        chosen = render(picked.slice(0, count), 1);
      }
      if (chosen.length > restBudget) chosen = '';
    }
  }

  const condensed = [lead.join('\n\n'), chosen].filter((s) => s.length > 0).join('\n\n');
  return { text: condensed, condensed: true, pageChars, readChars: condensed.length };
}
