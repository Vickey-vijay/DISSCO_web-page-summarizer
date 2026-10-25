// Central settings for Version 2 (the model runs inside the browser; there is no key and no cloud).

// The two models V2 can use. Both come from WebLLM's own list and are 4-bit versions that need
// the graphics card's 16-bit math ("shader-f16"). The primary one is chosen by default; the
// fallback is a smaller model used when the computer looks short of memory or the primary one
// fails to load. Sizes are the "vram_required_MB" values in WebLLM's model list.
export const MODELS = Object.freeze({
  primary: Object.freeze({ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', vramMB: 879 }),
  fallback: Object.freeze({ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', vramMB: 376 }),
});

export const DEFAULTS = Object.freeze({
  // A small local model reads less at once than a cloud model, so parts are smaller than in V1
  // (V1 used 8,000). 6,000 characters is about 1,500 words-pieces and fits the 4,096 window.
  chunkChars: 6000,
  // Pages with less readable text than this are not summarized.
  minTextChars: 200,
  // A local model is slow on a laptop, so a page that needs more parts than this is refused.
  maxChunks: 12,
  // Upper limits on the length of an answer: a part summary, and the final summary.
  maxTokensPart: 300,
  maxTokensFinal: 320,
  // On built-in graphics (2 to 5 tokens a second) answers are shorter: one part, a part of a long
  // page, and the merge.
  briefTokensSingle: 130,
  briefTokensPart: 90,
  briefTokensMerge: 180,
  // 'better' = Llama 3.2 1B (accurate, slower on built-in graphics); 'fast' = SmolLM2 360M (about
  // 2.4 times quicker, but it gets facts wrong more often). Chosen in the popup's Settings.
  quality: 'better',
  temperature: 0.2,
  // One generation that takes longer than this is stopped and reported.
  generateTimeoutMs: 600000,
  // How much of a page the model reads, in characters (0 = all of it). On built-in graphics the model
  // reads only about 26 tokens a second, so a long page is shortened first (see condense.js): 6,000
  // characters is one part and takes about a minute. The popup offers "Read the whole page".
  readBudgetIntegrated: 6000,
  readBudgetOther: 0,
  // The offscreen page holds the model in graphics memory; it is closed after this much idle time.
  idleCloseMs: 5 * 60 * 1000,
  // 'real' runs the model. 'mock' is a test seam: a fake engine with fake download progress.
  engineMode: 'real',
});

// Keys kept in chrome.storage.local.
//  modelOverride - 'fallback' once the primary model failed to load on this computer
//  chunkChars, maxChunks, engineMode, idleCloseMs - test seams (and a way to tune on a client laptop)
export const STORAGE_KEYS = Object.freeze({
  modelOverride: 'modelOverride',
  chunkChars: 'chunkChars',
  maxChunks: 'maxChunks',
  engineMode: 'engineMode',
  idleCloseMs: 'idleCloseMs',
  generateTimeoutMs: 'generateTimeoutMs',
  quality: 'quality',
  readBudgetIntegrated: 'readBudgetIntegrated',
  readBudgetOther: 'readBudgetOther',
});

/** Merge stored values over the defaults. `storageArea` is chrome.storage.local or a stand-in. */
export async function loadSettings(storageArea) {
  const stored = await storageArea.get(Object.values(STORAGE_KEYS));
  const settings = { ...DEFAULTS, modelOverride: null };
  const numeric = { chunkChars: 500, maxChunks: 1, idleCloseMs: 1, generateTimeoutMs: 1, readBudgetIntegrated: 0, readBudgetOther: 0 };
  for (const [name, min] of Object.entries(numeric)) {
    const value = Number(stored[STORAGE_KEYS[name]]);
    if (Number.isFinite(value) && value >= min) settings[name] = Math.floor(value);
  }
  const mode = stored[STORAGE_KEYS.engineMode];
  if (typeof mode === 'string' && mode.startsWith('mock')) settings.engineMode = mode;
  if (stored[STORAGE_KEYS.modelOverride] === 'fallback') settings.modelOverride = 'fallback';
  if (stored[STORAGE_KEYS.quality] === 'fast' || stored[STORAGE_KEYS.quality] === 'better') settings.quality = stored[STORAGE_KEYS.quality];
  return settings;
}
