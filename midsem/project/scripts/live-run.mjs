// Live runs: the real extension, in a visible Chromium window, summarizing real pages with the
// real Gemini API. Records what happened (text size, parts, requests, time, summary) and takes
// the screenshots used in the report. The key is read by tests/helpers/key.mjs and is never
// printed or saved. Uses roughly 30 to 40 API requests, so it is run on purpose, not by `npm test`.
//
// Run:  node scripts/live-run.mjs            (all cases)
//       node scripts/live-run.mjs L03 L04    (only these)
//
// Output: docs/test-runs/live-measurements.json, live-measurements.md, live-summaries.md
//         docs/screenshots/L**.png
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../src/core/config.js';
import { startFixtureServer } from '../tests/helpers/fixtures-server.mjs';
import { launchExtension } from '../tests/helpers/extension.mjs';
import { loadGeminiKey } from '../tests/helpers/key.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..', '..', 'docs');
const shots = path.join(docs, 'screenshots');
const runs = path.join(docs, 'test-runs');
mkdirSync(shots, { recursive: true });
mkdirSync(runs, { recursive: true });

const key = loadGeminiKey();
if (!key) {
  console.error('No Gemini key found. Live runs skipped.');
  process.exit(2);
}

const only = process.argv.slice(2);
const fixtures = await startFixtureServer();
const ext = await launchExtension({ extraHostPermissions: ['https://*/*'] });
const L = (p) => `${fixtures.origin}/${p}`;

const CASES = [
  { id: 'L01', name: 'Short article (fixture)', url: L('article-short.html'), note: 'one part, one request' },
  { id: 'L02', name: 'Long article (fixture), default limit', url: L('article-long.html'), note: 'default 8,000-character parts' },
  { id: 'L03', name: 'Long article (fixture), 3,000-character parts', url: L('article-long.html'), settings: { chunkChars: 3000 }, note: 'forces a longer part-by-part run' },
  { id: 'L04', name: 'Wikipedia: Lighthouse', url: 'https://en.wikipedia.org/wiki/Lighthouse' },
  { id: 'L05', name: 'Wikipedia: Fresnel lens', url: 'https://en.wikipedia.org/wiki/Fresnel_lens' },
  { id: 'L06', name: 'Chrome docs: Manifest V3', url: 'https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3' },
  { id: 'L07', name: 'MDN: WebGPU API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API' },
  { id: 'L08', name: 'Wikipedia: World War II (very long), page limit lowered to 10 parts', url: 'https://en.wikipedia.org/wiki/World_War_II', settings: { maxChunks: 10 }, note: 'shows the TOO_LONG guard on a real page without spending requests' },
  { id: 'L09', name: 'Wrong API key, real service', url: L('article-short.html'), apiKey: 'this-is-not-a-real-key', note: 'the real API answers with its own invalid-key error' },
];

const results = [];
const summaries = [];

