import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_FALLBACK_TIMEOUT_MS,
  GEMINI_PRIMARY_MODEL,
  GEMINI_PRIMARY_TIMEOUT_MS,
  LIVE_AI_DEADLINE_MS,
  resolveGeminiModel,
} from '../src/gemini-openai-bridge.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live clone использует Gemini 3.7 Flash как основной актуальный quality-first вариант', () => {
  assert.equal(GEMINI_PRIMARY_MODEL, 'gemini-3.7-flash');
  assert.equal(resolveGeminiModel({}), 'gemini-3.7-flash');
});

test('старые Gemini model env не могут случайно откатить публичный тест на устаревший Flash', () => {
  assert.equal(resolveGeminiModel({
    GEMINI_MODEL: 'gemini-2.5-flash',
    GEMINI_MODEL_LIVE: 'gemini-2.5-flash',
    GEMINI_MODEL_DEEP: 'gemini-2.5-flash',
  }), 'gemini-3.7-flash');
});

test('явный paid-tier override остаётся доступен, а резерв — Gemini 3.5 Flash', () => {
  assert.equal(resolveGeminiModel({ GEMINI_MODEL_FORCE: 'gemini-3.1-pro-preview' }), 'gemini-3.1-pro-preview');
  assert.equal(GEMINI_FALLBACK_MODEL, 'gemini-3.5-flash');
});

test('primary сохраняет high thinking, а fallback ускоряется до medium', async () => {
  const source = await read('src/gemini-openai-bridge.js');
  assert.match(source, /thinkingLevel:\s*fallback \? 'medium' : 'high'/);
  assert.doesNotMatch(source, /temperature\s*:/);
});

test('Live AI укладывает primary и fallback в Railway-safe deadline', () => {
  assert.equal(GEMINI_PRIMARY_TIMEOUT_MS, 22000);
  assert.equal(GEMINI_FALLBACK_TIMEOUT_MS, 9000);
  assert.equal(LIVE_AI_DEADLINE_MS, 35000);
  assert.ok(GEMINI_PRIMARY_TIMEOUT_MS + GEMINI_FALLBACK_TIMEOUT_MS < LIVE_AI_DEADLINE_MS);
  assert.ok(LIVE_AI_DEADLINE_MS < 39000);
});

test('OpenAI fallback получает только остаток общего Live deadline', async () => {
  const source = await read('src/gemini-openai-bridge.js');
  assert.match(source, /const openAiBudget = remainingDeadlineMs\(startedAt\)/);
  assert.match(source, /signal: AbortSignal\.timeout\(openAiBudget\)/);
});
