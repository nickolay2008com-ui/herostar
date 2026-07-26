import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactCloneEvidence,
  factorScopeForChart,
  publicConsultationFactors,
  selectConsultationFactors,
} from '../src/consultation-factors.js';

function chart({ unknownTime = false } = {}) {
  const planets = [
    ['sun', 'Солнце', 'Скорпион', 3],
    ['moon', 'Луна', 'Телец', 9],
    ['mercury', 'Меркурий', 'Скорпион', 3],
    ['venus', 'Венера', 'Стрелец', 4],
    ['mars', 'Марс', 'Весы', 2],
    ['jupiter', 'Юпитер', 'Овен', 8],
    ['saturn', 'Сатурн', 'Стрелец', 4],
    ['uranus', 'Уран', 'Стрелец', 4],
    ['neptune', 'Нептун', 'Козерог', 5],
    ['pluto', 'Плутон', 'Скорпион', 3],
  ].map(([key, name, sign, house]) => ({
    key, name, sign, house: unknownTime ? null : house, degreeLabel: '12°00′', element: 'Земля', retrograde: false,
  }));
  return {
    version: 'test',
    system: unknownTime ? 'Без домов: время рождения неизвестно' : 'Система домов Плацидуса',
    birth: { date: '1987-11-06', unknownTime },
    planets,
    northNode: { key: 'northNode', name: 'Северный узел', sign: 'Овен', house: unknownTime ? null : 8, degreeLabel: '20°00′' },
    houses: unknownTime ? null : { cusps: Array.from({ length: 12 }, (_, index) => ({ house: index + 1, sign: index === 6 ? 'Весы' : 'Овен', degreeLabel: '10°00′', area: `сфера ${index + 1}` })) },
    angles: unknownTime ? null : { ascendant: { name: 'Асцендент', sign: 'Дева', degreeLabel: '5°00′' }, mc: { name: 'МС', sign: 'Телец', degreeLabel: '15°00′' } },
    aspects: [
      { from: 'venus', to: 'mars', type: 'секстиль', symbol: '⚹', tone: 'support', orb: 1.2, exactness: .8 },
      { from: 'moon', to: 'saturn', type: 'квадрат', symbol: '□', tone: 'tension', orb: 2.1, exactness: .7 },
    ],
  };
}

test('отношения выбирают 7 дом, его управителя и проверяемую связь', () => {
  const selected = selectConsultationFactors({ chart: chart(), question: 'Как поговорить с партнёром об отношениях?', factorBudget: { min: 2, max: 4 } });
  assert.equal(selected.scope.unknownTime, false);
  assert.ok(selected.factors.some((item) => item.id === 'house:7'));
  assert.ok(selected.factors.some((item) => item.id === 'planet:venus'));
  assert.ok(selected.factors.some((item) => item.kind === 'aspect'));
});

test('неизвестное время исключает дома, углы, Луну и лунные аспекты', () => {
  const selected = selectConsultationFactors({ chart: chart({ unknownTime: true }), question: 'Как ответить партнёру?', factorBudget: { min: 2, max: 4 } });
  assert.equal(factorScopeForChart(chart({ unknownTime: true })).unknownTime, true);
  assert.ok(selected.factors.length >= 2);
  assert.ok(selected.factors.every((item) => !['house', 'angle'].includes(item.kind)));
  assert.ok(selected.factors.every((item) => item.key !== 'moon'));
  assert.ok(selected.factors.every((item) => !item.id.includes('moon')));
  assert.ok(selected.factors.every((item) => !item.position.includes('дом')));
});

test('модель получает только тот набор факторов, который возвращается интерфейсу', () => {
  const selected = selectConsultationFactors({ chart: chart(), question: 'Войти ли в новый проект?', factorBudget: { min: 2, max: 4 } });
  const evidence = compactCloneEvidence(chart(), selected.factors);
  assert.deepEqual(evidence.selectedFactors, publicConsultationFactors(selected.factors));
  assert.equal('planets' in evidence, false);
});
