// Reads the main text of a tab by injecting the extractor into it.

import { AppError, ERROR_CODES } from '../core/errors.js';

const RESTRICTED_PROTOCOLS = /^(chrome|chrome-extension|chrome-search|chrome-untrusted|devtools|edge|about|view-source|data|blob|file):/i;
const RESTRICTED_HOSTS = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;

/** True for pages Chrome never lets an extension script into. */
export function isRestrictedUrl(url) {
  if (!url) return false; // unknown: let executeScript decide
  return RESTRICTED_PROTOCOLS.test(url) || RESTRICTED_HOSTS.test(url);
}

/**
 * @param {number} tabId
 * @returns {Promise<{title: string, url: string, text: string, method: string}>}
 */
export async function extractFromTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (isRestrictedUrl(tab.url)) {
    throw new AppError(ERROR_CODES.RESTRICTED_PAGE, tab.url);
  }

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/lib/readability.js', 'src/content/extract.js'],
    });
  } catch (err) {
    const message = String(err?.message ?? err);
    if (/cannot access|cannot be scripted|extensions gallery|permission|no tab with id/i.test(message)) {
      throw new AppError(ERROR_CODES.RESTRICTED_PAGE, message, { cause: err });
    }
    throw new AppError(ERROR_CODES.EXTRACT_FAILED, message, { cause: err });
  }

  const result = results?.[0]?.result;
  if (!result || result.ok !== true) {
    throw new AppError(ERROR_CODES.EXTRACT_FAILED, result?.error ?? 'extractor returned nothing');
  }
  return { title: result.title, url: result.url, text: result.text, method: result.method };
}
