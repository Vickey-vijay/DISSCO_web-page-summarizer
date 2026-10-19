// Central settings. Everything tunable lives here, not scattered across files.

export const DEFAULTS = Object.freeze({
  // Cloud model id. Confirmed against the live model list in M4 (see DEVLOG.md).
  model: 'gemini-3.8-flash',
  apiBaseUrl: 'https://generativelanguage.googleapis.com',
  // Maximum characters sent to the model in one chunk.
  chunkChars: 8000,
  // Pages with less readable text than this are not summarized (FR8).
  minTextChars: 200,
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
export const STORAGE_KEYS = Object.freeze({
  apiKey: 'apiKey',
  apiBaseUrl: 'apiBaseUrl',
  chunkChars: 'chunkChars',
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
  return settings;
}
