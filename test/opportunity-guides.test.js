import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeepDive } from '../src/deep-dive-opportunities-ru.js';

const PLANETS = {
  sun: 'Солнце',
  moon: 'Луна',
  mercury: 'Меркурий',
  venus: 'Венера',
  mars: 'Марс',
  jupiter: 'Юпитер',
  saturn: 'Сатурн',
  uranus: 'Уран',
  neptune: 'Нептун',
  pluto: 'Плутон',
  northNode: 'Северный узел',
};

const SIGN_LOCATIONS = {
  Овен: 'в Овне',
  Телец: 'в Тельце',
  Близнецы: 'в Близнецах',
  Рак: 'в Раке',
  Лев: 'во Льве',
  Дева: 'в Деве',
  Весы: 'в Весах',
  Скорпион: 'в Скорпионе',
  Стрелец: 'в Стрельце',
  Козерог: 'в Козероге',
  Водолей: 'в Водолее',
  Рыбы: 'в Рыбах',
};

function itemFor(key, sign = 'Весы') {
  return {
    key,
    name: PLANETS[key],
    sign,
    oppositeSign: 'Овен',
    degree: 27.4,
    degreeLabel: '27°25′',
    house: 3,
    houseArea: 'мышление, речь, обучение и близкое окружение',
    retrograde: false,
  };
}

test('каждый полный разбор объясняет возможность и применение', () => {
  for (const key of Object.keys(PLANETS)) {
    const guide = buildDeepDive(itemFor(key));
    const combined = [
      guide.headline,
      guide.purpose,
      ...guide.lifeExamples.map((item) => `${item.title} ${item.text}`),
      guide.practice.title,
      ...guide.practice.steps,
    ].join(' ');

    assert.match(combined, /возможност/i, `${key}: не объяснена открываемая возможность`);
    assert.match(combined, /примен|действ|шаг|провер/i, `${key}: нет понятного применения`);
    assert.equal(guide.lifeExamples.length, 3, `${key}: нарушена структура полного разбора`);
    assert.equal(guide.lifeExamples[0].title, 'Какую возможность это открывает');
    assert.equal(guide.lifeExamples[1].title, 'Как применить это в жизни');
    assert.equal(guide.lifeExamples[2].title, 'Что закрывает возможность');
    assert.equal(guide.practice.title, 'Откройте одну новую возможность');
  }
});

test('разбор сохраняет персонализацию знаком, домом и практикой', () => {
  const guide = buildDeepDive(itemFor('mercury'));

  assert.match(guide.headline, /Меркурий в Весах/);
  assert.match(guide.purpose, /сфере «мышление, речь, обучение и близкое окружение»/);
  assert.match(guide.formula.sign.title, /Весы: как применить силу/);
  assert.match(guide.formula.house.title, /3 дом: где открывается возможность/);
  assert.equal(guide.practice.steps.length, 3);
});

test('названия всех знаков стоят в правильном предложном падеже', () => {
  for (const [sign, location] of Object.entries(SIGN_LOCATIONS)) {
    const guide = buildDeepDive(itemFor('mercury', sign));
    assert.ok(guide.headline.includes(`Меркурий ${location}`), `${sign}: неверный падеж в заголовке`);
    assert.doesNotMatch(JSON.stringify(guide), new RegExp(`в ${sign}(?:[\s,.;!?]|$)`), `${sign}: осталась форма именительного падежа после «в»`);
  }
});
