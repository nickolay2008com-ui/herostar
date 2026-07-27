import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('live использует реальные серверные цифры', async () => {
  const [server, html, stats] = await Promise.all([
    read('server.js'),
    read('public/clone/live/index.html'),
    read('public/clone/live/live-stats.js'),
  ]);
  assert.match(server, /app\.get\('\/api\/public\/stats'/);
  assert.match(server, /getAdminOverview\(7\)/);
  assert.match(html, /id="liveRealStats"/);
  assert.match(stats, /fetch\('\/api\/public\/stats'/);
  assert.match(stats, /if \(!total && !recent\) return/);
});

test('бесплатное и платное обещание образуют одну лестницу ценности', async () => {
  const source = `${await read('public/clone/live/index.html')}
${await read('public/clone.js')}`;
  assert.match(source, /главн(?:ый|ое) ход/i);
  assert.match(source, /3–6 значимых факторов/);
  assert.match(source, /альтернативн(?:ый|ые) ход/i);
  assert.match(source, /услови(?:е|я).*решени/i);
});

test('платный профиль превращает обещание 3–6 факторов в полный разбор решения', async () => {
  const source = await read('src/consultation-profiles.js');
  assert.match(source, /promptVersion: '2026-07-23\.1145-five'/);
  assert.match(source, /derivedFromPromptVersion: '2026-07-23\.1145'/);
  assert.match(source, /promptVersion: '2026-07-27\.full-decision-v1'/);
  assert.match(source, /derivedFromPromptVersion: '2026-07-23\.1145-five'/);
  assert.match(source, /const clonePremiumQuestionInstruction = `\$\{cloneFreeQuestionInstruction\.replace/);
  assert.match(source, /3–6 конкретных факторов карты/);
  assert.match(source, /полную картину одного решения/);
  assert.match(source, /главное внутреннее противоречие/);
  assert.match(source, /жизнеспособный альтернативный ход/);
  assert.match(source, /условие, при котором решение изменится/);
  assert.match(source, /первый проверяемый шаг/);
  assert.match(source, /действие: есть ли ясный ход/);
  assert.match(source, /гармония и красота/);
  assert.match(source, /ответственность и включённость/);
  assert.match(source, /единство/);
  assert.match(source, /уникальность/);
  assert.match(source, /factorBudget: Object\.freeze\(\{ min: 2, max: 4 \}\)/);
  assert.match(source, /factorBudget: Object\.freeze\(\{ min: 3, max: 6 \}\)/);
  assert.match(source, /historyLimit: 8/);
  assert.match(source, /historyLimit: 16/);
});

test('первый ответ не получает универсальные кнопки, которые спорят с вопросом Клона', async () => {
  const source = await read('public/clone/live/live.js');
  assert.match(source, /Первый ответ вашего Клона/);
  assert.match(source, /Клон ответит по имеющимся данным/);
  assert.doesNotMatch(source, /Уточнить решение:/);
  assert.doesNotMatch(source, /Показать главный риск/);
  assert.doesNotMatch(source, /Выбрать сильнейший ход/);
  assert.doesNotMatch(source, /Что изменит решение/);
  assert.doesNotMatch(source, /clone-next-actions/);
});
