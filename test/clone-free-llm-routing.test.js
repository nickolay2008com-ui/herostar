import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCloneAi } from '../src/clone-ai-provider.js';

test('Free LLM is primary and Gemini is not called when Free succeeds', async () => {
  let geminiCalls = 0;
  const result = await generateCloneAi({
    instructions: 'System',
    input: [{ role: 'user', content: 'Hello' }],
    maxOutputTokens: 900,
    freeLlm: async () => ({
      text: 'free answer',
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
    }),
    gemini: async () => {
      geminiCalls += 1;
      return { text: 'gemini answer', model: 'gemini-3.7-flash' };
    },
  });

  assert.equal(result.text, 'free answer');
  assert.equal(result.provider, 'free:groq');
  assert.equal(geminiCalls, 0);
});

test('Gemini is used only after Free LLM fails', async () => {
  let geminiCalls = 0;
  const result = await generateCloneAi({
    instructions: 'System',
    input: [{ role: 'user', content: 'Hello' }],
    maxOutputTokens: 900,
    freeLlm: async () => {
      throw Object.assign(new Error('free down'), { code: 'free_down' });
    },
    gemini: async () => {
      geminiCalls += 1;
      return { text: 'gemini answer', model: 'gemini-3.7-flash' };
    },
  });

  assert.equal(result.text, 'gemini answer');
  assert.equal(result.provider, 'gemini');
  assert.equal(geminiCalls, 1);
});

test('Free and Gemini failure returns unavailable and never needs OpenAI', async () => {
  const result = await generateCloneAi({
    instructions: 'System',
    input: [{ role: 'user', content: 'Hello' }],
    freeLlm: async () => {
      throw new Error('free down');
    },
    gemini: async () => {
      throw new Error('gemini down');
    },
  });

  assert.deepEqual(result, {
    text: '',
    provider: null,
    model: null,
    status: 'unavailable',
  });
});
