// The whole summarizing flow: extract -> chunk -> summarize each chunk -> merge.
// It knows nothing about Chrome or any one provider: the page text comes from extract(),
// and the model comes from an engine object. V2 swaps only the engine.
//
// Engine contract (both V1 and V2 must provide it):
//   summarizeChunk(text, {title, index, total, signal}) -> Promise<string>
//        when total === 1 this must return the final-format summary
//   mergeSummaries(parts, {title, signal})              -> Promise<string>

import { AppError, ERROR_CODES } from './errors.js';
import { chunkText, normalizeText } from './chunker.js';
import { mergeAll } from './merger.js';

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * @param {{
 *   extract: () => Promise<{title: string, url: string, text: string, method?: string}>,
 *   engine: object,
 *   settings: {chunkChars: number, minTextChars: number, model?: string},
 *   signal?: AbortSignal,
 *   onProgress?: (p: object) => void,
 *   now?: () => number
 * }} args
 */
export async function runPipeline({ extract, engine, settings, signal, onProgress = () => {}, now = Date.now }) {
  const startedAt = now();

  onProgress({ phase: 'extracting' });
  const page = await extract();
  const text = normalizeText(page.text);
  if (text.length < settings.minTextChars) {
    throw new AppError(ERROR_CODES.TOO_LITTLE_TEXT, `${text.length} readable characters`);
  }

  const chunks = chunkText(text, settings.chunkChars);
  const total = chunks.length;
  if (settings.maxChunks && total > settings.maxChunks) {
    throw new AppError(ERROR_CODES.TOO_LONG, `${total} parts needed, the limit is ${settings.maxChunks}`);
  }
  let calls = 0;

  // The local engine needs its model ready (graphics card checked, model downloaded and loaded)
  // before the first part. A cloud-style engine simply has no prepare() step.
  if (typeof engine.prepare === 'function') {
    await engine.prepare({ signal, onProgress });
  }

  onProgress({ phase: 'summarizing', current: 0, total });
  const partials = [];
  for (let i = 0; i < total; i += 1) {
    throwIfAborted(signal);
    const summary = await engine.summarizeChunk(chunks[i], {
      title: page.title,
      index: i + 1,
      total,
      signal,
    });
    calls += 1;
    partials.push(summary);
    onProgress({ phase: 'summarizing', current: i + 1, total });
  }

  let finalSummary;
  let mergeLevels = 0;
  if (total === 1) {
    finalSummary = partials[0];
  } else {
    onProgress({ phase: 'merging', parts: total });
    const merged = await mergeAll(partials, {
      engine,
      maxChars: settings.chunkChars,
      title: page.title,
      signal,
      onStep: ({ parts }) => onProgress({ phase: 'merging', parts }),
    });
    finalSummary = merged.summary;
    calls += merged.calls;
    mergeLevels = merged.levels;
  }

  return {
    title: page.title,
    url: page.url,
    summary: finalSummary,
    stats: {
      textChars: text.length,
      chunks: total,
      apiCalls: calls,
      mergeLevels,
      extractMethod: page.method ?? 'unknown',
      model: settings.model ?? null,
      elapsedMs: now() - startedAt,
    },
  };
}
