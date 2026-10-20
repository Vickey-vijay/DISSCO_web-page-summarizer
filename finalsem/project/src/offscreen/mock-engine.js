// A fake model for the browser tests. It follows the same steps as the real one (check the
// graphics card, "download" with progress, answer), so the whole V2 flow can be tested in
// seconds, without a 650 MB download. Modes come from the page address: offscreen.html?mock=<mode>
//   ok (default)  everything works
//   nowebgpu      the graphics-card check fails with NO_WEBGPU
//   nof16         the check fails with NO_SHADER_F16
//   intel         the card looks like built-in Intel graphics (the popup shows a note)
//   oom           the PRIMARY (1B) model runs out of graphics memory; the small model works
//   oomall        every model runs out of graphics memory
//   downloadfail  the download fails (only when the model is not yet "downloaded")
//   empty         the model answers with no text
//   html          the model answers with HTML-looking text (the popup must show it as plain text)
//   slow          each answer takes at least 1.5 s
// "Downloaded" is remembered per model in localStorage, so a second run skips the fake download.
import { classifyEngineError } from '../core/engine-errors.js';

const CACHE_PREFIX = 'page-summarizer-mock-model-cached:';

function isCached(modelId) {
  try {
    return localStorage.getItem(CACHE_PREFIX + modelId) === '1';
  } catch {
    return false;
  }
}
function setCached(modelId) {
  try {
    localStorage.setItem(CACHE_PREFIX + modelId, '1');
  } catch {
    /* ignore */
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const titleOf = (prompt) => (prompt.match(/Page title: (.*?)(?: \(part|\n)/)?.[1] ?? 'this page').trim();
const isPrimary = (modelId) => /Llama/.test(modelId ?? '');

function answerFor(prompt, mode) {
  if (mode === 'html') return 'Overview line.\n- <img src=x onerror="document.title=\'hacked\'"> bullet one\n- <b>bold</b> bullet two';
  const part = prompt.match(/\(part (\d+) of (\d+)\)/);
  if (part) {
    const body = prompt.split('<<<PAGE TEXT START>>>').pop().split('<<<PAGE TEXT END>>>')[0].trim();
    return `Part ${part[1]} of ${part[2]} covers: ${body.slice(0, 60).replace(/\s+/g, ' ')}...`;
  }
  if (/summaries of consecutive parts/.test(prompt)) {
    const parts = (prompt.match(/^Part \d+:/gm) ?? []).length;
    return `Combined overview of ${titleOf(prompt)}.\n- Point merged from ${parts} partial summaries.\n- Another merged point.`;
  }
  return `This page is about ${titleOf(prompt)}.\n- First key point taken from the page.\n- Second key point taken from the page.\n- Third key point taken from the page.`;
}

/** @param {{mode: string, delayMs: number, emitProgress: (p: object) => void}} options */
export function createMockEngine({ mode, delayMs, emitProgress }) {
  let loadedId = null;
  return {
    async status({ modelId } = {}) {
      if (mode === 'nowebgpu') return { ok: false, error: { code: 'NO_WEBGPU', detail: 'mock: no WebGPU' } };
      if (mode === 'nof16') return { ok: false, error: { code: 'NO_SHADER_F16', detail: 'mock: no shader-f16' } };
      const cached = isCached(modelId);
      return {
        ok: true,
        gpu: mode === 'intel'
          ? { vendor: 'intel', architecture: 'gen-12lp', integrated: true }
          : { vendor: 'mock', architecture: 'mock-gpu', integrated: false },
        deviceMemoryGB: 8,
        cached,
        downloadMB: cached ? null : isPrimary(modelId) ? 664 : 300,
        model: { id: modelId },
      };
    },

    async load({ modelId } = {}) {
      if (loadedId === modelId) return { ok: true, alreadyLoaded: true, loadMs: 0 };
      const t0 = performance.now();
      try {
        if (!isCached(modelId)) {
          if (mode === 'downloadfail') throw new Error('Failed to fetch (mock download failure)');
          const steps = 8;
          for (let i = 1; i <= steps; i += 1) {
            await sleep(120);
            emitProgress({ phase: 'downloading', percent: Math.round((i / steps) * 100), text: `Fetching param cache[${i}/${steps}]` });
          }
        }
        if (mode === 'oomall' || (mode === 'oom' && isPrimary(modelId))) throw new Error('GPUOutOfMemory: out of memory (mock)');
        emitProgress({ phase: 'loading', percent: 100, text: 'Warming up the model (mock)' });
        await sleep(120);
        setCached(modelId);
        loadedId = modelId;
        return { ok: true, loadMs: Math.round(performance.now() - t0), modelId };
      } catch (err) {
        return { ok: false, error: { code: classifyEngineError(err, 'load'), detail: String(err?.message ?? err) } };
      }
    },

    async generate({ prompt }) {
      if (!loadedId) return { ok: false, error: { code: 'MODEL_LOAD_FAILED', detail: 'mock model not loaded' } };
      const wait = mode === 'slow' ? Math.max(delayMs, 1500) : delayMs;
      if (wait) await sleep(wait);
      const text = mode === 'empty' ? '' : answerFor(prompt, mode);
      return { ok: true, text, stats: { promptTokens: Math.round(prompt.length / 4), completionTokens: 40, decodeTps: 50, prefillTps: 500 } };
    },
  };
}
