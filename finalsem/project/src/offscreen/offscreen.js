// The offscreen page: a hidden page that owns the language model and the graphics card.
//
// Why a separate page? The service worker is stopped by Chrome when it is idle, and a stopped
// worker would lose the model that took seconds to load. An offscreen page stays alive. It has
// only the chrome.runtime API (no chrome.storage, no chrome.tabs), so it works purely by
// messages: the service worker asks, this page answers.
//
// Messages it understands (all sent with target: 'offscreen'):
//   LOCAL_STATUS   -> graphics card check, is the model cached, how big is the download
//   LOCAL_LOAD     -> download (first time) and load the model; sends MODEL_PROGRESS while it works
//   LOCAL_GENERATE -> one answer for one prompt
// It sends KEEPALIVE every 10 s while busy, so the service worker is not stopped mid-job.
import { CreateWebWorkerMLCEngine, hasModelInCache, prebuiltAppConfig } from '../lib/web-llm.js';
import { classifyEngineError } from '../core/engine-errors.js';
import { evaluateGpu, mapInitProgress } from '../core/gpu-check.js';
import { createMockEngine } from './mock-engine.js';

// Cache Storage fails inside an offscreen page ("Unexpected internal error"), IndexedDB works,
// so the model is stored in IndexedDB. (Found by a spike; see DEVLOG.md.)
const APP_CONFIG = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' };

const params = new URLSearchParams(location.search);
const MOCK_MODE = params.get('mock');
const MOCK_DELAY = Number(params.get('delay') || 0);

let busy = 0;
let keepAliveTimer = null;
function beginWork() {
  busy += 1;
  if (!keepAliveTimer) {
    keepAliveTimer = setInterval(() => chrome.runtime.sendMessage({ type: 'KEEPALIVE' }).catch(() => {}), 10000);
  }
}
function endWork() {
  busy = Math.max(0, busy - 1);
  if (busy === 0 && keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function emitProgress(progress) {
  chrome.runtime.sendMessage({ type: 'MODEL_PROGRESS', ...progress }).catch(() => {});
}

// ---- real engine ---------------------------------------------------------------------------

let engine = null;
let loadedId = null;
let loading = null;

async function requestAdapter() {
  if (!navigator.gpu) return null;
  // The same request WebLLM makes, so we report the card WebLLM will actually use.
  return navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
}

/** Download size in MB, read from the model's own file list. Null if it cannot be read. */
async function estimateDownloadMB(modelId) {
  const record = APP_CONFIG.model_list.find((m) => m.model_id === modelId);
  if (!record) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${record.model}/resolve/main/ndarray-cache.json`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const bytes = (json.records ?? []).reduce((sum, r) => sum + (Number(r.nbytes) || 0), 0);
    return bytes > 0 ? Math.round(bytes / 1e6) : null;
  } catch {
    return null;
  }
}

const realEngine = {
  async status({ modelId }) {
    const adapter = await requestAdapter();
    const gpu = evaluateGpu({ hasGpuApi: Boolean(navigator.gpu), adapter });
    if (!gpu.ok) return { ok: false, error: { code: gpu.code, detail: gpu.detail } };
    const cached = await hasModelInCache(modelId, APP_CONFIG).catch(() => false);
    return {
      ok: true,
      gpu: {
        vendor: gpu.vendor,
        architecture: gpu.architecture,
        // Intel "gen-*" parts are the processor's built-in graphics: usable, but much slower.
        integrated: gpu.vendor.toLowerCase() === 'intel' && /gen/i.test(gpu.architecture),
      },
      deviceMemoryGB: navigator.deviceMemory ?? null,
      cached,
      downloadMB: cached ? null : await estimateDownloadMB(modelId),
      model: { id: modelId },
    };
  },

  async load({ modelId }) {
    if (engine && loadedId === modelId) return { ok: true, alreadyLoaded: true, loadMs: 0 };
    if (loading) return loading;
    // A different model was asked for (the quality setting changed): free the loaded one first.
    if (engine) {
      await engine.unload().catch(() => {});
      engine = null;
      loadedId = null;
    }
    loading = (async () => {
      const t0 = performance.now();
      try {
        const wasCached = await hasModelInCache(modelId, APP_CONFIG).catch(() => false);
        const worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
        engine = await CreateWebWorkerMLCEngine(worker, modelId, {
          appConfig: APP_CONFIG,
          initProgressCallback: (report) => emitProgress(mapInitProgress(report, { cached: wasCached })),
        });
        loadedId = modelId;
        // The first answer compiles the graphics-card programs (about half a minute on a slow
        // card). Do it now, with a message, so the first real part does not look frozen.
        emitProgress({ phase: 'loading', percent: 100, text: 'Warming up the model (first time only)' });
        await engine.chat.completions.create({ messages: [{ role: 'user', content: 'Say ok.' }], max_tokens: 1, temperature: 0 });
        return { ok: true, loadMs: Math.round(performance.now() - t0) };
      } catch (err) {
        engine = null;
        loadedId = null;
        return { ok: false, error: { code: classifyEngineError(err, 'load'), detail: String(err?.message ?? err).slice(0, 400) } };
      }
    })().finally(() => {
      loading = null;
    });
    return loading;
  },

  async generate({ prompt, maxTokens, temperature, timeoutMs }) {
    if (!engine) return { ok: false, error: { code: 'MODEL_LOAD_FAILED', detail: 'model is not loaded' } };
    let timer;
    try {
      const run = engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      });
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          engine.interruptGenerate?.();
          reject(Object.assign(new Error('generation timed out'), { name: 'TimeoutError' }));
        }, timeoutMs);
      });
      const reply = await Promise.race([run, timeout]);
      const extra = reply.usage?.extra ?? {};
      return {
        ok: true,
        text: reply.choices?.[0]?.message?.content ?? '',
        finishReason: reply.choices?.[0]?.finish_reason ?? null,
        stats: {
          promptTokens: reply.usage?.prompt_tokens ?? null,
          completionTokens: reply.usage?.completion_tokens ?? null,
          prefillTps: extra.prefill_tokens_per_s ?? null,
          decodeTps: extra.decode_tokens_per_s ?? null,
        },
      };
    } catch (err) {
      const code = err?.name === 'TimeoutError' ? 'TIMEOUT' : classifyEngineError(err, 'generate');
      return { ok: false, error: { code, detail: String(err?.message ?? err).slice(0, 400) } };
    } finally {
      clearTimeout(timer);
    }
  },
};

const impl = MOCK_MODE !== null
  ? createMockEngine({ mode: MOCK_MODE || 'ok', delayMs: MOCK_DELAY, emitProgress })
  : realEngine;

// ---- messages from the service worker --------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;
  const handlers = { LOCAL_STATUS: 'status', LOCAL_LOAD: 'load', LOCAL_GENERATE: 'generate' };
  const name = handlers[message.type];
  if (!name) {
    sendResponse({ ok: false, error: { code: 'SERVICE_ERROR', detail: `unknown message ${message.type}` } });
    return false;
  }
  beginWork();
  impl[name](message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: { code: 'SERVICE_ERROR', detail: String(err?.message ?? err) } }))
    .finally(endWork);
  return true; // the answer is sent later
});
