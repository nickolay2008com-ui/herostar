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
    key, name, sign, oppositeSign: opposites[sign], degreeLabel: '10°00′',
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

test('каждая карточка содержит полную редакционную матрицу', () => {
  const portrait = buildFallbackPortrait(chart());
  const required = ['function', 'sign', 'house', 'lifeScenario', 'contrast', 'trap', 'key', 'action', 'button'];
  for (const card of portrait.cards) {
    assert.deepEqual(Object.keys(card.matrix), required);
    assert.ok(card.buttonLabel);
  }
});

test('неизвестное время не создаёт вымышленные дома', () => {
  const portrait = buildFallbackPortrait(chart({ unknownTime: true }));
  for (const card of portrait.cards) {
    assert.match(card.manifestation, /не указано/i);
    assert.equal(card.evidence[1], 'Дома не рассчитаны');
  }
});

test('синтез содержит формулу, конфликт и практический маршрут', () => {
  const portrait = buildFallbackPortrait(chart());
  assert.match(portrait.synthesis.formula, /Центр/);
  assert.match(portrait.synthesis.conflict, /Солнце/);
  assert.ok(portrait.synthesis.route.length >= 4);
  assert.ok(portrait.synthesis.route.every((step) => step.length > 20));
});
