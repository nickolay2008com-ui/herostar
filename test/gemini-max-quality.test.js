import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
  resolveGeminiModel,
} from '../src/gemini-openai-bridge.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live clone использует Gemini 3.1 Pro Preview как основной quality-first вариант', () => {
  assert.equal(GEMINI_PRIMARY_MODEL, 'gemini-3.1-pro-preview');
  assert.equal(resolveGeminiModel({}), 'gemini-3.1-pro-preview');
});

test('старые Gemini model env не могут случайно откатить публичный тест на 2.5 Flash', () => {
  assert.equal(resolveGeminiModel({
    GEMINI_MODEL: 'gemini-2.5-flash',
    GEMINI_MODEL_LIVE: 'gemini-2.5-flash',
    GEMINI_MODEL_DEEP: 'gemini-2.5-flash',
  }), 'gemini-3.1-pro-preview');
});

test('явный аварийный override остаётся доступен, а резерв — Gemini 3.7 Flash', () => {
  assert.equal(resolveGeminiModel({ GEMINI_MODEL_FORCE: 'gemini-3.1-pro-preview-customtools' }), 'gemini-3.1-pro-preview-customtools');
  assert.equal(GEMINI_FALLBACK_MODEL, 'gemini-3.7-flash');
});

test('Gemini 3 получает high thinking без заниженной temperature и с увеличенным timeout', async () => {
  const source = await read('src/gemini-openai-bridge.js');
  assert.match(source, /thinkingConfig\s*=\s*\{ thinkingLevel: 'high' \}/);
  assert.match(source, /GEMINI_TIMEOUT_MS \|\| 90000/);
  assert.doesNotMatch(source, /temperature\s*:/);
});
