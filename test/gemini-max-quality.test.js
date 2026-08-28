import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
  resolveGeminiModel,
} from '../src/gemini-openai-bridge.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live clone использует Gemini 2.5 Pro как основной доступный quality-first вариант', () => {
  assert.equal(GEMINI_PRIMARY_MODEL, 'gemini-2.5-pro');
  assert.equal(resolveGeminiModel({}), 'gemini-2.5-pro');
});

test('старые Gemini model env не могут случайно откатить публичный тест на Flash', () => {
  assert.equal(resolveGeminiModel({
    GEMINI_MODEL: 'gemini-2.5-flash',
    GEMINI_MODEL_LIVE: 'gemini-2.5-flash',
    GEMINI_MODEL_DEEP: 'gemini-2.5-flash',
  }), 'gemini-2.5-pro');
});

test('явный paid-tier override остаётся доступен, а резерв — Gemini 2.5 Flash', () => {
  assert.equal(resolveGeminiModel({ GEMINI_MODEL_FORCE: 'gemini-3.1-pro-preview' }), 'gemini-3.1-pro-preview');
  assert.equal(GEMINI_FALLBACK_MODEL, 'gemini-2.5-flash');
});

test('Pro получает high reasoning, Gemini 3 override сохраняет high thinking и увеличенный timeout', async () => {
  const source = await read('src/gemini-openai-bridge.js');
  assert.match(source, /thinkingBudget:\s*24576/);
  assert.match(source, /thinkingLevel:\s*'high'/);
  assert.match(source, /GEMINI_TIMEOUT_MS \|\| 90000/);
  assert.doesNotMatch(source, /temperature\s*:/);
});
