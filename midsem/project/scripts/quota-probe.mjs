// Finds out how many requests a free-tier key really gets on each candidate model, by sending
// tiny requests one after another until the service answers HTTP 429, and printing the limit
// the service names. The key is never printed. Uses up to MAX requests per model (free).
//
// Run:  node scripts/quota-probe.mjs [model ...]     (default: the candidate list below)
// Output: docs/test-runs/quota-probe.json
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../src/core/config.js';
import { loadGeminiKey } from '../tests/helpers/key.mjs';

const key = loadGeminiKey();
if (!key) {
  console.error('No Gemini key found.');
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', '..', 'docs', 'test-runs');
mkdirSync(outDir, { recursive: true });

const MAX = 30;
const candidates = process.argv.slice(2).length ? process.argv.slice(2) : ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
const THINK = { 'gemini-3.5-flash-lite': null, 'gemini-2.5-flash-lite': { thinkingBudget: 0 }, 'gemini-2.5-flash': { thinkingBudget: 0 }, 'gemini-3.1-flash-lite': null };
const results = [];

for (const model of candidates) {
  const row = { model, okBefore429: 0, firstError: null };
  for (let i = 1; i <= MAX; i += 1) {
    const generationConfig = { temperature: 0.2 };
    if (THINK[model]) generationConfig.thinkingConfig = THINK[model];
    const res = await fetch(`${DEFAULTS.apiBaseUrl}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with one word: ok' }] }], generationConfig }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      row.okBefore429 = i;
    } else {
      row.firstError = { status: res.status, message: (body?.error?.message ?? '').replace(/\s+/g, ' ').slice(0, 420) };
      break;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  row.reachedProbeMax = !row.firstError;
  results.push(row);
  console.log(`${model.padEnd(26)} ok=${row.okBefore429}${row.reachedProbeMax ? ` (no limit hit in ${MAX})` : ''}${row.firstError ? `  HTTP ${row.firstError.status}: ${row.firstError.message}` : ''}`);
}
writeFileSync(path.join(outDir, 'quota-probe.json'), JSON.stringify({ date: new Date().toISOString(), probeMax: MAX, results }, null, 2));
