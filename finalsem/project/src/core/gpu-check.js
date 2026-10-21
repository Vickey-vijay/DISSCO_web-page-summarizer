// What the page can learn about the graphics card, and which model that allows.
// Pure functions: the offscreen page passes in what it found, so Node tests can feed any case.
import { ERROR_CODES } from './errors.js';
import { MODELS } from './config.js';

/**
 * @param {{hasGpuApi: boolean, adapter: null | {features: {has: (n: string) => boolean}, info?: object}}} found
 * @returns {{ok: true, f16: true, vendor: string, architecture: string} | {ok: false, code: string, detail: string}}
 */
export function evaluateGpu({ hasGpuApi, adapter }) {
  if (!hasGpuApi) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'navigator.gpu is missing' };
  if (!adapter) return { ok: false, code: ERROR_CODES.NO_WEBGPU, detail: 'requestAdapter() returned nothing' };
  if (!adapter.features.has('shader-f16')) {
    return { ok: false, code: ERROR_CODES.NO_SHADER_F16, detail: 'adapter has no shader-f16 feature' };
  }
  const info = adapter.info ?? {};
  return { ok: true, f16: true, vendor: String(info.vendor ?? ''), architecture: String(info.architecture ?? '') };
}

/**
 * Pick the model for this computer.
 *  - an earlier failure with the primary model (override) sends us to the smaller one
 *  - navigator.deviceMemory is rounded and capped at 8 by Chrome; below 8 means a small machine
 */
export function chooseModel({ deviceMemoryGB, override } = {}) {
  if (override === 'fallback') return MODELS.fallback;
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB < 8) return MODELS.fallback;
  return MODELS.primary;
}

/**
 * Turn WebLLM's progress report into a phase and a percentage for the popup.
 * Its text starts with "Fetching param cache" while downloading, and with "Loading model from
 * cache" or "Loading GPU shader modules" afterwards.
 */
export function mapInitProgress(report, { cached = false } = {}) {
  const text = String(report?.text ?? '');
  const fraction = Math.max(0, Math.min(1, Number(report?.progress) || 0));
  // "Start to fetch params" and "Fetching param cache[...]" both mean the download is happening.
  // But WebLLM also says "fetch" at the start of a load from the browser's own storage; when the
  // model is already stored, nothing is downloaded, so it is always "loading".
  const phase = !cached && /fetch/i.test(text) ? 'downloading' : 'loading';
  return { phase, percent: Math.round(fraction * 100), text };
}
