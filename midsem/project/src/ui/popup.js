// Popup UI. It never talks to the model: it asks the service worker to start a job and then
// renders whatever job record is in chrome.storage.session. Closing and reopening the popup
// therefore shows the same job.
//
// Test seam: ?tabId=123 makes the popup target that tab instead of the active tab, because an
// automated test cannot click the toolbar icon.

import { parseSummary } from './summary-format.js';

const $ = (id) => document.getElementById(id);
const els = {
  title: $('page-title'),
  button: $('summarize'),
  progress: $('progress'),
  progressText: $('progress-text'),
  progressBar: $('progress-bar'),
  notice: $('notice'),
  error: $('error'),
  errorText: $('error-text'),
  errorOptions: $('error-options'),
  result: $('result'),
  summary: $('summary'),
  stats: $('stats'),
};

const STALE_MS = 3 * 60 * 1000;
let tab = null;

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
  return `${parts} · ${calls} · ${seconds} s`;
}

// Same page ignoring the #fragment, so in-page links do not hide a finished summary.
function samePage(a, b) {
  const strip = (u) => String(u).split('#')[0];
  return strip(a) === strip(b);
}

function render(job) {
  const stale = job && job.status === 'running' && Date.now() - (job.updatedAt ?? 0) > STALE_MS;
  const sameUrl = !job?.url || !tab.url || samePage(job.url, tab.url);
  const live = job && sameUrl && !stale ? job : null;

  els.button.disabled = live?.status === 'running';
  show(els.progress, live?.status === 'running');
  show(els.error, live?.status === 'error' || stale);
  show(els.result, live?.status === 'done');

  if (stale) {
    els.errorText.textContent = 'The summary was interrupted. Press Summarize to try again.';
    show(els.errorOptions, false);
    return;
  }
  if (!live) return;

  if (live.status === 'running') {
    els.progressText.textContent = progressLabel(live);
    const known = live.phase === 'summarizing' && live.total > 0;
    if (known) {
      els.progressBar.max = live.total;
      els.progressBar.value = live.current;
    } else {
      els.progressBar.removeAttribute('value'); // indeterminate
    }
    if (live.notice?.type === 'retry') {
      const seconds = Math.ceil(live.notice.delayMs / 1000);
      els.notice.textContent = `The service is busy. Trying again in ${seconds} s (attempt ${live.notice.attempt} of ${live.notice.maxRetries}).`;
      show(els.notice, true);
    } else {
      show(els.notice, false);
    }
  } else if (live.status === 'error') {
    els.errorText.textContent = live.error?.message ?? 'Something went wrong.';
    show(els.errorOptions, ['NO_KEY', 'INVALID_KEY'].includes(live.error?.code));
  } else if (live.status === 'done') {
    renderSummary(live.summary);
    els.stats.textContent = formatStats(live.stats);
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
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
    await chrome.runtime.sendMessage({ type: 'START_SUMMARY', tabId: tab.id });
  });
  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    openOptions();
  });
  els.errorOptions.addEventListener('click', openOptions);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[jobKey()]) render(changes[jobKey()].newValue);
  });
  const stored = await chrome.storage.session.get(jobKey());
  render(stored[jobKey()]);
}

init();
