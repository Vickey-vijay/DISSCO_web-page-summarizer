// V1 cloud engine: Google Gemini over plain HTTPS (no SDK, so no bundler is needed).
// Handles the key, the timeout, retry with back-off on rate limits and server errors,
// and turns every failure into an AppError code (FR8).

import { AppError, ERROR_CODES } from '../core/errors.js';
import { buildChunkPrompt, buildMergePrompt, buildSinglePrompt } from '../core/prompts.js';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const defaultSleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

// A wait longer than this is not a short burst limit but a used-up quota: do not sit and retry.
// (It also keeps one wait shorter than the time Chrome lets an idle extension worker live.)
const MAX_RETRY_WAIT_SECONDS = 25;

/** "6h54m7.15s", "41s" or "0.5s" -> seconds, or null if it does not look like a duration. */
export function parseDurationSeconds(text) {
  const m = /^\s*(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?\s*$/.exec(String(text ?? ''));
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * How long the server says to wait, in seconds: the Retry-After header, else the RetryInfo
 * detail Google adds to 429 answers, else the "Please retry in ..." sentence in the message.
 */
function serverWaitSeconds(response, body) {
  const header = Number(response.headers?.get?.('retry-after'));
  if (Number.isFinite(header) && header > 0) return header;
  for (const detail of body?.error?.details ?? []) {
    const parsed = parseDurationSeconds(detail?.retryDelay);
    if (parsed !== null) return parsed;
  }
  // The sentence ends with a full stop ("... retry in 6h54m7.15s."), so match whole number+unit pairs.
  const sentence = /retry in ((?:\d+(?:\.\d+)?[hms])+)/i.exec(body?.error?.message ?? '');
  return sentence ? parseDurationSeconds(sentence[1]) : null;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (err) {
    // An abort or timeout while reading the body must still reach the caller.
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') throw err;
    return null; // not JSON: the status code alone decides what happens
  }
}

function classifyHttpError(status, body) {
  const message = body?.error?.message ?? '';
  // A 403 about the caller's region is not a bad key; say "service problem" instead.
  if (status === 403 && /location|region|country/i.test(message)) return ERROR_CODES.SERVICE_ERROR;
  if (status === 401 || status === 403) return ERROR_CODES.INVALID_KEY;
  if (status === 400 && /api key/i.test(message)) return ERROR_CODES.INVALID_KEY;
  if (status === 429) return ERROR_CODES.RATE_LIMIT;
  return ERROR_CODES.SERVICE_ERROR;
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

/**
 * @param {{apiKey: string, apiBaseUrl: string, model: string, requestTimeoutMs: number,
 *          maxRetries: number, retryBaseDelayMs: number, temperature: number}} settings
 * @param {{fetchImpl?: typeof fetch, sleepImpl?: Function, onNotice?: (n: object) => void}} [deps]
 */
export function createGeminiEngine(settings, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sleep = deps.sleepImpl ?? defaultSleep;
  const onNotice = deps.onNotice ?? (() => {});

  async function generate(prompt, signal) {
    if (!settings.apiKey) throw new AppError(ERROR_CODES.NO_KEY);

    const url = `${settings.apiBaseUrl}/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
    const generationConfig = { temperature: settings.temperature };
    // Without this the model spends many seconds "thinking" before a summary this simple.
    if (settings.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: settings.thinkingLevel };
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });

    for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

      // Our own timer (not AbortSignal.timeout) so it can be cleared once the answer is in.
      const timeoutController = new AbortController();
      const timer = setTimeout(
        () => timeoutController.abort(new DOMException('Request timed out', 'TimeoutError')),
        settings.requestTimeoutMs,
      );
      const requestSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;

      let response;
      let data;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          // The key goes in a header, never in the URL, so it cannot end up in logs or history.
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
          body,
          signal: requestSignal,
        });
        data = await readJson(response);
      } catch (err) {
        if (signal?.aborted) throw signal.reason ?? err;
        if (timeoutController.signal.aborted) {
          throw new AppError(ERROR_CODES.TIMEOUT, `no answer within ${settings.requestTimeoutMs} ms`, { cause: err });
        }
        throw new AppError(ERROR_CODES.NETWORK, String(err?.message ?? err), { cause: err });
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        const text = extractText(data);
        if (!text) {
          const reason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? 'no text returned';
          throw new AppError(ERROR_CODES.EMPTY_OR_BLOCKED, String(reason));
        }
        return text;
      }

      const code = classifyHttpError(response.status, data);
      const detail = `HTTP ${response.status}${data?.error?.message ? ': ' + data.error.message : ''}`;

      const waitSeconds = serverWaitSeconds(response, data);

      // The service says to come back much later (a daily or hourly quota): retrying in a few
      // seconds cannot help, so stop now and tell the user how long it will take.
      if (response.status === 429 && waitSeconds !== null && waitSeconds > MAX_RETRY_WAIT_SECONDS) {
        throw new AppError(ERROR_CODES.QUOTA_EXHAUSTED, detail, { retryAfterSeconds: waitSeconds });
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < settings.maxRetries) {
        // Prefer the wait the server asked for; otherwise back off 1x, 2x, 4x the base delay.
        const delayMs = waitSeconds !== null ? waitSeconds * 1000 : settings.retryBaseDelayMs * 2 ** attempt;
        onNotice({ type: 'retry', code, attempt: attempt + 1, maxRetries: settings.maxRetries, delayMs });
        await sleep(delayMs, signal);
        continue;
      }
      throw new AppError(code, detail);
    }
    // The loop always returns or throws; this line only satisfies readers and linters.
    throw new AppError(ERROR_CODES.SERVICE_ERROR, 'retries exhausted');
  }

  return {
    name: 'gemini',
    model: settings.model,

    async summarizeChunk(text, { title = '', index = 1, total = 1, signal } = {}) {
      const prompt =
        total === 1 ? buildSinglePrompt({ title, text }) : buildChunkPrompt({ title, text, index, total });
      return generate(prompt, signal);
    },

    async mergeSummaries(parts, { title = '', signal } = {}) {
      return generate(buildMergePrompt({ title, parts }), signal);
    },
  };
}
