import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Clone не запускает второй внешний retry поверх Gemini bridge deadline', async () => {
  const ai = await import('../src/ai.js');
  const primary = { model: 'gpt-5.6-sol', effort: 'medium' };
  const dialog = { model: 'gpt-5.6-terra', effort: 'low' };
  assert.equal(ai.shouldRetryWithDialog({ product: 'clone', mode: 'deep', primary, dialog }), false);
  assert.equal(ai.shouldRetryWithDialog({ product: 'herostar', mode: 'deep', primary, dialog }), true);
});

test('OpenAI SDK не перезапускает весь Gemini bridge для Clone', async () => {
  const ai = await read('src/ai.js');
  assert.match(ai, /maxRetries:\s*product === 'clone' \? 0 : 2/);
});

test('после отказа Gemini Clone возвращает локальный ответ по факторам карты', async () => {
  const ai = await read('src/ai.js');
  assert.match(ai, /localCloneFallback\(publicFactors\)/);
  assert.match(ai, /status: 'fallback'/);
  assert.match(ai, /не стал бы принимать окончательное решение вслепую/);
});

test('ошибка Live даёт повторить сохранённый вопрос одним нажатием', async () => {
  const client = await read('public/clone.js');
  const live = await read('public/clone/live/index.html');
  assert.match(client, /showAnswerRetry/);
  assert.match(client, /Повторить ответ/);
  assert.match(client, /form\.requestSubmit\(\)/);
  assert.match(client, /clone_answer_retry_clicked/);
  assert.match(live, /clone\.js\?v=20260914-recovery1/);
});
