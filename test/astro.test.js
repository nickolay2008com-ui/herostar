import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNatalChart } from '../src/astro.js';
import { buildFallbackPortrait } from '../src/narrative.js';

test('строит карту Николая с ожидаемыми углами', async () => {
  const chart = await calculateNatalChart({
    name: 'Николай',
    date: '1987-11-06',
    time: '01:15',
    place: 'Донецк',
    latitude: 48.0159,
    longitude: 37.8029,
  });

  assert.equal(chart.planets.find((p) => p.key === 'sun').sign, 'Скорпион');
  assert.equal(chart.angles.ascendant.sign, 'Дева');
  assert.equal(chart.angles.mc.sign, 'Телец');
  assert.equal(chart.planets.length, 10);
  assert.ok(chart.aspects.length > 0);
});

test('fallback-портрет всегда содержит 11 доказуемых карточек', async () => {
  const chart = await calculateNatalChart({
    name: 'Тест',
    date: '1990-01-01',
    time: '12:00',
    place: 'Москва',
    latitude: 55.7558,
    longitude: 37.6173,
  });
  const portrait = buildFallbackPortrait(chart);
  assert.equal(portrait.cards.length, 11);
  for (const card of portrait.cards) {
    assert.ok(card.position);
    assert.ok(card.contrast);
    assert.ok(card.action);
    assert.ok(card.evidence.length >= 3);
  }
});
