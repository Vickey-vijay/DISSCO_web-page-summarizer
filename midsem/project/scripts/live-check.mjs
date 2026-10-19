// M4 check against the real Gemini API: which Flash models exist for this key, and does the
// configured model answer a tiny request? Prints model names and timings only, never the key.
//
// Run:  node scripts/live-check.mjs
import { DEFAULTS } from '../src/core/config.js';
import { loadGeminiKey } from '../tests/helpers/key.mjs';

const key = loadGeminiKey();
if (!key) {
  console.error('No Gemini key found (env var Gemini_API, or .env.test). Nothing checked.');
  process.exit(2);
}
console.log(`Key found (${key.length} characters). Base URL: ${DEFAULTS.apiBaseUrl}`);

async function call(pathAndQuery, init = {}) {
  const started = Date.now();
  const res = await fetch(`${DEFAULTS.apiBaseUrl}${pathAndQuery}`, {
    ...init,
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { res, body, ms: Date.now() - started };
}

const list = await call('/v1beta/models?pageSize=200');
console.log(`ListModels -> HTTP ${list.res.status} in ${list.ms} ms`);
if (list.res.ok) {
  const names = (list.body.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/i.test(n));
  console.log(`generateContent models with "flash" in the name (${names.length}):`);
  for (const n of names) console.log('  ' + n);
  console.log(`Configured model "${DEFAULTS.model}" is ${names.includes(DEFAULTS.model) ? 'IN' : 'NOT in'} that list.`);
} else {
  console.log('ListModels error:', JSON.stringify(list.body?.error ?? list.body)?.slice(0, 300));
}

const model = process.argv[2] ?? DEFAULTS.model;
const gen = await call(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
  method: 'POST',
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Reply with exactly the three words: pipeline check ok' }] }],
    generationConfig: { temperature: 0.2 },
  }),
});
console.log(`generateContent(${model}) -> HTTP ${gen.res.status} in ${gen.ms} ms`);
if (gen.res.ok) {
  const text = gen.body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  console.log('Answer:', JSON.stringify(text.slice(0, 120)));
  console.log('Usage:', JSON.stringify(gen.body?.usageMetadata ?? {}));
} else {
  console.log('Error:', JSON.stringify(gen.body?.error ?? gen.body)?.slice(0, 400));
  const ra = gen.res.headers.get('retry-after');
  if (ra) console.log('Retry-After:', ra);
}
