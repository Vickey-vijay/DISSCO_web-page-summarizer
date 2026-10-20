// Runs inside a Web Worker started by offscreen.js. WebLLM's handler does the heavy work
// (tokenizing, running the model on the graphics card) so the offscreen page stays responsive.
import { WebWorkerMLCEngineHandler } from '../lib/web-llm.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message) => handler.onmessage(message);
