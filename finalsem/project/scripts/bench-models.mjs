// Speed benchmark of small models on THIS computer's default graphics chip (hidden Chromium).
// For each model it measures: loading, the first-answer warm-up, reading speed (prefill: a 1,500
// token part, one token out), writing speed (decode: 100 tokens), and one realistic part summary.
//
//   node scripts/bench-models.mjs                       the default list
//   node scripts/bench-models.mjs <modelId> [<modelId>] only these models
//
// It uses its own browser profile (.model-profile-bench), so the models it downloads stay there
// and a second run does not download again. Results: docs/test-runs/bench-models.json and .md.
// This is a measuring tool, not a test: run it when nothing else is using the graphics chip.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchExtension } from '../tests/helpers/extension.mjs';
import { buildChunkPrompt } from '../src/core/prompts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = path.resolve(root, '..', 'docs', 'test-runs');
mkdirSync(runs, { recursive: true });

const DEFAULT_MODELS = [
  'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'SmolLM2-360M-Instruct-q4f32_1-MLC',
  'SmolLM2-135M-Instruct-q0f16-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  'gemma3-1b-it-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f32_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
];
const models = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_MODELS;

// A realistic part: the first 6,000 characters of the long fixture article, in the real prompt.
const html = readFileSync(path.join(root, 'tests', 'fixtures', 'article-long.html'), 'utf8');
const text = html
  .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const part = (text + ' ' + text).slice(0, 6000); // the fixture is about 10,500 characters; this is one full-size part
const partPrompt = buildChunkPrompt({ title: 'Benchmark article', text: part, index: 2, total: 7 });
const decodePrompt = 'Write a long, detailed story about a lighthouse keeper who lives alone on a rock in the sea.';

const profile = path.join(root, '.model-profile-bench');
for (const dir of ['Service Worker', 'Code Cache']) rmSync(path.join(profile, 'Default', dir), { recursive: true, force: true });
const ext = await launchExtension({
  extraHostPermissions: ['https://*/*'],
  userDataDir: profile,
  extensionDir: path.join(root, '.model-profile-bench-ext'),
  extraArgs: [],
});

const adapterInfo = await ext.run(async () => {
  const a = await navigator.gpu.requestAdapter();
  return { vendor: a.info.vendor, architecture: a.info.architecture, f16: a.features.has('shader-f16'), maxBufferSize: a.limits.maxBufferSize };
});
console.log('adapter', JSON.stringify(adapterInfo));

const results = [];
for (const modelId of models) {
  process.stdout.write(`${modelId} ... `);
  const t0 = Date.now();
  let row;
  try {
    row = await ext.run(
      async ({ base, modelId, partPrompt, decodePrompt }) => {
        const { CreateWebWorkerMLCEngine, prebuiltAppConfig } = await import(`${base}/src/lib/web-llm.js`);
        const appConfig = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' };
        const worker = new Worker(`${base}/src/offscreen/engine-worker.js`, { type: 'module' });
        const out = { modelId };
        let t = performance.now();
        const engine = await CreateWebWorkerMLCEngine(worker, modelId, { appConfig, initProgressCallback: () => {} });
        out.loadMs = Math.round(performance.now() - t);
        const ask = async (content, max_tokens) => {
          const s = performance.now();
          const r = await engine.chat.completions.create({ messages: [{ role: 'user', content }], max_tokens, temperature: 0, stream: false });
          const e = r.usage?.extra ?? {};
          return {
            wallS: Number(((performance.now() - s) / 1000).toFixed(1)),
            promptTokens: r.usage?.prompt_tokens,
            completionTokens: r.usage?.completion_tokens,
            prefillTps: e.prefill_tokens_per_s ? Number(e.prefill_tokens_per_s.toFixed(1)) : null,
            decodeTps: e.decode_tokens_per_s ? Number(e.decode_tokens_per_s.toFixed(1)) : null,
            text: r.choices?.[0]?.message?.content ?? '',
          };
        };
        const warm = await ask('Say ok.', 1);
        out.warmupS = warm.wallS;
        out.prefill = await ask(partPrompt, 1); // reading only
        out.decode = await ask(decodePrompt, 100); // writing only
        const real = await ask(partPrompt, 150); // a realistic part summary
        out.realPart = { ...real, text: real.text.slice(0, 400) };
        delete out.prefill.text;
        delete out.decode.text;
        await engine.unload();
        worker.terminate();
        return out;
      },
      { base: ext.base, modelId, partPrompt, decodePrompt },
    );
  } catch (err) {
    row = { modelId, error: String(err.message).split('\n')[0] };
  }
  row.totalMinutes = Number(((Date.now() - t0) / 60000).toFixed(1));
  results.push(row);
  console.log(row.error ? `ERROR ${row.error}` : `prefill ${row.prefill.prefillTps} tok/s (${row.prefill.promptTokens} tokens), decode ${row.decode.decodeTps} tok/s, real part ${row.realPart.wallS} s, warm-up ${row.warmupS} s`);
  writeFileSync(path.join(runs, 'bench-models.json'), JSON.stringify({ date: new Date().toISOString(), adapter: adapterInfo, partChars: part.length, results }, null, 2));
}

const md = [
  '# Model speed benchmark on this computer\'s default graphics chip',
  '',
  `Adapter: ${adapterInfo.vendor} ${adapterInfo.architecture}, shader-f16 ${adapterInfo.f16 ? 'yes' : 'no'}. Hidden Chromium. One part of ${part.length} characters in the real part prompt (about ${results.find((r) => r.prefill)?.prefill.promptTokens ?? '?'} tokens). One run per model; run-to-run differences of 10 to 20 percent are normal.`,
  '',
  '| Model | Load (s) | Warm-up (s) | Reading (tokens/s) | Writing (tokens/s) | Realistic part (s, tokens written) |',
  '|---|---|---|---|---|---|',
  ...results.map((r) =>
    r.error
      ? `| ${r.modelId} | error: ${r.error} | | | | |`
      : `| ${r.modelId} | ${(r.loadMs / 1000).toFixed(1)} | ${r.warmupS} | ${r.prefill.prefillTps} | ${r.decode.decodeTps} | ${r.realPart.wallS} (${r.realPart.completionTokens}) |`,
  ),
  '',
];
writeFileSync(path.join(runs, 'bench-models.md'), md.join('\n'));
await ext.close();
console.log('Wrote docs/test-runs/bench-models.json and .md');
