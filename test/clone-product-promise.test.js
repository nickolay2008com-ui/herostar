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

test('live прямо называет Клона персональной подсказкой для жизненных решений', async () => {
  const source = await read('public/clone/live/index.html');
  assert.match(source, /Персональная подсказка для жизненных решений по вашей натальной карте/);
  assert.doesNotMatch(source, /не (?:принимает|заменяет).*решени|не решение за/i);
});

test('первое сообщение Клона раскрывает подсказку как другой взгляд на решение', async () => {
  const source = await read('public/clone/live/index.html');
  assert.match(source, /Это персональная подсказка, которая помогает взглянуть на решение с другой стороны\./);
});

test('платный профиль превращает обещание 3–6 факторов в полный разбор решения', async () => {
  const source = await read('src/consultation-profiles.js');
  assert.match(source, /promptVersion: '2026-08-31\.energy-interpretation-v2'/);
  assert.match(source, /derivedFromPromptVersion: '2026-08-31\.energy-interpretation-v1'/);
  assert.match(source, /promptVersion: '2026-08-31\.energy-interpretation-premium-v2'/);
  assert.match(source, /derivedFromPromptVersion: '2026-08-31\.energy-interpretation-v2'/);
  assert.match(source, /const clonePremiumQuestionInstruction = `\$\{cloneFreeQuestionInstruction\.replace/);
  assert.match(source, /3–6 наиболее значимых факторов карты/);
  assert.match(source, /полную картину одного решения или внутренней динамики/);
  assert.match(source, /главное внутреннее противоречие или баланс энергий/);
  assert.match(source, /альтернативный ход или альтернативное проявление/);
  assert.match(source, /конкретное условие, при котором вывод изменится/);
  assert.match(source, /первый проверяемый шаг/);
  assert.match(source, /действие: если вопрос требует решения, есть ли ясный ход/);
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
