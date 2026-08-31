import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../src/gemini-openai-bridge.js', import.meta.url), 'utf8');

test('Live clone defaults to current strongest free-tier Flash with stable fallback', () => {
  assert.match(bridge, /GEMINI_PRIMARY_MODEL\s*=\s*'gemini-3\.7-flash'/);
  assert.match(bridge, /GEMINI_FALLBACK_MODEL\s*=\s*'gemini-3\.5-flash'/);
});

test('primary Gemini 3 keeps high thinking while fallback uses medium for recovery', () => {
  assert.match(bridge, /thinkingLevel:\s*fallback \? 'medium' : 'high'/);
});

test('paid Gemini 3.1 Pro can still be explicitly enabled later', () => {
  assert.match(bridge, /GEMINI_MODEL_FORCE/);
});
