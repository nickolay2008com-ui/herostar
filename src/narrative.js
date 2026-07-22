import { buildEditorialMatrix } from './editorial-matrix.js';
import { CARD_ORDER, planetKnowledge, signKnowledge } from './knowledge.js';

function point(chart, key) {
  if (key === 'northNode') return chart.northNode;
  return chart.planets.find((item) => item.key === key);
}

function requiredPoint(chart, key) {
  const value = point(chart, key);
  if (!value) throw new Error(`HeroStar chart is missing ${key}`);
  return value;
}

function aspectSentence(aspect) {
  const relation = aspect.tone === 'tension'
    ? 'создаёт внутреннее напряжение, которое требует осознанного способа согласования'
    : 'создаёт естественную поддержку, которую важно использовать намеренно';
  return `${aspect.fromName} ${aspect.symbol} ${aspect.toName}: ${relation}`;
}

function buildSynthesis(chart) {
  const sun = requiredPoint(chart, 'sun');
  const moon = requiredPoint(chart, 'moon');
  const mercury = requiredPoint(chart, 'mercury');
  const venus = requiredPoint(chart, 'venus');
  const mars = requiredPoint(chart, 'mars');
  const saturn = requiredPoint(chart, 'saturn');
  const node = requiredPoint(chart, 'northNode');
  const mainAspects = (chart.aspects || []).slice(0, 3).map(aspectSentence);

  const conflict = mainAspects[0]
    || `Главный рабочий узел: привычная опора Луны в ${moon.sign} должна поддерживать, а не задерживать движение Марса в ${mars.sign}.`;

  return {
    title: `Формула пути ${chart.person.name}`,
    formula: `Центр — ${sun.sign}; опора — ${moon.sign}; мышление — ${mercury.sign}; действие — ${mars.sign}; развитие — ${node.sign}.`,
    conflict,
    strengths: [
      `Авторская сила: ${signKnowledge(sun.sign).strength}.`,
      `Эмоциональный ресурс: ${signKnowledge(moon.sign).strength}.`,
      `Способ действия: ${signKnowledge(mars.sign).strength}.`,
      `Способ создавать ценность: ${signKnowledge(venus.sign).strength}.`,
    ],
    tensions: mainAspects.length ? mainAspects : [conflict],
    route: [
      `Выберите одну задачу, где действительно нужен способ Солнца в ${sun.sign}.`,
      `До действия восстановите опору Луны в ${moon.sign}, но не превращайте восстановление в отсрочку.`,
      `Сформулируйте проверку способом Меркурия в ${mercury.sign} и выполните измеримый шаг Марса в ${mars.sign}.`,
      `Закрепите результат правилом Сатурна в ${saturn.sign} и добавьте один непривычный ход Северного узла в ${node.sign}.`,
    ],
    bingo: `Вы на своём маршруте, когда сила ${sun.sign}, спокойствие ${moon.sign}, действие ${mars.sign} и развитие ${node.sign} работают как одна система, а не спорят за управление.`,
  };
}

export function buildFallbackPortrait(chart) {
  const cards = CARD_ORDER.map((key, index) => ({
    ...buildEditorialMatrix(requiredPoint(chart, key)),
    order: index + 1,
  }));

  const sun = requiredPoint(chart, 'sun');
  const moon = requiredPoint(chart, 'moon');
  const mars = requiredPoint(chart, 'mars');
  const node = requiredPoint(chart, 'northNode');

  return {
    version: '2.2-core',
    title: `Карта внутренних ресурсов ${chart.person.name}`,
    subtitle: 'Читайте её как понятный маршрут: что в вас работает → как именно → где это работает в жизни → какой сюжет повторяется → где вы теряете силу → что помогает → какой шаг сделать.',
    archetype: `Ваш центр — Солнце в ${sun.sign}. Эмоциональная опора — Луна в ${moon.sign}. Способ действовать — Марс в ${mars.sign}. Новое направление роста — Северный узел в ${node.sign}.`,
    cards,
    synthesis: buildSynthesis(chart),
    disclaimer: 'Астрологическая интерпретация является инструментом саморефлексии, а не научной диагностикой, гарантией событий или заменой профессиональной помощи.',
  };
}

export { CARD_ORDER } from './knowledge.js';
export { PLANET_KNOWLEDGE as ROLE } from './knowledge.js';
