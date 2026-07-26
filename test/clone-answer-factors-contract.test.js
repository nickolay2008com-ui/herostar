import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../public/clone.js', import.meta.url), 'utf8');
const liveHtml = readFileSync(new URL('../public/clone/live/index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('API сохраняет и возвращает факторный след ответа', () => {
  assert.match(server, /answerConsultationWithFactors/);
  assert.match(server, /const factors = product === 'clone'/);
  assert.match(server, /assistantMessageMetadata[\s\S]*factors, factorScope/);
  assert.match(server, /res\.json\(\{[\s\S]*factors,[\s\S]*factorScope/);
});

test('клиент показывает факторы конкретного ответа, а не статическую четвёрку карты', () => {
  assert.match(client, /renderAnswerFactors\(data\.factors/);
  assert.match(client, /item\.metadata\?\.factors/);
  assert.match(client, /data-factor-id/);
  assert.doesNotMatch(client, /Способ, которым клон переходит от оценки ситуации к действию/);
});

test('live-форма поддерживает честный режим неизвестного времени', () => {
  assert.match(liveHtml, /id="unknownTime"/);
  assert.match(liveHtml, /дома, ASC\/MC и Луна/);
  assert.match(client, /input\[name=\"unknownTime\"\]:checked/);
  assert.match(client, /time: unknownTime \? '' : birthTime/);
  assert.match(client, /time\.required = !unknown/);
});
