// Prints what the extension would read from a page: the extracted text, its size, and the
// section headings. Used to see how much of a long page is real prose and how much is
// references and lists. Hidden Chromium, no model.
//
//   node scripts/dump-page-text.mjs https://en.wikipedia.org/wiki/Lighthouse [out.txt]
import { writeFileSync } from 'node:fs';
import { launchExtension } from '../tests/helpers/extension.mjs';

const url = process.argv[2];
if (!url) throw new Error('usage: node scripts/dump-page-text.mjs <url> [out.txt]');
const ext = await launchExtension({ extraHostPermissions: ['https://*/*'] });
try {
  const page = await ext.context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  const tabId = await ext.tabIdOf(page);
  const result = await ext.run(
    async ({ tabId }) => {
      const r = await chrome.scripting.executeScript({ target: { tabId }, files: ['src/lib/readability.js', 'src/content/extract.js'] });
      return r[0].result;
    },
    { tabId },
  );
  console.log(`method=${result.method} title="${result.title}" chars=${result.text.length}`);
  if (process.argv[3]) writeFileSync(process.argv[3], result.text, 'utf8');
} finally {
  await ext.close();
}
