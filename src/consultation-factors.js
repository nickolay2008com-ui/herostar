const HOUSE_RULES = [
  { house: 7, words: ['отношен', 'партн', 'любов', 'муж', 'жен', 'договор', 'контакт', 'расстав'], planets: ['venus', 'moon'] },
  { house: 2, words: ['деньг', 'доход', 'зарплат', 'оплат', 'цена', 'бюджет', 'заработ', 'ресурс'], planets: ['venus', 'saturn'] },
  { house: 8, words: ['долг', 'кредит', 'инвест', 'доля', 'общие деньги', 'риск', 'зависим', 'наслед'], planets: ['pluto', 'saturn'] },
  { house: 10, words: ['карьер', 'статус', 'должност', 'руковод', 'повышен', 'репутац', 'призван'], planets: ['sun', 'saturn'] },
  { house: 6, words: ['работ', 'задач', 'режим', 'навык', 'сотрудник', 'устал', 'эффектив'], planets: ['mercury', 'saturn'] },
  { house: 4, words: ['дом', 'семь', 'родител', 'переезд', 'квартир', 'жиль', 'город', 'стран'], planets: ['moon', 'saturn'] },
  { house: 5, words: ['проект', 'иде', 'твор', 'запуск', 'продукт', 'автор', 'удовольств'], planets: ['sun', 'venus'] },
  { house: 3, words: ['сказать', 'ответить', 'написать', 'разговор', 'переговор', 'сообщен', 'обуч', 'документ'], planets: ['mercury', 'mars'] },
  { house: 9, words: ['учёб', 'образован', 'путешеств', 'смысл', 'мировоззрен', 'за границ'], planets: ['jupiter', 'mercury'] },
  { house: 11, words: ['сообще', 'аудитор', 'будущ', 'масштаб', 'друз', 'команд', 'сеть'], planets: ['jupiter', 'uranus'] },
];

const SIGN_RULERS = Object.freeze({
  'Овен': 'mars', 'Телец': 'venus', 'Близнецы': 'mercury', 'Рак': 'moon',
  'Лев': 'sun', 'Дева': 'mercury', 'Весы': 'venus', 'Скорпион': 'pluto',
  'Стрелец': 'jupiter', 'Козерог': 'saturn', 'Водолей': 'uranus', 'Рыбы': 'neptune',
});

const PLANET_PURPOSES = Object.freeze({
  sun: 'центр решения и способ сохранить авторство',
  moon: 'автоматическая эмоциональная реакция модели',
  mercury: 'способ собирать факты, формулировать и сравнивать варианты',
  venus: 'критерий ценности, отношений и приемлемого обмена',
  mars: 'способ переходить от оценки ситуации к действию',
  jupiter: 'критерий роста, смысла и расширения возможностей',
  saturn: 'границы, цена обязательств и проверка устойчивости',
  uranus: 'потребность в свободе конструкции и нестандартном ходе',
  neptune: 'чувствительность к атмосфере, смыслу и неясным допущениям',
  pluto: 'контроль критического риска, зависимости и необратимых ставок',
  northNode: 'направление развития, когда оно действительно меняет выбор',
});

