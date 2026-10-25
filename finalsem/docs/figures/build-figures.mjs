// Builds the Version 2 figures (V01 to V17) for finalsem/docs/figures.
// Writes SVG sources to svg/ and PNGs to this folder, then _contact-sheet.png.
// Run with:  node finalsem/docs/figures/build-figures.mjs
// Each SVG is loaded into HTML and rendered by Playwright's headless Chromium at 2x (hidden, no window).
// The helpers and the palette are copied from midsem/docs/figures/build-figures.mjs (Version 1).
// Rules enforced by the helpers: every text is at least 22 px, box titles 24-26 px bold,
// every figure is at most 1000 px tall, and no text may be wider than its box.
// After rendering, the browser also checks that no two text items overlap and that all text
// lies inside the canvas. Problems are printed and the exit code is 1.
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

// ===== VERSION 2 HELPERS (added to the copied helpers above) =====

// Title strip at the top of every figure: one line, 26 px bold, with a rule underneath.
function strip(id, title) {
  text(40, 50, `${id}  ${title}`, { size: 26, bold: true });
  put(`<line x1="40" y1="68" x2="1560" y2="68" stroke="${C.neutralBorder}" stroke-width="2"/>`);
}

// Pill centred between two y values (for labels on vertical arrows).
function mpill(x, y1, y2, label, o = {}) {
  return pill(x, (y1 + y2) / 2 - 18.5, label, { anchor: 'middle', ...o });
}

function vline(x, y1, y2, o = {}) {
  put(
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${o.color ?? C.muted}" stroke-width="2"` +
      `${o.dashed ? ' stroke-dasharray="6 6"' : ''}/>`,
  );
}

// Red prohibition sign (circle with a slash), used on the crossed-out cloud box.
function prohibit(cx, cy, r = 20) {
  put(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.white}" stroke="${C.red}" stroke-width="5"/>`);
  const d = r * 0.7;
  put(`<line x1="${cx - d}" y1="${cy + d}" x2="${cx + d}" y2="${cy - d}" stroke="${C.red}" stroke-width="5"/>`);
}

// Height a box needs for its title and body lines (same rules as box()), plus its 16 px padding.
function needH(o) {
  const pad = o.pad ?? 16;
  const innerW = o.w - pad * 2;
  const tSize = o.titleSize ?? TITLE;
  const bSize = o.size ?? MIN_FONT;
  const tN = o.title ? wrap(o.title, innerW, tSize, true).length : 0;
  const bodyIn = Array.isArray(o.lines) ? o.lines : o.lines ? [o.lines] : [];
  const bN = bodyIn.reduce((s, l) => s + wrap(l, innerW, bSize).length, 0);
  const gap = tN && bN ? 6 : 0;
  return tN * tSize * 1.28 + gap + bN * bSize * 1.32 + 16;
}

// One row of boxes side by side, all as tall as the tallest cell needs. Returns the row height.
function rowBoxes(y, cols, cells) {
  const h = Math.max(...cells.map((c, i) => needH({ w: cols[i].w, ...c })));
  cells.forEach((c, i) => box(cols[i].x, y, cols[i].w, h, { align: 'left', ...c }));
  return h;
}

// Coloured band with a title (used as a column heading on V14).
function band(x, y, w, title, kind) {
  box(x, y, w, 50, { kind, title, titleSize: 24 });
}

// ===== VERSION 2 FIGURES (V01 to V17) =====

// V01 - context: the laptop does everything; only the first download uses the internet.
registerFigure('V01_context', () => {
  begin();
  const H = 800;
  strip('V01', 'Context: the model runs on this laptop, and page text stays here');
  box(420, 100, 280, 130, { kind: 'neutral', title: 'You', lines: ['Presses Summarize'] });
  group(40, 300, 1020, 370, 'Your laptop (Windows and Chrome)');
  box(70, 350, 240, 120, { kind: 'neutral', title: 'Web page', lines: ['Its text is read by the extension'] });
  box(420, 350, 280, 150, { kind: 'blue', title: 'Page Summarizer', lines: ['Popup, service worker and offscreen page'] });
  box(800, 350, 230, 150, { kind: 'green', title: 'Model on the graphics card', lines: ['WebLLM, WebGPU'] });
  box(420, 540, 280, 120, { kind: 'neutral', title: 'Model files', lines: ['IndexedDB, kept between runs'] });
  box(1100, 350, 440, 130, { kind: 'red', title: 'Cloud service (not used)', lines: ['No page text, prompt or summary is sent to it'] });
  prohibit(1100, 350, 22);
  box(1100, 540, 440, 110, { kind: 'v2', title: 'Hugging Face and GitHub', lines: ['Model files: first use only'] });

  arrow([[560, 230], [560, 350]], {});
  pill(560, 240, 'presses the button', { anchor: 'middle' });
  arrow([[310, 410], [420, 410]], {});
  pill(365, 391, 'reads', { anchor: 'middle' });
  arrow([[700, 425], [800, 425]], {});
  pill(750, 406, 'runs', { anchor: 'middle' });
  arrow([[560, 500], [560, 540]], {});
  text(578, 526, 'saves and loads', { size: 22 });
  arrow([[1100, 595], [700, 595]], { dashed: true });
  pill(900, 576, 'first use only', { anchor: 'middle' });

  text(40, 706, 'Solid arrows: data stays on this laptop. Dashed arrow: model files, first download only.', { size: 22 });
  text(40, 742, 'Page text, prompts and summaries are never sent to a service in Version 2.', { size: 22 });
  return { svg: finish(H), height: H };
});

