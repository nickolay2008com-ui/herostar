import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consultationMode,
  normalizeReasoningEffort,
  resolveConsultationConfig,
} from '../src/ai.js';

test('первый содержательный запрос идёт в глубокий режим', () => {
  assert.equal(consultationMode([]), 'deep');
  assert.equal(consultationMode([{ role: 'system', content: 'служебное сообщение' }]), 'deep');
});

test('последующие реплики идут в быстрый диалоговый режим', () => {
  assert.equal(consultationMode([{ role: 'user', content: 'Что со мной происходит?' }]), 'dialog');
  assert.equal(consultationMode([{ role: 'assistant', content: 'Начнём с главного.' }]), 'dialog');
});

test('конфигурация использует две независимые модели и reasoning effort', () => {
  const config = resolveConsultationConfig({
    OPENAI_MODEL: 'gpt-5.6-terra',
    OPENAI_MODEL_DEEP: 'gpt-5.6-sol',
    OPENAI_REASONING_DIALOG: 'low',
    OPENAI_REASONING_DEEP: 'medium',
  });

  assert.deepEqual(config.dialog, {
    model: 'gpt-5.6-terra',
    effort: 'low',
    maxOutputTokens: 1000,
  });
  assert.deepEqual(config.deep, {
    model: 'gpt-5.6-sol',
    effort: 'medium',
    maxOutputTokens: 1800,
  });
});

test('неверный reasoning effort безопасно заменяется значением по умолчанию', () => {
  assert.equal(normalizeReasoningEffort('turbo', 'low'), 'low');
  assert.equal(normalizeReasoningEffort(' HIGH ', 'low'), 'high');
});
