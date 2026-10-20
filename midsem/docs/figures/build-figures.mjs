// Builds the midsem figures: SVG sources in svg/ and PNGs in this folder.
// Run with:  node midsem/docs/figures/build-figures.mjs
// Each SVG is loaded into HTML and rendered by Playwright's headless Chromium at 2x.
// Rules enforced by the helpers: every text is at least 22 px, box titles 24-26 px bold,
// every figure is at most 1000 px tall, and no text may be wider than its box.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVG_DIR = path.join(HERE, 'svg');
const PROJECT = path.resolve(HERE, '..', '..', 'project');
const requireFromProject = createRequire(path.join(PROJECT, 'package.json'));

const W = 1600;
const MAX_H = 1000;
const MIN_FONT = 22;
const TITLE = 25;
const FONT = "'Segoe UI', Arial, sans-serif";
// Printed-page palette: paper tones, brick-red accent, olive (success), ochre (warning).
const C = {
  ink: '#1C1B1A',
  muted: '#6B665C',
  accent: '#B4391F',
  blue: '#B4391F', blueFill: '#FBF8F1',
  neutralFill: '#F3EEE2', neutralBorder: '#D9D2C3',
  green: '#3F5F2A', greenFill: '#EEF2E3',
  amber: '#8A5A00', amberFill: '#FBF0D9',
  red: '#B4391F', redFill: '#F6E7E1',
  arrow: '#1C1B1A',
  v2: '#6B665C',
  purple: '#6B665C',
  white: '#FBF8F1',
};
const KIND = {
  blue: { fill: C.blueFill, stroke: C.blue, dash: false },
  neutral: { fill: C.neutralFill, stroke: C.neutralBorder, dash: false },
  green: { fill: C.greenFill, stroke: C.green, dash: false },
  amber: { fill: C.amberFill, stroke: C.amber, dash: false },
  red: { fill: C.redFill, stroke: C.red, dash: false },
  v2: { fill: 'none', stroke: C.v2, dash: true },
};
// Code-like names (file names, message names, error codes) are set in a monospace face.
const MONO = "Consolas, 'Courier New', monospace";
const MONO_CHAR = 0.57;
function isMono(str) {
  const s = String(str);
  if (s.length === 0 || /\s/.test(s)) return false;
  if (/^[A-Z][A-Z0-9_]{3,}$/.test(s)) return true;
  return /[._()\/:<>{}\[\]]/.test(s) && /[A-Za-z]/.test(s);
}

// Arial advance widths (per 1000 em) for ASCII 32..126, used to wrap text inside boxes.
const ARIAL = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const SAFETY = 1.08;

function textWidth(str, size, bold = false, mono = false) {
  if (mono) return String(str).length * MONO_CHAR * size * SAFETY;
  let w = 0;
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    w += c >= 32 && c <= 126 ? ARIAL[c - 32] : 556;
  }
  return (w / 1000) * size * (bold ? 1.08 : 1) * SAFETY;
}