function cleanQuestion(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е');
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function planet(chart, key) {
  if (key === 'northNode') return chart?.northNode || null;
  return (chart?.planets || []).find((item) => item.key === key) || null;
}

function cusp(chart, house) {
  return (chart?.houses?.cusps || []).find((item) => Number(item.house) === Number(house)) || null;
}

function planetPosition(item, unknownTime) {
  if (!item) return '';
  const parts = [`${item.name} в ${item.sign}`];
  if (item.degreeLabel) parts[0] += ` ${item.degreeLabel}`;
  if (!unknownTime && item.house) parts.push(`${item.house} дом`);
  if (item.retrograde) parts.push('ретроградность');
  return parts.join(' · ');
}

function planetFactor(chart, key, role, unknownTime) {
  const item = planet(chart, key);
  if (!item || (unknownTime && key === 'moon')) return null;
  return {
    id: `planet:${key}`,
    kind: 'planet',
    key,
    title: item.name,
    position: planetPosition(item, unknownTime),
    role: role || PLANET_PURPOSES[key] || 'релевантная функция карты',
    sourceKeys: [key],
  };
}

function houseFactor(chart, house) {
  const item = cusp(chart, house);
  if (!item) return null;
  return {
    id: `house:${house}`,
    kind: 'house',
    key: `house_${house}`,
    title: `${house} дом · ${item.sign}`,
    position: item.degreeLabel ? `Куспид ${item.degreeLabel}` : 'Куспид дома',
    role: `сфера текущей ситуации: ${item.area || 'жизненная область вопроса'}`,
    sourceKeys: [`house:${house}`],
  };
}

function angleFactor(chart, key, role) {
  const item = chart?.angles?.[key];
  if (!item) return null;
  return {
    id: `angle:${key}`,
    kind: 'angle',
    key,
    title: `${item.name || key.toUpperCase()} · ${item.sign}`,
    position: item.degreeLabel || '',
    role,
    sourceKeys: [`angle:${key}`],
  };
}

function aspectFactor(chart, aspect) {
  if (!aspect) return null;
  const from = planet(chart, aspect.from);
  const to = planet(chart, aspect.to);
  if (!from || !to) return null;
  return {
    id: `aspect:${aspect.from}:${aspect.to}:${aspect.type}`,
    kind: 'aspect',
    key: `${aspect.from}_${aspect.to}_${aspect.type}`,
    title: `${from.name} ${aspect.symbol || '—'} ${to.name}`,
    position: `${aspect.type}${Number.isFinite(Number(aspect.orb)) ? ` · орбис ${Number(aspect.orb).toFixed(1)}°` : ''}`,
    role: aspect.tone === 'tension'
      ? 'внутреннее противоречие, которое меняет условия выбора'
      : 'поддерживающая связь, позволяющая соединить две функции в одном ходе',
    sourceKeys: [aspect.from, aspect.to, `aspect:${aspect.from}:${aspect.to}:${aspect.type}`],
  };
}

function bestHouseRule(question) {
  const text = cleanQuestion(question);
  let best = null;
  for (const rule of HOUSE_RULES) {
    const score = rule.words.reduce((sum, word) => sum + (text.includes(word.replace(/ё/g, 'е')) ? 1 : 0), 0);
    if (!best || score > best.score) best = { ...rule, score };
  }
  return best?.score ? best : { house: 1, planets: ['mars', 'mercury'], score: 0 };
}

function strongestAspect(chart, selectedKeys, unknownTime) {
  return (chart?.aspects || [])
    .filter((item) => !(unknownTime && (item.from === 'moon' || item.to === 'moon')))
    .filter((item) => selectedKeys.has(item.from) || selectedKeys.has(item.to))
    .sort((left, right) => {
      const sharedLeft = Number(selectedKeys.has(left.from)) + Number(selectedKeys.has(left.to));
      const sharedRight = Number(selectedKeys.has(right.from)) + Number(selectedKeys.has(right.to));
      return sharedRight - sharedLeft || Number(right.exactness || 0) - Number(left.exactness || 0);
    })[0] || null;
}

export function factorScopeForChart(chart) {
  const unknownTime = Boolean(chart?.birth?.unknownTime);
  return {
    unknownTime,
    system: String(chart?.system || ''),
    note: unknownTime
      ? 'Время рождения неизвестно: дома, ASC/MC и Луна не используются в объяснении ответа.'
      : 'Показаны только параметры карты, переданные модели для текущего ответа.',
  };
}

export function selectConsultationFactors({ chart, question, factorBudget = {} }) {
  const scope = factorScopeForChart(chart);
  const min = Math.max(2, Number(factorBudget.min || 2));
  const max = Math.max(min, Math.min(6, Number(factorBudget.max || 4)));
  const rule = bestHouseRule(question);
  const factors = [];
  const selectedPlanetKeys = new Set();

  if (!scope.unknownTime) {
    const selectedHouse = houseFactor(chart, rule.house);
    if (selectedHouse) factors.push(selectedHouse);
    const selectedCusp = cusp(chart, rule.house);
    const rulerKey = SIGN_RULERS[selectedCusp?.sign];
    if (rulerKey) {
      const ruler = planetFactor(chart, rulerKey, `управитель ${rule.house} дома — связывает тему вопроса с конкретным способом решения`, false);
      if (ruler) {
        factors.push(ruler);
        selectedPlanetKeys.add(rulerKey);
      }
    }
  }

  for (const key of rule.planets || []) {
    if (scope.unknownTime && key === 'moon') continue;
    const item = planetFactor(chart, key, PLANET_PURPOSES[key], scope.unknownTime);
    if (item) {
      factors.push(item);
      selectedPlanetKeys.add(key);
    }
    if (unique(factors).length >= Math.max(min, max - 1)) break;
  }

  const fallbackKeys = scope.unknownTime
    ? ['mars', 'mercury', 'venus', 'saturn', 'sun', 'jupiter']
    : ['mars', 'moon', 'mercury', 'venus', 'saturn', 'sun', 'jupiter'];
  for (const key of fallbackKeys) {
    if (unique(factors).length >= min) break;
    const item = planetFactor(chart, key, PLANET_PURPOSES[key], scope.unknownTime);
    if (item) {
      factors.push(item);
      selectedPlanetKeys.add(key);
    }
  }

  const aspect = strongestAspect(chart, selectedPlanetKeys, scope.unknownTime);
  if (aspect && unique(factors).length < max) factors.push(aspectFactor(chart, aspect));

  if (!scope.unknownTime && unique(factors).length < max) {
    if (rule.house === 10) factors.push(angleFactor(chart, 'mc', 'внешний результат, к которому тяготеет решение'));
    else if (rule.house === 1) factors.push(angleFactor(chart, 'ascendant', 'то, что модель замечает первым при входе в ситуацию'));
  }

  return { factors: unique(factors).slice(0, max), scope };
}

export function publicConsultationFactors(factors = []) {
  return factors.slice(0, 6).map(({ id, kind, key, title, position, role }) => ({
    id: String(id || '').slice(0, 160),
    kind: String(kind || '').slice(0, 32),
    key: String(key || '').slice(0, 120),
    title: String(title || '').slice(0, 180),
    position: String(position || '').slice(0, 220),
    role: String(role || '').slice(0, 320),
  }));
}

export function compactCloneEvidence(chart, factors = []) {
  return {
    version: chart?.version || null,
    birth: {
      unknownTime: Boolean(chart?.birth?.unknownTime),
      date: chart?.birth?.date || null,
    },
    system: chart?.system || null,
    selectedFactors: publicConsultationFactors(factors),
  };
}