// V02 - layers: popup, service worker, offscreen page, web worker, WebLLM, WebGPU; stores beside them.
registerFigure('V02_layers', () => {
  begin();
  const H = 940;
  strip('V02', 'Layers: four kinds of page and worker, one model, three stores');
  const A = 60;
  const AW = 980;
  const B = 1160;
  const BW = 380;
  box(A, 110, 460, 84, { kind: 'blue', title: 'Popup', lines: ['Summarize button and progress'] });
  box(580, 110, 460, 84, { kind: 'neutral', title: 'Web page (tab)', lines: ['Text read by an injected script'] });
  box(A, 246, AW, 84, { kind: 'blue', title: 'Service worker (service-worker.js)', lines: ['Owns the job, the parts and the merge; asks the offscreen page'] });
  box(A, 382, AW, 84, { kind: 'blue', title: 'Offscreen page (offscreen.js)', lines: ['Keeps the model loaded; closes after 5 minutes idle'] });
  box(A, 518, AW, 84, { kind: 'neutral', title: 'Web worker (engine-worker.js)', lines: ["Runs WebLLM's handler, so the page stays responsive"] });
  box(A, 654, AW, 84, { kind: 'green', title: 'WebLLM (lib/web-llm.js)', lines: ['Reads the model, splits text into tokens, runs each answer'] });
  box(A, 790, AW, 84, { kind: 'amber', title: 'WebGPU on the graphics card', lines: ['NVIDIA RTX 3050 in the tests; Intel built-in graphics when Chrome picks it'] });

  box(B, 110, BW, 84, { kind: 'neutral', title: 'chrome.storage.local', lines: ['Settings and model choice'] });
  box(B, 246, BW, 84, { kind: 'neutral', title: 'chrome.storage.session', lines: ['Job record per tab'] });
  box(B, 382, BW, 84, { kind: 'neutral', title: 'IndexedDB', lines: ['Model files (about 695 MB)'] });
  box(B, 518, BW, 262, {
    kind: 'neutral',
    title: 'Messages',
    lines: [
      'LOCAL_STATUS, LOCAL_LOAD and LOCAL_GENERATE go from the service worker to the offscreen page',
      'MODEL_PROGRESS and KEEPALIVE go back',
    ],
  });

  arrow([[290, 194], [290, 246]], {});
  mpill(290, 194, 246, 'START_SUMMARY');
  arrow([[800, 246], [800, 194]], {});
  mpill(800, 194, 246, 'injects extractor');
  arrow([[290, 330], [290, 382]], {});
  mpill(290, 330, 382, 'LOCAL_* messages');
  arrow([[290, 466], [290, 518]], {});
  mpill(290, 466, 518, 'worker messages');
  arrow([[290, 602], [290, 654]], {});
  mpill(290, 602, 654, 'calls');
  arrow([[290, 738], [290, 790]], {});
  mpill(290, 738, 790, 'shader programs');

  arrow([[1040, 270], [1100, 270], [1100, 152], [1160, 152]], { dashed: true });
  arrow([[1040, 290], [1160, 290]], { dashed: true });
  arrow([[1040, 424], [1160, 424]], { dashed: true });

  text(40, 902, 'Solid arrows: calls and messages. Dashed arrows: storage access.', { size: 22 });
  return { svg: finish(H), height: H };
});

// V03 - first use and later use as sequence diagrams, with the measured times as labels.
registerFigure('V03_first_run_vs_cached', () => {
  begin();
  const H = 980;
  strip('V03', 'First use and later use, step by step (measured times as labels)');
  const L = [
    ['Popup', 170, 'neutral'],
    ['Service worker', 470, 'blue'],
    ['Offscreen page', 770, 'blue'],
    ['IndexedDB', 1070, 'neutral'],
    ['Graphics card', 1370, 'amber'],
  ];
  for (const [, cx] of L) vline(cx, 160, 895, { dashed: true });
  for (const [name, cx, kind] of L) box(cx - 120, 100, 240, 60, { kind, title: name });
  const msg = (a, b, y, label, dashed = false) => {
    const x1 = L[a][1];
    const x2 = L[b][1];
    arrow([[x1, y], [x2, y]], { dashed });
    pill((x1 + x2) / 2, y - 38, label, { anchor: 'middle' });
  };
  pill(40, 170, 'First use: the model is not stored yet. Short article, 196.8 s in total.', { size: 24 });
  msg(0, 1, 262, 'press the button');
  msg(1, 2, 306, 'LOCAL_STATUS: not stored');
  msg(2, 3, 350, 'download and save: 158.3 s');
  msg(2, 4, 394, 'load: 3.8 s');
  msg(2, 4, 438, 'warm-up: about 30 s');
  msg(1, 2, 482, 'summarize: 3.7 s');
  msg(1, 0, 526, 'summary shown', true);
  pill(40, 566, 'Later use: the model is stored. Short article, 15.3 s in total (outside sites blocked).', { size: 24 });
  msg(0, 1, 654, 'press Summarize this page');
  msg(1, 2, 698, 'LOCAL_STATUS: stored');
  msg(3, 2, 742, 'read model files');
  msg(2, 4, 786, 'load and warm-up: 6.9 s');
  msg(1, 2, 830, 'summarize: 6.7 s');
  msg(1, 0, 874, 'summary shown', true);
  text(40, 920, 'Times come from the clean run timelines (NVIDIA RTX 3050, hidden Chromium, real model).', { size: 22 });
  text(40, 952, 'Warm-up was 30.5 s on first use and 0.5 s in the later run; the reason is not measured.', { size: 22 });
  return { svg: finish(H), height: H };
});

// V04 - preparing the model: the steps of prepare() and the error branches.
registerFigure('V04_model_preparation', () => {
  begin();
  const H = 990;
  strip('V04', 'Preparing the model: the steps of prepare(), and what happens on errors');
  const M = 60;
  const MW = 580;
  const r = [100, 226, 352, 478, 604, 730, 856];
  box(M, r[0], MW, 86, { kind: 'neutral', title: 'prepare() starts', lines: ['Called by the pipeline before the first part'] });
  box(M, r[1], MW, 86, { kind: 'blue', title: 'Check the graphics card', lines: ['LOCAL_STATUS: card, shader-f16, stored or not'] });
  box(M, r[2], MW, 86, { kind: 'amber', title: 'WebGPU and shader-f16 available?', lines: ['Checked by the offscreen page'] });
  box(M, r[3], MW, 86, { kind: 'blue', title: 'Choose the model', lines: ['Llama 3.2 1B on every chip, unless a rule applies'] });
  box(M, r[4], MW, 86, { kind: 'blue', title: 'LOCAL_LOAD', lines: ['Download if not stored, then load into the card'] });
  box(M, r[5], MW, 86, { kind: 'blue', title: 'Warm-up', lines: ['One one-token answer; about 30 s the first time'] });
  box(M, r[6], MW, 86, { kind: 'green', title: 'Ready', lines: ['Parts are summarized with LOCAL_GENERATE'] });

  box(900, r[2], 640, 86, { kind: 'red', title: 'NO_WEBGPU or NO_SHADER_F16', lines: ['Stop. The popup says why and disables the button.'] });
  box(900, r[3], 640, 112, {
    kind: 'neutral',
    title: 'SmolLM2 360M is chosen when',
    lines: ['Settings, Quality: Fast; under 8 GB memory; or a saved fallback'],
  });
  box(900, r[4], 640, 236, {
    kind: 'amber',
    title: 'Error during LOCAL_LOAD',
    lines: [
      'GPU_MEMORY or MODEL_LOAD_FAILED with Llama 3.2 1B: save the fallback, retry once with SmolLM2 360M.',
      'Any other error, for example MODEL_DOWNLOAD_FAILED: stop, show its message, no retry.',
      'A second failure: stop and show its message.',
    ],
  });

  for (let i = 0; i < 6; i += 1) arrow([[330, r[i] + 86], [330, r[i + 1]]], {});
  text(340, r[2] + 108, 'yes', { size: 22 });
  arrow([[640, r[2] + 43], [900, r[2] + 43]], {});
  pill(770, r[2] + 43 - 18.5, 'no', { anchor: 'middle' });
  arrow([[640, r[3] + 43], [900, r[3] + 43]], {});
  arrow([[640, r[4] + 43], [900, r[4] + 43]], {});

  text(40, 974, 'Sizes from the test runs: Llama 3.2 1B about 695 MB, SmolLM2 360M about 204 MB.', { size: 22 });
  return { svg: finish(H), height: H };
});

