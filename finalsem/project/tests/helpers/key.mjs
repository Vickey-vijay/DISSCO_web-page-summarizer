// Finds the Gemini API key for live tests and scripts. The value is returned to the caller
// and is never printed or written anywhere by this module.
//
// Lookup order:
//   1. this process's environment (case-insensitive: Windows ignores case anyway)
//   2. midsem/project/.env.test  (git-ignored)   line: GEMINI_API_KEY=...
//   3. Windows user / machine environment variables, read through PowerShell, because a
//      variable set after a terminal or editor started is not in that process's environment.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMES = ['Gemini_API', 'GEMINI_API_KEY', 'GEMINI_API', 'GOOGLE_API_KEY'];
const here = path.dirname(fileURLToPath(import.meta.url));
const envTestFile = path.resolve(here, '..', '..', '.env.test');

function fromProcessEnv() {
  const wanted = new Set(NAMES.map((n) => n.toLowerCase()));
  for (const [name, value] of Object.entries(process.env)) {
    if (wanted.has(name.toLowerCase()) && value && value.trim()) return value.trim();
  }
  return null;
}

function fromEnvFile() {
  if (!existsSync(envTestFile)) return null;
  for (const line of readFileSync(envTestFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
    if (m && NAMES.some((n) => n.toLowerCase() === m[1].toLowerCase())) return m[2].replace(/^["']|["']$/g, '');
  }
  return null;
}

function fromWindowsEnvironment() {
  if (process.platform !== 'win32') return null;
  for (const scope of ['User', 'Machine']) {
    for (const name of NAMES) {
      try {
        const out = execFileSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', `[Environment]::GetEnvironmentVariable('${name}','${scope}')`],
          { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim();
        if (out) return out;
      } catch {
        /* try the next one */
      }
    }
  }
  return null;
}

/** @returns {string | null} the key, or null if none was found */
export function loadGeminiKey() {
  return fromProcessEnv() ?? fromEnvFile() ?? fromWindowsEnvironment();
}
