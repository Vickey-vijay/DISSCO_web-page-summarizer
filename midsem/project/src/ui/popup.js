// Popup UI. It never talks to the model: it asks the service worker to start a job and then
// renders whatever job record is in chrome.storage.session. Closing and reopening the popup
// therefore shows the same job. The API key can be entered right here, so the user never has
// to leave the popup (the Options page still works for the same job).
//
// Test seam: ?tabId=123 makes the popup target that tab instead of the active tab, because an
// automated test cannot click the toolbar icon.

import { STORAGE_KEYS } from '../core/config.js';
import { samePage } from '../core/url.js';
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
  toggleKey: $('toggle-key'),
  keyForm: $('key-form'),
  keyInput: $('key-input'),
  keySave: $('key-save'),
  keyRemove: $('key-remove'),
  keyMsg: $('key-msg'),
};

const STALE_MS = 3 * 60 * 1000;
const KEY_ERRORS = ['NO_KEY', 'INVALID_KEY', 'QUOTA_EXHAUSTED'];
let tab = null;
let lastJob = null; // kept so an open popup can notice a dead job without a storage event

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

// ---- API key, entered inside the popup ---------------------------------------------------

function keyMessage(text, kind) {
  els.keyMsg.textContent = text ?? '';
  els.keyMsg.className = `keymsg ${kind ?? ''}`.trim();
}

function openKeyForm(open, message, kind) {
  show(els.keyForm, open);
  els.toggleKey.setAttribute('aria-expanded', String(open));
  keyMessage(message, kind);
  if (open) els.keyInput.focus();
}

async function refreshKeyState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.apiKey);
  const hasKey = Boolean(stored[STORAGE_KEYS.apiKey]);
  show(els.keyRemove, hasKey);
  els.keyInput.placeholder = hasKey ? 'Paste a new key to replace the saved one' : 'Paste the key here';
  return hasKey;
}

async function saveKey() {
  const key = els.keyInput.value.trim();
  if (!key) return keyMessage('Paste a key first.', 'bad');
  if (/\s/.test(key)) return keyMessage('A key has no spaces. Check what you pasted.', 'bad');
  await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: key });
  els.keyInput.value = '';
  await refreshKeyState();
  // A key problem on screen is out of date now: clear it so the user can press Summarize again.
  if (lastJob?.status === 'error' && KEY_ERRORS.includes(lastJob.error?.code)) {
    show(els.error, false);
    els.button.disabled = false;
  }
  openKeyForm(true, 'Key saved. Now press Summarize.', 'ok');
}

async function removeKey() {
  await chrome.storage.local.remove(STORAGE_KEYS.apiKey);
  await refreshKeyState();
  keyMessage('The saved key was removed.', 'ok');
}

// ---- rendering ----------------------------------------------------------------------------

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

function render(job) {
  lastJob = job ?? null;
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
    const known = live.phase === 'summarizing' && live.total > 0 && !live.notice;
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
    const keyProblem = KEY_ERRORS.includes(live.error?.code);
    show(els.errorOptions, keyProblem);
    if (keyProblem) openKeyForm(true, '', '');
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
    show(els.errorOptions, false);
    show(els.error, true);
    els.button.disabled = false;
  });

  els.toggleKey.addEventListener('click', () => openKeyForm(els.keyForm.hidden, '', ''));
  els.keySave.addEventListener('click', saveKey);
  els.keyRemove.addEventListener('click', removeKey);
  els.keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveKey();
  });
  els.errorOptions.addEventListener('click', openOptions);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[jobKey()]) render(changes[jobKey()].newValue);
  });

  const hasKey = await refreshKeyState();
  if (!hasKey) openKeyForm(true, 'Paste your Gemini key to begin.', '');
  const stored = await chrome.storage.session.get(jobKey());
  render(stored[jobKey()]);
  // An open popup re-checks every few seconds, so a job whose worker died stops looking busy.
  setInterval(() => {
    if (lastJob) render(lastJob);
  }, 5000);
}

init();