// V05 - the message protocol between the service worker and the offscreen page.
registerFigure('V05_offscreen_messages', () => {
  begin();
  const H = 880;
  strip('V05', 'Messages between the service worker and the offscreen page');
  box(60, 100, 500, 84, { kind: 'blue', title: 'Service worker', lines: ['Asks for work and keeps the job running'] });
  box(1040, 100, 500, 84, { kind: 'blue', title: 'Offscreen page', lines: ['Owns the model and the graphics card'] });
  vline(310, 184, 760, { dashed: true });
  vline(1290, 184, 760, { dashed: true });
  const to = (y, label) => {
    arrow([[310, y], [1290, y]], {});
    pill(800, y - 38, label, { anchor: 'middle' });
  };
  const back = (y, label, dashed = true) => {
    arrow([[1290, y], [310, y]], { dashed });
    pill(800, y - 38, label, { anchor: 'middle' });
  };
  to(240, 'LOCAL_STATUS');
  back(290, 'reply: graphics card, stored or not, size');
  to(350, 'LOCAL_LOAD');
  back(400, 'MODEL_PROGRESS: phase, percent, text (many times)');
  to(455, 'LOCAL_GENERATE');
  back(505, 'reply: text and stats');
  back(565, 'KEEPALIVE, every 10 s while work runs', false);

  box(60, 620, 600, 190, {
    kind: 'neutral',
    title: 'Idle close',
    lines: [
      'The 5-minute timer (idleCloseMs = 300000) starts when the last running message is done. At zero the offscreen page closes and its graphics memory is freed. Model files stay in IndexedDB.',
    ],
  });
  box(980, 620, 560, 190, {
    kind: 'neutral',
    title: 'Rules',
    lines: [
      "Every message has target: 'offscreen'.",
      'Answers are made one at a time, in the order asked.',
      'KEEPALIVE is sent only while a request runs.',
    ],
  });
  text(40, 856, 'Names and fields are from src/background/offscreen-manager.js and src/offscreen/offscreen.js.', { size: 22 });
  return { svg: finish(H), height: H };
});

// V06 - the job phases the popup shows, in order; later use skips the download.
registerFigure('V06_job_phases', () => {
  begin();
  const H = 990;
  strip('V06', 'The job phases the popup shows, in order (later use skips the download)');
  const P = [
    ['Reading the page', 'Reading the page...'],
    ['Checking the graphics card', 'Checking your graphics card...'],
    ['Downloading (first time only)', 'Downloading the model (first time only): 0% to 100%'],
    ['Loading into the graphics card', 'Loading the model into the graphics card: 0% to 100%'],
    ['Warming up', 'Warming up the model (first time can take about 30 seconds)...'],
    ['Summarizing', 'Summarizing part 1 of 2...  or  Summarizing...  (one part)'],
    ['Combining', 'Combining 2 summaries...  (only when there is more than one part)'],
    ['Done, or an error', 'The summary is shown, or the error message from Figure V11'],
  ];
  const y0 = 112;
  const step = 98;
  const bx = 200;
  const bw = 460;
  const bh = 60;
  const kinds = ['blue', 'blue', 'v2', 'blue', 'blue', 'blue', 'neutral', 'green'];
  P.forEach(([title, shown], i) => {
    const y = y0 + i * step;
    box(bx, y, bw, bh, { kind: kinds[i], title, titleSize: 24 });
    text(700, y + bh / 2 + 8, shown, { size: 22 });
    if (i < P.length - 1) arrow([[bx + bw / 2, y + bh], [bx + bw / 2, y + step]], {});
  });
  // Later use: from "Checking" straight to "Loading", skipping "Downloading".
  const yA = y0 + 1 * step + bh / 2;
  const yB = y0 + 3 * step + bh / 2;
  arrow([[bx, yA], [130, yA], [130, yB], [bx, yB]], { dashed: true });
  text(40, y0 + 2 * step + bh / 2 + 8, 'skipped', { size: 22 });

  text(40, 930, 'Later use is meant to skip the Downloading step (dashed). One offline test run, made before a fix, showed that line for about 0.8 s (see FIGURES.md).', { size: 22 });
  text(40, 962, 'TOO_LITTLE_TEXT (under 200 characters) and TOO_LONG (more than 12 parts) stop the job before the model is used.', { size: 22 });
  return { svg: finish(H), height: H };
});

// V07 - Version 1 (cloud) against Version 2 (local model), with the measured times.
registerFigure('V07_v1_vs_v2', () => {
  begin();
  strip('V07', 'Version 1 (cloud) against Version 2 (on this laptop)');
  const C1 = { x: 40, w: 300 };
  const C2 = { x: 360, w: 590 };
  const C3 = { x: 970, w: 590 };
  const cols = [C1, C2, C3];
  let y = 100;
  y += rowBoxes(y, cols, [
    { title: 'Measure', titleSize: 24, kind: 'neutral' },
    { title: 'Version 1: cloud (Gemini)', titleSize: 24, kind: 'amber' },
    { title: 'Version 2: on this laptop', titleSize: 24, kind: 'green' },
  ]) + 8;
  const R = [
    ['Model', 'gemini-3.5-flash-lite, run by Google', 'Llama 3.2 1B on the graphics card (SmolLM2 360M as a Fast choice)'],
    ['API key', 'Needed: a free key, pasted in the popup', 'Not needed'],
    ['Internet', 'Needed for every summary', 'Needed once to download the model: about 695 MB. Not needed after that.'],
    ['Where the page text goes', "Sent to Google's service over HTTPS", 'Stays on this laptop'],
    ['Short article', '1.7 s, measured with the live service', '15.3 s with the model stored (NVIDIA). 196.8 s on first use, download included.'],
    ['Seven-part article', '17.8 s, five parts of 8,000 characters', '74.1 s, seven parts of 6,000 characters (NVIDIA, model stored)'],
    ['Long page, built-in Intel graphics', '(not measured in Version 1)', '124.6 s, about a fifth of the Lighthouse page read (616.4 s whole page before)'],
    ['Free-tier limits', '15 requests a minute named for the default model (DEVLOG, 20 Oct)', 'No service quota. A page over 12 parts is refused.'],
    ['Summary quality', 'Not measured in this study', 'Not measured in this study'],
  ];
  for (const [a, b, c] of R) {
    y += rowBoxes(y, cols, [
      { title: a, titleSize: 24, kind: 'neutral' },
      { lines: [b], kind: 'amber' },
      { lines: [c], kind: 'green' },
    ]) + 8;
  }
  text(40, y + 34, 'Version 1 timings: midsem/docs/test-runs/live-measurements.md, rows L01 and L04.', { size: 22 });
  text(40, y + 66, 'Version 2 timings: finalsem/docs/test-runs, clean runs only (hidden Chromium).', { size: 22 });
  const H = y + 100;
  return { svg: finish(H), height: H };
});