// Greedy word wrap on explicit '\n' paragraphs.
function wrap(str, maxW, size, bold = false) {
  const out = [];
  const m = isMono(str);
  for (const para of String(str).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const cand = line ? `${line} ${word}` : word;
      if (textWidth(cand, size, bold, m) <= maxW || !line) line = cand;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

let OUT = [];
const put = (s) => OUT.push(s);
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const begin = () => { OUT = []; };

function needSize(size, what) {
  if (size < MIN_FONT) throw new Error(`font ${size}px is below the ${MIN_FONT}px minimum (${what})`);
}

// Plain or wrapped text. Standalone text must still fit the canvas (checked in the browser).
function text(x, y, str, o = {}) {
  const size = o.size ?? MIN_FONT;
  needSize(size, str);
  const lh = size * 1.32;
  const lines = o.wrapW ? wrap(str, o.wrapW, size, o.bold) : String(str).split('\n');
  const anchor = o.anchor ?? 'start';
  const fit = anchor === 'middle' ? 2 * Math.min(x, W - x) - 40 : anchor === 'end' ? x - 40 : W - 40 - x;
  const fill = o.fill ?? C.ink;
  const family = isMono(str) ? ` font-family="${MONO}"` : '';
  lines.forEach((ln, i) => {
    put(
      `<text x="${x}" y="${y + i * lh}" font-size="${size}" font-weight="${o.bold ? 700 : 400}"` +
        ` fill="${fill}" text-anchor="${anchor}"${family} data-fit="${o.fit ?? fit}">${esc(ln)}</text>`,
    );
  });
  return lines.length * lh;
}

// Rounded box: optional bold title (24-26 px) and body lines (22 px). Throws if the text does not fit.
function box(x, y, w, h, o = {}) {
  const kind = KIND[o.kind ?? 'neutral'];
  const dashed = o.dashed ?? kind.dash;
  const pad = o.pad ?? 16;
  const innerW = w - pad * 2;
  const tSize = o.titleSize ?? TITLE;
  const bSize = o.size ?? MIN_FONT;
  if (o.title && tSize < 24) throw new Error(`title ${tSize}px below 24px in "${o.title}"`);
  needSize(bSize, o.title ?? 'box');
  const tLines = o.title ? wrap(o.title, innerW, tSize, true) : [];
  const bodyIn = Array.isArray(o.lines) ? o.lines : o.lines ? [o.lines] : [];
  const bLines = bodyIn.flatMap((l) => wrap(l, innerW, bSize).map((t) => ({ t, m: isMono(l) })));
  const tLH = tSize * 1.28;
  const bLH = bSize * 1.32;
  const gap = tLines.length && bLines.length ? 6 : 0;
  const need = tLines.length * tLH + gap + bLines.length * bLH;
  if (need > h - 16 + 0.5) {
    throw new Error(`box text overflow in "${o.title ?? bodyIn[0]}": needs ${need.toFixed(0)}px, box allows ${h - 16}px`);
  }
  const sw = o.sw ?? 2.2;
  put(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ry="4" fill="${o.fill ?? kind.fill}"` +
      ` stroke="${o.stroke ?? kind.stroke}" stroke-width="${sw}"${dashed ? ' stroke-dasharray="9 6"' : ''}/>`,
  );
  const align = o.align ?? 'center';
  const ax = align === 'center' ? x + w / 2 : x + pad;
  const anchor = align === 'center' ? 'middle' : 'start';
  const top = o.valign === 'top' ? y + pad : y + (h - need) / 2;
  const fill = dashed ? C.v2 : C.ink;
  let cursor = top;
  const tFamily = o.title && isMono(o.title) ? ` font-family="${MONO}"` : '';
  tLines.forEach((ln) => {
    put(`<text x="${ax}" y="${cursor + tSize * 0.92}" font-size="${tSize}" font-weight="700" fill="${fill}" text-anchor="${anchor}"${tFamily} data-fit="${innerW}">${esc(ln)}</text>`);
    cursor += tLH;
  });
  cursor += gap;
  bLines.forEach(({ t, m }) => {
    const bFamily = m ? ` font-family="${MONO}"` : '';
    put(`<text x="${ax}" y="${cursor + bSize * 0.92}" font-size="${bSize}" font-weight="400" fill="${fill}" text-anchor="${anchor}"${bFamily} data-fit="${innerW}">${esc(t)}</text>`);
    cursor += bLH;
  });
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

// Small label with a white backing (used on arrows and as legend chips).
function pill(x, y, str, o = {}) {
  const size = o.size ?? MIN_FONT;
  needSize(size, str);
  const w = textWidth(str, size, o.bold, isMono(str)) + 18;
  const h = size * 1.7;
  const left = o.anchor === 'end' ? x - w : o.anchor === 'middle' ? x - w / 2 : x;
  const stroke = o.kind ? KIND[o.kind].stroke : C.neutralBorder;
  put(`<rect x="${left}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C.white}" stroke="${stroke}" stroke-width="1.6"${o.kind === 'v2' ? ' stroke-dasharray="6 4"' : ''}/>`);
  const pFamily = isMono(str) ? ` font-family="${MONO}"` : '';
  put(
    `<text x="${left + w / 2}" y="${y + h / 2 + size * 0.36}" font-size="${size}" fill="${o.kind === 'v2' ? C.v2 : C.ink}" text-anchor="middle"${pFamily}>${esc(str)}</text>`,
  );
  return { x: left, y, w, h };
}

// Polyline arrow; the last point gets the arrowhead. o.label sits on the middle segment.
function arrow(pts, o = {}) {
  const d = 'M' + pts.map((p) => p.join(',')).join(' L');
  put(
    `<path d="${d}" fill="none" stroke="${o.color ?? C.arrow}" stroke-width="2.4"` +
      `${o.dashed ? ' stroke-dasharray="9 6"' : ''} marker-end="url(#ah)"/>`,
  );
  if (o.label) {
    const i = Math.floor((pts.length - 1) / 2);
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    const h = MIN_FONT * 1.7;
    pill((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h / 2, o.label, { anchor: 'middle', kind: o.labelKind });
  }
}

// Straight arrow between two boxes, clipped to their edges.
function clipPt(r, dx, dy) {
  const hw = r.w / 2;
  const hh = r.h / 2;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [r.cx + dx * t, r.cy + dy * t];
}
function link(a, b, o = {}) {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  arrow([clipPt(a, dx, dy), clipPt(b, -dx, -dy)], o);
}

// Titled frame around a group of boxes.
function group(x, y, w, h, title, o = {}) {
  put(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${o.fill ?? '#FBF8F1'}"` +
      ` stroke="${o.stroke ?? C.neutralBorder}" stroke-width="2.2"${o.dashed ? ' stroke-dasharray="9 6"' : ''}/>`,
  );
  if (title) {
    const tw = textWidth(title, 24, true, isMono(title)) + 26;
    put(`<rect x="${x + 16}" y="${y - 18}" width="${tw}" height="38" rx="4" fill="${C.white}" stroke="${o.stroke ?? C.neutralBorder}" stroke-width="1.6"/>`);
    const gFamily = isMono(title) ? ` font-family="${MONO}"` : '';
    put(`<text x="${x + 29}" y="${y + 8}" font-size="24" font-weight="700" fill="${o.tabText ?? C.ink}"${gFamily}>${esc(title)}</text>`);
  }
}

// Legend chips (22 px labels).
function legend(x, y, items) {
  let cx = x;
  for (const [label, kind] of items) {
    const k = KIND[kind];
    put(`<rect x="${cx}" y="${y}" width="40" height="26" rx="4" fill="${k.fill}" stroke="${k.stroke}" stroke-width="2.2"${k.dash ? ' stroke-dasharray="6 4"' : ''}/>`);
    text(cx + 52, y + 20, label, { size: 22 });
    cx += 52 + textWidth(label, 22, false, isMono(label)) + 40;
  }
}

// Wraps the collected SVG fragments into one document.
function finish(H) {
  if (H > MAX_H) throw new Error(`figure is ${H}px tall; the limit is ${MAX_H}px`);
  const defs =
    `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="13" markerHeight="13"` +
    ` markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.arrow}"/></marker></defs>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"` +
    ` font-family="${FONT}" fill="${C.ink}">` +
    defs +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
    OUT.join('\n') +
    `</svg>\n`
  );
}

const FIGS = [];
function registerFigure(name, build) { FIGS.push({ name, build }); }

// ===== FIGURES (registered in report order) =====

// F01 - context: web page, extension, Gemini API, chrome.storage
registerFigure('F01_context', () => {
  begin();
  const H = 720;
  group(440, 100, 660, 500, 'Your computer');
  box(40, 320, 340, 130, { kind: 'neutral', title: 'Web page', lines: ['Its text is read by the extension'] });
  box(480, 150, 580, 110, { kind: 'blue', title: 'Popup', lines: ['You press Summarize and read the result'] });
  box(480, 320, 580, 130, { kind: 'blue', title: 'Service worker', lines: ['Runs the job and calls the API', 'Writes progress and the result'] });
  box(480, 490, 580, 90, { kind: 'neutral', title: 'chrome.storage', lines: ['API key and job record'] });
  box(1160, 320, 400, 130, { kind: 'amber', title: 'Gemini API', lines: ['Cloud, outside your computer'] });
  arrow([[380, 385], [480, 385]], {});
  arrow([[1060, 370], [1160, 370]], {});
  arrow([[1160, 410], [1060, 410]], { dashed: true });
  arrow([[770, 260], [770, 320]], { dashed: true });
  arrow([[770, 450], [770, 490]], {});
  legend(40, 640, [['Built in V1 (in code)', 'blue'], ['Outside your computer', 'amber']]);
  return { svg: finish(H), height: H };
});

// F02 - layered architecture
registerFigure('F02_layers', () => {
  begin();
  const H = 950;
  const bands = [
    ['UI layer', 100, 120],
    ['Orchestration', 240, 110],
    ['Core layer', 370, 230],
    ['Engine', 620, 120],
    ['Platform', 760, 130],
  ];
  for (const [name, y, h] of bands) {
    put(`<rect x="40" y="${y}" width="1520" height="${h}" rx="4" fill="#F3EEE2" stroke="#D9D2C3" stroke-width="1.5"/>`);
    text(60, y + h / 2 + 8, name, { size: 24, bold: true });
  }
  box(270, 115, 400, 90, { kind: 'blue', title: 'Popup', lines: ['Summarize button, progress'] });
  box(690, 115, 400, 90, { kind: 'blue', title: 'Options page', lines: ['Saves the API key'] });
  box(1110, 115, 430, 90, { kind: 'blue', title: 'Summary formatter', lines: ['Text to paragraphs and lists'] });
  box(270, 255, 1270, 90, { kind: 'blue', title: 'Service worker', lines: ['Owns the job; writes progress to storage'] });
  box(270, 384, 300, 90, { kind: 'neutral', title: 'Extractor', lines: ['Reads the page text'] });
  box(590, 384, 300, 90, { kind: 'neutral', title: 'Pipeline', lines: ['Extract, chunk, merge'] });
  box(910, 384, 300, 90, { kind: 'neutral', title: 'Errors', lines: ['Codes and messages'] });
  box(270, 490, 300, 90, { kind: 'neutral', title: 'Chunker', lines: ['Splits long text'] });
  box(590, 490, 300, 90, { kind: 'neutral', title: 'Merger', lines: ['Joins part summaries'] });
  box(910, 490, 300, 90, { kind: 'neutral', title: 'Prompts', lines: ['Prompt wording'] });
  box(1230, 490, 310, 90, { kind: 'neutral', title: 'Config', lines: ['Settings and key'] });
  box(270, 636, 620, 90, { kind: 'blue', title: 'Gemini engine (V1)', lines: ['engines/gemini.js'] });
  box(910, 636, 630, 90, { kind: 'v2', title: 'WebLLM engine (planned V2)', lines: ['Model runs in the browser'] });
  box(270, 776, 302, 90, { kind: 'neutral', title: 'chrome.scripting', lines: ['Injects the extractor'] });
  box(592, 776, 302, 90, { kind: 'neutral', title: 'chrome.storage', lines: ['Key and job record'] });
  box(914, 776, 302, 90, { kind: 'neutral', title: 'chrome.tabs', lines: ['Reads the tab URL'] });
  box(1236, 776, 302, 90, { kind: 'neutral', title: 'chrome.runtime', lines: ['Popup messages'] });
  for (const y of [222, 352, 602, 742]) arrow([[800, y], [800, y + 16]], {});
  legend(40, 920, [['Built in V1 (in code)', 'blue'], ['Planned (V2)', 'v2']]);
  return { svg: finish(H), height: H };
});

// F03a - components: UI, background, extraction (real files and their imports)
registerFigure('F03_a_components_ui', () => {
  begin();
  const H = 720;
  const popup = box(60, 130, 300, 100, { kind: 'blue', title: 'popup.js', lines: ['Summarize button'] });
  const summary = box(60, 300, 300, 100, { kind: 'neutral', title: 'summary-format.js', lines: ['Text to paragraphs'] });
  const options = box(60, 470, 300, 100, { kind: 'blue', title: 'options.js', lines: ['Save the API key'] });
  const sw = box(430, 130, 300, 100, { kind: 'blue', title: 'service-worker.js', lines: ['Job owner (see F03_b)'] });
  const config = box(430, 470, 300, 100, { kind: 'neutral', title: 'config.js', lines: ['Settings and API key'] });
  const extractTab = box(800, 130, 300, 100, { kind: 'blue', title: 'extract-tab.js', lines: ['Runs the extraction'] });
  const extract = box(1170, 130, 300, 100, { kind: 'neutral', title: 'extract.js', lines: ['Injected page script'] });
  const readability = box(1170, 300, 300, 100, { kind: 'neutral', title: 'readability.js', lines: ['Vendored Readability'] });
  link(popup, sw, { dashed: true });
  link(popup, summary);
  link(options, config);
  link(sw, config);
  link(sw, extractTab);
  link(extractTab, extract, { dashed: true });
  link(extract, readability, { dashed: true });
  text(60, 640, 'Solid arrow: imports. Dashed arrow: runtime message or script injection.', { size: 22 });
  text(60, 680, 'Continues in F03_b: pipeline, chunker, merger, errors, gemini, prompts.', { size: 22 });
  return { svg: finish(H), height: H };
});

// F03b - components: core and engine
registerFigure('F03_b_components_core', () => {
  begin();
  const H = 660;
  const pipeline = box(60, 300, 300, 100, { kind: 'neutral', title: 'pipeline.js', lines: ['Runs the whole flow'] });
  const chunker = box(430, 130, 300, 100, { kind: 'neutral', title: 'chunker.js', lines: ['Splits long text'] });
  const errors = box(430, 300, 300, 100, { kind: 'neutral', title: 'errors.js', lines: ['Codes and messages'] });
  const merger = box(430, 470, 300, 100, { kind: 'neutral', title: 'merger.js', lines: ['Joins part summaries'] });
  const gemini = box(800, 300, 300, 100, { kind: 'blue', title: 'gemini.js', lines: ['V1 cloud engine'] });
  const prompts = box(800, 470, 300, 100, { kind: 'neutral', title: 'prompts.js', lines: ['Prompt text'] });
  link(pipeline, chunker);
  link(pipeline, errors);
  link(pipeline, merger);
  link(gemini, errors);
  link(gemini, prompts);
  text(60, 620, 'Solid arrow: imports. config.js is used by service-worker.js and options.js (F03_a).', { size: 22 });
  return { svg: finish(H), height: H };
});

// F04 - sequence of one summary, from click to saved result
registerFigure('F04_sequence', () => {
  begin();
  const H = 940;
  const P = [
    ['User', 110, 'neutral'], ['Popup', 330, 'blue'], ['Service worker', 550, 'blue'],
    ['Tab (extractor)', 770, 'neutral'], ['Pipeline + engine', 990, 'blue'],
    ['Gemini API', 1210, 'amber'], ['Storage (session)', 1430, 'neutral'],
  ];
  for (const [, cx] of P) {
    put(`<line x1="${cx}" y1="156" x2="${cx}" y2="880" stroke="#6B665C" stroke-width="2" stroke-dasharray="6 6"/>`);
  }
  for (const [name, cx, kind] of P) box(cx - 100, 60, 200, 96, { kind, title: name, titleSize: 24 });
  const msg = (a, b, y, label, dashed = false) => {
    const x1 = P[a][1];
    const x2 = P[b][1];
    arrow([[x1, y], [x2, y]], { dashed });
    pill((x1 + x2) / 2, y - 38, label, { anchor: 'middle' });
  };
  msg(0, 1, 200, 'click Summarize');
  msg(1, 2, 242, 'START_SUMMARY');
  msg(2, 6, 284, 'job: running');
  msg(2, 1, 326, 'reply ok', true);
  msg(2, 3, 368, 'inject extractor');
  msg(3, 2, 410, 'page text', true);
  msg(2, 4, 452, 'run pipeline');
  group(500, 490, 800, 100, 'loop: each chunk', { fill: 'none' });
  msg(4, 5, 530, 'POST chunk i');
  msg(5, 4, 570, 'chunk summary', true);
  group(500, 610, 800, 96, 'alt: more than one chunk', { fill: 'none' });
  msg(4, 5, 650, 'POST merge');
  msg(5, 4, 690, 'merged summary', true);
  msg(4, 2, 746, 'summary, stats', true);
  msg(2, 6, 788, 'job: done');
  msg(6, 1, 830, 'storage event', true);
  msg(1, 0, 872, 'summary shown', true);
  text(40, 912, 'Pipeline and engine run inside the service worker. Dashed = reply or event.', { size: 22 });
  return { svg: finish(H), height: H };
});

// F05 - extraction: service worker side and injected tab side
registerFigure('F05_extraction_flow', () => {
  begin();
  const H = 980;
  group(40, 100, 760, 860, 'Service worker');
  group(840, 100, 720, 860, 'Tab (injected page script)');
  box(80, 140, 480, 96, { kind: 'neutral', title: 'extractFromTab(tabId)', lines: ['Reads the tab URL first'] });
  box(80, 276, 480, 110, { kind: 'amber', title: 'Restricted URL?', lines: ['yes: RESTRICTED_PAGE'] });
  box(80, 426, 480, 110, { kind: 'neutral', title: 'Inject the extractor', lines: ['readability.js, then extract.js'] });
  box(80, 576, 480, 110, { kind: 'amber', title: 'Result ok?', lines: ['no: EXTRACT_FAILED'] });
  box(80, 726, 480, 96, { kind: 'neutral', title: 'Return the text', lines: ['to the pipeline'] });
  box(900, 426, 600, 96, { kind: 'neutral', title: 'Clone the page', lines: ['document.cloneNode(true)'] });
  box(900, 576, 600, 96, { kind: 'neutral', title: 'Readability.parse()', lines: ['Main text of the copy'] });
  box(900, 726, 600, 96, { kind: 'neutral', title: 'Convert to text', lines: ['Blank lines; short text uses body text'] });
  box(900, 856, 600, 70, { kind: 'green', title: 'Return {title, url, text, method}' });
  arrow([[320, 236], [320, 276]], {});
  arrow([[320, 386], [320, 426]], {});
  text(330, 412, 'no', { size: 22 });
  arrow([[320, 536], [320, 576]], {});
  arrow([[320, 686], [320, 726]], {});
  text(330, 712, 'yes', { size: 22 });
  arrow([[560, 481], [900, 481]], { label: 'runs in the tab' });
  arrow([[1200, 522], [1200, 576]], {});
  arrow([[1200, 672], [1200, 726]], {});
  arrow([[1200, 822], [1200, 856]], {});
  arrow([[900, 891], [820, 891], [820, 631], [560, 631]], { label: 'result' });
  return { svg: finish(H), height: H };
});

// F06 - chunking flow (core/chunker.js)
registerFigure('F06_chunking_flow', () => {
  begin();
  const H = 970;
  const X = 490;
  const Wd = 620;
  box(X, 100, Wd, 96, { kind: 'neutral', title: 'chunkText(text, maxChars)', lines: ['Normalize whitespace first'] });
  box(X, 225, Wd, 96, { kind: 'amber', title: 'Fits in maxChars?', lines: ['yes: the text is one chunk'] });
  box(X, 350, Wd, 96, { kind: 'neutral', title: 'Split into paragraphs', lines: ['Blank lines separate them'] });
  box(X, 475, Wd, 96, { kind: 'amber', title: 'Paragraph over maxChars?', lines: ['Then split at sentence ends'] });
  box(X, 600, Wd, 96, { kind: 'amber', title: 'Sentence over maxChars?', lines: ['Cut at last space or at maxChars'] });
  box(X, 725, Wd, 96, { kind: 'neutral', title: 'Pack pieces up to maxChars', lines: ['Join with blank lines, in order'] });
  box(X, 850, Wd, 96, { kind: 'green', title: 'Return chunks[]', lines: ['No chunk is empty or too long'] });
  for (const [a, b] of [[196, 225], [321, 350], [446, 475], [571, 600], [696, 725], [821, 850]]) {
    arrow([[800, a], [800, b]], {});
  }
  text(812, 342, 'no', { size: 22 });
  text(812, 592, 'no', { size: 22 });
  // paragraphs and sentences that already fit go straight to packing (left route)
  arrow([[490, 523], [450, 523], [450, 773], [490, 773]], {});
  put(`<path d="M490,648 L450,648" fill="none" stroke="${C.arrow}" stroke-width="2.4"/>`);
  text(392, 700, 'yes', { size: 22 });
  return { svg: finish(H), height: H };
});

// F07 - merge tree for 8 partial summaries (core/merger.js mergeAll, small limit)
registerFigure('F07_merge_tree', () => {
  begin();
  const H = 920;
  const leafX = [120, 305, 490, 675, 860, 1045, 1230, 1415];
  const leaves = leafX.map((x, i) => box(x - 85, 580, 170, 100, { kind: 'neutral', title: `Part ${i + 1}`, lines: [`call ${i + 1}`] }));
  const m = [0, 1, 2, 3].map((k) => {
    const cxm = (leafX[2 * k] + leafX[2 * k + 1]) / 2;
    return box(cxm - 120, 400, 240, 100, { kind: 'blue', title: `Merge ${2 * k + 1}-${2 * k + 2}`, lines: ['1 model call'] });
  });
  const n1 = box((m[0].cx + m[1].cx) / 2 - 130, 250, 260, 100, { kind: 'blue', title: 'Merge 1-4', lines: ['1 model call'] });
  const n2 = box((m[2].cx + m[3].cx) / 2 - 130, 250, 260, 100, { kind: 'blue', title: 'Merge 5-8', lines: ['1 model call'] });
  const root = box((n1.cx + n2.cx) / 2 - 150, 110, 300, 100, { kind: 'green', title: 'Final summary', lines: ['1 model call'] });
  leaves.forEach((l, i) => link(l, m[Math.floor(i / 2)]));
  m.forEach((mm, i) => link(mm, i < 2 ? n1 : n2));
  link(n1, root);
  link(n2, root);
  box(40, 720, 1520, 110, {
    kind: 'neutral',
    title: 'Total: 15 model calls',
    lines: ['8 chunk calls + 7 merge calls (4 + 2 + 1), in 3 merge levels'],
  });
  text(40, 880, 'Example limit: maxChars 1,000; parts of 400 characters, so two fit in one merge.', { size: 22 });
  return { svg: finish(H), height: H };
});

// F08 - retry and back-off sequence (engines/gemini.js with core/config.js values)
registerFigure('F08_retry_sequence', () => {
  begin();
  const H = 980;
  const P = [['Popup', 200, 'blue'], ['Service worker (engine)', 700, 'blue'], ['Gemini API', 1200, 'amber']];
  for (const [, cx] of P) {
    put(`<line x1="${cx}" y1="150" x2="${cx}" y2="740" stroke="#6B665C" stroke-width="2" stroke-dasharray="6 6"/>`);
  }
  for (const [name, cx, kind] of P) box(cx - 140, 60, 280, 90, { kind, title: name, titleSize: 24 });
  const msg = (a, b, y, label, dashed = false) => {
    const x1 = P[a][1];
    const x2 = P[b][1];
    arrow([[x1, y], [x2, y]], { dashed });
    pill((x1 + x2) / 2, y - 38, label, { anchor: 'middle' });
  };
  msg(1, 2, 230, 'attempt 1');
  msg(2, 1, 276, 'HTTP 429', true);
  box(730, 300, 250, 60, { kind: 'amber', title: 'wait 2 s' });
  msg(1, 0, 400, 'notice: retry 1 of 3', true);
  msg(1, 2, 446, 'attempt 2');
  msg(2, 1, 492, 'HTTP 429', true);
  box(730, 516, 250, 60, { kind: 'amber', title: 'wait 4 s' });
  msg(1, 0, 610, 'notice: retry 2 of 3', true);
  msg(1, 2, 656, 'attempt 3');
  msg(2, 1, 702, 'HTTP 200 OK', true);
  box(40, 770, 1520, 180, {
    kind: 'neutral',
    title: 'Retry rules in the code',
    valign: 'top',
    align: 'left',
    lines: [
      'Retries: 3 (maxRetries). Each attempt has its own 25 s timeout.',
      'Back-off: 2 s, then 4 s, then 8 s. A Retry-After header (max 60 s) overrides it.',
      'Retried: HTTP 429, 500, 502, 503, 504. Not retried: 400, 401, 403, timeouts, network.',
      'After the third retry fails: RATE_LIMIT (429) or SERVICE_ERROR (5xx).',
    ],
  });
  return { svg: finish(H), height: H };
});

// F09 - failure source -> AppError code -> message the user sees (core/errors.js)
registerFigure('F09_error_flow', () => {
  begin();
  const H = 1000;
  text(40, 100, 'Failure', { size: 24, bold: true });
  text(580, 100, 'Error code', { size: 24, bold: true });
  text(880, 100, 'Message the user sees', { size: 24, bold: true });
  const rows = [
    ['No API key saved', 'NO_KEY', 'No API key yet. Add your key in Options first.', 'amber'],
    ['HTTP 401 or 403 (or 400 mentioning the key)', 'INVALID_KEY', 'Your API key was rejected. Check it in Options.', 'amber'],
    ['HTTP 429 after 3 retries', 'RATE_LIMIT', 'The free tier is busy right now. Wait a minute and try again.', 'red'],
    ['HTTP 500-504 after retries, or other HTTP errors', 'SERVICE_ERROR', 'The service had a problem. Try again in a moment.', 'red'],
    ['No answer within 25 s (not retried)', 'TIMEOUT', 'The service took too long to answer. Try again.', 'red'],
    ['Offline or DNS failure (not retried)', 'NETWORK', 'Cannot reach the service. Check your internet connection.', 'red'],
    ['HTTP 200 with no text (blocked or empty)', 'EMPTY_OR_BLOCKED', 'The model returned no summary for this page.', 'red'],
    ['Chrome page: chrome://, Web Store', 'RESTRICTED_PAGE', 'Chrome does not allow extensions to read this page.', 'neutral'],
    ['Script injection or extractor error', 'EXTRACT_FAILED', 'Could not read the text of this page.', 'neutral'],
    ['Under 200 characters of text', 'TOO_LITTLE_TEXT', 'This page has too little readable text to summarize.', 'neutral'],
    ['Worker restarted mid-job, or job over 3 min old', 'INTERRUPTED', 'The summary was interrupted. Press Summarize to try again.', 'neutral'],
  ];
  rows.forEach(([src, code, msgText, kind], i) => {
    const y = 130 + i * 78;
    box(40, y, 500, 74, { kind: 'neutral', lines: [src], align: 'left', pad: 14 });
    arrow([[540, y + 37], [580, y + 37]], {});
    box(580, y, 260, 74, { kind, title: code, titleSize: 24, pad: 8 });
    arrow([[840, y + 37], [880, y + 37]], {});
    box(880, y, 680, 74, { kind: 'neutral', lines: [msgText], align: 'left', pad: 14 });
  });
  return { svg: finish(H), height: H };
});

// F10 - engine seam: the contract the pipeline calls; V1 engine solid, V2 engine dashed
registerFigure('F10_engine_seam', () => {
  begin();
  const H = 800;
  group(40, 100, 1520, 200, 'Reused unchanged in V2', { stroke: C.green, tabText: C.green });
  box(75, 130, 270, 110, { kind: 'green', title: 'Extraction', lines: ['Text from the tab'] });
  box(370, 130, 270, 110, { kind: 'green', title: 'Chunker', lines: ['Splits long text'] });
  box(665, 130, 270, 110, { kind: 'green', title: 'Merger', lines: ['Joins part summaries'] });
  box(960, 130, 270, 110, { kind: 'green', title: 'Pipeline', lines: ['Runs the whole flow'] });
  box(1255, 130, 270, 110, { kind: 'green', title: 'UI', lines: ['Popup and options'] });
  const contract = box(300, 350, 1000, 124, {
    kind: 'blue',
    title: 'Engine contract',
    lines: ['summarizeChunk(text, {title, index, total, signal})', 'mergeSummaries(parts, {title, signal})'],
  });
  arrow([[1095, 240], [1095, 350]], {});
  arrow([[800, 240], [800, 350]], {});
  const gemini = box(200, 540, 500, 110, { kind: 'blue', title: 'GeminiEngine (V1)', lines: ['engines/gemini.js'] });
  const local = box(900, 540, 500, 110, { kind: 'v2', title: 'LocalEngine (planned V2)', lines: ['WebLLM, same two methods'] });
  link(contract, gemini);
  link(contract, local, { dashed: true });
  text(40, 700, 'Only the engine changes in V2. Everything in the green frame stays as it is.', { size: 22 });
  legend(40, 740, [['Built in V1 (in code)', 'blue'], ['Planned (V2)', 'v2']]);
  return { svg: finish(H), height: H };
});

// F11 - storage model: two stores, their keys, and who reads and writes them
registerFigure('F11_storage_model', () => {
  begin();
  const H = 680;
  group(40, 90, 660, 500, 'chrome.storage.local');
  group(760, 90, 800, 500, 'chrome.storage.session (job:<tabId>)');
  box(70, 140, 600, 140, { kind: 'blue', title: 'apiKey', lines: ['Saved by Options, read by the worker', 'Stored unencrypted, on this computer only'] });
  box(70, 320, 600, 140, { kind: 'neutral', title: 'Test-only seams', lines: ['apiBaseUrl, chunkChars, retry, timeout', 'Written by the tests, never by the UI'] });
  box(790, 140, 740, 250, {
    kind: 'neutral',
    title: 'Job record fields',
    lines: ['status, phase, current, total, parts', 'notice, summary, error', 'stats, url, title, pageUrl', 'startedAt, updatedAt'],
  });
  box(790, 440, 350, 120, { kind: 'blue', title: 'Service worker', lines: ['Writes and deletes'] });
  box(1180, 440, 350, 120, { kind: 'blue', title: 'Popup', lines: ['Reads on open and change'] });
  arrow([[965, 440], [965, 390]], { label: 'writes' });
  arrow([[1355, 440], [1355, 390]], { label: 'reads' });
  text(40, 640, 'Local storage survives restarts. Session storage is cleared when the browser closes.', { size: 22 });
  return { svg: finish(H), height: H };
});

// F12 - job state machine (service worker writes, popup reads)
registerFigure('F12_job_states', () => {
  begin();
  const H = 840;
  box(60, 380, 260, 110, { kind: 'neutral', title: 'idle', lines: ['No record for the tab'] });
  group(360, 110, 780, 230, 'running');
  box(400, 175, 200, 90, { kind: 'blue', title: 'extracting' });
  box(640, 175, 220, 90, { kind: 'blue', title: 'summarizing' });
  box(900, 175, 220, 90, { kind: 'blue', title: 'merging' });
  arrow([[600, 220], [640, 220]], {});
  arrow([[860, 220], [900, 220]], {});
  box(1220, 110, 320, 100, { kind: 'green', title: 'done', lines: ['Summary and stats stored'] });
  box(1220, 400, 320, 100, { kind: 'red', title: 'error', lines: ['Any AppError code'] });
  box(1220, 600, 320, 110, { kind: 'red', title: 'error: INTERRUPTED', lines: ['Worker restarted mid-job'] });
  box(360, 600, 460, 110, { kind: 'amber', title: 'stale (popup view)', lines: ['No update for 3 min'] });
  arrow([[190, 380], [190, 220], [360, 220]], {});
  arrow([[1140, 190], [1220, 160]], {});
  arrow([[1140, 290], [1220, 450]], {});
  arrow([[1140, 320], [1220, 650]], {});
  arrow([[550, 340], [550, 600]], { label: '3 min' });
  arrow([[820, 655], [900, 655], [900, 340]], {});
  text(40, 760, 'Summarize again from done or error starts a new run.', { size: 22 });
  text(40, 800, 'Closing the tab deletes its record (back to idle).', { size: 22 });
  return { svg: finish(H), height: H };
});

// F13 - deployment view: what runs where in V1
registerFigure('F13_deployment', () => {
  begin();
  const H = 730;
  group(40, 90, 1000, 500, "Your computer (Windows, Chrome)");
  group(1080, 90, 480, 460, 'The internet');
  box(70, 150, 300, 100, { kind: 'neutral', title: 'Web page', lines: ['Rendered text'] });
  box(70, 300, 300, 110, { kind: 'neutral', title: 'Extractor', lines: ['Injected on demand'] });
  box(440, 150, 280, 100, { kind: 'blue', title: 'Popup', lines: ['Shows progress'] });
  box(440, 300, 280, 120, { kind: 'blue', title: 'Service worker', lines: ['Job, pipeline, engine'] });
  box(440, 460, 280, 90, { kind: 'neutral', title: 'Session storage', lines: ['Job record'] });
  box(740, 150, 280, 100, { kind: 'neutral', title: 'Local storage', lines: ['API key only'] });
  box(1120, 260, 440, 150, { kind: 'amber', title: 'Google Gemini API', lines: ['HTTPS, outside your computer', 'Key sent in a header'] });
  arrow([[220, 250], [220, 300]], {});
  arrow([[370, 355], [440, 355]], {});
  arrow([[580, 250], [580, 300]], {});
  arrow([[580, 420], [580, 460]], {});
  arrow([[720, 340], [1120, 320]], { label: 'page text + prompt', labelKind: 'amber' });
  arrow([[1120, 380], [720, 400]], { dashed: true, label: 'summary' });
  text(40, 648, 'Only the page text and the prompt leave the machine in V1, over HTTPS.', { size: 22 });
  text(40, 690, 'The key goes in a header, never in the URL.', { size: 22 });
  return { svg: finish(H), height: H };
});

// F14 - data flow: what leaves the machine in V1 versus planned V2
registerFigure('F14_data_flow', () => {
  begin();
  const H = 700;
  group(40, 90, 740, 520, 'V1 (built): cloud engine', { stroke: C.blue, tabText: C.blue });
  group(820, 90, 740, 520, 'V2 (planned): local model', { dashed: true, stroke: C.v2, tabText: C.v2 });
  box(80, 150, 280, 100, { kind: 'neutral', title: 'Page text', lines: ['From the active tab'] });
  box(80, 300, 280, 110, { kind: 'blue', title: 'Extension', lines: ['Pipeline runs here'] });
  box(80, 480, 280, 100, { kind: 'neutral', title: 'API key', lines: ['Stored locally'] });
  box(470, 300, 290, 110, { kind: 'amber', title: 'Gemini API', lines: ['Returns the summary'] });
  box(460, 480, 310, 100, { kind: 'amber', title: 'Leaves the machine', lines: ['Text, prompt, key'] });
  arrow([[220, 250], [220, 300]], {});
  arrow([[220, 480], [220, 410]], {});
  arrow([[360, 355], [470, 355]], { label: 'sent' });
  arrow([[470, 400], [360, 400]], { dashed: true });
  box(860, 150, 320, 110, { kind: 'v2', title: 'Model download', lines: ['First run only'] });
  box(860, 300, 320, 100, { kind: 'v2', title: 'Browser cache', lines: ['Kept for later runs'] });
  box(1200, 300, 320, 110, { kind: 'v2', title: 'Local engine', lines: ['WebGPU, this computer'] });
  box(1200, 150, 320, 110, { kind: 'v2', title: 'Page text', lines: ['Never leaves the machine'] });
  box(860, 470, 660, 110, { kind: 'v2', title: 'Nothing leaves after the download', lines: ['No key and no network per summary'] });
  arrow([[1020, 260], [1020, 300]], { dashed: true });
  arrow([[1180, 355], [1200, 355]], { dashed: true });
  arrow([[1360, 260], [1360, 300]], { dashed: true });
  text(40, 660, 'Left: built and tested in V1. Right: planned for V2 and drawn dashed.', { size: 22 });
  return { svg: finish(H), height: H };
});

// F15 - build, test and fix loop used for V1
registerFigure('F15_dev_loop', () => {
  begin();
  const H = 730;
  box(60, 130, 300, 100, { kind: 'blue', title: 'Write code', lines: ['src and tests'] });
  box(420, 130, 300, 100, { kind: 'blue', title: 'Unit tests', lines: ['npm test (node --test)'] });
  box(780, 130, 300, 100, { kind: 'blue', title: 'Browser tests', lines: ['Playwright, headed'] });
  box(1140, 130, 300, 100, { kind: 'v2', title: 'Exploratory agent', lines: ['Planned (M8)'] });
  box(60, 330, 300, 100, { kind: 'amber', title: 'Exit criteria met?', lines: ['V1_PLAN section 7.4'] });
  box(420, 330, 300, 100, { kind: 'blue', title: 'Retest', lines: ['Run the loop again'] });
  box(780, 330, 300, 100, { kind: 'blue', title: 'Fix and log', lines: ['Commit per fix, DEVLOG'] });
  box(1140, 330, 300, 100, { kind: 'v2', title: 'Bug list', lines: ['Severity and screenshot'] });
  box(60, 530, 300, 100, { kind: 'green', title: 'Document and tag', lines: ['Tag v1-midsem'] });
  arrow([[360, 180], [420, 180]], {});
  arrow([[720, 180], [780, 180]], {});
  arrow([[1080, 180], [1140, 180]], { dashed: true });
  arrow([[1290, 230], [1290, 330]], { dashed: true });
  arrow([[1140, 380], [1080, 380]], { dashed: true });
  arrow([[780, 380], [720, 380]], {});
  arrow([[570, 330], [570, 230]], { label: 'loop' });
  arrow([[420, 380], [360, 380]], {});
  arrow([[210, 430], [210, 530]], { label: 'yes' });
  arrow([[210, 330], [210, 230]], { label: 'no' });
  text(60, 690, 'Solid = in use now. Dashed = planned for milestone M8.', { size: 22 });
  return { svg: finish(H), height: H };
});

// F16 - 14-week plan (abstract section 5): V1 weeks 1-7 blue, V2 weeks 8-14 purple
registerFigure('F16_plan_chart', () => {
  begin();
  const H = 760;
  const X0 = 600;
  const WK = 68;
  const rows = [
    ['Literature review (W1-2)', 1, 2, 'V1'],
    ['Extension skeleton, extraction (W3-4)', 3, 4, 'V1'],
    ['Chunking, merging, V1 engine (W5-6)', 5, 6, 'V1'],
    ['V1 testing, midsem (W7)', 7, 7, 'V1'],
    ['Local model study (W8-9)', 8, 9, 'V2'],
    ['In-browser engine (W10-11)', 10, 11, 'V2'],
    ['Cloud vs local comparison (W12)', 12, 12, 'V2'],
    ['Final testing, submission (W13-14)', 13, 14, 'V2'],
  ];
  for (let w = 1; w <= 14; w++) text(X0 + (w - 1) * WK + WK / 2, 122, 'W' + w, { size: 22, anchor: 'middle' });
  for (let k = 0; k <= 14; k++) put(`<line x1="${X0 + k * WK}" y1="134" x2="${X0 + k * WK}" y2="600" stroke="#D9D2C3" stroke-width="1.5"/>`);
  rows.forEach(([name, s, e, ver], i) => {
    const rowY = 150 + i * 56;
    const wlabel = s === e ? `W${s}` : `W${s}-${e}`;
    text(40, rowY + 31, name, { size: 22 });
    put(`<rect x="${X0 + (s - 1) * WK + 4}" y="${rowY + 8}" width="${(e - s + 1) * WK - 8}" height="34" rx="4" fill="${ver === 'V1' ? C.blue : C.purple}"/>`);
  });
  put(`<line x1="${X0 + 7 * WK}" y1="134" x2="${X0 + 7 * WK}" y2="600" stroke="${C.amber}" stroke-width="2.5" stroke-dasharray="8 6"/>`);
  pill(X0 + 7 * WK, 614, 'Midsem (end of W7)', { anchor: 'middle', kind: 'amber' });
  put(`<line x1="${X0 + 14 * WK}" y1="134" x2="${X0 + 14 * WK}" y2="600" stroke="${C.ink}" stroke-width="2.5"/>`);
  pill(X0 + 14 * WK, 614, 'Final (end of W14)', { anchor: 'end' });
  put(`<rect x="40" y="690" width="40" height="26" rx="4" fill="${C.blue}"/>`);
  text(92, 712, 'V1, weeks 1-7 (midsem)', { size: 22 });
  put(`<rect x="440" y="690" width="40" height="26" rx="4" fill="${C.purple}"/>`);
  text(492, 712, 'V2, weeks 8-14 (final)', { size: 22 });
  return { svg: finish(H), height: H };
});

// F17 - repository tree: real folders and key files, one-line purpose each
registerFigure('F17_repo_tree', () => {
  begin();
  const H = 760;
  const items = [
    [0, 'Jeffy/', ''],
    [1, 'abstract/', 'Abstract and plan of work'],
    [1, 'midsem/', 'V1 for the midsem review'],
    [2, 'docs/', 'Figures, screenshots, test runs'],
    [2, 'project/', 'The extension (load in Chrome)'],
    [3, 'manifest.json', 'Manifest V3 entry point'],
    [3, 'src/', 'Background, core, engines, UI'],
    [3, 'tests/', 'Unit, Playwright, fixtures'],
    [3, 'scripts/', 'Live check, benchmark, secret scan'],
    [1, 'DEVLOG.md', 'Real problems and fixes'],
    [1, 'README.md', 'Setup and status'],
    [1, 'prd.md', 'Product requirements'],
  ];
  const xOf = (d) => 60 + d * 64;
  const yOf = (i) => 130 + i * 52;
  // parent of each item = the nearest earlier item one level up
  const parent = items.map((it, i) => {
    if (it[0] === 0) return -1;
    for (let j = i - 1; j >= 0; j--) if (items[j][0] === it[0] - 1) return j;
    return -1;
  });
  items.forEach((it, i) => {
    const p = parent[i];
    if (p < 0) return;
    const trunkX = xOf(items[p][0]) + 14;
    const last = items.reduce((acc, _, k) => (parent[k] === p ? k : acc), i);
    if (i === items.findIndex((_, k) => parent[k] === p)) {
      put(`<line x1="${trunkX}" y1="${yOf(p) + 10}" x2="${trunkX}" y2="${yOf(last) - 8}" stroke="#6B665C" stroke-width="2"/>`);
    }
    put(`<line x1="${trunkX}" y1="${yOf(i) - 8}" x2="${xOf(it[0]) - 12}" y2="${yOf(i) - 8}" stroke="#6B665C" stroke-width="2"/>`);
  });
  items.forEach(([d, name, purpose], i) => {
    const isDir = name.endsWith('/');
    text(xOf(d), yOf(i), name, { size: 22, bold: isDir });
    if (purpose) text(640, yOf(i), purpose, { size: 22, fill: '#6B665C' });
  });
  return { svg: finish(H), height: H };
});

// F18 - comparison table from prd.md; V2 parts drawn dashed and labelled
registerFigure('F18_comparison', () => {
  begin();
  const H = 990;
  box(40, 100, 240, 60, { kind: 'blue', title: 'Aspect', titleSize: 24 });
  box(300, 100, 480, 60, { kind: 'neutral', title: 'Copilot-style assistant', titleSize: 24 });
  box(800, 100, 760, 60, { kind: 'blue', title: 'This extension', titleSize: 24 });
  const rows = [
    ['Cost', 'Cloud service tied to a vendor account', 'Runs on a free-tier API key', 'No key and no per-use cost'],
    ['Data and privacy', "Page text is sent to the vendor's cloud", 'Page text is sent to the Gemini cloud', "Page text stays on the user's machine"],
    ['Offline use', 'Not possible', 'Needs the network for every summary', 'Works offline once the model is cached'],
    ['Control', 'Fixed vendor model and behavior', 'Model, chunk size and prompt chosen for this job', null],
    ['Research value', 'None for the project', 'Cloud (V1) can be compared on speed, quality, memory', 'Local engine joins the comparison'],
  ];
  rows.forEach(([aspect, cop, v1, v2], i) => {
    const y = 180 + i * 130;
    box(40, y, 240, 120, { kind: 'neutral', title: aspect });
    box(300, y, 480, 120, { kind: 'neutral', lines: [cop], align: 'left', pad: 16 });
    if (v2) {
      box(800, y, 760, 56, { kind: 'green', lines: [v1], align: 'left', pad: 16 });
      box(800, y + 64, 760, 56, { kind: 'v2', lines: ['Planned (V2): ' + v2], align: 'left', pad: 16 });
    } else {
      box(800, y, 760, 120, { kind: 'green', lines: [v1], align: 'left', pad: 16 });
    }
  });
  box(40, 850, 1520, 120, {
    kind: 'v2',
    title: 'Limitation (planned V2 model, from the PRD)',
    lines: ['Local models of about 1B to 3B parameters summarize less well than cloud models. The first download is large, and V2 needs a WebGPU browser with enough GPU memory.'],
  });
  return { svg: finish(H), height: H };
});

// F19 - reuse map: reused unchanged, replaced, and new in V2
registerFigure('F19_reuse_v1_v2', () => {
  begin();
  const H = 870;
  group(40, 100, 500, 660, 'Reused unchanged', { stroke: C.green, tabText: C.green });
  group(560, 100, 500, 660, 'Replaced', { stroke: C.amber, tabText: C.amber });
  group(1080, 100, 480, 660, 'New in V2 (planned)', { dashed: true, stroke: C.v2, tabText: C.v2 });
  const col = (x, w, items, kind) =>
    items.forEach(([title, body, k], i) => box(x, 150 + i * 122, w, 100, { kind: k ?? kind, title, lines: [body] }));
  col(70, 440, [
    ['Extraction', 'Page text from the tab'],
    ['Chunker and merger', 'Split and join text'],
    ['Pipeline and errors', 'Flow and error codes'],
    ['Service worker', 'Job owner, progress'],
    ['Popup and formatter', 'UI and summary text'],
  ], 'green');
  col(590, 440, [
    ['Cloud engine (gemini.js)', 'Replaced by the local engine'],
    ['API key form (options.js)', 'Not needed in V2 (open)'],
    ['Prompts (prompts.js)', 'Open: may need tuning', 'v2'],
    ['Cloud settings (config.js)', 'Model and key go'],
  ], 'amber');
  col(1100, 440, [
    ['Model download', 'First run, progress bar'],
    ['WebGPU and memory check', 'At startup, clear message'],
    ['Browser cache', 'Keeps weights between runs'],
    ['LocalEngine (WebLLM)', 'Same two methods'],
  ], 'v2');
  text(40, 800, 'The engine contract is the only seam; the green parts keep their code.', { size: 22 });
  text(40, 840, 'Open (PRD): keep the cloud engine selectable, or local only?', { size: 22 });
  return { svg: finish(H), height: H };
});

// ===== RENDER =====
// Each SVG is read back from disk and placed inline in HTML; Chromium rasterises it at 2x.
// Checks: no text wider than its box (data-fit) and no text below 22 px (font-size attribute).
async function renderAll(items) {
  const { chromium } = requireFromProject('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const problems = [];
  try {
    for (const it of items) {
      const svgText = fs.readFileSync(it.svgPath, 'utf8');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body>${svgText}</body></html>`;
      await page.setViewportSize({ width: W, height: it.height });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const checks = await page.evaluate(() => {
        const texts = [...document.querySelectorAll('text')];
        const wide = texts
          .filter((t) => t.dataset.fit && t.getComputedTextLength() > Number(t.dataset.fit) + 0.5)
          .map((t) => `${t.textContent} [${t.getComputedTextLength().toFixed(0)} > ${t.dataset.fit}]`);
        const small = texts
          .filter((t) => parseFloat(t.getAttribute('font-size')) < 22)
          .map((t) => `${t.textContent} [${t.getAttribute('font-size')}px]`);
        return { wide, small };
      });
      for (const o of checks.wide) problems.push(`${it.name}: wider than box: ${o}`);
      for (const o of checks.small) problems.push(`${it.name}: font below 22px: ${o}`);
      await page.locator('svg').first().screenshot({ path: it.pngPath });
      console.log(`rendered ${it.name}.png (${W}x${it.height} logical)`);
    }
  } finally {
    await browser.close();
  }
  return problems;
}

async function main() {
  fs.mkdirSync(SVG_DIR, { recursive: true });
  const items = [];
  for (const fig of FIGS) {
    const { svg, height } = fig.build();
    const svgPath = path.join(SVG_DIR, `${fig.name}.svg`);
    fs.writeFileSync(svgPath, svg, 'utf8');
    items.push({ name: fig.name, svgPath, pngPath: path.join(HERE, `${fig.name}.png`), height });
    console.log(`wrote svg/${fig.name}.svg`);
  }
  const problems = await renderAll(items);
  if (problems.length) {
    console.error('LEGIBILITY / FIT PROBLEMS:\n  ' + problems.join('\n  '));
    process.exitCode = 1;
  }
}

await main();
