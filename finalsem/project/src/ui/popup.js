// Popup UI (Version 2). It never touches the model: it asks the service worker to start a job and
// renders whatever job record is in chrome.storage.session. Closing and reopening the popup
// therefore shows the same job. There is no key to enter: the model runs in the browser.
//
// Test seam: ?tabId=123 makes the popup target that tab instead of the active tab, because an
// automated test cannot click the toolbar icon.

import { samePage } from '../core/url.js';
import { parseSummary } from './summary-format.js';

const $ = (id) => document.getElementById(id);
const els = {
  title: $('page-title'),
  button: $('summarize'),
  modelLine: $('model-line'),
  gpuNote: $('gpu-note'),
  progress: $('progress'),
  progressText: $('progress-text'),
  progressBar: $('progress-bar'),
  notice: $('notice'),
  resultNotice: $('result-notice'),
  condenseNotice: $('condense-notice'),
  readAll: $('read-all'),
  quality: $('quality'),
  error: $('error'),
  errorText: $('error-text'),
  errorDetail: $('error-detail'),
  result: $('result'),
  summary: $('summary'),
  stats: $('stats'),
};

const STALE_MS = 5 * 60 * 1000;
let tab = null;
let lastJob = null; // kept so an open popup can notice a dead job without a storage event
let modelBlocked = false; // true when this computer cannot run the model at all
let refreshedFor = null; // id of the job whose end already refreshed the model line

async function getTargetTab() {
  const forced = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(forced) && forced > 0) return chrome.tabs.get(forced);
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}

const jobKey = () => `job:${tab.id}`;

function show(el, visible) {
  el.hidden = !visible;
}

// ---- the model line: graphics card, model, downloaded or not ------------------------------------

// WebGPU reports vendors in lowercase ("intel", "nvidia"); show them the way people write them.
const VENDOR_NAMES = { intel: 'Intel', nvidia: 'NVIDIA', amd: 'AMD', apple: 'Apple', qualcomm: 'Qualcomm', arm: 'Arm' };
export function vendorName(vendor) {
  const v = String(vendor ?? '').toLowerCase();
  return VENDOR_NAMES[v] ?? (v ? v[0].toUpperCase() + v.slice(1) : 'built-in');
}

function renderModelState(state) {
  els.modelLine.className = 'modelline';
  show(els.gpuNote, false);
  if (!state?.ok) {
    const code = state?.error?.code;
    els.modelLine.textContent = state?.error?.message ?? 'Could not check this computer.';
    els.modelLine.classList.add('bad');
    // A computer without WebGPU or fp16 cannot run Version 2 at all; other failures may be temporary.
    modelBlocked = code === 'NO_WEBGPU' || code === 'NO_SHADER_F16';
    els.button.disabled = modelBlocked || lastJob?.status === 'running';
    return;
  }
  modelBlocked = false;
  const { model, cached, downloadMB, gpu } = state;
  els.modelLine.textContent = cached
    ? `Model: ${model.label}. Downloaded, runs on this computer.`
    : `Model: ${model.label}. Not downloaded yet (about ${downloadMB ?? 'several hundred'} MB, first use only).`;
  els.button.textContent = cached ? 'Summarize this page' : 'Download model and summarize';
  if (gpu?.integrated) {
    els.gpuNote.textContent = `Graphics: ${vendorName(gpu.vendor)} (built into the processor). Answers can be slow. A separate graphics card is much faster.`;
    show(els.gpuNote, true);
  }
}

/** After a job ends the model line may be out of date (downloaded now, or switched to the smaller model). */
function refreshModelLineOnce(job) {
  if (refreshedFor === job.jobId) return;
  refreshedFor = job.jobId;
  void loadModelState();
}

/** Tells the user when the summary was made by the smaller model after the main one failed. */
function switchNotice(reason) {
  if (reason === 'GPU_MEMORY' || reason === 'MODEL_LOAD_FAILED') {
    return 'The main model did not fit in the graphics card, so the smaller model wrote this summary. It may be less detailed.';
  }
  return null;
}

