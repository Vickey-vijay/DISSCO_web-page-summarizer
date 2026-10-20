// Launches Playwright's Chromium with the extension loaded. It runs hidden (headless) by default so\n// it never disturbs the person working on the machine; set HEADED=1 to watch it in a window.
//
// The extension is copied to a temp folder first and the copy's manifest gets one extra host
// permission, http://127.0.0.1/*. A test cannot click the toolbar icon, so Chrome's "activeTab"
// grant never happens; the extra permission stands in for it. The product manifest is unchanged.
// Real activeTab behaviour is covered by the manual Load-unpacked smoke test.
//
// Environment: HEADED=1 shows the browser window, SLOWMO=<ms> sets the delay between actions (headed only).
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
export const OUTPUT_DIR = path.join(projectRoot, 'test-output');

function stageExtension({ patchHostPermission = true, extraHostPermissions = [], targetDir = null } = {}) {
  // A fixed folder keeps the extension's id (and so its browser storage) the same between runs.
  if (targetDir) {
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
  }
  const dir = targetDir ?? mkdtempSync(path.join(tmpdir(), 'ps-ext-'));
  for (const name of ['icons', 'src']) cpSync(path.join(projectRoot, name), path.join(dir, name), { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
  // false = test the manifest exactly as shipped (used by the activeTab check)
  if (patchHostPermission) manifest.host_permissions = [...manifest.host_permissions, 'http://127.0.0.1/*', ...extraHostPermissions];
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // A blank extension page used only by the tests, to call chrome.* APIs (storage, tabs).
  writeFileSync(path.join(dir, 'src', 'ui', 'test-bridge.html'), '<!doctype html><meta charset="utf-8"><title>test bridge</title>');
  return dir;
}

export async function launchExtension({
  headless = process.env.HEADED !== '1',
  slowMo = headless ? 0 : Number(process.env.SLOWMO ?? 120),
  patchHostPermission = true,
  extraHostPermissions = [], // live runs on real websites pass ['https://*/*'] here
  userDataDir: givenProfile = null, // reuse a profile folder (keeps the downloaded model between runs)
  extensionDir: givenExtensionDir = null, // reuse one extension folder, so the extension id stays the same
  extraArgs = [],
} = {}) {
  const extensionDir = stageExtension({ patchHostPermission, extraHostPermissions, targetDir: givenExtensionDir });
  const userDataDir = givenProfile ?? mkdtempSync(path.join(tmpdir(), 'ps-profile-'));
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless,
    slowMo,
    viewport: null,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--window-size=1280,900', ...extraArgs],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  const base = `chrome-extension://${extensionId}`;

  // A page on the extension's own origin, used to call chrome.* APIs (storage, tabs).
  // Unlike the service worker handle it cannot go stale when Chrome stops the worker.
  const bridge = await context.newPage();
  await bridge.goto(`${base}/src/ui/test-bridge.html`);

  const ext = {
    context,
    extensionId,
    bridge,
    base,
    /** Run a function inside the extension origin (chrome.* available). */
    run: (fn, arg) => bridge.evaluate(fn, arg),
    /** Replace everything in chrome.storage.local, e.g. {engineMode, chunkChars, mockDelayMs}. */
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
    /**
     * Open the popup page aimed at a given tab. A test cannot click the toolbar icon, so the page
     * is opened in a small popup-type window at the right edge of the screen (not as a tab),
     * which is close to how the real popup looks while you watch the test.
     */
    async openPopup(tabId) {
      const appeared = context.waitForEvent('page');
      const windowId = await bridge.evaluate(async (url) => {
        const w = await chrome.windows.create({ url, type: 'popup', width: 400, height: 640, left: Math.max(0, screen.availWidth - 420), top: 90, focused: true });
        return w.id;
      }, `${base}/src/ui/popup.html?tabId=${tabId}`);
      const popup = await appeared;
      await popup.waitForLoadState('domcontentloaded');
      // The browser was launched with --window-size, which new windows inherit, so first shrink
      // the window, then measure the page area and correct for the window frame so the page
      // area is exactly 380 x 600 like the real popup.
      const left = await bridge.evaluate(() => Math.max(0, screen.availWidth - 420));
      const resize = (w, h) => bridge.evaluate(async ([id, ww, hh, l]) => chrome.windows.update(id, { width: ww, height: hh, left: l, top: 90 }), [windowId, w, h, left]);
      await resize(400, 640);
      await popup.waitForTimeout(250);
      const [iw, ih] = await popup.evaluate(() => [window.innerWidth, window.innerHeight]);
      await resize(Math.max(300, 400 + (380 - iw)), Math.max(300, 640 + (600 - ih)));      await popup.waitForTimeout(150);
      return popup;
    },    /**
     * Forget (false) or set (true) that the fake models are "downloaded", so a test can start from
     * a first run. The flags live in localStorage of the extension origin, which this page shares.
     */
    async setMockModelCached(cached) {
      await bridge.evaluate((c) => {
        const prefix = 'page-summarizer-mock-model-cached:';
        for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
        if (c) {
          localStorage.setItem(prefix + 'Llama-3.2-1B-Instruct-q4f16_1-MLC', '1');
          localStorage.setItem(prefix + 'SmolLM2-360M-Instruct-q4f16_1-MLC', '1');
        }
      }, cached);
    },
    async shot(page, name) {
      const file = path.join(OUTPUT_DIR, `${name}.png`);
      await page.screenshot({ path: file });
      return file;
    },
    async close() {
      await context.close().catch(() => {});
      for (const dir of [givenProfile ? null : userDataDir, givenExtensionDir ? null : extensionDir].filter(Boolean)) {
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
