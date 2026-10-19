// A stand-in for the Gemini REST endpoint, so browser tests are fast, free and repeatable.
// It checks the key header like the real API, records every request, and can be told to
// misbehave: delay, rate-limit, fail, return nothing, or return HTML-looking text.
import http from 'node:http';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-goog-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function classify(prompt) {
  if (/Summarize this web page for a busy reader/.test(prompt)) return { kind: 'single' };
  const chunk = prompt.match(/part (\d+) of (\d+) of one long web page/);
  if (chunk) return { kind: 'chunk', index: Number(chunk[1]), total: Number(chunk[2]) };
  if (/summaries of consecutive parts/.test(prompt)) return { kind: 'merge' };
  return { kind: 'unknown' };
}

const titleOf = (prompt) => (prompt.match(/Page title: (.*)/)?.[1] ?? 'this page').trim();

function answerFor(info, prompt, special) {
  if (special === 'html') return 'Overview line.\n- <img src=x onerror="document.title=\'hacked\'"> bullet one\n- <b>bold</b> bullet two';
  switch (info.kind) {
    case 'single':
      return `This page is about ${titleOf(prompt)}.\n- First key point taken from the page.\n- Second key point taken from the page.\n- Third key point taken from the page.`;
    case 'chunk': {
      const body = prompt.split('<<<PAGE TEXT START>>>').pop().split('<<<PAGE TEXT END>>>')[0].trim();
      return `Part ${info.index} of ${info.total} covers: ${body.slice(0, 60).replace(/\s+/g, ' ')}...`;
    }
    case 'merge': {
      const parts = (prompt.match(/^Part \d+:/gm) ?? []).length;
      return `Combined overview of ${titleOf(prompt)}.\n- Point merged from ${parts} partial summaries.\n- Another merged point.`;
    }
    default:
      return 'Unknown prompt type.';
  }
}

/**
 * @param {{validKey?: string}} [options]
 */
export async function startMockGemini({ validKey = 'mock-key' } = {}) {
  /** every request received, oldest first */
  const requests = [];
  let config = { delayMs: 0, failStatus: null, failTimes: 0, special: null };
  let failuresLeft = 0;

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const send = (status, body, extra = {}) =>
        res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...extra }).end(JSON.stringify(body));

      let prompt = '';
      try {
        prompt = JSON.parse(raw)?.contents?.[0]?.parts?.[0]?.text ?? '';
      } catch {
        /* leave empty */
      }
      const info = classify(prompt);
      const keyHeader = req.headers['x-goog-api-key'];
      requests.push({ at: Date.now(), url: req.url, hasKey: Boolean(keyHeader), prompt, ...info });

      if (keyHeader !== validKey) {
        send(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
        return;
      }
      if (config.delayMs) await new Promise((r) => setTimeout(r, config.delayMs));
      if (config.failStatus && failuresLeft > 0) {
        failuresLeft -= 1;
        send(config.failStatus, { error: { code: config.failStatus, message: 'mock failure', status: 'UNAVAILABLE' } });
        return;
      }
      if (config.special === 'empty') {
        send(200, { candidates: [] });
        return;
      }
      if (config.special === 'blocked') {
        send(200, { promptFeedback: { blockReason: 'SAFETY' } });
        return;
      }
      send(200, {
        candidates: [{ content: { parts: [{ text: answerFor(info, prompt, config.special) }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: Math.round(prompt.length / 4), candidatesTokenCount: 60 },
      });
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    origin: `http://127.0.0.1:${port}`,
    validKey,
    requests,
    /** Change behaviour. failTimes may be Infinity. special: 'empty' | 'blocked' | 'html' | null */
    configure(next) {
      config = { delayMs: 0, failStatus: null, failTimes: 0, special: null, ...next };
      failuresLeft = config.failTimes;
    },
    reset() {
      requests.length = 0;
      config = { delayMs: 0, failStatus: null, failTimes: 0, special: null };
      failuresLeft = 0;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
