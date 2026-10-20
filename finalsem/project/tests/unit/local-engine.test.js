import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalEngine } from '../../src/engines/local.js';
import { createOffscreenManager } from '../../src/background/offscreen-manager.js';
import { DEFAULTS, MODELS } from '../../src/core/config.js';
import { runPipeline } from '../../src/core/pipeline.js';
import { toAppError } from '../../src/core/errors.js';

const SETTINGS = { ...DEFAULTS, modelOverride: null };

/** A fake offscreen page: records every message and answers from a script of handlers. */
function fakePage(handlers = {}) {
  const sent = [];
  const send = async (message) => {
    sent.push(message);
    const h = handlers[message.type];
    if (!h) throw new Error(`unexpected message ${message.type}`);
    return typeof h === 'function' ? h(message) : h;
  };
  send.sent = sent;
  return send;
}
const okStatus = (extra = {}) => ({ ok: true, gpu: { vendor: 'nvidia', architecture: 'ampere', integrated: false }, cached: true, downloadMB: null, ...extra });
const code = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return toAppError(err).code;
  }
  return 'NO_ERROR';
};

// ---- the engine contract ------------------------------------------------------------------------

test('summarizeChunk asks for a part summary, or the final format when the page is one part', async () => {
  const send = fakePage({ LOCAL_GENERATE: (m) => ({ ok: true, text: `answer to: ${m.prompt.slice(-40)}`, stats: { decodeTps: 50 } }) });
  const engine = createLocalEngine({ send, settings: SETTINGS, deviceMemoryGB: 8 });
  await engine.summarizeChunk('text', { title: 'T', index: 2, total: 5 });
  await engine.summarizeChunk('text', { title: 'T', index: 1, total: 1 });
  assert.match(send.sent[0].prompt, /part 2 of 5/);
  assert.equal(send.sent[0].maxTokens, SETTINGS.maxTokensPart);
  assert.match(send.sent[1].prompt, /busy reader/);
  assert.equal(send.sent[1].maxTokens, SETTINGS.maxTokensFinal);
  assert.equal(send.sent[0].target, 'offscreen');
  assert.equal(engine.lastStats.decodeTps, 50);
});

test('mergeSummaries sends every part summary in order', async () => {
  const send = fakePage({ LOCAL_GENERATE: { ok: true, text: 'merged' } });
  const engine = createLocalEngine({ send, settings: SETTINGS });
  assert.equal(await engine.mergeSummaries(['first', 'second'], { title: 'T' }), 'merged');
  const p = send.sent[0].prompt;
  assert.ok(p.indexOf('first') < p.indexOf('second'));
});

test('an empty answer is EMPTY_ANSWER', async () => {
  const engine = createLocalEngine({ send: fakePage({ LOCAL_GENERATE: { ok: true, text: '   ' } }), settings: SETTINGS });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'EMPTY_ANSWER');
});

test('an error sent back by the offscreen page keeps its code', async () => {
  const send = fakePage({ LOCAL_GENERATE: { ok: false, error: { code: 'TIMEOUT', detail: 'too slow' } } });
  const engine = createLocalEngine({ send, settings: SETTINGS });
  assert.equal(await code(engine.summarizeChunk('t', { total: 1 })), 'TIMEOUT');
});

test('an unreachable offscreen page is SERVICE_ERROR', async () => {
  const engine = createLocalEngine({ send: async () => { throw new Error('Could not establish connection'); }, settings: SETTINGS });
  assert.equal(await code(engine.prepare()), 'SERVICE_ERROR');
});

// ---- preparing the model ------------------------------------------------------------------------

test('prepare reports checking, then downloading when the model is not cached, then loads it', async () => {
  const send = fakePage({ LOCAL_STATUS: okStatus({ cached: false, downloadMB: 664 }), LOCAL_LOAD: { ok: true, loadMs: 1200 } });
  const engine = createLocalEngine({ send, settings: SETTINGS, deviceMemoryGB: 8 });
  const phases = [];
  await engine.prepare({ onProgress: (p) => phases.push(p.phase) });
  assert.deepEqual(phases, ['checking', 'downloading']);
  assert.deepEqual(send.sent.map((m) => m.type), ['LOCAL_STATUS', 'LOCAL_LOAD']);
  assert.equal(engine.model.id, MODELS.primary.id);
});

