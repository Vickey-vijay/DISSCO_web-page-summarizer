// Owns the summarizing job so it keeps running after the popup closes (same idea as Version 1).
// The popup only sends START_SUMMARY and then reads the job record from chrome.storage.session.
//
// New in Version 2: the model runs in an offscreen page (see offscreen-manager.js and
// src/offscreen). Before the first part is summarized, the job "prepares" the model: checks the
// graphics card, downloads the model the first time, and loads it. Progress of that work is
// written into the job record so the popup can show a progress bar.
//
// One job per tab. Each job has an id: a job that has been replaced (the tab went to another
// page) or whose tab was closed is aborted, and anything it still tries to write is dropped.

import { loadSettings } from '../core/config.js';
import { AppError, describeError, ERROR_CODES, toAppError } from '../core/errors.js';
import { runPipeline } from '../core/pipeline.js';
import { samePage } from '../core/url.js';
import { createLocalEngine } from '../engines/local.js';
import { extractFromTab } from './extract-tab.js';
import { createOffscreenManager } from './offscreen-manager.js';

const LOG = '[PageSummarizer]';
const jobKey = (tabId) => `job:${tabId}`;
// A "running" job that has not been updated for this long is treated as dead.
const STALE_MS = 3 * 60 * 1000;
const bootTime = Date.now();

const manager = createOffscreenManager({ getSettings: () => loadSettings(chrome.storage.local) });

const queues = new Map(); // tabId -> promise chain, so writes for one tab stay in order
const controllers = new Map(); // tabId -> {jobId, controller} of the running job
const closedTabs = new Set(); // tab ids are never reused within a browser session
const starting = new Set(); // tabs whose job is being created right now

/** Merge a patch into the job record, but only if the record still belongs to this job. */
function writeJob(tabId, jobId, patch) {
  if (closedTabs.has(tabId)) return Promise.resolve();
  const key = jobKey(tabId);
  const prev = queues.get(tabId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      if (closedTabs.has(tabId)) return;
      const current = (await chrome.storage.session.get(key))[key];
      if (!current || current.jobId !== jobId) return; // replaced by a newer job, or removed
      await chrome.storage.session.set({ [key]: { ...current, ...patch, updatedAt: Date.now() } });
    });
  queues.set(tabId, next);
  return next;
}

async function makeEngine() {
  const settings = await loadSettings(chrome.storage.local);
  const engine = createLocalEngine({
    send: (message) => manager.send(message),
    settings,
    deviceMemoryGB: navigator.deviceMemory,
    onFallback: () => chrome.storage.local.set({ modelOverride: 'fallback' }),
  });
  return { settings, engine };
}

async function runJob(tabId, jobId, signal) {
  const stopListening = manager.onProgress((p) => void writeJob(tabId, jobId, { phase: p.phase, percent: p.percent, detail: p.text ?? null, notice: null }));
  try {
    const { settings, engine } = await makeEngine();

    const result = await runPipeline({
      extract: () => extractFromTab(tabId),
      engine,
      settings,
      signal,
      onProgress: (p) => void writeJob(tabId, jobId, { ...p, notice: null }),
    });

    await writeJob(tabId, jobId, {
      status: 'done',
      phase: 'done',
      percent: null,
      notice: null,
      title: result.title,
      pageUrl: result.url, // `url` stays the tab's URL at start, which the popup compares against
      summary: result.summary,
      stats: {
        ...result.stats,
        model: engine.model.label,
        modelSwitchReason: engine.modelSwitchReason,
        gpu: engine.status?.gpu ?? null,
        loadMs: engine.loadInfo?.loadMs ?? null,
        decodeTps: engine.lastStats?.decodeTps ?? null,
      },
      error: null,
    });
    console.log(LOG, 'done', result.stats);
  } catch (err) {
    const info = describeError(err);
    if (info.code === ERROR_CODES.CANCELLED) {
      console.log(LOG, 'job cancelled (page changed or tab closed)');
      return; // nobody is waiting for this job any more
    }
    console.warn(LOG, 'failed', info.code, info.detail);
    await writeJob(tabId, jobId, { status: 'error', phase: 'error', notice: null, error: info });
  } finally {
    stopListening();
    if (controllers.get(tabId)?.jobId === jobId) controllers.delete(tabId);
  }
}

async function startJob(tabId) {
  if (starting.has(tabId)) return { ok: false, reason: 'already_running' };
  starting.add(tabId);
  try {
    const key = jobKey(tabId);
    const existing = (await chrome.storage.session.get(key))[key];
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const url = tab?.url ?? null;

    const alive = existing?.status === 'running' && Date.now() - (existing.updatedAt ?? 0) < STALE_MS;
    if (alive && (!url || !existing.url || samePage(existing.url, url))) {
      return { ok: false, reason: 'already_running' }; // same page: the popup shows its progress
    }
    // The tab moved to another page while an old job was running: drop the old job.
    if (alive) controllers.get(tabId)?.controller.abort();

    const jobId = crypto.randomUUID();
    const controller = new AbortController();
    controllers.set(tabId, { jobId, controller });
    await chrome.storage.session.set({
      [key]: {
        jobId,
        status: 'running',
        phase: 'extracting',
        current: 0,
        total: 0,
        percent: null,
        detail: null,
        notice: null,
        summary: null,
        error: null,
        stats: null,
        url,
        title: tab?.title ?? null,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    void runJob(tabId, jobId, controller.signal); // not awaited: the popup gets its answer at once
    return { ok: true };
  } finally {
    starting.delete(tabId);
  }
}

/** What the popup shows before any job: graphics card, model, is it downloaded, how big. */
async function getModelState() {
  try {
    const { engine } = await makeEngine();
    const status = await engine.checkStatus();
    return {
      ok: true,
      model: engine.model,
      switchReason: engine.modelSwitchReason,
      cached: status.cached,
      downloadMB: status.downloadMB ?? null,
      gpu: status.gpu,
    };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'START_SUMMARY' && Number.isInteger(message.tabId)) {
    startJob(message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, reason: toAppError(err).code }));
    return true; // keep the channel open for the async response
  }
  if (message?.type === 'GET_MODEL_STATE') {
    getModelState().then(sendResponse);
    return true;
  }
  if (message?.type === 'MODEL_PROGRESS') {
    manager.emitProgress(message);
    return false;
  }
  // KEEPALIVE from the offscreen page needs no answer: receiving it is what keeps this worker alive.
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  closedTabs.add(tabId);
  controllers.get(tabId)?.controller.abort();
  controllers.delete(tabId);
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
      console.warn(LOG, 'marking orphaned job as interrupted', key);
      await writeJob(Number(key.slice(4)), job.jobId, {
        status: 'error',
        phase: 'error',
        error: describeError(new AppError(ERROR_CODES.INTERRUPTED)),
      });
    }
  }
}
void sweepOrphans();

console.log(LOG, 'service worker started (Version 2, local model)');