async function runCase(c) {
  await ext.setSettings({ apiKey: c.apiKey ?? key, ...(c.settings ?? {}) });
  await ext.clearJobs();
  const page = await ext.context.newPage();
  const row = { id: c.id, name: c.name, url: c.url.replace(fixtures.origin, 'http://127.0.0.1:<fixture-port>'), note: c.note ?? '', startedAt: new Date().toISOString() };
  try {
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500); // let scripts on real sites settle
    row.pageTitle = await page.title();
    await page.screenshot({ path: path.join(shots, `${c.id}-page.png`) });

    const tabId = await ext.tabIdOf(page);
    const popup = await ext.openPopup(tabId);
    const t0 = Date.now();
    await popup.click('#summarize');

    const done = popup.locator('#result:not([hidden])');
    const failed = popup.locator('#error:not([hidden])');
    let midShot = false;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      if ((await done.count()) > 0 || (await failed.count()) > 0) break;
      if (!midShot) {
        const text = await popup.locator('#progress-text').innerText().catch(() => '');
        if (/part [23] of/.test(text)) {
          await popup.screenshot({ path: path.join(shots, `${c.id}-progress.png`) });
          midShot = true;
        }
      }
      await popup.waitForTimeout(250);
    }
    row.wallSeconds = Number(((Date.now() - t0) / 1000).toFixed(1));
    const job = await ext.getJob(tabId);
    row.outcome = (await done.count()) > 0 ? 'summary' : (await failed.count()) > 0 ? 'error' : 'timeout';
    if (row.outcome === 'error') {
      row.errorCode = job?.error?.code ?? null;
      row.errorMessage = await popup.locator('#error-text').innerText();
      row.errorDetail = job?.error?.detail ?? null;
    }
    if (job?.stats) {
      const s = job.stats;
      Object.assign(row, { textChars: s.textChars, parts: s.chunks, requests: s.apiCalls, mergeLevels: s.mergeLevels, extractMethod: s.extractMethod, pipelineSeconds: Number((s.elapsedMs / 1000).toFixed(1)), model: s.model });
    }
    if (row.outcome === 'summary') {
      row.summaryChars = job.summary.length;
      summaries.push({ id: c.id, name: c.name, summary: job.summary });
    }
    await popup.screenshot({ path: path.join(shots, `${c.id}-popup.png`) });
    await popup.close();
  } catch (err) {
    row.outcome = 'harness-error';
    row.errorMessage = String(err.message).split('\n')[0];
  } finally {
    await page.close().catch(() => {});
  }
  return row;
}

try {
  for (const c of CASES) {
    if (only.length && !only.includes(c.id)) continue;
    process.stdout.write(`${c.id} ${c.name} ... `);
    const row = await runCase(c);
    results.push(row);
    console.log(`${row.outcome}${row.errorCode ? ' (' + row.errorCode + ')' : ''}  ${row.wallSeconds ?? '-'} s  parts=${row.parts ?? '-'} requests=${row.requests ?? '-'} chars=${row.textChars ?? '-'}`);
    // The cheap model's free tier allows about 15 requests a minute: pause longer after big runs.
    await new Promise((r) => setTimeout(r, (row.requests ?? 0) > 7 ? 65000 : 20000));
  }
} finally {
  await ext.close();
  await fixtures.close();
}

const suffix = only.length ? '-partial' : '';
writeFileSync(
  path.join(runs, `live-measurements${suffix}.json`),
  JSON.stringify({ date: new Date().toISOString(), model: DEFAULTS.model, thinkingLevel: DEFAULTS.thinkingLevel, defaultChunkChars: DEFAULTS.chunkChars, results }, null, 2),
);

const md = ['# Live runs against the real Gemini API', '', `Model \`${DEFAULTS.model}\`, thinking level \`${DEFAULTS.thinkingLevel}\`, default part size ${DEFAULTS.chunkChars} characters. Headless Chromium (hidden window), extension loaded, real pages. Times are measured by the test, not estimated.`, '',
  '| ID | Page | Text chars | Parts | Requests | Merge levels | Extraction | Total time (s) | Outcome |', '|---|---|---|---|---|---|---|---|---|'];
for (const r of results) {
  md.push(`| ${r.id} | ${r.name} | ${r.textChars ?? '-'} | ${r.parts ?? '-'} | ${r.requests ?? '-'} | ${r.mergeLevels ?? '-'} | ${r.extractMethod ?? '-'} | ${r.wallSeconds ?? '-'} | ${r.outcome}${r.errorCode ? ' (' + r.errorCode + ')' : ''} |`);
}
writeFileSync(path.join(runs, `live-measurements${suffix}.md`), md.join('\n') + '\n');

const sm = ['# Summaries produced in the live runs', '', 'Exactly as shown in the popup (nothing edited).', ''];
for (const s of summaries) sm.push(`## ${s.id}: ${s.name}`, '', '```text', s.summary, '```', '');
writeFileSync(path.join(runs, `live-summaries${suffix}.md`), sm.join('\n'));
console.log('Wrote live-measurements, live-summaries and screenshots (docs/).');