test('prepare reports loading, not downloading, when the model is already cached', async () => {
  const send = fakePage({ LOCAL_STATUS: okStatus({ cached: true }), LOCAL_LOAD: { ok: true } });
  const engine = createLocalEngine({ send, settings: SETTINGS, deviceMemoryGB: 8 });
  const phases = [];
  await engine.prepare({ onProgress: (p) => phases.push(p.phase) });
  assert.deepEqual(phases, ['checking', 'loading']);
});

test('no WebGPU stops prepare with NO_WEBGPU before any load', async () => {
  const send = fakePage({ LOCAL_STATUS: { ok: false, error: { code: 'NO_WEBGPU', detail: 'none' } } });
  const engine = createLocalEngine({ send, settings: SETTINGS });
  assert.equal(await code(engine.prepare()), 'NO_WEBGPU');
  assert.deepEqual(send.sent.map((m) => m.type), ['LOCAL_STATUS']);
});

test('integrated graphics switches to the small model before loading', async () => {
  const send = fakePage({ LOCAL_STATUS: (m) => okStatus({ gpu: { vendor: 'intel', architecture: 'gen-12lp', integrated: true }, cached: m.modelId === MODELS.fallback.id }), LOCAL_LOAD: { ok: true } });
  const engine = createLocalEngine({ send, settings: SETTINGS, deviceMemoryGB: 8 });
  await engine.prepare();
  assert.equal(engine.model.id, MODELS.fallback.id);
  assert.equal(engine.modelSwitchReason, 'integrated-graphics');
  assert.equal(send.sent.at(-1).modelId, MODELS.fallback.id);
});

test('a primary model that runs out of graphics memory is retried once with the small one, and remembered', async () => {
  let loads = 0;
  const send = fakePage({
    LOCAL_STATUS: okStatus(),
    LOCAL_LOAD: (m) => (++loads === 1 ? { ok: false, error: { code: 'GPU_MEMORY', detail: 'oom' } } : { ok: true, modelId: m.modelId }),
  });
  let remembered = 0;
  const engine = createLocalEngine({ send, settings: SETTINGS, deviceMemoryGB: 8, onFallback: () => { remembered += 1; } });
  await engine.prepare();
  assert.equal(loads, 2);
  assert.equal(remembered, 1);
  assert.equal(engine.model.id, MODELS.fallback.id);
  assert.equal(engine.modelSwitchReason, 'GPU_MEMORY');
});

test('a download failure is not retried with another model', async () => {
  const send = fakePage({ LOCAL_STATUS: okStatus({ cached: false }), LOCAL_LOAD: { ok: false, error: { code: 'MODEL_DOWNLOAD_FAILED', detail: 'offline' } } });
  const engine = createLocalEngine({ send, settings: SETTINGS, deviceMemoryGB: 8 });
  assert.equal(await code(engine.prepare()), 'MODEL_DOWNLOAD_FAILED');
  assert.equal(send.sent.filter((m) => m.type === 'LOCAL_LOAD').length, 1);
});

test('the small model failing is not retried again', async () => {
  const send = fakePage({ LOCAL_STATUS: okStatus(), LOCAL_LOAD: { ok: false, error: { code: 'MODEL_LOAD_FAILED', detail: 'x' } } });
  const engine = createLocalEngine({ send, settings: { ...SETTINGS, modelOverride: 'fallback' }, deviceMemoryGB: 8 });
  assert.equal(engine.model.id, MODELS.fallback.id);
  assert.equal(await code(engine.prepare()), 'MODEL_LOAD_FAILED');
});

// ---- through the pipeline -----------------------------------------------------------------------

