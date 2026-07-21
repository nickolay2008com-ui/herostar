import { buildDeepDive as buildOpportunityDeepDive } from './deep-dive-opportunities.js';

const SIGN_LOCATION = {
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

function localizeSignCase(value, sign) {
  if (typeof value === 'string') {
    const location = SIGN_LOCATION[sign];
    return location ? value.replaceAll(`в ${sign}`, location) : value;
  }
  if (Array.isArray(value)) return value.map((item) => localizeSignCase(item, sign));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, localizeSignCase(item, sign)]),
    );
  }
  return value;
}

export function buildDeepDive(item) {
  return localizeSignCase(buildOpportunityDeepDive(item), item.sign);
}
