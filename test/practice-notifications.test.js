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

test('выбираются только уже открытые карточки', () => {
  const cards = selectPracticeCards(portrait, ['moon', 'mercury']);
  assert.deepEqual(cards.map((card) => card.id), ['moon', 'mercury']);
});

test('без истории берётся первая доступная практика', () => {
  const cards = selectPracticeCards(portrait, []);
  assert.deepEqual(cards.map((card) => card.id), ['sun']);
});

test('следующая практика циклически меняет открытую планету', () => {
  const cards = selectPracticeCards(portrait, ['sun', 'moon']);
  assert.equal(pickNextPracticeCard(cards, 'sun').id, 'moon');
  assert.equal(pickNextPracticeCard(cards, 'moon').id, 'sun');
});

test('сообщение содержит ресурс и небольшое действие без технического префикса', () => {
  const message = buildPracticeMessage(portrait.cards[0], 0);
  assert.match(message, /Практика по вашей карте: Солнце/);
  assert.match(message, /выбрать один свой приоритет/i);
  assert.doesNotMatch(message, /Попробуйте сейчас:/i);
  assert.match(message, /проверка, а не экзамен/i);
});
