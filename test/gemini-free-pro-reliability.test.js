import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../src/gemini-openai-bridge.js', import.meta.url), 'utf8');

test('Live clone defaults to strongest Pro model available on Gemini API free tier', () => {
  assert.match(bridge, /GEMINI_PRIMARY_MODEL\s*=\s*'gemini-2\.5-pro'/);
  assert.match(bridge, /GEMINI_FALLBACK_MODEL\s*=\s*'gemini-2\.5-flash'/);
});

test('Gemini 2.5 Pro uses high reasoning budget while Gemini 3 override keeps high thinking level', () => {
  assert.match(bridge, /thinkingBudget:\s*24576/);
  assert.match(bridge, /thinkingLevel:\s*'high'/);
});

test('paid Gemini 3.1 Pro can still be explicitly enabled later', () => {
  assert.match(bridge, /GEMINI_MODEL_FORCE/);
});
