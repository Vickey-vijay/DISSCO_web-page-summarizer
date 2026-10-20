// Central settings. Everything tunable lives here, not scattered across files.

export const DEFAULTS = Object.freeze({
  // Cloud model id, confirmed against the live model list and benchmarked in M4
  // (docs/test-runs/model-bench.json, DEVLOG.md). With the default "thinking" this model took
  // about 12 s per request; thinkingLevel "low" brought a typical request to about 4 s.
  model: 'gemini-3.8-flash',
  thinkingLevel: 'low',
  apiBaseUrl: 'https://generativelanguage.googleapis.com',
  // Maximum characters sent to the model in one chunk.
  chunkChars: 8000,
  // Pages with less readable text than this are not summarized (FR8).
  minTextChars: 200,
  // A page that would need more parts than this is refused, so one huge page cannot burn through
  // the free-tier quota (30 parts of 8,000 characters is about 240,000 characters).
  maxChunks: 30,
  requestTimeoutMs: 25000,
  // Retries for rate limits (429) and server errors (5xx).
  maxRetries: 3,
  retryBaseDelayMs: 2000,
  temperature: 0.2,
});

// Keys kept in chrome.storage.local.
//  apiKey      - the user's own key, saved from the Options page (FR5)
//  apiBaseUrl  - test seam only: lets the end-to-end tests point at a local mock server
//  chunkChars  - test seam only: lets tests force several chunks on a short page
//  retryBaseDelayMs, requestTimeoutMs, maxChunks - test seams only: let tests exercise retries,
//                timeouts and the page-length limit in milliseconds and small pages
export const STORAGE_KEYS = Object.freeze({
  apiKey: 'apiKey',
  apiBaseUrl: 'apiBaseUrl',
  chunkChars: 'chunkChars',
  retryBaseDelayMs: 'retryBaseDelayMs',
  requestTimeoutMs: 'requestTimeoutMs',
  maxChunks: 'maxChunks',
});

/**
 * Merge stored values over the defaults.
 * @param {{get: (keys: string[]) => Promise<Record<string, unknown>>}} storageArea
 *        chrome.storage.local, or any object with the same get() shape.
 */
export async function loadSettings(storageArea) {
  const stored = await storageArea.get(Object.values(STORAGE_KEYS));
  const settings = { ...DEFAULTS, apiKey: '' };
  if (typeof stored[STORAGE_KEYS.apiKey] === 'string') {
    settings.apiKey = stored[STORAGE_KEYS.apiKey].trim();
  }
  if (typeof stored[STORAGE_KEYS.apiBaseUrl] === 'string' && stored[STORAGE_KEYS.apiBaseUrl]) {
    settings.apiBaseUrl = stored[STORAGE_KEYS.apiBaseUrl].replace(/\/+$/, '');
  }
  const chunk = Number(stored[STORAGE_KEYS.chunkChars]);
  if (Number.isFinite(chunk) && chunk >= 500) {
    settings.chunkChars = Math.floor(chunk);
  }
  for (const name of ['retryBaseDelayMs', 'requestTimeoutMs', 'maxChunks']) {
    const value = Number(stored[STORAGE_KEYS[name]]);
    if (Number.isFinite(value) && value >= 1) settings[name] = Math.floor(value);
  }
  return settings;
}
