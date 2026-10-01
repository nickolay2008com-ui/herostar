import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_FALLBACK_TIMEOUT_MS,
  GEMINI_PRIMARY_MODEL,
  GEMINI_PRIMARY_TIMEOUT_MS,
  GEMINI_PROVIDER_DEADLINE_MS,
  resolveGeminiModel,
} from '../src/gemini-clone.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live clone uses Gemini 3.7 Flash as the primary Gemini fallback provider', () => {
  assert.equal(GEMINI_PRIMARY_MODEL, 'gemini-3.7-flash');
  assert.equal(resolveGeminiModel({}), 'gemini-3.7-flash');
});

test('old Gemini env names cannot silently downgrade the Clone fallback model', () => {
  assert.equal(resolveGeminiModel({
    GEMINI_MODEL: 'gemini-2.5-flash',
    GEMINI_MODEL_LIVE: 'gemini-2.5-flash',
    GEMINI_MODEL_DEEP: 'gemini-2.5-flash',
  }), 'gemini-3.7-flash');
});

test('explicit paid-tier override stays available while Gemini 3.5 Flash remains the reserve', () => {
  assert.equal(resolveGeminiModel({ GEMINI_MODEL_FORCE: 'gemini-3.1-pro-preview' }), 'gemini-3.1-pro-preview');
  assert.equal(GEMINI_FALLBACK_MODEL, 'gemini-3.5-flash');
});

test('primary Gemini keeps medium thinking and its reserve uses low', async () => {
  const source = await read('src/gemini-clone.js');
  assert.match(source, /thinkingLevel:\s*fallback \? 'low' : 'medium'/);
  assert.doesNotMatch(source, /temperature\s*:/);
});

test('Gemini fallback provider stays inside its bounded deadline', () => {
  assert.equal(GEMINI_PRIMARY_TIMEOUT_MS, 18000);
  assert.equal(GEMINI_FALLBACK_TIMEOUT_MS, 8000);
  assert.equal(GEMINI_PROVIDER_DEADLINE_MS, 24000);
  assert.ok(GEMINI_PROVIDER_DEADLINE_MS < 39000);
});

test('Gemini provider contains no OpenAI fallback path', async () => {
  const source = await read('src/gemini-clone.js');
  assert.doesNotMatch(source, /api\.openai\.com|openAiBudget|OPENAI_API_KEY/);
});
