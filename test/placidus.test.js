import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlacidusCusps, houseForLongitude } from '../src/placidus.js';

const references = [
  {
    name: 'Донецк · 6 ноября 1987, 01:15 местного времени',
    input: { armc: 56.159753635, latitude: 48.0159, obliquity: 23.443288, ascendant: 155.18061732, mc: 58.403691844 },
    cusps: [155.18061732, 176.832218436, 204.406691232, 238.403691844, 275.241655083, 308.073257273, 335.18061732, 356.832218436, 24.406691232, 58.403691844, 95.241655083, 128.073257273],
  },
  {
    name: 'Нью-Йорк · 15 мая 1990, 14:30 UTC',
    input: { armc: 16.552861284, latitude: 40.7128, obliquity: 23.442164562, ascendant: 122.203664553, mc: 17.950040994 },
    cusps: [122.203664553, 142.47212434, 166.990601881, 197.950040994, 234.635026883, 271.0603953, 302.203664553, 322.47212434, 346.990601881, 17.950040994, 54.635026883, 91.0603953],
  },
  {
    name: 'Лондон · 1 января 2000, 12:00 UTC',
    input: { armc: 280.457072438, latitude: 51.4779, obliquity: 23.437679, ascendant: 24.266189203, mc: 279.6110878 },
    cusps: [24.266189203, 61.14240133, 82.020814372, 99.6110878, 119.061909398, 147.700656834, 204.266189203, 241.14240133, 262.020814372, 279.6110878, 299.061909398, 327.700656834],
  },
  {
    name: 'Сидней · 1 июля 2010, 02:00 UTC',
    input: { armc: 100.235643843, latitude: -33.8688, obliquity: 23.437961, ascendant: 195.612194869, mc: 99.406840249 },
    cusps: [195.612194869, 231.077415306, 256.83214991, 279.406840249, 303.375117514, 333.733944045, 15.612194869, 51.077415306, 76.83214991, 99.406840249, 123.375117514, 153.733944045],
  },
];

function angularDistance(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

for (const reference of references) {
  test(`Плацидус совпадает с независимым эталоном: ${reference.name}`, () => {
    const actual = calculatePlacidusCusps(reference.input);
    assert.equal(actual.length, 12);
    actual.forEach((value, index) => {
      assert.ok(
        angularDistance(value, reference.cusps[index]) < 0.02,
        `Куспид ${index + 1}: ожидалось ${reference.cusps[index]}, получено ${value}`,
      );
    });
  });
}

test('дом определяется между реальными неравными куспидами', () => {
  const cusps = references[0].cusps;
  assert.equal(houseForLongitude(155.18061732, cusps), 1);
  assert.equal(houseForLongitude(198.143854332, cusps), 2);
  assert.equal(houseForLongitude(222.958975404, cusps), 3);
  assert.equal(houseForLongitude(45.770046954, cusps), 9);
  assert.equal(houseForLongitude(58.403691844, cusps), 10);
});

test('Плацидус не выдаёт вымышленные куспиды на полярной широте', () => {
  assert.throws(() => calculatePlacidusCusps({
    armc: 120,
    latitude: 75,
    obliquity: 23.44,
    ascendant: 10,
    mc: 100,
  }), /Placidus/i);
});
