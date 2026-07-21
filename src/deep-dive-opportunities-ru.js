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

export function signLocation(sign) {
  return SIGN_LOCATION[sign] || `в ${sign}`;
}

function localizeSignCase(value, sign) {
  if (typeof value === 'string') {
    return value.replaceAll(`в ${sign}`, signLocation(sign));
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
  const guide = localizeSignCase(buildOpportunityDeepDive(item), item.sign);

  if (item.key === 'mars' && guide.lifeExamples?.[1]) {
    guide.lifeExamples[1].text += ' Если напряжение уже накопилось, сначала дайте ему короткий физический выход или движение, а затем направьте освободившуюся энергию в конкретное действие.';
  }

  return guide;
}