// V08 - speed on the two graphics chips, clean runs only (numbers as in the test-run tables).
registerFigure('V08_speed_chart', () => {
  begin();
  const H = 980;
  strip('V08', 'Speed on the two graphics chips (clean runs only, measured)');
  text(40, 116, 'Writing speed, tokens a second', { size: 24, bold: true });
  text(840, 116, 'Seconds for one summary', { size: 24, bold: true });

  // Left panel: tokens a second, one bar per run.
  const barK = 360 / 60;
  const barRow = (y, label, v, color, valText) => {
    text(40, y + 24, label, { size: 22 });
    const w = v * barK;
    put(`<rect x="330" y="${y + 4}" width="${w}" height="32" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2"/>`);
    text(330 + w + 12, y + 28, valText, { size: 22 });
  };
  const NV = { fill: C.blue, stroke: C.blue };
  const IN = { fill: C.muted, stroke: C.muted };
  text(40, 160, 'NVIDIA RTX 3050, Llama 3.2 1B', { size: 24, bold: true });
  [['Short, first use', 47], ['Two parts, stored', 53], ['Seven parts, stored', 34], ['Short, offline', 40], ['Two parts, offline', 42]]
    .forEach(([label, v], i) => barRow(186 + i * 46, label, v, NV, String(v)));
  text(40, 446, 'Intel built-in graphics, Llama 3.2 1B (now)', { size: 24, bold: true });
  [['Short, first use', 2.0], ['Lighthouse page', 1.8], ['Long article', 1.9]].forEach(([label, v], i) => barRow(472 + i * 46, label, v, IN, v.toFixed(1)));
  text(40, 636, 'Intel built-in graphics, SmolLM2 360M (before)', { size: 24, bold: true });
  [['Short, first use', 4], ['Two parts, stored', 5]].forEach(([label, v], i) => barRow(662 + i * 46, label, v, IN, String(v)));

  // Right panel: seconds for one summary.
  const sK = 560 / 650;
  const secRow = (y, label, v, color, valText) => {
    text(840, y, label, { size: 22 });
    const w = v * sK;
    put(`<rect x="840" y="${y + 12}" width="${w}" height="34" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2"/>`);
    text(840 + w + 12, y + 38, valText, { size: 22 });
  };
  text(840, 160, 'NVIDIA RTX 3050, Llama 3.2 1B', { size: 24, bold: true });
  secRow(192, 'Short, first use (download included)', 196.8, NV, '196.8 s');
  secRow(258, 'Lighthouse page, whole page', 74.1, NV, '74.1 s');
  text(840, 360, 'Intel built-in graphics', { size: 24, bold: true });
  secRow(392, 'Lighthouse, SmolLM2, whole page (before)', 616.4, IN, '616.4 s');
  secRow(458, 'Lighthouse, Llama 1B, 21% read (now)', 124.6, IN, '124.6 s');
  secRow(524, 'Long article, Llama 1B, 50% read (now)', 103.8, IN, '103.8 s');
  secRow(590, 'Short, first use, Llama 1B (now)', 200.6, IN, '200.6 s');

  const notes = [
    "Tokens a second: the decode speed of each job's last request, as the extension records it (rounded).",
    'Intel "now" = Llama 3.2 1B (about 695 MB) with long pages shortened (26 October). "Before" = SmolLM2 360M chosen automatically.',
    'The NVIDIA runs used the same Llama 3.2 1B, reading the whole page. All runs: hidden Chromium on the developer laptop.',
    'Not measured on the client laptop (Intel Iris Xe, a faster variant of this Intel chip at 15 watts).',
    'Left out: runs done while other programs were using the processor (see their notes in the test-run files).',
  ];
  notes.forEach((n, i) => text(40, 786 + i * 34, n, { size: 22 }));
  return { svg: finish(H), height: H };
});

// V09 - first use as a horizontal timeline (seconds from the first clean cold run).
registerFigure('V09_cold_timeline', () => {
  begin();
  const H = 660;
  strip('V09', 'First use, step by step: the download is most of the wait');
  const X0 = 60;
  const S = 1480 / 200;
  const xs = (t) => X0 + t * S;
  const segs = [
    { a: 0, b: 0.5, kind: 'neutral' },
    { a: 0.5, b: 158.8, kind: 'blue' },
    { a: 158.8, b: 162.6, kind: 'neutral' },
    { a: 162.6, b: 193.1, kind: 'amber' },
    { a: 193.1, b: 196.8, kind: 'green' },
  ];
  const BY = 250;
  const BH = 70;
  for (const s of segs) {
    const k = KIND[s.kind];
    put(
      `<rect x="${xs(s.a)}" y="${BY}" width="${xs(s.b) - xs(s.a)}" height="${BH}" fill="${k.fill}"` +
        ` stroke="${k.stroke}" stroke-width="2.2"/>`,
    );
  }
  text((xs(0.5) + xs(158.8)) / 2, BY + 42, 'Download: 158.3 s (0% to 100%)', { size: 24, bold: true, anchor: 'middle' });
  text((xs(162.6) + xs(193.1)) / 2, BY + 42, 'Warm-up: 30.5 s', { size: 24, bold: true, anchor: 'middle' });

  // Labels for the short segments, above the bar, with leader lines.
  text(60, 226, 'Read and check: 0.5 s', { size: 22 });
  vline(62, 232, BY, { color: C.ink, w: 1.5 });
  text(xs(158.8) + 14, 226, 'Load into the card: 3.8 s', { size: 22, anchor: 'end' });
  vline((xs(158.8) + xs(162.6)) / 2, 232, BY, { color: C.ink, w: 1.5 });
  text(1516, 226, 'Summarize: 3.7 s', { size: 22, anchor: 'end' });
  vline((xs(193.1) + xs(196.8)) / 2, 232, BY, { color: C.ink, w: 1.5 });

  // Time axis.
  const AY = 352;
  put(`<line x1="${X0}" y1="${AY}" x2="${xs(196.8)}" y2="${AY}" stroke="${C.ink}" stroke-width="2"/>`);
  for (let t = 0; t <= 180; t += 30) {
    put(`<line x1="${xs(t)}" y1="${AY}" x2="${xs(t)}" y2="${AY + 10}" stroke="${C.ink}" stroke-width="2"/>`);
    text(xs(t), AY + 42, `${t} s`, { size: 22, anchor: 'middle' });
  }

  text(40, 440, '0 s: the button is pressed. 0.5 s: the download starts (popup shows 0%).', { size: 22 });
  text(40, 472, '158.8 s: the download is done; loading into the card runs from 21% to 100%.', { size: 22 });
  text(40, 504, "162.6 s: warm-up starts ('Warming up the model (first time can take about 30 seconds)').", { size: 22 });
  text(40, 536, "193.1 s: the answer starts ('Summarizing...'). 196.8 s: the summary is shown.", { size: 22 });
  text(40, 600, 'Source: docs/test-runs/v2-local-nvidia-cold-first-attempt.md, timeline of the short article (clean run, NVIDIA RTX 3050).', { size: 22 });
  text(40, 632, "Segment times are the differences between the timeline's stamps. A 'Loading 0%' line at 5.1 s, during the download, is not shown.", { size: 22 });
  return { svg: finish(H), height: H };
});

