// One place that turns every failure into a code plus a plain-English message.
// The technical detail is kept separately and only goes to the console.

export const ERROR_CODES = Object.freeze({
  NO_WEBGPU: 'NO_WEBGPU',
  NO_SHADER_F16: 'NO_SHADER_F16',
  GPU_MEMORY: 'GPU_MEMORY',
  MODEL_DOWNLOAD_FAILED: 'MODEL_DOWNLOAD_FAILED',
  MODEL_LOAD_FAILED: 'MODEL_LOAD_FAILED',
  TIMEOUT: 'TIMEOUT',
  EMPTY_ANSWER: 'EMPTY_ANSWER',
  TOO_LITTLE_TEXT: 'TOO_LITTLE_TEXT',
  TOO_LONG: 'TOO_LONG',
  CONTEXT_TOO_LONG: 'CONTEXT_TOO_LONG',
  RESTRICTED_PAGE: 'RESTRICTED_PAGE',
  EXTRACT_FAILED: 'EXTRACT_FAILED',
  SERVICE_ERROR: 'SERVICE_ERROR',
  INTERRUPTED: 'INTERRUPTED',
  CANCELLED: 'CANCELLED',
});

export const USER_MESSAGES = Object.freeze({
  NO_WEBGPU: 'Chrome cannot use your graphics card for the model (WebGPU is not available). Open chrome://gpu to check.',
  NO_SHADER_F16: 'Your graphics card does not support the 16-bit math this model needs, so this computer cannot run Version 2.',
  GPU_MEMORY: 'The graphics card ran out of memory. Close other heavy tabs or programs and try again.',
  MODEL_DOWNLOAD_FAILED: 'The model download stopped. Check your internet connection and press the button again. What was already downloaded is kept.',
  MODEL_LOAD_FAILED: 'The model could not be started. Press the button to try again.',
  TIMEOUT: 'The model took too long to answer. Try again, or use a shorter page.',
  EMPTY_ANSWER: 'The model returned no summary for this page.',
  TOO_LITTLE_TEXT: 'This page has too little readable text to summarize.',
  TOO_LONG: 'This page is too long for the local model on this computer. Try a shorter page.',
  CONTEXT_TOO_LONG: 'A part of this page is too long for the model to read at once, even after it was cut in half. Try a shorter page.',
  RESTRICTED_PAGE: 'Chrome does not allow extensions to read this page.',
  EXTRACT_FAILED: 'Could not read the text of this page.',
  SERVICE_ERROR: 'Something went wrong inside the extension. Try again.',
  INTERRUPTED: 'The summary was interrupted. Press Summarize to try again.',
  CANCELLED: 'Cancelled.',
});

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} [detail] technical detail, for the console only
   * @param {{cause?: unknown}} [options]
   */
  constructor(code, detail = '', options = {}) {
    super(detail || USER_MESSAGES[code] || code);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  get userMessage() {
    return USER_MESSAGES[this.code] ?? USER_MESSAGES.SERVICE_ERROR;
  }
}

/** Anything thrown becomes an AppError, so the UI only ever deals with codes. */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err && err.name === 'AbortError') return new AppError(ERROR_CODES.CANCELLED, 'aborted', { cause: err });
  return new AppError(ERROR_CODES.SERVICE_ERROR, String(err?.message ?? err), { cause: err });
}

/** The plain object stored in the job record and shown by the popup. */
export function describeError(err) {
  const e = toAppError(err);
  return { code: e.code, message: e.userMessage, detail: e.detail };
}

/** Rebuild an AppError from the {code, detail} object sent over a message channel. */
export function fromWire(wire) {
  const code = wire?.code && ERROR_CODES[wire.code] ? wire.code : ERROR_CODES.SERVICE_ERROR;
  return new AppError(code, wire?.detail ?? '');
}
