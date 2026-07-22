import { buildDeepDive, signLocation } from './deep-dive-opportunities-ru.js';
import { describeHouseManifestation } from './house-manifestations-ru.js';
import { houseKnowledge, planetKnowledge, signKnowledge } from './knowledge.js';

function sentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : '';
}

export function positionLabel(item) {
  const retro = item.retrograde && item.key !== 'northNode' ? ' R' : '';
  const house = item.house ? ` в ${item.house} доме` : '';
  return `${item.name} ${signLocation(item.sign)} ${item.degreeLabel}${retro}${house}`;
}

export function buildEditorialMatrix(item) {
  const role = planetKnowledge(item.key);
  const sign = signKnowledge(item.sign);
  const oppositeName = item.oppositeSign || sign.opposite;
  const opposite = signKnowledge(oppositeName);
  const area = houseKnowledge(item.house, item.houseArea);

  const matrix = {
    function: sentence(role.function),
    sign: sentence(`${capitalize(signLocation(item.sign))} эта внутренняя сила включается ${sign.mechanism}; её преимущество — ${sign.strength}`),
    house: item.house
      ? sentence(describeHouseManifestation(item.house, area))
      : 'Время рождения не указано, поэтому HeroStar не приписывает этой внутренней силе конкретную сферу жизни.',
    lifeScenario: sentence(`${sign.scenario}${item.house ? ` — особенно когда ситуация касается сферы «${area}»` : ''}`),
    contrast: sentence(`${capitalize(signLocation(oppositeName))} человек чаще действовал бы ${opposite.mechanism}; ваш естественный способ — ${sign.mechanism}`),
    trap: sentence(`Эта сила начинает мешать так: ${sign.shadow}`),
    key: sentence(role.key),
    action: sentence(role.action),
    button: role.button,
  };

  return {
    id: item.key,
    icon: role.icon,
    title: role.title,
    category: role.category,
    question: role.question,
    position: positionLabel(item),
    matrix,
    deepDive: buildDeepDive(item),
    lead: `Что в вас работает. ${matrix.function} Как именно. ${matrix.sign}`,
    manifestation: `Где это проявляется. ${matrix.house}`,
    uniqueExample: `Знакомый жизненный сюжет: ${matrix.lifeScenario}`,
    contrast: matrix.contrast,
    trap: matrix.trap,
    key: `Что возвращает силу: ${matrix.key}`,
    action: `Попробуйте сейчас: ${matrix.action}`,
    buttonLabel: matrix.button,
    evidence: [
      positionLabel(item),
      item.house ? `${item.house} дом: ${area}` : 'Дома не рассчитаны',
      `Контраст: ${oppositeName}`,
    ],
  };
}