// V10 - what is stored where, and for how long.
registerFigure('V10_storage', () => {
  begin();
  strip('V10', 'What is stored where, and for how long');
  const cols = [
    { x: 40, w: 260 },
    { x: 320, w: 370 },
    { x: 710, w: 420 },
    { x: 1150, w: 410 },
  ];
  let y = 100;
  y += rowBoxes(y, cols, [
    { title: 'Store', titleSize: 24, kind: 'neutral' },
    { title: 'Where', titleSize: 24, kind: 'blue' },
    { title: 'How long it lasts', titleSize: 24, kind: 'amber' },
    { title: 'Who writes and reads it', titleSize: 24, kind: 'green' },
  ]) + 8;
  const R = [
    [
      'Model files',
      'IndexedDB (cacheBackend: indexeddb). About 695 MB for Llama 3.2 1B; about 204 MB for SmolLM2.',
      'Kept between runs. No code deletes it. unlimitedStorage asks the browser not to delete it when disk space runs low.',
      'Written by the offscreen page on first use (WebLLM). Read on every load.',
    ],
    [
      'Job record',
      'chrome.storage.session, key job:<tabId>',
      'Until the browser closes. Removed when its tab closes.',
      'Service worker writes status, phase, percent, summary and stats. The popup reads it, and again on every change.',
    ],
    [
      'Settings',
      'chrome.storage.local',
      'Kept across restarts.',
      "Service worker reads them. modelOverride becomes 'fallback' after a failed load. Test-only settings also live here.",
    ],
    [
      'Loaded model',
      'Graphics memory, inside the offscreen page',
      'Until the page closes: 5 minutes after the last message, or when the browser closes.',
      "Offscreen page only. WebLLM's figures: about 879 MB (Llama 3.2 1B) or 376 MB (SmolLM2).",
    ],
  ];
  const kinds = ['neutral', 'blue', 'amber', 'green'];
  for (const row of R) {
    y += rowBoxes(y, cols, row.map((t, i) => (i === 0 ? { title: t, titleSize: 24, kind: 'neutral' } : { lines: [t], kind: kinds[i] }))) + 8;
  }
  text(40, y + 34, 'Version 2 stores no API key. Version 1 kept its key in chrome.storage.local.', { size: 22 });
  const H = y + 70;
  return { svg: finish(H), height: H };
});

// V11 - errors: the code, when it happens, and the exact message the user sees (errors.js).
registerFigure('V11_error_flow', () => {
  begin();
  strip('V11', 'Errors: the code, when it happens, and the exact message the user sees');
  const cols = [
    { x: 40, w: 350 },
    { x: 410, w: 370 },
    { x: 800, w: 760 },
  ];
  let y = 92;
  const R = [
    ['NO_WEBGPU', 'No WebGPU or no adapter', 'Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check.', 'red'],
    ['NO_SHADER_F16', 'Card lacks 16-bit math', 'Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2.', 'red'],
    ['GPU_MEMORY', 'Out of memory while loading', 'The graphics card ran out of memory. Close other heavy tabs or programs and try again.', 'amber'],
    ['MODEL_DOWNLOAD_FAILED', 'Download stopped (network)', 'The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept.', 'red'],
    ['MODEL_LOAD_FAILED', 'Model would not start', 'The model could not be started. Press the button to try again.', 'amber'],
    ['TIMEOUT', 'No answer within 10 minutes', 'The model took too long to answer. Try again, or use a shorter page.', 'red'],
    ['EMPTY_ANSWER', 'Model returned no text', 'The model returned no summary for this page.', 'red'],
    ['TOO_LITTLE_TEXT', 'Under 200 characters of text', 'This page has too little readable text to summarize.', 'neutral'],
    ['TOO_LONG', 'More than 12 parts', 'This page is too long for the local model on this computer. Try a shorter page.', 'neutral'],
    ['RESTRICTED_PAGE', 'chrome:// or Web Store page', 'Chrome does not allow extensions to read this page.', 'neutral'],
    ['INTERRUPTED', 'Worker stopped, or 5 min with no update', 'The summary was interrupted. Press Summarize to try again.', 'red'],
    ['CANCELLED', 'New page or tab closed. Not shown.', 'Cancelled.', 'neutral'],
  ];
  for (const [code, when, msgText, kind] of R) {
    y += rowBoxes(y, cols, [
      { title: code, titleSize: 24, kind, pad: 8 },
      { lines: [when], kind: 'neutral' },
      { lines: [msgText], kind: 'neutral' },
    ]) + 4;
  }
  legend(40, y + 16, [
    ['retries once with SmolLM2 360M', 'amber'],
    ['job stops, message shown', 'red'],
    ['refused early, or not shown', 'neutral'],
  ]);
  text(40, y + 66, 'Messages are copied from src/core/errors.js (USER_MESSAGES). The technical detail goes to the console and the job record.', { size: 22 });
  const H = y + 100;
  return { svg: finish(H), height: H };
});

// V12 - what runs where on the client laptop, and what is outside it.
registerFigure('V12_deployment', () => {
  begin();
  const H = 870;
  strip('V12', 'What runs where on the client laptop (Chrome parts, graphics card, disk)');
  group(40, 110, 1060, 660, 'Your laptop (Windows, Chrome)');
  group(1140, 110, 420, 660, 'Outside your laptop');
  box(70, 160, 260, 100, { kind: 'neutral', title: 'Popup', lines: ['Button and progress'] });
  box(70, 320, 260, 100, { kind: 'neutral', title: 'Web page (tab)', lines: ['Read by a script'] });
  box(420, 160, 280, 100, { kind: 'blue', title: 'Service worker', lines: ['Job, parts, merge'] });
  box(420, 320, 280, 100, { kind: 'blue', title: 'Offscreen page', lines: ['Holds the model'] });
  box(420, 480, 280, 100, { kind: 'neutral', title: 'Web worker', lines: ['Runs WebLLM'] });
  box(800, 320, 280, 100, { kind: 'neutral', title: 'Disk: IndexedDB', lines: ['Model files'] });
  box(800, 480, 280, 100, { kind: 'neutral', title: 'Chrome GPU', lines: ['Runs WebGPU'] });
  box(800, 640, 280, 100, { kind: 'amber', title: 'Graphics card', lines: ['NVIDIA or Intel'] });
  box(1160, 320, 380, 100, { kind: 'v2', title: 'Hugging Face and GitHub', lines: ['Model files, first use only'] });

  text(800, 190, 'Solid arrows: inside this laptop', { size: 22, wrapW: 280 });
  text(800, 252, 'Dashed arrow: first download only', { size: 22, wrapW: 280 });

  arrow([[330, 210], [420, 210]], {});
  arrow([[420, 255], [330, 340]], {});
  arrow([[560, 260], [560, 320]], {});
  mpill(560, 260, 320, 'messages');
  arrow([[560, 420], [560, 480]], {});
  arrow([[700, 370], [800, 370]], {});
  arrow([[700, 530], [800, 530]], {});
  arrow([[940, 580], [940, 640]], {});
  arrow([[1160, 370], [1080, 370]], { dashed: true });

  text(40, 806, "The client's laptop has not been tested yet. The same parts run there; the graphics card decides the speed.", { size: 22 });
  text(40, 838, "Chrome's own process layout is not measured here. The boxes show what each part does (see Figures V08 and V17 for speed).", { size: 22 });
  return { svg: finish(H), height: H };
});

