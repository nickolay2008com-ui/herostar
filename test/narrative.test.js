import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackPortrait, CARD_ORDER } from '../src/narrative.js';

function makePoint(key, name, sign, house = null) {
  const opposites = {
    Овен: 'Весы', Телец: 'Скорпион', Близнецы: 'Стрелец', Рак: 'Козерог',
    Лев: 'Водолей', Дева: 'Рыбы', Весы: 'Овен', Скорпион: 'Телец',
    Стрелец: 'Близнецы', Козерог: 'Рак', Водолей: 'Лев', Рыбы: 'Дева',
  };
  return {
    key, name, sign, oppositeSign: opposites[sign], degree: 10, degreeLabel: '10°00′',
    house, houseArea: house ? `тестовая сфера ${house} дома` : null,
    retrograde: false,
  };
}

function chart({ unknownTime = false } = {}) {
  const signs = ['Скорпион', 'Телец', 'Весы', 'Стрелец', 'Весы', 'Овен', 'Козерог', 'Водолей', 'Рыбы', 'Скорпион'];
  const names = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Плутон'];
  const planets = CARD_ORDER.slice(0, 10).map((key, index) => makePoint(key, names[index], signs[index], unknownTime ? null : index + 1));
  return {
    person: { name: 'Герой' },
    system: unknownTime ? 'Без домов' : 'Равнодомная система',
    planets,
    northNode: makePoint('northNode', 'Северный узел', 'Овен', unknownTime ? null : 8),
    aspects: [{ fromName: 'Солнце', toName: 'Луна', symbol: '☍', tone: 'tension' }],
  };
}

test('v2.2 сохраняет контракт текущего интерфейса', () => {
  const portrait = buildFallbackPortrait(chart());
  assert.equal(portrait.version, '2.2-core');
  assert.deepEqual(portrait.cards.map((card) => card.id), CARD_ORDER);
  assert.equal(portrait.cards.length, 11);
  for (const card of portrait.cards) {
    for (const field of ['lead', 'manifestation', 'uniqueExample', 'contrast', 'trap', 'key', 'action']) {
      assert.equal(typeof card[field], 'string');
      assert.ok(card[field].length > 10, `${card.id}.${field} должен быть содержательным`);
    }
  }
});

test('карта ведёт новичка по понятным жизненным вопросам', () => {
  const portrait = buildFallbackPortrait(chart());
  const card = portrait.cards[0];
  assert.match(portrait.subtitle, /что в вас работает/i);
  assert.match(card.lead, /Что в вас работает/i);
  assert.match(card.lead, /Как именно/i);
  assert.match(card.manifestation, /Где это проявляется/i);
  assert.match(card.uniqueExample, /жизненный сюжет/i);
  assert.match(card.trap, /начинает мешать/i);
  assert.match(card.key, /Что возвращает силу/i);
  assert.match(card.action, /Попробуйте сейчас/i);
});

test('дом объясняет жизненную пользу человеческим языком', () => {
  const portrait = buildFallbackPortrait(chart());
  const mercury = portrait.cards.find((card) => card.id === 'mercury');
  const neptune = portrait.cards.find((card) => card.id === 'neptune');

  assert.match(mercury.manifestation, /как вы думаете, объясняете сложное, учитесь новому и общаетесь каждый день/i);
  assert.match(neptune.manifestation, /расширяет ваш горизонт/i);
  assert.doesNotMatch(mercury.manifestation, /переносит эту механику|в сферу «/i);
});

test('каждая карточка содержит полную редакционную матрицу', () => {
  const portrait = buildFallbackPortrait(chart());
  const required = ['function', 'sign', 'house', 'lifeScenario', 'contrast', 'trap', 'key', 'action', 'button'];
  for (const card of portrait.cards) {
    assert.deepEqual(Object.keys(card.matrix), required);
    assert.ok(card.buttonLabel);
  }
});

test('каждая карточка содержит глубокий практический разбор', () => {
  const portrait = buildFallbackPortrait(chart());
  for (const card of portrait.cards) {
    const guide = card.deepDive;
    assert.ok(guide.headline.length > 40, `${card.id}: нужен практический вопрос`);
    assert.ok(guide.purpose.length > 60, `${card.id}: нужна задача функции`);
    assert.deepEqual(Object.keys(guide.formula), ['planet', 'element', 'sign', 'house', 'mode', 'degree', 'motion']);
    assert.equal(guide.lifeExamples.length, 3);
    assert.ok(guide.lifeExamples.every((example) => example.title && example.text.length > 40));
    assert.ok(guide.states.resource.length > 40);
    assert.ok(guide.states.stress.length > 40);
    assert.ok(guide.states.return.length > 40);
    assert.equal(guide.elementComparison.length, 4);
    assert.equal(guide.elementComparison.filter((item) => item.current).length, 1);
    assert.equal(guide.distinguish.length, 3);
    assert.equal(guide.practice.steps.length, 3);
  }
});

test('марс в воздухе объясняет действие через слово, но не отменяет движение', () => {
  const portrait = buildFallbackPortrait(chart());
  const mars = portrait.cards.find((card) => card.id === 'mars');
  assert.match(mars.deepDive.formula.element.text, /мысль, слово|слово, сравнение/);
  assert.match(mars.deepDive.lifeExamples.map((item) => item.text).join(' '), /активность|выход|движение/i);
  assert.match(mars.deepDive.distinguish.find((item) => item.name === 'Меркурий').text, /решением и движением/);
});

test('неизвестное время не создаёт вымышленные дома', () => {
  const portrait = buildFallbackPortrait(chart({ unknownTime: true }));
  for (const card of portrait.cards) {
    assert.match(card.manifestation, /не указано/i);
    assert.equal(card.evidence[1], 'Дома не рассчитаны');
    assert.match(card.deepDive.formula.house.text, /не приписывает/i);
  }
});

test('синтез содержит формулу, конфликт и практический маршрут', () => {
  const portrait = buildFallbackPortrait(chart());
  assert.match(portrait.synthesis.formula, /Центр/);
  assert.match(portrait.synthesis.conflict, /Солнце/);
  assert.ok(portrait.synthesis.route.length >= 4);
  assert.ok(portrait.synthesis.route.every((step) => step.length > 20));
});
