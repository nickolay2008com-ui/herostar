import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutcomeKeyboard,
  buildPracticeKeyboard,
  buildPracticeMessage,
  buildWeeklySummary,
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

test('практика использует полный набор карточек купленного паспорта', () => {
  const cards = selectPracticeCards(portrait, ['moon']);
  assert.deepEqual(cards.map((card) => card.id), ['sun', 'moon', 'mercury']);
});

test('следующая практика циклически меняет настройку карты', () => {
  const cards = selectPracticeCards(portrait, []);
  assert.equal(pickNextPracticeCard(cards, 'sun').id, 'moon');
  assert.equal(pickNextPracticeCard(cards, 'mercury').id, 'sun');
});

test('сообщение объясняет пользу и просит сохранить реальный результат', () => {
  const message = buildPracticeMessage(portrait.cards[0], 0);
  assert.match(message, /Практика по вашей карте: Солнце/);
  assert.match(message, /На что опереться/);
  assert.match(message, /Проверка на 2 минуты/);
  assert.match(message, /выбрать один свой приоритет/i);
  assert.match(message, /сохранит не теорию, а ваш реальный результат/i);
  assert.doesNotMatch(message, /Попробуйте сейчас:/i);
  assert.doesNotMatch(message, /подарк|вселенн/i);
});

test('у ежедневной практики есть полный цикл реакции', () => {
  const keyboard = buildPracticeKeyboard({ chart_id: 'chart-id' }, 12);
  const callbacks = keyboard.inline_keyboard.flat().map((button) => button.callback_data).filter(Boolean);
  assert.ok(callbacks.includes('alignment:done:12'));
  assert.ok(callbacks.includes('alignment:remind:12'));
  assert.ok(callbacks.includes('alignment:notfit:12'));
  assert.ok(callbacks.includes('alignment:disable'));
  assert.ok(callbacks.every((value) => value.length <= 64));

  const outcomes = buildOutcomeKeyboard(12).inline_keyboard.flat().map((button) => button.callback_data);
  assert.deepEqual(outcomes, [
    'alignment:outcome:12:clear',
    'alignment:outcome:12:step',
    'alignment:outcome:12:none',
  ]);
});

test('выжимка честно разделяет подтверждённые и не сработавшие настройки', () => {
  const summary = buildWeeklySummary([
    { card_title: 'Солнце', card_key: 'Опора на собственное решение', outcome: 'clear' },
    { card_title: 'Меркурий', card_key: 'Ясность через простые слова', outcome: 'step' },
    { card_title: 'Луна', card_key: 'Естественный ритм', outcome: 'none' },
    { card_title: 'Луна', card_key: 'Естественный ритм', outcome: 'not_fit' },
  ]);
  assert.match(summary, /Что уже подтверждено вашей жизнью/);
  assert.match(summary, /Рабочие опоры/);
  assert.match(summary, /Солнце/);
  assert.match(summary, /Пока не стало опорой/);
  assert.match(summary, /Луна/);
  assert.match(summary, /личная карта работающих принципов/);
});