// V13 - folder tree of finalsem/ with one-line notes (drawn from the real folders).
registerFigure('V13_repo_tree', () => {
  begin();
  const H = 960;
  strip('V13', 'Folder tree of finalsem/, with one line per folder or key file');
  const items = [
    [0, 'finalsem/', 'Version 2 (final semester): all of it'],
    [1, 'README.md', 'What it is, install, measured results'],
    [1, 'docs/', 'Decisions, test results, figures, report parts'],
    [2, 'DECISIONS.md', 'The big choices for Version 2, and why'],
    [2, 'build/', 'Writing guide and the script that assembles the Markdown'],
    [2, 'figures/', 'The Version 2 figures (this set) and their build script'],
    [3, 'build-figures.mjs', 'Draws V01 to V17 (copied from midsem)'],
    [3, 'svg/', 'The drawings as SVG, one file each'],
    [3, 'V01_*.png to V17_*.png', 'Rendered figures'],
    [3, 'FIGURES.md', 'Caption and source files for each figure'],
    [2, 'kt/', 'Knowledge-transfer document (not written yet)'],
    [2, 'report/', 'The report (not written yet)'],
    [2, 'screenshots/', 'Pictures from the real-model runs'],
    [2, 'test-runs/', 'Raw results (JSON) and tables (Markdown)'],
    [1, 'project/', 'The extension: load this folder in Chrome'],
    [2, 'manifest.json', 'Manifest V3: permissions and hosts'],
    [2, 'setup.bat, run.bat', 'Install check and launch steps'],
    [2, 'src/', 'The code, in the folders below'],
    [3, 'background/', 'Service worker and offscreen manager'],
    [3, 'content/', 'Page text extraction (injected into the tab)'],
    [3, 'core/', 'Chunker, merger, pipeline, errors, config'],
    [3, 'engines/', 'The local engine (the cloud engine is gone)'],
    [3, 'lib/', 'WebLLM and Readability'],
    [3, 'offscreen/', 'Hidden model page and its web worker'],
    [3, 'ui/', 'Popup and summary formatting'],
    [2, 'tests/', 'Unit tests, browser tests, fixtures'],
    [2, 'scripts/', 'Computer check, Chrome GPU setting, real-model runs'],
    ];
  const xOf = (d) => 60 + d * 56;
  const yOf = (i) => 146 + i * 30;
  const parent = items.map((it, i) => {
    if (it[0] === 0) return -1;
    for (let j = i - 1; j >= 0; j -= 1) if (items[j][0] === it[0] - 1) return j;
    return -1;
  });
  items.forEach((it, i) => {
    const p = parent[i];
    if (p < 0) return;
    const trunkX = xOf(items[p][0]) + 12;
    let last = i;
    items.forEach((_, k) => {
      if (parent[k] === p) last = k;
    });
    if (i === items.findIndex((_, k) => parent[k] === p)) {
      put(`<line x1="${trunkX}" y1="${yOf(p) + 8}" x2="${trunkX}" y2="${yOf(last) - 8}" stroke="${C.muted}" stroke-width="2"/>`);
    }
    put(`<line x1="${trunkX}" y1="${yOf(i) - 8}" x2="${xOf(it[0]) - 10}" y2="${yOf(i) - 8}" stroke="${C.muted}" stroke-width="2"/>`);
  });
  items.forEach(([d, name, note], i) => {
    const isDir = name.endsWith('/') || name.endsWith('/, test-output/');
    text(xOf(d), yOf(i), name, { size: 22, bold: isDir });
    text(700, yOf(i), note, { size: 22, fill: C.muted });
  });
  return { svg: finish(H), height: H };
});

// V14 - reuse: which Version 1 files were reused unchanged, changed, removed, or are new.
registerFigure('V14_reuse_v1_v2', () => {
  begin();
  const H = 1000;
  strip('V14', 'Reuse: what came from Version 1 unchanged, what changed, what is new');
  const L = 40;
  const LW = 720;
  const R = 800;
  const RW = 760;
  const rowLine = (x, w, y) => put(`<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${C.neutralBorder}" stroke-width="1.2"/>`);
  const row = (x, w, y, name, note) => {
    text(x + 8, y + 24, name, { size: 22 });
    text(x + 402, y + 24, note, { size: 22, fill: C.muted });
    rowLine(x, w, y + 33);
  };
  const REUSED = [
    ['background/extract-tab.js', 'runs the extraction'],
    ['content/extract.js', 'reads the page text'],
    ['core/chunker.js', 'cuts text into parts'],
    ['core/merger.js', 'joins part summaries'],
    ['core/url.js', 'compares page addresses'],
    ['ui/summary-format.js', 'text to paragraphs and lists'],
    ['lib/readability.js', 'main-text reader (vendored)'],
    ['lib/READABILITY_LICENSE.md', 'licence for readability.js'],
  ];
  const REMOVED = [
    ['engines/gemini.js', 'Version 1 cloud engine'],
    ['ui/options.html', 'Version 1 key page'],
    ['ui/options.js', 'Version 1 key page script'],
  ];
  const CHANGED = [
    ['background/service-worker.js', '92 · local engine, no Gemini'],
    ['core/config.js', '83 · local models, no key'],
    ['core/errors.js', '58 · model error codes'],
    ['core/pipeline.js', '6 · model prepared first'],
    ['core/prompts.js', '61 · shorter prompts'],
    ['ui/popup.js', '181 · model line, no key box'],
    ['ui/popup.html', '17 · model line, no key box'],
    ['ui/ui.css', '39 · model line styles'],
  ];
  const NEW = [
    ['background/offscreen-manager.js', 'hidden page, opened and closed'],
    ['engines/local.js', 'local engine, replaces Gemini'],
    ['core/gpu-check.js', 'graphics check, model choice'],
    ['core/engine-errors.js', 'WebLLM errors to codes'],
    ['lib/web-llm.js', 'WebLLM library, no bundler'],
    ['lib/WEBLLM_LICENSE', 'WebLLM licence (Apache 2.0)'],
    ['offscreen/offscreen.html', 'the hidden page'],
    ['offscreen/offscreen.js', 'messages: status, load, answer'],
    ['offscreen/engine-worker.js', 'web worker for WebLLM'],
    ['offscreen/mock-engine.js', 'pretend model for tests'],
  ];
  // Left column: reused and removed.
  let y = 110;
  band(L, y, LW, `Reused unchanged: ${REUSED.length} files`, 'green');
  y += 58;
  for (const [n, note] of REUSED) {
    row(L, LW, y, n, note);
    y += 38;
  }
  y += 14;
  band(L, y, LW, `Removed: ${REMOVED.length} files`, 'red');
  y += 58;
  for (const [n, note] of REMOVED) {
    row(L, LW, y, n, note);
    y += 38;
  }
  // Right column: changed and new.
  let z = 110;
  band(R, z, RW, `Changed: ${CHANGED.length} files (diff lines first)`, 'amber');
  z += 58;
  for (const [n, note] of CHANGED) {
    row(R, RW, z, n, note);
    z += 38;
  }
  z += 14;
  band(R, z, RW, `New in Version 2: ${NEW.length} files`, 'v2');
  z += 58;
  for (const [n, note] of NEW) {
    row(R, RW, z, n, note);
    z += 38;
  }
  text(40, 960, 'Lists come from comparing midsem/project/src with finalsem/project/src (diff).', { size: 22 });
  text(40, 990, 'Diff line counts are old and new lines together: a rough size of each change, not a count of edits.', { size: 22 });
  return { svg: finish(H), height: H };
});

