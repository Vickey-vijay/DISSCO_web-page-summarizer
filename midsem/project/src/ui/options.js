// Options page: save or remove the user's API key (FR5).
// The key lives in chrome.storage.local (this browser only), never in chrome.storage.sync.

import { STORAGE_KEYS } from '../core/config.js';

const input = document.getElementById('api-key');
const saveBtn = document.getElementById('save');
const removeBtn = document.getElementById('remove');
const removeWrap = document.getElementById('remove-wrap');
const savedNote = document.getElementById('saved-note');
const status = document.getElementById('status');

function say(message, kind) {
  status.textContent = message;
  status.className = `status ${kind ?? ''}`.trim();
}

function reflect(hasKey) {
  savedNote.hidden = !hasKey;
  removeWrap.hidden = !hasKey;
  input.placeholder = hasKey ? 'Paste a new key to replace the saved one' : 'Paste your key here';
}

async function load() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.apiKey);
  reflect(Boolean(stored[STORAGE_KEYS.apiKey]));
}

saveBtn.addEventListener('click', async () => {
  const key = input.value.trim();
  if (!key) {
    say('Enter a key first.', 'bad');
    return;
  }
  if (/\s/.test(key)) {
    say('A key has no spaces. Check what you pasted.', 'bad');
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: key });
  input.value = '';
  reflect(true);
  say('Saved. You can close this tab and press Summarize.', 'ok');
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

removeBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(STORAGE_KEYS.apiKey);
  reflect(false);
  say('The saved key was removed.', 'ok');
});

load();