/** Warm the model up while the person reads the popup, so the first answer does not wait for it. */
let preloadedFor = null;
function preloadIfPossible(state) {
  if (!state?.ok || !state.cached || modelBlocked || preloadedFor === state.model.id) return;
  if (/^(chrome|chrome-extension|about|edge|view-source|file|devtools):/i.test(tab?.url ?? '')) return; // nothing to summarize there
  preloadedFor = state.model.id;
  void chrome.runtime.sendMessage({ type: 'PRELOAD_MODEL' }).catch(() => {});
}

async function loadModelState() {
  let state = null;
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_MODEL_STATE' });
  } catch {
    /* handled in renderModelState */
  }
  renderModelState(state);
  preloadIfPossible(state);
}

// ---- rendering ---------------------------------------------------------------------------------

function renderSummary(text) {
  els.summary.replaceChildren();
  for (const block of parseSummary(text)) {
    if (block.type === 'p') {
      const p = document.createElement('p');
      p.textContent = block.text;
      els.summary.append(p);
    } else {
      const ul = document.createElement('ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        li.textContent = item;
        ul.append(li);
      }
      els.summary.append(ul);
    }
  }
}

function progressLabel(job) {
  switch (job.phase) {
    case 'extracting':
      return 'Reading the page...';
    case 'checking':
      return 'Checking your graphics card...';
    case 'downloading':
      return `Downloading the model (first time only): ${job.percent ?? 0}%`;
    case 'loading':
      return /warming/i.test(job.detail ?? '')
        ? 'Warming up the model (first time can take about 30 seconds)...'
        : `Loading the model into the graphics card: ${job.percent ?? 0}%`;
    case 'summarizing':
      return job.total > 1 ? `Summarizing part ${Math.min(job.current + 1, job.total)} of ${job.total}...` : 'Summarizing...';
    case 'merging':
      return `Combining ${job.parts ?? job.total} summaries...`;
    default:
      return 'Working...';
  }
}

