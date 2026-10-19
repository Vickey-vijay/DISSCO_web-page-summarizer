// Owns the summarizing job so it keeps running after the popup closes.
// The popup only sends START_SUMMARY and then reads the job record from chrome.storage.session.
// Every progress write is an extension API call, which also keeps Chrome from stopping the worker.

import { loadSettings } from '../core/config.js';
import { AppError, describeError, ERROR_CODES, toAppError } from '../core/errors.js';
import { runPipeline } from '../core/pipeline.js';
import { createGeminiEngine } from '../engines/gemini.js';
import { extractFromTab } from './extract-tab.js';

const LOG = '[PageSummarizer]';
const jobKey = (tabId) => `job:${tabId}`;
// A "running" job that has not been updated for this long is treated as dead.
const STALE_MS = 3 * 60 * 1000;
const bootTime = Date.now();

// Writes for one tab are queued so progress updates can never arrive out of order.
const queues = new Map();
function writeJob(tabId, patch) {
  const key = jobKey(tabId);
  const prev = queues.get(tabId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const current = (await chrome.storage.session.get(key))[key] ?? {};
      await chrome.storage.session.set({ [key]: { ...current, ...patch, updatedAt: Date.now() } });
    });
  queues.set(tabId, next);
  return next;
}

async function runJob(tabId) {
  try {
    const settings = await loadSettings(chrome.storage.local);
    if (!settings.apiKey) throw new AppError(ERROR_CODES.NO_KEY);

    const engine = createGeminiEngine(settings, {
      onNotice: (notice) => {
        console.warn(LOG, 'retrying', notice);
        void writeJob(tabId, { notice });
      },
    });

    const result = await runPipeline({
      extract: () => extractFromTab(tabId),
      engine,
      settings,
      onProgress: (p) => void writeJob(tabId, { ...p, notice: null }),
    });

    await writeJob(tabId, {
      status: 'done',
      phase: 'done',
      notice: null,
      title: result.title,
      pageUrl: result.url, // `url` stays the tab's URL at start, which the popup compares against
      summary: result.summary,
      stats: result.stats,
      error: null,
    });
    console.log(LOG, 'done', result.stats);
  } catch (err) {
    const info = describeError(err);
    console.warn(LOG, 'failed', info.code, info.detail);
    await writeJob(tabId, { status: 'error', phase: 'error', notice: null, error: info });
  }
}

async function startJob(tabId) {
  const key = jobKey(tabId);
  const existing = (await chrome.storage.session.get(key))[key];
  if (existing?.status === 'running' && Date.now() - (existing.updatedAt ?? 0) < STALE_MS) {
    return { ok: false, reason: 'already_running' };
  }
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  await chrome.storage.session.set({
    [key]: {
      status: 'running',
      phase: 'extracting',
      current: 0,
      total: 0,
      notice: null,
      summary: null,
      error: null,
      stats: null,
      url: tab?.url ?? null,
      title: tab?.title ?? null,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  void runJob(tabId); // not awaited: the popup gets its answer immediately
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'START_SUMMARY' && Number.isInteger(message.tabId)) {
    startJob(message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, reason: toAppError(err).code }));
    return true; // keep the channel open for the async response
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  queues.delete(tabId);
  void chrome.storage.session.remove(jobKey(tabId));
});

// If Chrome stopped this worker mid-job, the job record still says "running" but nothing
// is working on it. A fresh worker marks those jobs as interrupted so the popup does not
// wait forever.
async function sweepOrphans() {
  const all = await chrome.storage.session.get(null);
  for (const [key, job] of Object.entries(all)) {
    if (key.startsWith('job:') && job?.status === 'running' && (job.updatedAt ?? 0) < bootTime) {
      const tabId = Number(key.slice(4));
      console.warn(LOG, 'marking orphaned job as interrupted', key);
      await writeJob(tabId, { status: 'error', phase: 'error', error: describeError(new AppError(ERROR_CODES.INTERRUPTED)) });
    }
  }
}
void sweepOrphans();

console.log(LOG, 'service worker started');
