// Starts, talks to, and closes the offscreen page that hosts the model. Lives in the service
// worker. `api` is the chrome object (a fake in tests).
//
//  - one offscreen page at a time; created on first use
//  - answers are sent one at a time (the graphics card does one job at a time)
//  - closed after idleCloseMs without work, which frees about a gigabyte of graphics memory;
//    the downloaded model stays in the browser, so reopening only has to load it again
const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

/**
 * @param {{api?: typeof chrome, getSettings: () => Promise<{engineMode: string, idleCloseMs: number}>}} options
 */
export function createOffscreenManager({ api = globalThis.chrome, getSettings }) {
  const listeners = new Set();
  let closeTimer = null;
  let generateChain = Promise.resolve();
  let creating = null;

  async function pageUrl() {
    const { engineMode } = await getSettings();
    const path = api.runtime.getURL(OFFSCREEN_PATH);
    // Test seam: "mock" or "mock:<mode>" starts the fake model instead of the real one.
    if (typeof engineMode === 'string' && engineMode.startsWith('mock')) {
      const mode = engineMode.split(':')[1] ?? 'ok';
      const { mockDelayMs } = await api.storage.local.get('mockDelayMs');
      return `${path}?mock=${encodeURIComponent(mode)}&delay=${Number(mockDelayMs) || 0}`;
    }
    return path;
  }

  async function ensure() {
    if (creating) return creating;
    const contexts = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) return undefined;
    creating = (async () => {
      await api.offscreen.createDocument({
        url: await pageUrl(),
        reasons: ['WORKERS'],
        justification: 'Runs the local language model (WebGPU) in a worker, in a page that stays alive',
      });
    })().finally(() => {
      creating = null;
    });
    return creating;
  }

  async function scheduleIdleClose() {
    clearTimeout(closeTimer);
    const { idleCloseMs } = await getSettings();
    closeTimer = setTimeout(() => void close(), idleCloseMs);
  }

  async function close() {
    clearTimeout(closeTimer);
    const contexts = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) await api.offscreen.closeDocument();
  }

  /** Send one message to the offscreen page and wait for its answer. */
  async function send(message) {
    await ensure();
    clearTimeout(closeTimer);
    const run = () => api.runtime.sendMessage(message);
    try {
      // Answers are generated one at a time, in the order they were asked.
      const result = message.type === 'LOCAL_GENERATE' ? (generateChain = generateChain.then(run, run)) : run();
      return await result;
    } finally {
      void scheduleIdleClose();
    }
  }

  return {
    send,
    close,
    /** Called by the service worker for every MODEL_PROGRESS message the offscreen page sends. */
    emitProgress(progress) {
      for (const listener of listeners) listener(progress);
    },
    /** Subscribe to progress while a job is preparing the model. Returns the unsubscribe function. */
    onProgress(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
