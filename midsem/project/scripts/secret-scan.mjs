// Before every push: make sure the real API key appears in no file of the repository.
// Prints only counts and file paths, never the key. Exit code 1 if the key is found.
//
// Run:  node scripts/secret-scan.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeminiKey } from '../tests/helpers/key.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const key = loadGeminiKey();
if (!key) {
  console.log('No key available on this machine, so nothing to scan for.');
  process.exit(0);
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv']);
const keyBytes = Buffer.from(key, 'utf8');
const hits = [];
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
    } else {
      const file = path.join(dir, entry.name);
      if (statSync(file).size > 50 * 1024 * 1024) continue;
      scanned += 1;
      // Binary-safe: also catches the key inside .docx/.pptx zips only if stored uncompressed,
      // so documents are additionally checked by text extraction in the docs build.
      if (readFileSync(file).includes(keyBytes)) hits.push(path.relative(repoRoot, file));
    }
  }
}
walk(repoRoot);

console.log(`Scanned ${scanned} files under the repository.`);
if (hits.length) {
  console.error(`KEY FOUND in ${hits.length} file(s):\n  ` + hits.join('\n  '));
  process.exit(1);
}
console.log('Key not found in any file. OK to commit and push.');
