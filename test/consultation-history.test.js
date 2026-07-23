import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCloneHistory, historyForProduct } from '../src/consultation-history.js';

const messages = [
  { role: 'user', content: 'Обычный вопрос', metadata: { product: 'herostar' } },
  { role: 'assistant', content: 'Обычный ответ', metadata: { product: 'herostar' } },
  { role: 'user', content: 'Вопрос клону', metadata: { product: 'clone' } },
  { role: 'assistant', content: 'Ответ клона', metadata: { product: 'clone' } },
  { role: 'user', content: 'Незавершённый вопрос', metadata: { product: 'clone' } },
];

test('история клона содержит только завершённые пары вопрос–ответ', () => {
  assert.deepEqual(extractCloneHistory(messages).map((item) => item.content), ['Вопрос клону', 'Ответ клона']);
});

test('обычная консультация не получает сообщения Звёздного клона', () => {
  assert.deepEqual(historyForProduct(messages, 'herostar').map((item) => item.content), ['Обычный вопрос', 'Обычный ответ']);
});
