// Picks the V1 cloud model by measurement. Sends the same real summarization request
// (about 7,000 characters of the long fixture, built with the extension's own prompt)
// to several model / thinking settings and records latency, token use and output length.
// The key is never printed or saved. Results go to docs/test-runs/model-bench.json.
//
// Run:  node scripts/model-bench.mjs [runsPerCandidate]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../src/core/config.js';
import { buildSinglePrompt } from '../src/core/prompts.js';
import { loadGeminiKey } from '../tests/helpers/key.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const key = loadGeminiKey();
if (!key) {
  console.error('No Gemini key found. Nothing run.');
  process.exit(2);
}
const runs = Number(process.argv[2] ?? 1);

// ~7,000 characters: the first sections of the long fixture article.
const html = readFileSync(path.join(here, '..', 'tests', 'fixtures', 'article-long.html'), 'utf8');
const blocks = [...html.matchAll(/<(h2|p)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
let text = '';
for (const b of blocks.slice(2)) {
  if ((text + b).length > 7000) break;
  text += (text ? '\n\n' : '') + b;
}
const prompt = buildSinglePrompt({ title: 'Lighthouses: A Short History of Light on the Coast', text });
console.log(`Test input: ${text.length} characters, ${runs} run(s) per candidate\n`);

const candidates = [
  { label: 'gemini-3.8-flash (default thinking)', model: 'gemini-3.8-flash', thinking: null },
  { label: 'gemini-3.8-flash thinkingLevel=low', model: 'gemini-3.8-flash', thinking: { thinkingLevel: 'low' } },
  { label: 'gemini-3.8-flash thinkingLevel=minimal', model: 'gemini-3.8-flash', thinking: { thinkingLevel: 'minimal' } },
  { label: 'gemini-3.8-flash thinkingBudget=0', model: 'gemini-3.8-flash', thinking: { thinkingBudget: 0 } },
  { label: 'gemini-3.5-flash-lite (default)', model: 'gemini-3.5-flash-lite', thinking: null },
  { label: 'gemini-2.5-flash thinkingBudget=0', model: 'gemini-2.5-flash', thinking: { thinkingBudget: 0 } },
];

// Optional 2nd argument: comma-separated label fragments to run only some candidates.
const only = (process.argv[3] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const selected = only.length ? candidates.filter((c) => only.some((o) => c.label.includes(o))) : candidates;

const results = [];
for (const c of selected) {
  for (let i = 1; i <= runs; i += 1) {
    const generationConfig = { temperature: DEFAULTS.temperature };
    if (c.thinking) generationConfig.thinkingConfig = c.thinking;
    const started = Date.now();
    let row;
    try {
      const res = await fetch(`${DEFAULTS.apiBaseUrl}/v1beta/models/${c.model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
        signal: AbortSignal.timeout(90000),
      });
      const body = await res.json().catch(() => null);
      const out = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
      row = {
        label: c.label, run: i, status: res.status, ms: Date.now() - started,
        promptTokens: body?.usageMetadata?.promptTokenCount ?? null,
        outputTokens: body?.usageMetadata?.candidatesTokenCount ?? null,
        thinkingTokens: body?.usageMetadata?.thoughtsTokenCount ?? 0,
        outputChars: out.length,
        error: res.ok ? null : (body?.error?.message ?? 'error').slice(0, 160),
        sample: res.ok ? out.slice(0, 160).replace(/\s+/g, ' ') : null,
      };
    } catch (err) {
      row = { label: c.label, run: i, status: 0, ms: Date.now() - started, error: String(err.message).slice(0, 160) };
    }
    results.push(row);
    console.log(
      `${row.label.padEnd(42)} run ${i}  HTTP ${String(row.status).padEnd(3)}  ${String(row.ms).padStart(6)} ms` +
        (row.error ? `  ERROR: ${row.error}` : `  think=${row.thinkingTokens} out=${row.outputTokens} (${row.outputChars} chars)`),
    );
    await new Promise((r) => setTimeout(r, 1500)); // be gentle with free-tier limits
  }
}

const outDir = path.resolve(here, '..', '..', 'docs', 'test-runs');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'model-bench.json'),
  JSON.stringify({ date: new Date().toISOString(), inputChars: text.length, runsPerCandidate: runs, results }, null, 2),
);
console.log('\nSaved docs/test-runs/model-bench.json');
