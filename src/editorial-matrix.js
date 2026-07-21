import { buildDeepDive } from './deep-dive-opportunities-ru.js';
import { houseKnowledge, planetKnowledge, signKnowledge } from './knowledge.js';

function sentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

export function positionLabel(item) {
  const retro = item.retrograde && item.key !== 'northNode' ? ' R' : '';
  const house = item.house ? ` в ${item.house} доме` : '';
  return `${item.name} в ${item.sign} ${item.degreeLabel}${retro}${house}`;
}

export function buildEditorialMatrix(item) {
  const role = planetKnowledge(item.key);
  const sign = signKnowledge(item.sign);
  const oppositeName = item.oppositeSign || sign.opposite;
  const opposite = signKnowledge(oppositeName);
  const area = houseKnowledge(item.house, item.houseArea);

  const matrix = {
    function: sentence(role.function),
    sign: sentence(`В ${item.sign} эта функция работает ${sign.mechanism}; её сильная сторона — ${sign.strength}`),
    house: item.house
      ? sentence(`${item.house} дом переносит эту механику в сферу «${area}»`)
      : 'Время рождения не указано, поэтому HeroStar не приписывает этой функции конкретный дом.',
    lifeScenario: sentence(`Жизненный сценарий: ${sign.scenario}${item.house ? ` — особенно в ситуациях, связанных со сферой «${area}»` : ''}`),
    contrast: sentence(`В ${oppositeName} та же функция чаще действовала бы ${opposite.mechanism}; ваше отличие — ${sign.mechanism}`),
    trap: sentence(`Ловушка: ${sign.shadow}`),
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
    lead: `${matrix.function} ${matrix.sign}`,
    manifestation: matrix.house,
    uniqueExample: matrix.lifeScenario,
    contrast: matrix.contrast,
    trap: matrix.trap,
    key: matrix.key,
    action: matrix.action,
    buttonLabel: matrix.button,
    evidence: [
      positionLabel(item),
      item.house ? `${item.house} дом: ${area}` : 'Дома не рассчитаны',
      `Контраст: ${oppositeName}`,
    ],
  };
}