test('the pipeline prepares the model once, before the first part, and then summarizes and merges', async () => {
  const order = [];
  const send = fakePage({
    LOCAL_STATUS: () => (order.push('status'), okStatus()),
    LOCAL_LOAD: () => (order.push('load'), { ok: true }),
    LOCAL_GENERATE: (m) => (order.push(/part \d+ of/.test(m.prompt) ? 'part' : 'merge'), { ok: true, text: 'summary' }),
  });
  const engine = createLocalEngine({ send, settings: { ...SETTINGS, chunkChars: 500 }, deviceMemoryGB: 8 });
  const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${'word '.repeat(40)}`).join('\n\n');
  const phases = [];
  const out = await runPipeline({
    extract: async () => ({ title: 'T', url: 'u', text }),
    engine,
    settings: { ...SETTINGS, chunkChars: 500, minTextChars: 100 },
    onProgress: (p) => phases.push(p.phase),
  });
  assert.deepEqual(order.slice(0, 2), ['status', 'load']);
  assert.ok(order.filter((s) => s === 'part').length > 1);
  assert.equal(order.at(-1), 'merge');
  assert.ok(phases.indexOf('checking') < phases.indexOf('summarizing'));
  assert.equal(out.summary, 'summary');
});

// ---- the offscreen manager ----------------------------------------------------------------------

function fakeChrome({ contexts = [] } = {}) {
  const state = { contexts: [...contexts], created: [], closed: 0, messages: [] };
  const api = {
    runtime: {
      getURL: (p) => `chrome-extension://abc/${p}`,
      getContexts: async () => [...state.contexts],
      sendMessage: async (m) => {
        state.messages.push(m);
        return { ok: true, echo: m.type };
      },
    },
    offscreen: {
      createDocument: async (o) => {
        state.created.push(o);
        state.contexts.push({ contextType: 'OFFSCREEN_DOCUMENT' });
      },
      closeDocument: async () => {
        state.closed += 1;
        state.contexts.length = 0;
      },
    },
    storage: { local: { get: async () => ({ mockDelayMs: 25 }) } },
  };
  return { api, state };
}

test('the manager creates the offscreen page once, with the WORKERS reason, and reuses it', async () => {
  const { api, state } = fakeChrome();
  const manager = createOffscreenManager({ api, getSettings: async () => ({ engineMode: 'real', idleCloseMs: 60000 }) });
  assert.deepEqual(await manager.send({ type: 'LOCAL_STATUS' }), { ok: true, echo: 'LOCAL_STATUS' });
  await manager.send({ type: 'LOCAL_STATUS' });
  assert.equal(state.created.length, 1);
  assert.deepEqual(state.created[0].reasons, ['WORKERS']);
  assert.match(state.created[0].url, /src\/offscreen\/offscreen\.html$/);
  await manager.close();
});

test('mock mode puts the mock choice and delay in the page address', async () => {
  const { api, state } = fakeChrome();
  const manager = createOffscreenManager({ api, getSettings: async () => ({ engineMode: 'mock:oom', idleCloseMs: 60000 }) });
  await manager.send({ type: 'LOCAL_STATUS' });
  assert.match(state.created[0].url, /\?mock=oom&delay=25$/);
  await manager.close();
});

test('answers are generated one at a time, in the order asked', async () => {
  const { api } = fakeChrome({ contexts: [{ contextType: 'OFFSCREEN_DOCUMENT' }] });
  const log = [];
  let active = 0;
  let maxActive = 0;
  api.runtime.sendMessage = async (m) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    log.push(`start ${m.n}`);
    await new Promise((r) => setTimeout(r, 15));
    log.push(`end ${m.n}`);
    active -= 1;
    return { ok: true };
  };
  const manager = createOffscreenManager({ api, getSettings: async () => ({ engineMode: 'real', idleCloseMs: 60000 }) });
  await Promise.all([1, 2, 3].map((n) => manager.send({ type: 'LOCAL_GENERATE', n })));
  assert.equal(maxActive, 1);
  assert.deepEqual(log, ['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  await manager.close();
});

test('the offscreen page is closed after the idle time', async () => {
  const { api, state } = fakeChrome();
  const manager = createOffscreenManager({ api, getSettings: async () => ({ engineMode: 'real', idleCloseMs: 30 }) });
  await manager.send({ type: 'LOCAL_STATUS' });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(state.closed, 1);
});

test('progress messages reach subscribers until they unsubscribe', () => {
  const { api } = fakeChrome();
  const manager = createOffscreenManager({ api, getSettings: async () => ({ engineMode: 'real', idleCloseMs: 1000 }) });
  const seen = [];
  const stop = manager.onProgress((p) => seen.push(p.percent));
  manager.emitProgress({ percent: 10 });
  stop();
  manager.emitProgress({ percent: 20 });
  assert.deepEqual(seen, [10]);
});
