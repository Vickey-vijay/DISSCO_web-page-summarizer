// One place that turns every failure into a code plus a plain-English message (FR8).
// The technical detail is kept separately and only goes to the console.

export const ERROR_CODES = Object.freeze({
  NO_KEY: 'NO_KEY',
  INVALID_KEY: 'INVALID_KEY',
  RATE_LIMIT: 'RATE_LIMIT',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  SERVICE_ERROR: 'SERVICE_ERROR',
  TOO_LITTLE_TEXT: 'TOO_LITTLE_TEXT',
  TOO_LONG: 'TOO_LONG',
  RESTRICTED_PAGE: 'RESTRICTED_PAGE',
  EXTRACT_FAILED: 'EXTRACT_FAILED',
  EMPTY_OR_BLOCKED: 'EMPTY_OR_BLOCKED',
  INTERRUPTED: 'INTERRUPTED',
  CANCELLED: 'CANCELLED',
});

export const USER_MESSAGES = Object.freeze({
  NO_KEY: 'No API key yet. Paste your Gemini key in the Key box and save it.',
  INVALID_KEY: 'Your API key was rejected. Paste a correct key in the Key box.',
  RATE_LIMIT: 'The free tier is busy right now. Wait a minute and try again.',
  // {wait} becomes "in about 7 hours" when the service said how long, otherwise "later".
  QUOTA_EXHAUSTED: 'The free-tier limit for your API key is used up for now. Try again {wait}, or use a different key.',
  NETWORK: 'Cannot reach the service. Check your internet connection.',
  TIMEOUT: 'The service took too long to answer. Try again.',
  SERVICE_ERROR: 'The service had a problem. Try again in a moment.',
  TOO_LITTLE_TEXT: 'This page has too little readable text to summarize.',
  TOO_LONG: 'This page is too long for Version 1 to summarize. Try a shorter page.',
  RESTRICTED_PAGE: 'Chrome does not allow extensions to read this page.',
  EXTRACT_FAILED: 'Could not read the text of this page.',
  EMPTY_OR_BLOCKED: 'The model returned no summary for this page.',
  INTERRUPTED: 'The summary was interrupted. Press Summarize to try again.',
  CANCELLED: 'Cancelled.',
});

/** "about 7 hours", "about 12 minutes", "about a minute" for a wait given in seconds. */
export function humanizeWait(seconds) {
  if (seconds < 90) return 'a minute';
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  const hours = Math.round(seconds / 3600);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} [detail] technical detail, for the console only
   * @param {{cause?: unknown, retryAfterSeconds?: number}} [options]
   */
  constructor(code, detail = '', options = {}) {
    super(detail || USER_MESSAGES[code] || code);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
    if (options.cause !== undefined) this.cause = options.cause;
    if (Number.isFinite(options.retryAfterSeconds)) this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get userMessage() {
    const template = USER_MESSAGES[this.code] ?? USER_MESSAGES.SERVICE_ERROR;
    const wait = this.retryAfterSeconds ? `in about ${humanizeWait(this.retryAfterSeconds)}` : 'later';
    return template.replace('{wait}', wait);
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
