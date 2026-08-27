import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function presentation() {
  const source = await readFile(new URL('../public/clone-answer-presentation.js', import.meta.url), 'utf8');
  const context = {};
  vm.runInNewContext(source, context);
  return context.HeroStarAnswerPresentation;
}

test('видимый ответ убирает технический абзац со скриншота за значок', async () => {
  const { displayCloneAnswer } = await presentation();
  const raw = `Ваш звёздный клон, вероятнее всего, выбрал бы ход, который прямо отвечает на ситуацию и опирается на наиболее значимые факторы карты.

Почему: Куспид 5°15' — сфера текущей ситуации; Луна в Телец 15°46' · 9 дом; Юпитер в Овен 22°18' · 8 дом · ретроградность; тригон · орбис 2.1° — поддерживающая связь.

Итог модели: выбрать наиболее обоснованное действие и ясно понимать, какие факторы карты поддерживают этот ход.`;

  const visible = displayCloneAnswer(raw);
  assert.match(visible, /Ваш звёздный клон/);
  assert.match(visible, /выбрать наиболее обоснованное действие/);
  assert.doesNotMatch(visible, /Куспид|Луна в Телец|Юпитер в Овен|дом|ретроград|тригон|орбис|°/i);
  assert.doesNotMatch(visible, /Итог модели:/i);
});

test('обычное человеческое объяснение со словом «почему» остаётся в диалоге', async () => {
  const { displayCloneAnswer } = await presentation();
  const raw = 'Клон сначала уточнил бы условия.\n\nПочему: без ясной договорённости риск сейчас выше пользы.';
  assert.equal(displayCloneAnswer(raw), raw);
});

test('техническое предложение убирается и из смешанного абзаца', async () => {
  const { displayCloneAnswer } = await presentation();
  const raw = 'Клон сначала проверил бы условия. Луна в Тельце и тригон с Юпитером дают устойчивость. После проверки он выбрал бы обратимый шаг.';
  assert.equal(displayCloneAnswer(raw), 'Клон сначала проверил бы условия. После проверки он выбрал бы обратимый шаг.');
});

test('смысл до технической причины остаётся в одном предложении', async () => {
  const { displayCloneAnswer } = await presentation();
  assert.equal(
    displayCloneAnswer('Клон выбрал бы отложить решение, потому что Меркурий ретрограден.'),
    'Клон выбрал бы отложить решение.',
  );
  assert.equal(
    displayCloneAnswer('Клон выбрал бы отложить решение потому что Меркурий ретрограден.'),
    'Клон выбрал бы отложить решение.',
  );
  assert.equal(
    displayCloneAnswer('Клон из-за ретроградного Меркурия выбрал бы отложить решение.'),
    'Клон выбрал бы отложить решение.',
  );
});

test('технический объект заменяется нейтральной ссылкой без потери действия', async () => {
  const { displayCloneAnswer } = await presentation();
  assert.equal(
    displayCloneAnswer('Клон проверил бы 9-й дом и только потом принял решение.'),
    'Клон проверил бы это и только потом принял решение.',
  );
});

test('варианты дома и градуса не просачиваются, а обычное соединение остаётся', async () => {
  const { displayCloneAnswer } = await presentation();
  assert.equal(
    displayCloneAnswer('Клон сохранил бы соединение с командой. Плутон на 3 градусе и в девятом доме усиливает тему. Затем он проверил бы договорённости.'),
    'Клон сохранил бы соединение с командой. Затем он проверил бы договорённости.',
  );
  assert.doesNotMatch(displayCloneAnswer('Клон уточнил бы цель. Венера в 9-м доме задаёт контекст.'), /9-м доме/i);
  assert.doesNotMatch(displayCloneAnswer('Клон уточнил бы цель. Венера и 7-й дом задают контекст.'), /7-й дом/i);
  assert.equal(displayCloneAnswer('Клон проверил бы практический аспект проблемы и соединение с командой.'), 'Клон проверил бы практический аспект проблемы и соединение с командой.');
});

test('технический слой старой истории можно перенести в popover', async () => {
  const { technicalCloneDetails } = await presentation();
  const technical = technicalCloneDetails('Клон сначала проверил бы условия.\n\nПочему: Куспид 5°15′ и тригон с орбисом 2.1° поддерживают этот ход.');
  assert.match(technical, /Куспид/);
  assert.match(technical, /орбис/);
  assert.doesNotMatch(technical, /сначала проверил/);
});

test('полностью технический текст заменяется безопасным живым выводом', async () => {
  const { displayCloneAnswer } = await presentation();
  const visible = displayCloneAnswer('Почему: Куспид 11 дома 5°15′; тригон, орбис 2.1°.');
  assert.match(visible, /Клон выбрал бы/);
  assert.doesNotMatch(visible, /Куспид|тригон|орбис|°/i);
});
