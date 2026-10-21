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
  error: $('error'),
  errorText: $('error-text'),
  result: $('result'),
  summary: $('summary'),
  stats: $('stats'),
};

const STALE_MS = 3 * 60 * 1000;
let tab = null;
let lastJob = null; // kept so an open popup can notice a dead job without a storage event
let modelBlocked = false; // true when this computer cannot run the model at all

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

async function loadModelState() {
  let state = null;
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_MODEL_STATE' });
  } catch {
    /* handled in renderModelState */
  }
  renderModelState(state);
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

function formatStats(stats) {
  if (!stats) return '';
  const seconds = (stats.elapsedMs / 1000).toFixed(1);
  const parts = stats.chunks === 1 ? '1 part' : `${stats.chunks} parts`;
  const calls = stats.apiCalls === 1 ? '1 request' : `${stats.apiCalls} requests`;
  return `${parts} · ${calls} · ${seconds} s · ${stats.model ?? 'local model'}`;
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
    show(els.notice, false);
  } else if (live.status === 'error') {
    els.errorText.textContent = live.error?.message ?? 'Something went wrong.';
  } else if (live.status === 'done') {
    renderSummary(live.summary);
    els.stats.textContent = formatStats(live.stats);
    void loadModelState(); // the model is downloaded now: refresh the line and the button
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

  els.button.addEventListener('click', async () => {
    els.button.disabled = true;
    show(els.error, false);
    show(els.result, false);
    let reply = null;
    try {
      reply = await chrome.runtime.sendMessage({ type: 'START_SUMMARY', tabId: tab.id });
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
  });

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
