// Measures the REAL local model in a real (hidden) Chromium with the V2 extension loaded:
// download time, load time from the cache, warm-up, time per summary, and whether it works with
// the network blocked. Run it on purpose; it downloads about 660 MB the first time.
//
//   node scripts/local-run.mjs nvidia           cold start on the separate graphics card (downloads the model)
//   node scripts/local-run.mjs nvidia-offline   same profile, every outside website blocked (cache only)
//   node scripts/local-run.mjs intel            the processor's built-in graphics (the automatic small model)
//   node scripts/local-run.mjs intel-wikipedia  the same, on the long Wikipedia article (7 parts; slow)
//
// Output: docs/test-runs/v2-local-<mode>.json and .md, screenshots in docs/screenshots/v2-*.png
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from '../tests/helpers/fixtures-server.mjs';
import { launchExtension } from '../tests/helpers/extension.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const docs = path.resolve(root, '..', 'docs');
const shots = path.join(docs, 'screenshots');
const runs = path.join(docs, 'test-runs');
mkdirSync(shots, { recursive: true });
mkdirSync(runs, { recursive: true });

const mode = process.argv[2] ?? 'nvidia';
const PLANS = {
  nvidia: { profile: '.model-profile', args: ['--force_high_performance_gpu'], online: true, cases: ['short', 'long', 'wikipedia'] },
  'nvidia-offline': { profile: '.model-profile', args: ['--force_high_performance_gpu', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'], online: false, cases: ['short', 'long'] },
  intel: { profile: '.model-profile-intel', args: [], online: true, cases: ['short', 'long'] },
  'intel-wikipedia': { profile: '.model-profile-intel', args: [], online: true, cases: ['wikipedia'] },
  'intel-short': { profile: '.model-profile-intel', args: [], online: true, cases: ['short'] },
  // The default on built-in graphics since 26 October: the main model (Llama 3.2 1B), long pages shortened. The first case includes the download and the warm-up.
  'intel-better': { profile: '.model-profile-intel-better', args: [], online: true, cases: ['short', 'wikipedia', 'long'] },
  'intel-fast': { profile: '.model-profile-intel', args: [], online: true, cases: ['short', 'wikipedia'], settings: { quality: 'fast' } },
};
const plan = PLANS[mode];
if (!plan) throw new Error(`unknown mode ${mode}; use ${Object.keys(PLANS).join(', ')}`);

// A persistent profile keeps the extension's service worker scripts, so a changed service worker
// would not run on the next launch (seen: the "halvedParts" stat was missing after the code changed).
// Deleting only that folder is safe: the downloaded model lives in IndexedDB, which stays.
for (const dir of ['Service Worker', 'Code Cache']) rmSync(path.join(root, plan.profile, 'Default', dir), { recursive: true, force: true });

const fixtures = await startFixtureServer();
const CASES = {
  short: { id: 'short', name: 'Short article (fixture)', url: `${fixtures.origin}/article-short.html` },
  long: { id: 'long', name: 'Long article (fixture)', url: `${fixtures.origin}/article-long.html` },
  wikipedia: { id: 'wikipedia', name: 'Wikipedia: Lighthouse', url: 'https://en.wikipedia.org/wiki/Lighthouse' },
};

const ext = await launchExtension({
  extraHostPermissions: ['https://*/*'],
  userDataDir: path.join(root, plan.profile),
  extensionDir: path.join(root, plan.profile + '-ext'), // fixed folder: same extension id on every run
  extraArgs: plan.args,
});
const results = [];

async function runCase(c) {
  await ext.setSettings(plan.settings ?? {});
  await ext.clearJobs();
  const page = await ext.context.newPage();
  const row = { mode, id: c.id, name: c.name, startedAt: new Date().toISOString() };
  try {
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    const tabId = await ext.tabIdOf(page);
    const popup = await ext.openPopup(tabId);
    await popup.waitForFunction(() => !/Checking this computer/.test(document.getElementById('model-line').textContent), null, { timeout: 60000 });
    row.modelLineBefore = await popup.locator('#model-line').innerText();
    row.gpuNote = (await popup.locator('#gpu-note').isVisible()) ? await popup.locator('#gpu-note').innerText() : null;
    row.buttonBefore = await popup.locator('#summarize').innerText();
    await ext.shot(popup, `v2-${mode}-${c.id}-before`);
    const t0 = Date.now();
    await popup.click('#summarize');

    const timeline = [];
    const done = popup.locator('#result:not([hidden])');
    const failed = popup.locator('#error:not([hidden])');
    let shotDownload = false;
    let shotWarm = false;
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      if ((await done.count()) > 0 || (await failed.count()) > 0) break;
      const text = await popup.locator('#progress-text').innerText().catch(() => '');
      if (text && timeline.at(-1)?.text !== text) timeline.push({ s: Number(((Date.now() - t0) / 1000).toFixed(1)), text });
      if (!shotDownload && /Downloading the model.*: ([3-9]\d)%/.test(text)) {
        await popup.mouse.move(1, 1);
        await popup.screenshot({ path: path.join(shots, `v2-${mode}-${c.id}-downloading.png`) });
        shotDownload = true;
      }
      if (!shotWarm && /Warming up/.test(text)) {
        await popup.mouse.move(1, 1);
        await popup.screenshot({ path: path.join(shots, `v2-${mode}-${c.id}-warming.png`) });
        shotWarm = true;
      }
      await popup.waitForTimeout(400);
    }
    row.wallSeconds = Number(((Date.now() - t0) / 1000).toFixed(1));
    row.timeline = timeline;
    const job = await ext.getJob(tabId);
    row.outcome = (await done.count()) > 0 ? 'summary' : (await failed.count()) > 0 ? 'error' : 'timeout';
    if (row.outcome === 'error') row.error = { code: job?.error?.code, message: await popup.locator('#error-text').innerText(), detail: job?.error?.detail };
    if (job?.stats) row.stats = job.stats;
    if (row.outcome === 'summary') row.summary = job.summary;
    await popup.mouse.move(1, 1);
    await popup.screenshot({ path: path.join(shots, `v2-${mode}-${c.id}-popup.png`) });
    await popup.close();
  } catch (err) {
    row.outcome = 'harness-error';
    row.error = { message: String(err.message).split('\n')[0] };
  } finally {
    await page.close().catch(() => {});
  }
  return row;
}

try {
  for (const id of plan.cases) {
    const c = CASES[id];
    process.stdout.write(`${mode}/${c.id} ... `);
    const row = await runCase(c);
    results.push(row);
    console.log(`${row.outcome}  ${row.wallSeconds ?? '-'} s  model=${row.stats?.model ?? '-'}  parts=${row.stats?.chunks ?? '-'}  gpu=${row.stats?.gpu ? row.stats.gpu.vendor : '-'}${row.error ? '  ERROR ' + (row.error.code ?? '') + ' ' + row.error.message : ''}`);
  }
} finally {
  await ext.close();
  await fixtures.close();
}

writeFileSync(path.join(runs, `v2-local-${mode}.json`), JSON.stringify({ date: new Date().toISOString(), mode, plan: { args: plan.args, online: plan.online }, results }, null, 2));
const md = [`# V2 local model run: ${mode}`, '', `Hidden Chromium, V2 extension, real model. Flags: \`${plan.args.join(' ') || 'none'}\`. Outside websites ${plan.online ? 'allowed' : 'blocked (cache only)'}.`, '',
  '| Case | Outcome | Total (s) | Model | Graphics | Parts | Requests | Load (ms) | Decode (tok/s) |', '|---|---|---|---|---|---|---|---|---|'];
for (const r of results) md.push(`| ${r.name} | ${r.outcome} | ${r.wallSeconds ?? '-'} | ${r.stats?.model ?? '-'} | ${r.stats?.gpu ? r.stats.gpu.vendor + ' ' + r.stats.gpu.architecture : '-'} | ${r.stats?.chunks ?? '-'} | ${r.stats?.apiCalls ?? '-'} | ${r.stats?.loadMs ?? '-'} | ${r.stats?.decodeTps ? Math.round(r.stats.decodeTps) : '-'} |`);
md.push('', '## Timelines (seconds after pressing the button)', '');
for (const r of results) {
  md.push(`### ${r.name}`, '', `- Before: ${r.modelLineBefore ?? '-'} | button: ${r.buttonBefore ?? '-'}${r.gpuNote ? ' | note: ' + r.gpuNote : ''}`);
  for (const t of r.timeline ?? []) md.push(`- ${t.s} s: ${t.text}`);
  md.push('');
}
writeFileSync(path.join(runs, `v2-local-${mode}.md`), md.join('\n'));
console.log(`Wrote docs/test-runs/v2-local-${mode}.json and .md`);
