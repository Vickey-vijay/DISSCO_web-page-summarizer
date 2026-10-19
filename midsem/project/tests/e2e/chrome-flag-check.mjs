// M0 evidence script: does this machine's branded Chrome still load an extension
// through --load-extension (removed in Chrome 137+ per the Chromium team), and does
// Playwright's bundled Chromium still honour it?
//
// Run:  node tests/e2e/chrome-flag-check.mjs
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, '..', '..');

async function tryLaunch(label, launchOptions) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'ps-flagcheck-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null);
    }
    const version = context.browser()?.version() ?? 'unknown';
    console.log(`${label}: browser ${version} -> extension service worker ${worker ? 'LOADED (' + worker.url() + ')' : 'NOT loaded'}`);
    return Boolean(worker);
  } catch (err) {
    console.log(`${label}: launch failed -> ${err.message.split('\n')[0]}`);
    return false;
  } finally {
    await context?.close().catch(() => {});
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

const results = {};
results.brandedChrome = await tryLaunch('Branded Google Chrome', { channel: 'chrome', headless: false });
results.playwrightChromium = await tryLaunch('Playwright Chromium', { channel: 'chromium', headless: true });
console.log(JSON.stringify(results));