/** The sentence shown when a long page was shortened before reading (built-in graphics read slowly). */
export function shortenedNotice(stats) {
  if (!stats?.condensed || !stats.textChars) return null;
  const percent = Math.max(1, Math.round((stats.readChars / stats.textChars) * 100));
  let text = `This is a long page. To keep it quick on this computer, the opening of each section was read: about ${percent}% of the text.`;
  if (stats.estimateFullSeconds) {
    const minutes = Math.max(1, Math.round(stats.estimateFullSeconds / 60));
    text += ` Reading all of it would take roughly ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  }
  return text;
}

function formatStats(stats) {
  if (!stats) return '';
  const seconds = (stats.elapsedMs / 1000).toFixed(1);
  const parts = stats.chunks === 1 ? '1 part' : `${stats.chunks} parts`;
  const calls = stats.apiCalls === 1 ? '1 request' : `${stats.apiCalls} requests`;
  const read = stats.condensed && stats.textChars ? ` · read ${Math.max(1, Math.round((stats.readChars / stats.textChars) * 100))}% of the text` : '';
  return `${parts} · ${calls} · ${seconds} s · ${stats.model ?? 'local model'}${read}`;
}

function render(job) {
  lastJob = job ?? null;
  const stale = job && job.status === 'running' && Date.now() - (job.updatedAt ?? 0) > STALE_MS;
  const sameUrl = !job?.url || !tab.url || samePage(job.url, tab.url);
  const live = job && sameUrl && !stale ? job : null;

  els.button.disabled = live?.status === 'running' || modelBlocked;
  show(els.progress, live?.status === 'running');
  show(els.error, live?.status === 'error' || stale);
  show(els.result, live?.status === 'done');

  show(els.notice, false);
  show(els.resultNotice, false);
  show(els.condenseNotice, false);
  show(els.readAll, false);
  show(els.errorDetail, false);
  if (stale) {
    els.errorText.textContent = 'The summary was interrupted. Press Summarize to try again.';
    return;
  }
  if (!live) return;

  if (live.status === 'running') {
    els.progressText.textContent = progressLabel(live);
    const measured =
      (live.phase === 'summarizing' && live.total > 0) ||
      (['downloading', 'loading'].includes(live.phase) && Number.isFinite(live.percent) && !/warming/i.test(live.detail ?? ''));
    if (measured) {
      const isParts = live.phase === 'summarizing';
      els.progressBar.max = isParts ? live.total : 100;
      els.progressBar.value = isParts ? live.current : live.percent;
    } else {
      els.progressBar.removeAttribute('value'); // indeterminate
    }
  } else if (live.status === 'error') {
    els.errorText.textContent = live.error?.message ?? 'Something went wrong.';
    // For the vague messages, show what the extension knows, so a person (or the developer) can say what happened.
    const code = live.error?.code;
    const detail = String(live.error?.detail ?? '').replace(/\s+/g, ' ').trim();
    if (detail && (code === 'SERVICE_ERROR' || code === 'MODEL_LOAD_FAILED')) {
      els.errorDetail.textContent = `Technical detail: ${detail.slice(0, 240)}`;
      show(els.errorDetail, true);
    }
    refreshModelLineOnce(live); // a fallback may have been saved even though the job failed
  } else if (live.status === 'done') {
    renderSummary(live.summary);
    els.stats.textContent = formatStats(live.stats);
    const why = switchNotice(live.stats?.modelSwitchReason);
    if (why) {
      els.resultNotice.textContent = why;
      show(els.resultNotice, true);
    }
    const shortened = shortenedNotice(live.stats);
    if (shortened) {
      els.condenseNotice.textContent = shortened;
      show(els.condenseNotice, true);
      show(els.readAll, true);
    }
    refreshModelLineOnce(live); // the model is downloaded now: refresh the line and the button
  }
}

async function init() {
  tab = await getTargetTab();
  if (!tab) {
    els.errorText.textContent = 'No page is open in this window.';
    show(els.error, true);
    els.button.disabled = true;
    return;
  }
  if (tab.title) {
    els.title.textContent = tab.title;
    show(els.title, true);
  }

  async function startSummary({ full = false } = {}) {
    els.button.disabled = true;
    show(els.error, false);
    show(els.result, false);
    let reply = null;
    try {
      reply = await chrome.runtime.sendMessage({ type: 'START_SUMMARY', tabId: tab.id, full });
    } catch {
      /* handled below */
    }
    if (reply?.ok) return; // the job record will arrive through the storage listener
    if (reply?.reason === 'already_running') {
      // This page is already being summarized: show its progress instead of a blank popup.
      const stored = await chrome.storage.session.get(jobKey());
      render(stored[jobKey()]);
      return;
    }
    els.errorText.textContent = 'Could not start the summary. Try again.';
    show(els.error, true);
    els.button.disabled = false;
  }

  // Settings: quality (which model). Stored in this browser; the model line follows the choice.
  try {
    els.quality.value = (await chrome.storage.local.get('quality')).quality === 'fast' ? 'fast' : 'better';
  } catch {
    /* the select keeps its default */
  }
  els.quality.addEventListener('change', async () => {
    await chrome.storage.local.set({ quality: els.quality.value });
    await loadModelState();
  });

  els.button.addEventListener('click', () => void startSummary());
  els.readAll.addEventListener('click', () => void startSummary({ full: true }));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[jobKey()]) render(changes[jobKey()].newValue);
  });

  const stored = await chrome.storage.session.get(jobKey());
  render(stored[jobKey()]);
  await loadModelState();
  render(lastJob); // apply the button state now that the model line is known
  // An open popup re-checks every few seconds, so a job whose worker died stops looking busy.
  setInterval(() => {
    if (lastJob) render(lastJob);
  }, 5000);
}

init();
