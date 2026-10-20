// Spike: can the REAL permission path (manifest exactly as shipped, no extra host permission) be
// exercised in automation? Opens the popup with chrome.action.openPopup() instead of a test
// seam, presses Summarize there, and sees whether the extension may read the tab through
// "activeTab". Uses the mock Gemini server (no quota, no key).
//
// Run:  node scripts/activetab-spike.mjs
import { startFixtureServer } from '../tests/helpers/fixtures-server.mjs';
import { startMockGemini } from '../tests/helpers/mock-gemini.mjs';
import { launchExtension, OUTPUT_DIR } from '../tests/helpers/extension.mjs';
import path from 'node:path';

const fixtures = await startFixtureServer();
const mock = await startMockGemini();
const ext = await launchExtension({ patchHostPermission: false });
const report = {};
try {
  await ext.setSettings({ apiKey: mock.validKey, apiBaseUrl: mock.origin });
  const target = await ext.context.newPage();
  await target.goto(`${fixtures.origin}/article-short.html`);
  await target.bringToFront();

  // How does the shipped manifest see this tab? (url is hidden without a grant)
  report.tabUrlVisibleBeforeGrant = await ext.run(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return Boolean(t?.url);
  });

  // Ask Chrome to open the toolbar popup for the active tab.
  const worker = ext.context.serviceWorkers()[0];
  const popupPromise = ext.context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  try {
    await worker.evaluate(() => chrome.action.openPopup());
    report.openPopupCall = 'ok';
  } catch (err) {
    report.openPopupCall = 'failed: ' + String(err.message).split('\n')[0];
  }
  const popup = await popupPromise;
  report.popupPageExposedToPlaywright = Boolean(popup);

  // Did openPopup() grant "activeTab" for the target tab? A grant makes tab.url readable and
  // lets the extension inject a script into a page it has no host permission for.
  await new Promise((r) => setTimeout(r, 1500));
  report.tabUrlVisibleAfterOpenPopup = await ext.run(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return Boolean(t?.url);
  });
  const tabId = await ext.tabIdOf(target);
  report.injectionAfterOpenPopup = await ext.run(async (id) => {
    try {
      const r = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => document.title });
      return 'allowed: ' + r[0].result;
    } catch (e) {
      return 'blocked: ' + String(e.message).slice(0, 80);
    }
  }, tabId);
  report.injectionWithoutAnyGrant_controlTab = await (async () => {
    const other = await ext.context.newPage();
    await other.goto(`${fixtures.origin}/near-empty.html`);
    const id = await ext.tabIdOf(other);
    const r = await ext.run(async (tid) => {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tid }, func: () => 1 });
        return 'allowed';
      } catch (e) {
        return 'blocked: ' + String(e.message).slice(0, 80);
      }
    }, id);
    await other.close();
    return r;
  })();} finally {
  console.log(JSON.stringify(report, null, 2));
  await ext.close();
  await mock.close();
  await fixtures.close();
}
