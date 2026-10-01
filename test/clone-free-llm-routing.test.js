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

test('Free keeps Olli 900-token reservation while Gemini keeps the HeroStar output budget', async () => {
  let freeMaxOutputTokens = null;
  let geminiMaxOutputTokens = null;
  const result = await generateCloneAi({
    instructions: 'System',
    input: [{ role: 'user', content: 'Hello' }],
    maxOutputTokens: 1800,
    freeLlm: async ({ maxOutputTokens }) => {
      freeMaxOutputTokens = maxOutputTokens;
      throw Object.assign(new Error('free down'), { code: 'free_down' });
    },
    gemini: async ({ maxOutputTokens }) => {
      geminiMaxOutputTokens = maxOutputTokens;
      return { text: 'gemini answer', model: 'gemini-3.7-flash' };
    },
  });

  assert.equal(freeMaxOutputTokens, 900);
  assert.equal(geminiMaxOutputTokens, 1800);
  assert.equal(result.text, 'gemini answer');
  assert.equal(result.provider, 'gemini');
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


test('Free receives compact Clone context while Gemini keeps the full original payload', async () => {
  const originalInput = [{
    role: 'user',
    content: JSON.stringify({
      mode: 'deep',
      product: 'clone',
      consultationProfile: { id: 'clone-free-v1', promptVersion: 'v1' },
      chart: { system: 'Плацидус', scope: 'full', planets: Array.from({ length: 10 }, (_, i) => ({ key: `p${i}` })) },
      selectedFactors: [{ id: 'planet:venus', role: 'релевантный фактор' }],
      portrait: { cards: Array.from({ length: 11 }, (_, i) => ({ id: i, text: 'large portrait card' })) },
      history: [{ role: 'user', content: 'Раньше мы говорили о выборе' }],
      question: 'Инструкция профиля. Ситуация: какой вариант выбрать?',
      externalContext: null,
    }),
  }];

  let freeArgs = null;
  let geminiArgs = null;

  const result = await generateCloneAi({
    instructions: 'Полная chart передана как фон для понимания положений и связей. Остальные правила.',
    input: originalInput,
    maxOutputTokens: 1800,
    freeLlm: async (args) => {
      freeArgs = args;
      throw Object.assign(new Error('free down'), { code: 'free_down' });
    },
    gemini: async (args) => {
      geminiArgs = args;
      return { text: 'gemini answer', model: 'gemini-3.7-flash' };
    },
  });

  const freePayload = JSON.parse(freeArgs.input[0].content);
  assert.equal('chart' in freePayload, false);
  assert.equal('portrait' in freePayload, false);
  assert.deepEqual(freePayload.selectedFactors, [{ id: 'planet:venus', role: 'релевантный фактор' }]);
  assert.deepEqual(freePayload.history, [{ role: 'user', content: 'Раньше мы говорили о выборе' }]);
  assert.equal(freePayload.chartContext.system, 'Плацидус');
  assert.doesNotMatch(freeArgs.instructions, /Полная chart передана/);

  assert.deepEqual(geminiArgs.input, originalInput);
  assert.equal(geminiArgs.instructions, 'Полная chart передана как фон для понимания положений и связей. Остальные правила.');
  assert.equal(result.provider, 'gemini');
});


test('Free LLM receives the compact two-layer answer style without changing Gemini instructions', async () => {
  let freeInstructions = '';
  let geminiInstructions = '';

  const result = await generateCloneAi({
    instructions: 'Полная chart передана как фон для понимания положений и связей. Базовые правила.',
    input: [{
      role: 'user',
      content: JSON.stringify({
        mode: 'deep',
        product: 'clone',
        selectedFactors: [{ id: 'planet:venus', role: 'важный фактор' }],
        history: [],
        question: 'Какой формат работы выбрать?',
      }),
    }],
    maxOutputTokens: 1800,
    freeLlm: async ({ instructions }) => {
      freeInstructions = instructions;
      throw Object.assign(new Error('free down'), { code: 'free_down' });
    },
    gemini: async ({ instructions }) => {
      geminiInstructions = instructions;
      return { text: 'gemini answer', model: 'gemini-3.7-flash' };
    },
  });

  assert.match(freeInstructions, /Что проверить первым:/);
  assert.match(freeInstructions, /Markdown-разметки/i);
  assert.match(freeInstructions, /2–4 коротких предложения/);
  assert.match(freeInstructions, /не перечисляй дома, градусы, аспекты/i);
  assert.equal(
    geminiInstructions,
    'Полная chart передана как фон для понимания положений и связей. Базовые правила.',
  );
  assert.equal(result.provider, 'gemini');
});
