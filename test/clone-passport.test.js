import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClonePassport } from '../src/clone-passport.js';

const chart = {
  person: { name: 'Николай Звёздный' },
  planets: [
    { key: 'sun', name: 'Солнце', sign: 'Скорпионе', house: 3, element: 'Вода', symbol: '☉' },
    { key: 'moon', name: 'Луна', sign: 'Тельце', house: 10, element: 'Земля', symbol: '☽' },
    { key: 'mars', name: 'Марс', sign: 'Весах', house: 2, element: 'Воздух', symbol: '♂' },
  ],
  angles: {
    ascendant: { sign: 'Деве' },
    mc: { sign: 'Тельце' },
  },
};

const portrait = {
  cards: [
    { id: 'sun', key: 'Собирать смысл', action: 'Ваш ход: назвать главный приоритет' },
    { id: 'moon', key: 'Возвращаться к устойчивости', action: 'Заметьте телесную реакцию' },
    { id: 'mars', key: 'Действовать через согласование', action: 'Первый ход: сформулировать условия' },
  ],
  synthesis: {
    strengths: ['Глубина', 'Устойчивость'],
    tensions: ['Не затягивать решение'],
    route: ['Проверить условия', 'Сделать обратимый шаг'],
  },
};

test('Паспорт клона создаёт персональный аватар без внешнего генератора', () => {
  const passport = buildClonePassport(chart, portrait);
  assert.equal(passport.version, 'clone-passport-v1');
  assert.equal(passport.avatar.initials, 'НЗ');
  assert.equal(passport.avatar.symbol, '☉');
  assert.match(passport.avatar.signature, /Скорпионе.*Тельце.*ASC Деве/);
  assert.equal(passport.avatar.element, 'Воздух');
  assert.ok(passport.avatar.gradient.from);
  assert.ok(passport.avatar.gradient.to);
});

test('Паспорт объясняет базовые настройки и применение, не подменяя решение человека', () => {
  const passport = buildClonePassport(chart, portrait);
  assert.deepEqual(passport.sections.map((section) => section.id), ['identity', 'reaction', 'action', 'entry', 'result']);
  assert.match(passport.sections.find((section) => section.id === 'action').application, /сформулировать условия/i);
  assert.doesNotMatch(passport.sections.find((section) => section.id === 'action').application, /Первый ход:/i);
  assert.match(passport.disclaimer, /не приказ человеку/i);
  assert.doesNotMatch(JSON.stringify(passport), /подарк|вселенн/i);
});
