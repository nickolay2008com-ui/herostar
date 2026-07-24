const ELEMENT_GRADIENTS = {
  Огонь: ['#f59e0b', '#ef4444'],
  Земля: ['#84cc16', '#0f766e'],
  Воздух: ['#38bdf8', '#8b5cf6'],
  Вода: ['#6366f1', '#db2777'],
};

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function planet(chart, key) {
  return chart?.planets?.find((item) => item.key === key) || null;
}

function card(portrait, key) {
  return portrait?.cards?.find((item) => item.id === key) || null;
}

function positionLabel(item, fallback) {
  if (!item) return fallback;
  const house = Number.isInteger(item.house) ? ` · ${item.house} дом` : '';
  return `${item.name || fallback} в ${item.sign || 'неизвестном знаке'}${house}`;
}

function usefulText(cardRecord, fallback) {
  return compact(cardRecord?.key || cardRecord?.manifestation || cardRecord?.lead || fallback);
}

function applicationText(cardRecord, fallback) {
  return compact(cardRecord?.action || cardRecord?.key || fallback)
    .replace(/^(попробуйте сейчас|ваш ход|первый ход|маленький ход)\s*[:—-]\s*/i, '');
}

export function buildClonePassport(chart, portrait) {
  if (!chart) return null;
  const sun = planet(chart, 'sun');
  const moon = planet(chart, 'moon');
  const mars = planet(chart, 'mars');
  const asc = chart.angles?.ascendant || null;
  const mc = chart.angles?.mc || null;
  const dominantElement = mars?.element || sun?.element || moon?.element || 'Воздух';
  const [from, to] = ELEMENT_GRADIENTS[dominantElement] || ELEMENT_GRADIENTS.Воздух;
  const name = compact(chart.person?.name || 'Звёздный клон');
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '✦';

  const sections = [
    {
      id: 'identity',
      title: 'Внутренний вектор',
      position: positionLabel(sun, 'Солнце'),
      meaning: usefulText(card(portrait, 'sun'), 'Показывает, вокруг чего клон собирает целостное решение.'),
      application: applicationText(card(portrait, 'sun'), 'Сверять решение с главным приоритетом, а не только с внешним давлением.'),
    },
    {
      id: 'reaction',
      title: 'Автоматическая реакция',
      position: positionLabel(moon, 'Луна'),
      meaning: usefulText(card(portrait, 'moon'), 'Показывает первую эмоциональную реакцию и способ восстановить устойчивость.'),
      application: applicationText(card(portrait, 'moon'), 'Перед выбором дать реакции проявиться и отделить её от окончательного решения.'),
    },
    {
      id: 'action',
      title: 'Способ действовать',
      position: positionLabel(mars, 'Марс'),
      meaning: usefulText(card(portrait, 'mars'), 'Показывает, как клон набирает импульс и переводит намерение в действие.'),
      application: applicationText(card(portrait, 'mars'), 'Выбирать форму первого шага, которая соответствует естественному темпу действия.'),
    },
    {
      id: 'entry',
      title: 'Вход в ситуацию',
      position: asc ? `Асцендент в ${asc.sign}` : 'Асцендент не рассчитан',
      meaning: usefulText(card(portrait, 'ascendant'), 'Показывает, что клон замечает первым и с какой позиции входит в новую ситуацию.'),
      application: applicationText(card(portrait, 'ascendant'), 'Проверять первое впечатление, но не принимать его за всю картину.'),
    },
    {
      id: 'result',
      title: 'Образ результата',
      position: mc ? `MC в ${mc.sign}` : 'MC не рассчитан',
      meaning: usefulText(card(portrait, 'mc'), 'Показывает, какой внешний результат выглядит для клона убедительным и достойным усилий.'),
      application: applicationText(card(portrait, 'mc'), 'Сравнивать варианты не только по удобству сейчас, но и по качеству результата.'),
    },
  ];

  return {
    version: 'clone-passport-v1',
    title: `Паспорт клона ${name}`,
    subtitle: 'Постоянная карта базовых настроек и способов применять их в реальных ситуациях.',
    avatar: {
      initials,
      symbol: sun?.symbol || '✦',
      signature: [sun?.sign, moon?.sign, asc?.sign ? `ASC ${asc.sign}` : null].filter(Boolean).join(' · '),
      element: dominantElement,
      gradient: { from, to },
    },
    sections,
    strengths: (portrait?.synthesis?.strengths || []).slice(0, 3).map(compact),
    tensions: (portrait?.synthesis?.tensions || []).slice(0, 2).map(compact),
    route: (portrait?.synthesis?.route || []).slice(0, 3).map(compact),
    disclaimer: 'Паспорт описывает механику самостоятельной астрологической модели. Это не приказ человеку и не гарантия результата.',
  };
}