// V15 - how the model writes: page text in, all tokens read at once, then one token written at a time.
registerFigure('V15_how_a_model_writes', () => {
  begin();
  const H = 790;
  strip('V15', 'How the model writes: it reads the whole prompt, then writes one token at a time');
  const steps = [
    ['Page text', ['Up to 6,000 characters per part', '(about 1,500 tokens, config.js)']],
    ['Prompt', ['One safety line, the title, the text between markers, one instruction']],
    ['Reading (prefill)', ['The model reads every token of the prompt in one pass']],
    ['Writing (decode)', ['One new token per step; each step uses everything before it']],
    ['Summary', ['Stops at the end of the answer, or at 300 tokens a part, 320 for the final']],
  ];
  steps.forEach(([title, lines], i) => {
    const x = 40 + i * 302;
    box(x, 110, 270, 200, { kind: i === 3 ? 'amber' : i === 2 ? 'blue' : 'neutral', title, lines });
    if (i < steps.length - 1) arrow([[x + 270, 210], [x + 302, 210]], {});
  });

  text(40, 350, 'Writing: one token at a time. Each small square is one step of the model.', { size: 22 });
  for (let i = 0; i < 40; i += 1) {
    const x = 40 + i * 37;
    put(`<rect x="${x}" y="370" width="29" height="34" rx="3" fill="${i === 39 ? C.amberFill : C.neutralFill}" stroke="${i === 39 ? C.amber : C.neutralBorder}" stroke-width="1.6"/>`);
  }
  text(40, 436, 'The answer ends at its last token, or at the limit (300 tokens a part, 320 for the final summary).', { size: 22 });

  box(40, 470, 1520, 270, {
    kind: 'neutral',
    title: 'Measured on this laptop (NVIDIA RTX 3050, Llama 3.2 1B)',
    lines: [
      'Saved clean runs, writing: 34 to 53 tokens a second. Each value is the last request of its job (v2-local-nvidia-cold-first-attempt.md; 40 and 42 offline in v2-local-nvidia-offline.md).',
      'DEVLOG speed test, 21 Oct (no saved run file): about 63 tokens a second writing, and about 600 a second reading the prompt.',
      'First answer: about 30 s of warm-up on first use while the graphics programs are compiled; 0.5 s in the later offline run.',
    ],
  });
  return { svg: finish(H), height: H };
});

// V16 - chunking: a long page cut into parts, each summarized, then merged (7-part example).
registerFigure('V16_chunking_v2', () => {
  begin();
  const H = 900;
  strip('V16', 'A long page: cut into parts, each summarized, then merged (seven-part example)');
  text(40, 112, 'Page text: 36,752 characters (Wikipedia: Lighthouse, measured in Version 1), cut into 7 parts.', { size: 22 });
  text(40, 144, 'Each part is at most 6,000 characters (chunkChars). Their sizes vary with the paragraphs.', { size: 22 });
  for (let i = 0; i < 7; i += 1) {
    const x = 40 + i * 220;
    box(x, 166, 200, 56, { kind: 'neutral', title: `Part ${i + 1}`, titleSize: 24 });
    arrow([[x + 100, 222], [x + 100, 300]], {});
    box(x, 300, 200, 70, { kind: 'blue', title: `Summary ${i + 1}`, titleSize: 24 });
    arrow([[x + 100, 370], [x + 100, 410]], {});
  }
  box(40, 410, 1520, 60, { kind: 'blue', title: 'Merge: one request for the 7 summaries, in page order', titleSize: 24 });
  arrow([[800, 470], [800, 510]], {});
  box(40, 510, 1520, 60, { kind: 'green', title: 'Final summary', titleSize: 24 });

  text(40, 616, 'Measured timeline (clean run, NVIDIA RTX 3050): 74.1 s, with the model already downloaded and loaded', { size: 24, bold: true });
  const X0 = 60;
  const S = 1480 / 74.1;
  const xs = (t) => X0 + t * S;
  const segs = [
    { a: 0, b: 3.2, kind: 'neutral', top: 'Start', bottom: '3.2 s' },
    { a: 3.2, b: 7.8, kind: 'blue', top: 'Part 1', bottom: '4.6 s' },
    { a: 7.8, b: 17.0, kind: 'blue', top: 'Part 2', bottom: '9.2 s' },
    { a: 17.0, b: 22.5, kind: 'blue', top: 'Part 3', bottom: '5.5 s' },
    { a: 22.5, b: 30.1, kind: 'blue', top: 'Part 4', bottom: '7.6 s' },
    { a: 30.1, b: 38.1, kind: 'blue', top: 'Part 5', bottom: '8.0 s' },
    { a: 38.1, b: 54.7, kind: 'blue', top: 'Part 6', bottom: '16.6 s' },
    { a: 54.7, b: 60.2, kind: 'blue', top: 'Part 7', bottom: '5.5 s' },
    { a: 60.2, b: 74.1, kind: 'green', top: 'Merge', bottom: '13.9 s' },
  ];
  const BY = 636;
  const BH = 66;
  for (const s of segs) {
    const k = KIND[s.kind];
    const x = xs(s.a);
    const w = xs(s.b) - xs(s.a);
    put(`<rect x="${x}" y="${BY}" width="${w}" height="${BH}" fill="${k.fill}" stroke="${k.stroke}" stroke-width="2"/>`);
    text(x + w / 2, BY + 28, s.top, { size: 22, anchor: 'middle' });
    text(x + w / 2, BY + 54, s.bottom, { size: 22, anchor: 'middle' });
  }
  put(`<line x1="${X0}" y1="${BY + BH + 10}" x2="${xs(74.1)}" y2="${BY + BH + 10}" stroke="${C.ink}" stroke-width="2"/>`);
  for (let t = 0; t <= 70; t += 10) {
    put(`<line x1="${xs(t)}" y1="${BY + BH + 10}" x2="${xs(t)}" y2="${BY + BH + 20}" stroke="${C.ink}" stroke-width="2"/>`);
    text(xs(t), BY + BH + 48, `${t} s`, { size: 22, anchor: 'middle' });
  }
  text(40, 806, 'Time per part is the gap between the popup status lines. Start is the check and the load, short because the model was already in memory.', { size: 22 });
  text(40, 838, 'Limit: maxChunks is 12. A page that needs more parts is refused as TOO_LONG before any model work.', { size: 22 });
  text(40, 870, 'Requests: 7 for the parts and 1 for the merge (8 in total, one merge level).', { size: 22 });
  return { svg: finish(H), height: H };
});

