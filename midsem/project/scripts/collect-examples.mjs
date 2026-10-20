// Collects REAL worked examples for the report, by running the extension in the browser
// against the fixture pages with the mock Gemini server (deterministic, no API quota):
//   - what extraction keeps and drops on a noisy article
//   - how the long article is chunked at 3,000 and at 8,000 characters
//   - the real prompts sent for a one-chunk page, a chunk and a merge
//   - which extraction method handled each fixture page
// Output: docs/test-runs/examples.json and examples.md
//
// Run:  node scripts/collect-examples.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from '../tests/helpers/fixtures-server.mjs';
import { startMockGemini } from '../tests/helpers/mock-gemini.mjs';
import { launchExtension, summarize } from '../tests/helpers/extension.mjs';
import { PAGE_END, PAGE_START } from '../src/core/prompts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', '..', 'docs', 'test-runs');
mkdirSync(outDir, { recursive: true });

const pageTextOf = (prompt) => prompt.split(PAGE_START).pop().split(PAGE_END)[0].trim();
const clip = (s, n = 90) => (s.length > n ? s.slice(0, n).replace(/\s+/g, ' ') + '...' : s.replace(/\s+/g, ' '));

const fixtures = await startFixtureServer();
const mock = await startMockGemini();
const ext = await launchExtension();
const out = { collectedAt: new Date().toISOString(), pages: {}, chunking: {}, prompts: {} };

async function run(fixture, { chunkChars } = {}) {
  mock.reset();
  await ext.setSettings({ apiKey: mock.validKey, apiBaseUrl: mock.origin, ...(chunkChars ? { chunkChars } : {}) });
  await ext.clearJobs();
  const page = await ext.context.newPage();
  await page.goto(`${fixtures.origin}/${fixture}`);
  const raw = await page.evaluate(() => document.body.innerText);
  const result = await summarize(ext, page, { timeoutMs: 60000 });
  const job = await ext.getJob(result.tabId);
  const requests = mock.requests.map((r) => ({ ...r }));
  await result.popup.close();
  await page.close();
  return { raw, result, job, requests };
}

try {
  // --- extraction on the noisy short article
  {
    const { raw, result, job, requests } = await run('article-short.html');
    const sent = pageTextOf(requests[0].prompt);
    const noise = ['SUBSCRIBE NOW', 'Accept all cookies', 'Related articles', 'Advertise with us', 'SPONSORED', 'Terms of use'];
    out.pages['article-short.html'] = {
      outcome: result.outcome,
      rawVisibleChars: raw.length,
      sentToModelChars: sent.length,
      method: job.stats.extractMethod,
      noiseInRaw: noise.filter((n) => raw.includes(n)),
      noiseSentToModel: noise.filter((n) => sent.includes(n)),
      rawStart: clip(raw, 260),
      sentStart: clip(sent, 260),
      sentEnd: clip(sent.slice(-200), 200),
    };
    out.prompts.single = requests[0].prompt;
  }

  // --- chunking of the long article at two limits
  for (const chunkChars of [3000, 8000]) {
    const { raw, result, job, requests } = await run('article-long.html', { chunkChars });
    const chunks = requests.filter((r) => r.kind === 'chunk');
    const merges = requests.filter((r) => r.kind === 'merge');
    const single = requests.filter((r) => r.kind === 'single');
    out.chunking[String(chunkChars)] = {
      outcome: result.outcome,
      rawVisibleChars: raw.length,
      textChars: job.stats.textChars,
      chunks: job.stats.chunks,
      apiCalls: job.stats.apiCalls,
      mergeLevels: job.stats.mergeLevels,
      singlePromptRequests: single.length,
      mergeRequests: merges.length,
      chunkTable: chunks.map((c) => {
        const body = pageTextOf(c.prompt);
        return { index: c.index, total: c.total, chars: body.length, starts: clip(body, 60), ends: clip(body.slice(-60), 60) };
      }),
    };
    if (chunkChars === 3000) {
      out.prompts.chunk = chunks[1]?.prompt ?? chunks[0]?.prompt;
      out.prompts.merge = merges[0]?.prompt;
    }
  }

  // --- which extraction method each fixture used
  for (const fixture of ['dashboard.html', 'late-content.html?delay=300', 'near-empty.html']) {
    mock.reset();
    await ext.setSettings({ apiKey: mock.validKey, apiBaseUrl: mock.origin });
    await ext.clearJobs();
    const page = await ext.context.newPage();
    await page.goto(`${fixtures.origin}/${fixture}`);
    if (fixture.startsWith('late')) await page.waitForTimeout(1200);
    const result = await summarize(ext, page, { timeoutMs: 30000 });
    const job = await ext.getJob(result.tabId);
    out.pages[fixture] = { outcome: result.outcome, message: result.outcome === 'error' ? result.text : null, method: job?.stats?.extractMethod ?? null, textChars: job?.stats?.textChars ?? null };
    await result.popup.close();
    await page.close();
  }
} finally {
  await ext.close();
  await mock.close();
  await fixtures.close();
}

writeFileSync(path.join(outDir, 'examples.json'), JSON.stringify(out, null, 2));

const md = [];
md.push('# Worked examples collected from real runs', '', `Collected ${out.collectedAt} with the extension loaded in Chromium and a mock Gemini server (so the model text here is fake, but the page text, chunking and prompts are real).`, '');
const s = out.pages['article-short.html'];
md.push('## Extraction on a noisy article (article-short.html)', '', `- Visible text on the page: ${s.rawVisibleChars} characters. Sent to the model: ${s.sentToModelChars} characters. Method: ${s.method}.`, `- Noise present on the page: ${s.noiseInRaw.join('; ') || 'none'}.`, `- Noise that reached the model: ${s.noiseSentToModel.join('; ') || 'none'}.`, '', '```text', 'RAW (start):  ' + s.rawStart, 'SENT (start): ' + s.sentStart, 'SENT (end):   ' + s.sentEnd, '```', '');
for (const [limit, c] of Object.entries(out.chunking)) {
  md.push(`## Chunking article-long.html at ${limit} characters`, '', `Extracted text ${c.textChars} characters, ${c.chunks} chunk(s), ${c.apiCalls} model call(s) in total, ${c.mergeRequests} merge call(s), merge levels ${c.mergeLevels}.`, '');
  if (c.chunkTable.length) {
    md.push('| Chunk | Characters | Starts with | Ends with |', '|---|---|---|---|');
    for (const r of c.chunkTable) md.push(`| ${r.index} of ${r.total} | ${r.chars} | ${r.starts.replace(/\|/g, '/')} | ${r.ends.replace(/\|/g, '/')} |`);
    md.push('');
  }
}
md.push('## Extraction method per fixture page', '', '| Page | Outcome | Method | Characters |', '|---|---|---|---|');
for (const [name, p] of Object.entries(out.pages)) md.push(`| ${name} | ${p.outcome}${p.message ? ' (' + p.message + ')' : ''} | ${p.method ?? '-'} | ${p.textChars ?? p.sentToModelChars ?? '-'} |`);
md.push('', '## Prompts actually sent', '');
for (const [kind, prompt] of Object.entries(out.prompts)) {
  if (!prompt) continue;
  const shown = prompt.length > 1400 ? prompt.slice(0, 700) + '\n[... page text omitted ...]\n' + prompt.slice(-500) : prompt;
  md.push(`### ${kind}`, '', '```text', shown, '```', '');
}
writeFileSync(path.join(outDir, 'examples.md'), md.join('\n'));
console.log('Wrote docs/test-runs/examples.json and examples.md');
