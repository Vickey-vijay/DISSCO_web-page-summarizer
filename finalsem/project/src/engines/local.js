// V2 engine: the same contract as V1's cloud engine (summarizeChunk and mergeSummaries), but the
// work is done by a small language model running in the browser. This file runs in the service
// worker and does not touch the model itself: it sends messages to the offscreen page, which
// owns the model and the graphics card.
//
// `send(message)` is injected (the offscreen manager in the extension, a fake in tests).
// Every reply looks like {ok: true, ...} or {ok: false, error: {code, detail}}.
import { AppError, ERROR_CODES, fromWire } from '../core/errors.js';
import { MODELS } from '../core/config.js';
import { chooseModel } from '../core/gpu-check.js';
import { buildChunkPrompt, buildMergePrompt, buildSinglePrompt, stripPageMarkers } from '../core/prompts.js';

// A failed load with the primary model is retried once with the smaller one.
const RETRY_WITH_FALLBACK = new Set([ERROR_CODES.GPU_MEMORY, ERROR_CODES.MODEL_LOAD_FAILED]);

/**
 * @param {{send: (m: object) => Promise<any>, settings: object, deviceMemoryGB?: number,
 *          onFallback?: () => Promise<void> | void}} deps
 */
export function createLocalEngine({ send, settings, deviceMemoryGB, onFallback = () => {} }) {
  async function call(message) {
    let reply;
    try {
      reply = await send({ target: 'offscreen', ...message });
    } catch (err) {
      throw new AppError(ERROR_CODES.SERVICE_ERROR, `offscreen page not reachable: ${String(err?.message ?? err)}`, { cause: err });
    }
    if (!reply) throw new AppError(ERROR_CODES.SERVICE_ERROR, 'the offscreen page did not answer');
    if (!reply.ok) throw fromWire(reply.error);
    return reply;
  }

  async function generate(prompt, maxTokens) {
    const reply = await call({
      type: 'LOCAL_GENERATE',
      prompt,
      maxTokens,
      temperature: settings.temperature,
      timeoutMs: settings.generateTimeoutMs,
    });
    const text = stripPageMarkers(reply.text);
    if (!text) throw new AppError(ERROR_CODES.EMPTY_ANSWER, 'the model answered with no text');
    engine.lastStats = reply.stats ?? null;
    return text;
  }

  const engine = {
    name: 'local',
    model: chooseModel({ deviceMemoryGB, override: settings.modelOverride }),
    status: null,
    loadInfo: null,
    lastStats: null,
    modelSwitchReason: null,

    /**
     * Asks the offscreen page about the graphics card and the model. On integrated graphics the
     * 1B model is far too slow (measured: about 2 tokens a second), so the small one is chosen.
     */
    async checkStatus() {
      let status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      if (status.gpu?.integrated && engine.model.id === MODELS.primary.id && !settings.modelOverride) {
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = 'integrated-graphics';
        status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      }
      engine.status = status;
      return status;
    },

    /** Checks the graphics card, downloads the model if needed, and loads it. Throws AppError. */
    async prepare({ onProgress = () => {} } = {}) {
      onProgress({ phase: 'checking' });
      const status = await engine.checkStatus();
      onProgress(status.cached ? { phase: 'loading', percent: 0 } : { phase: 'downloading', percent: 0 });
      try {
        engine.loadInfo = await call({ type: 'LOCAL_LOAD', modelId: engine.model.id });
      } catch (err) {
        if (!(err instanceof AppError) || !RETRY_WITH_FALLBACK.has(err.code) || engine.model.id !== MODELS.primary.id) throw err;
        // The primary model did not fit or would not start: remember that and try the small one.
        await onFallback();
        engine.model = MODELS.fallback;
        engine.modelSwitchReason = err.code;
        const small = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
        engine.status = small;
        onProgress(small.cached ? { phase: 'loading', percent: 0 } : { phase: 'downloading', percent: 0 });
        engine.loadInfo = await call({ type: 'LOCAL_LOAD', modelId: engine.model.id });
      }
      return { status: engine.status, loaded: engine.loadInfo };
    },

    async summarizeChunk(text, { title = '', index = 1, total = 1 } = {}) {
      const prompt =
        total === 1 ? buildSinglePrompt({ title, text }) : buildChunkPrompt({ title, text, index, total });
      return generate(prompt, total === 1 ? settings.maxTokensFinal : settings.maxTokensPart);
    },

    async mergeSummaries(parts, { title = '' } = {}) {
      return generate(buildMergePrompt({ title, parts }), settings.maxTokensFinal);
    },
  };
  return engine;
}