// V17 - built-in graphics: reading is the slow part, so a long page is shortened before it is read.
registerFigure('V17_two_graphics_chips', () => {
  begin();
  const H = 900;
  strip('V17', 'Built-in graphics read slowly, so a long page is shortened first');
  box(80, 110, 700, 130, {
    kind: 'amber',
    title: "Intel built-in graphics (the client's chip)",
    lines: ['Iris Xe in a Core i7-1355U. Reads 15.6 and writes 2 tokens a second with Llama 3.2 1B (developer laptop, Intel Gen-12).'],
  });
  box(820, 110, 700, 130, {
    kind: 'blue',
    title: 'NVIDIA RTX 3050 (developer laptop only)',
    lines: ['Reads about 600 and writes 34 to 53 tokens a second with Llama 3.2 1B.'],
  });
  box(80, 280, 700, 110, {
    kind: 'neutral',
    title: 'Wikipedia "Lighthouse" page, whole page',
    lines: ['SmolLM2 360M, 7 parts: 616.4 s (before 26 October).'],
  });
  box(820, 280, 700, 110, {
    kind: 'green',
    title: 'Same page, whole page, NVIDIA',
    lines: ['Llama 3.2 1B, 7 parts: 74.1 s.'],
  });
  box(80, 430, 1440, 290, {
    kind: 'green',
    title: 'What the extension does on built-in graphics: 124.6 s for the same page',
    lines: [
      '1. Cuts the Notes and Bibliography and the [12] markers: 8,788 of 36,752 characters.',
      '2. Keeps the opening and the first sentences of the paragraphs: 5,968 characters (21 percent), one part, no merge request.',
      '3. Keeps answers short (3 sentences) and keeps the accurate main model, Llama 3.2 1B.',
      '4. Says what it did in the popup, and offers "Read the whole page (slower)": about 12 minutes for this page.',
    ],
  });
  box(80, 760, 1440, 100, {
    kind: 'neutral',
    title: 'Laptops with two chips',
    lines: ['Windows Graphics setting or setup.bat --gpu (opt-in) moves Chrome to the separate card. Nothing to do on the client\'s laptop.'],
  });
  return { svg: finish(H), height: H };
});

// ===== RENDER =====
// Each SVG is read back from disk and placed inline in HTML; Chromium rasterises it at 2x.
// Checks: no text wider than its box (data-fit), no text below 22 px, no two text items
// overlapping, and all text inside the canvas. Problems are printed; the exit code is then 1.
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
      const checks = await page.evaluate((H) => {
        const texts = [...document.querySelectorAll('text')];
        const wide = texts
          .filter((t) => t.dataset.fit && t.getComputedTextLength() > Number(t.dataset.fit) + 0.5)
          .map((t) => `${t.textContent} [${t.getComputedTextLength().toFixed(0)} > ${t.dataset.fit}]`);
        const small = texts
          .filter((t) => parseFloat(t.getAttribute('font-size')) < 22)
          .map((t) => `${t.textContent} [${t.getAttribute('font-size')}px]`);
        const boxes = texts.map((t) => {
          const b = t.getBBox();
          return { s: t.textContent, x: b.x, y: b.y, w: b.width, h: b.height };
        });
        const outside = boxes
          .filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > 1600 || b.y + b.h > H)
          .map((b) => `${b.s} [outside the canvas]`);
        const overlap = [];
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i];
            const b = boxes[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (ox > 2 && oy > 4) overlap.push(`"${a.s}" overlaps "${b.s}"`);
          }
        }
        return { wide, small, outside, overlap };
      }, it.height);
      for (const o of checks.wide) problems.push(`${it.name}: wider than its box: ${o}`);
      for (const o of checks.small) problems.push(`${it.name}: font below 22px: ${o}`);
      for (const o of checks.outside) problems.push(`${it.name}: ${o}`);
      for (const o of checks.overlap) problems.push(`${it.name}: text overlap: ${o}`);
      await page.locator('svg').first().screenshot({ path: it.pngPath });
      console.log(`rendered ${it.name}.png (${W}x${it.height} logical)`);
    }
    await contactSheet(page, items);
  } finally {
    await browser.close();
  }
  return problems;
}

// One picture with all figures, for a quick look (_contact-sheet.png).
async function contactSheet(page, items) {
  const cells = items
    .map((it) => {
      const b64 = fs.readFileSync(it.pngPath).toString('base64');
      return `<figure><figcaption>${esc(it.name)}</figcaption><img alt="${esc(it.name)}" src="data:image/png;base64,${b64}"></figure>`;
    })
    .join('\n');
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `body{margin:0;padding:24px;background:#fff;font-family:${FONT};color:#1C1B1A;width:1600px;box-sizing:border-box}` +
    `h1{font-size:28px;margin:0 0 16px}` +
    `.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}` +
    `figure{margin:0;border:1px solid #D9D2C3;padding:10px;background:#fff}` +
    `figcaption{font-size:22px;font-weight:700;margin-bottom:8px}` +
    `img{width:100%;height:auto;display:block}` +
    `</style></head><body><h1>Version 2 figures, V01 to V17</h1><div class="grid">${cells}</div></body></html>`;
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.screenshot({ path: path.join(HERE, '_contact-sheet.png'), fullPage: true });
  console.log('wrote _contact-sheet.png');
}

async function main() {
  fs.mkdirSync(SVG_DIR, { recursive: true });
  const items = [];
  const buildProblems = [];
  for (const fig of FIGS) {
    let built;
    try {
      built = fig.build();
    } catch (err) {
      // A box whose text does not fit throws in the helpers; collect it and keep going.
      buildProblems.push(`${fig.name}: ${err.message}`);
      continue;
    }
    const { svg, height } = built;
    const svgPath = path.join(SVG_DIR, `${fig.name}.svg`);
    fs.writeFileSync(svgPath, svg, 'utf8');
    items.push({ name: fig.name, svgPath, pngPath: path.join(HERE, `${fig.name}.png`), height: Math.ceil(height) });
    console.log(`wrote svg/${fig.name}.svg (${height} px tall)`);
  }
  if (buildProblems.length) {
    console.error('LAYOUT PROBLEMS (figure not drawn):\n  ' + buildProblems.join('\n  '));
    process.exitCode = 1;
  }
  const problems = await renderAll(items);
  if (problems.length) {
    console.error('LEGIBILITY / FIT / OVERLAP PROBLEMS:\n  ' + problems.join('\n  '));
    process.exitCode = 1;
  } else if (!buildProblems.length) {
    console.log('all checks passed');
  }
}

await main();
