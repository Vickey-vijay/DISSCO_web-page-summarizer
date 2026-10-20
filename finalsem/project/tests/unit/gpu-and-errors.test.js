import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseModel, evaluateGpu, mapInitProgress } from '../../src/core/gpu-check.js';
import { classifyEngineError } from '../../src/core/engine-errors.js';
import { MODELS } from '../../src/core/config.js';

const adapter = (features = ['shader-f16'], info = { vendor: 'nvidia', architecture: 'ampere' }) => ({
  features: new Set(features),
  info,
});

// ---- the graphics-card check --------------------------------------------------------------------

test('no WebGPU API at all is NO_WEBGPU', () => {
  const r = evaluateGpu({ hasGpuApi: false, adapter: null });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NO_WEBGPU');
});

test('the API exists but no adapter is NO_WEBGPU', () => {
  assert.equal(evaluateGpu({ hasGpuApi: true, adapter: null }).code, 'NO_WEBGPU');
});

test('an adapter without shader-f16 is NO_SHADER_F16', () => {
  assert.equal(evaluateGpu({ hasGpuApi: true, adapter: adapter([]) }).code, 'NO_SHADER_F16');
});

test('a good adapter passes and reports vendor and architecture', () => {
  const r = evaluateGpu({ hasGpuApi: true, adapter: adapter() });
  assert.deepEqual(r, { ok: true, f16: true, vendor: 'nvidia', architecture: 'ampere' });
});

// ---- which model --------------------------------------------------------------------------------

test('the primary model is chosen on a normal computer', () => {
  assert.equal(chooseModel({ deviceMemoryGB: 8 }).id, MODELS.primary.id);
  assert.equal(chooseModel({}).id, MODELS.primary.id);
});

test('a small machine (under 8 GB) or an earlier failure chooses the smaller model', () => {
  assert.equal(chooseModel({ deviceMemoryGB: 4 }).id, MODELS.fallback.id);
  assert.equal(chooseModel({ deviceMemoryGB: 16, override: 'fallback' }).id, MODELS.fallback.id);
});

// ---- progress text from WebLLM ------------------------------------------------------------------

test('mapInitProgress tells downloading from loading and clamps the percentage', () => {
  assert.deepEqual(mapInitProgress({ progress: 0.1, text: 'Fetching param cache[4/22]: 73MB fetched. 10% completed' }).phase, 'downloading');
  assert.equal(mapInitProgress({ progress: 0.1, text: 'Fetching param cache[4/22]' }).percent, 10);
  assert.equal(mapInitProgress({ progress: 0.65, text: 'Loading model from cache[13/22]: 433MB loaded.' }).phase, 'loading');
  assert.equal(mapInitProgress({ progress: 7, text: 'Loading GPU shader modules' }).percent, 100);
  // WebLLM's very first message is "Start to fetch params": that is already the download
  assert.equal(mapInitProgress({ progress: 0, text: 'Start to fetch params' }).phase, 'downloading');
  assert.equal(mapInitProgress(undefined).percent, 0);
});

// ---- error classification -----------------------------------------------------------------------

test('engine errors become the right code', () => {
  assert.equal(classifyEngineError(new Error('Failed to fetch'), 'load'), 'MODEL_DOWNLOAD_FAILED');
  assert.equal(classifyEngineError(new Error('net::ERR_INTERNET_DISCONNECTED while fetching'), 'load'), 'MODEL_DOWNLOAD_FAILED');
  assert.equal(classifyEngineError(new Error('GPUOutOfMemory: out of memory'), 'load'), 'GPU_MEMORY');
  assert.equal(classifyEngineError(new Error('Device was lost'), 'generate'), 'GPU_MEMORY');
  assert.equal(classifyEngineError(new Error('shader-f16 feature is not supported by this adapter'), 'load'), 'NO_SHADER_F16');
  assert.equal(classifyEngineError(new Error('WebGPU is not supported in this environment'), 'load'), 'NO_WEBGPU');
  assert.equal(classifyEngineError(new Error('something strange'), 'load'), 'MODEL_LOAD_FAILED');
  assert.equal(classifyEngineError(new Error('something strange'), 'generate'), 'SERVICE_ERROR');
});

test('a network word during generation is not a download failure', () => {
  assert.equal(classifyEngineError(new Error('network exploded'), 'generate'), 'SERVICE_ERROR');
});
