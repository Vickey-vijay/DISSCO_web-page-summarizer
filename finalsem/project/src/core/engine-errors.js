// Decides which of our error codes a failure inside the local engine should become.
// The engine (WebLLM) throws plain errors with free-text messages, so this looks at the text.
// Pure function, no browser APIs, so it is tested in Node.
import { ERROR_CODES } from './errors.js';

/**
 * @param {unknown} err the thrown value
 * @param {'load'|'generate'} stage where it happened
 */
export function classifyEngineError(err, stage) {
  const text = String(err?.message ?? err ?? '').toLowerCase();
  // WebLLM: "Prompt tokens exceed context window size: number of prompt tokens: N; context window size: 4096"
  if (/prompt tokens exceed|context window size/.test(text)) return ERROR_CODES.CONTEXT_TOO_LONG;
  if (/shader-f16|f16/.test(text) && /(support|feature|require)/.test(text)) return ERROR_CODES.NO_SHADER_F16;
  if (/webgpu|gpu adapter|navigator\.gpu/.test(text) && /(not\s+|un)(supported|available)|no (gpu )?adapter|unavailable/.test(text)) {
    return ERROR_CODES.NO_WEBGPU;
  }
  if (/out of memory|\boom\b|device (was )?lost|maxbuffersize|exceeds the max|too large|allocation/.test(text)) {
    return ERROR_CODES.GPU_MEMORY;
  }
  if (stage === 'load' && /(fetch|network|failed to fetch|net::|timeout|offline|http \d{3}|cache)/.test(text)) {
    return ERROR_CODES.MODEL_DOWNLOAD_FAILED;
  }
  if (stage === 'load') return ERROR_CODES.MODEL_LOAD_FAILED;
  return ERROR_CODES.SERVICE_ERROR;
}
