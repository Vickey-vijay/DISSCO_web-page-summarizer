// Launches Playwright's Chromium (headed by default, so you can watch) with the extension loaded.
//
// The extension is copied to a temp folder first and the copy's manifest gets one extra host
// permission, http://127.0.0.1/*. A test cannot click the toolbar icon, so Chrome's "activeTab"
// grant never happens; the extra permission stands in for it. The product manifest is unchanged.
// Real activeTab behaviour is covered by the manual Load-unpacked smoke test.
//
// Environment: HEADLESS=1 runs without a window, SLOWMO=<ms> sets the delay between actions.
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
export const OUTPUT_DIR = path.join(projectRoot, 'test-output');

function stageExtension() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ps-ext-'));
  for (const name of ['icons', 'src']) cpSync(path.join(projectRoot, name), path.join(dir, name), { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [...manifest.host_permissions, 'http://127.0.0.1/*'];
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

export async function launchExtension({
  headless = process.env.HEADLESS === '1',
  slowMo = headless ? 0 : Number(process.env.SLOWMO ?? 120),
} = {}) {
  const extensionDir = stageExtension();
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'ps-profile-'));
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless,
    slowMo,
    viewport: null,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--window-size=1280,900'],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  const base = `chrome-extension://${extensionId}`;

  // A page on the extension's own origin, used to call chrome.* APIs (storage, tabs).
  // Unlike the service worker handle it cannot go stale when Chrome stops the worker.
  const bridge = await context.newPage();
  await bridge.goto(`${base}/src/ui/options.html`);

  const ext = {
    context,
    extensionId,
    bridge,
    base,
    /** Run a function inside the extension origin (chrome.* available). */
    run: (fn, arg) => bridge.evaluate(fn, arg),
    /** Replace everything in chrome.storage.local, e.g. {apiKey, apiBaseUrl, chunkChars}. */
    async setSettings(values) {
      await bridge.evaluate(async (v) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(v);
      }, values);
    },
    async clearJobs() {
      await bridge.evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        const keys = Object.keys(all).filter((k) => k.startsWith('job:'));
        if (keys.length) await chrome.storage.session.remove(keys);
      });
    },
    async getJob(tabId) {
      return bridge.evaluate(async (id) => (await chrome.storage.session.get(`job:${id}`))[`job:${id}`] ?? null, tabId);
    },
    /** The tab id of a Playwright page: bring it to the front, then ask Chrome which tab is active. */
    async tabIdOf(page) {
      await page.bringToFront();
      return bridge.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id ?? null);
    },
    /** Open the popup page (sized like the real popup) aimed at a given tab. */
    async openPopup(tabId) {
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 380, height: 560 });
      await popup.goto(`${base}/src/ui/popup.html?tabId=${tabId}`);
      return popup;
    },
    async openOptions() {
      const page = await context.newPage();
      await page.setViewportSize({ width: 700, height: 520 });
      await page.goto(`${base}/src/ui/options.html`);
      return page;
    },
    async shot(page, name) {
      const file = path.join(OUTPUT_DIR, `${name}.png`);
      await page.screenshot({ path: file });
      return file;
    },
    async close() {
      await context.close().catch(() => {});
      for (const dir of [userDataDir, extensionDir]) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          /* temp folder; the OS cleans it eventually */
        }
      }
    },
  };
  return ext;
}

/**
 * Press Summarize for a page and wait for the popup to show a result or an error.
 * @returns {{popup, tabId, outcome: 'done' | 'error', text: string}}
 */
export async function summarize(ext, targetPage, { timeoutMs = 60000 } = {}) {
  const tabId = await ext.tabIdOf(targetPage);
  const popup = await ext.openPopup(tabId);
  await popup.click('#summarize');
  const done = popup.locator('#result:not([hidden])');
  const failed = popup.locator('#error:not([hidden])');
  await Promise.race([done.waitFor({ timeout: timeoutMs }), failed.waitFor({ timeout: timeoutMs })]);
  const outcome = (await done.count()) > 0 ? 'done' : 'error';
  const text = outcome === 'done' ? await popup.locator('#summary').innerText() : await popup.locator('#error-text').innerText();
  return { popup, tabId, outcome, text };
}
