import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPracticeMessage,
  pickNextPracticeCard,
  selectPracticeCards,
} from '../src/practice-notifications.js';

const portrait = {
  cards: [
    { id: 'sun', title: 'Солнце', action: 'Попробуйте сейчас: выбрать один свой приоритет', key: 'Опора на собственное решение' },
    { id: 'moon', title: 'Луна', action: 'Заметьте, что помогает восстановиться', key: 'Разрешить себе естественный ритм' },
    { id: 'mercury', title: 'Меркурий', action: 'Сформулируйте мысль одной фразой', key: 'Ясность через простые слова' },
  ],
};

test('Сонастройка использует полный набор карточек купленного паспорта', () => {
  const cards = selectPracticeCards(portrait, ['moon']);
  assert.deepEqual(cards.map((card) => card.id), ['sun', 'moon', 'mercury']);
});

test('без истории берётся первая практика полного паспорта', () => {
  const cards = selectPracticeCards(portrait, []);
  assert.deepEqual(cards.map((card) => card.id), ['sun', 'moon', 'mercury']);
});

test('следующая практика циклически меняет настройку клона', () => {
  const cards = selectPracticeCards(portrait, []);
  assert.equal(pickNextPracticeCard(cards, 'sun').id, 'moon');
  assert.equal(pickNextPracticeCard(cards, 'mercury').id, 'sun');
});

test('сообщение содержит ключевой момент и мини-задание без мистических обещаний', () => {
  const message = buildPracticeMessage(portrait.cards[0], 0);
  assert.match(message, /Сонастройка: Солнце/);
  assert.match(message, /Ключевой момент/);
  assert.match(message, /Мини-задание/);
  assert.match(message, /выбрать один свой приоритет/i);
  assert.doesNotMatch(message, /Попробуйте сейчас:/i);
  assert.match(message, /подошло|частично|не подошло/i);
  assert.doesNotMatch(message, /подарк|вселенн/i);
});
