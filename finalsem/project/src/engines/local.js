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
import { chunkText } from '../core/chunker.js';
import { buildChunkPrompt, buildMergePrompt, buildSinglePrompt, endAtSentence, stripPageMarkers } from '../core/prompts.js';

// A part that does not fit the model's window is cut in half and tried again, at most this deep.
const MAX_HALVING_DEPTH = 3;
const MIN_HALVING_CHARS = 600;

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
    let text = stripPageMarkers(reply.text);
    if (reply.finishReason === 'length') text = endAtSentence(text); // stopped by the length limit: end at a full stop
    if (!text) throw new AppError(ERROR_CODES.EMPTY_ANSWER, 'the model answered with no text');
    engine.lastStats = reply.stats ?? null;
    return text;
  }

  const engine = {
    name: 'local',
    model: chooseModel({ deviceMemoryGB, override: settings.modelOverride, quality: settings.quality }),
    status: null,
    loadInfo: null,
    lastStats: null,
    modelSwitchReason: settings.quality === 'fast' ? 'quality-fast' : null,
    halvedParts: 0, // how many parts had to be cut in half because they did not fit the window

    /** Asks the offscreen page about the graphics card and whether the chosen model is stored. */
    async checkStatus() {
      const status = await call({ type: 'LOCAL_STATUS', modelId: engine.model.id });
      engine.status = status;
      return status;
    },

    /** True on built-in graphics, which write slowly: answers are kept short there. */
    get brief() {
      return Boolean(engine.status?.gpu?.integrated);
    },

    /** Checks the graphics card, downloads the model if needed, and loads it. Throws AppError. */
    async prepare({ onProgress = () => {} } = {}) {
      onProgress({ phase: 'checking' });
      const status = engine.status ?? (await engine.checkStatus()); // already asked when the reading budget was set
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

    /** How many characters of a page this computer should read: less on built-in graphics, which read slowly. */
    async readBudgetChars() {
      const status = engine.status ?? (await engine.checkStatus());
      return status.gpu?.integrated ? settings.readBudgetIntegrated : settings.readBudgetOther;
    },

    async summarizeChunk(text, { title = '', index = 1, total = 1, signal } = {}) {
      const brief = engine.brief;
      const once = (t, i, n) => {
        const prompt = n === 1 ? buildSinglePrompt({ title, text: t, brief }) : buildChunkPrompt({ title, text: t, index: i, total: n, brief });
        const tokens = n === 1 ? (brief ? settings.briefTokensSingle : settings.maxTokensFinal) : brief ? settings.briefTokensPart : settings.maxTokensPart;
        return generate(prompt, tokens);
      };

      // Dense pages (tables, numbers, references) use more tokens per character than the 6000
      // character limit assumes. When WebLLM says the prompt does not fit the window, the part is
      // cut in half at a paragraph or sentence break and each half is summarized on its own.
      const attempt = async (t, i, n, depth) => {
        try {
          return await once(t, i, n);
        } catch (err) {
          const tooLong = err instanceof AppError && err.code === ERROR_CODES.CONTEXT_TOO_LONG;
          if (!tooLong || depth >= MAX_HALVING_DEPTH || t.length < MIN_HALVING_CHARS) throw err;
          const halves = chunkText(t, Math.ceil(t.length / 2) + 100);
          if (halves.length < 2) throw err;
          engine.halvedParts += 1;
          const pieces = [];
          for (const half of halves) {
            if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
            // A page that was one part is now several: its pieces are summarized as parts and merged below.
            pieces.push(await attempt(half, n === 1 ? pieces.length + 1 : i, n === 1 ? halves.length : n, depth + 1));
          }
          return n === 1 ? engine.mergeSummaries(pieces, { title }) : pieces.join('\n\n');
        }
      };
      return attempt(text, index, total, 0);
    },

    async mergeSummaries(parts, { title = '' } = {}) {
      const brief = engine.brief;
      return generate(buildMergePrompt({ title, parts, brief }), brief ? settings.briefTokensMerge : settings.maxTokensFinal);
    },
  };
  return engine;
}
