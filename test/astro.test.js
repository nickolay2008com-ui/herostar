import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNatalChart, CHART_VERSION } from '../src/astro.js';
import { buildFallbackPortrait } from '../src/narrative.js';

test('строит контрольную карту только по Плацидусу', async () => {
  const chart = await calculateNatalChart({
    name: 'Контрольный профиль',
    date: '1987-11-06',
    time: '01:15',
    place: 'Контрольная локация',
    latitude: 48.0159,
    longitude: 37.8029,
  });

  assert.equal(chart.version, CHART_VERSION);
  assert.equal(chart.version, '0.2-placidus');
  assert.equal(chart.system, 'Система домов Плацидуса');
  assert.equal(chart.houses.key, 'placidus');
  assert.equal(chart.houses.cusps.length, 12);
  assert.equal(chart.planets.find((p) => p.key === 'sun').sign, 'Скорпион');
  assert.equal(chart.angles.ascendant.sign, 'Дева');
  assert.equal(chart.angles.mc.sign, 'Телец');
  assert.equal(chart.planets.length, 10);
  assert.ok(chart.planets.every((planet) => Number.isInteger(planet.house)));
  assert.ok(chart.aspects.length > 0);
});

test('неизвестное время честно отключает Плацидус и дома', async () => {
  const chart = await calculateNatalChart({
    name: 'Без времени',
    date: '1990-01-01',
    unknownTime: true,
    place: 'Тестовая локация',
    latitude: 55.7558,
    longitude: 37.6173,
  });
  assert.equal(chart.version, '0.2-placidus');
  assert.equal(chart.houses, null);
  assert.equal(chart.angles, null);
  assert.ok(chart.planets.every((planet) => planet.house === null));
  assert.match(chart.system, /Без домов/);
});

test('fallback-портрет всегда содержит 11 доказуемых карточек', async () => {
  const chart = await calculateNatalChart({
    name: 'Тестовый профиль',
    date: '1990-01-01',
    time: '12:00',
    place: 'Тестовая локация',
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
