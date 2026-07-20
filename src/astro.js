import * as Astronomy from 'astronomy-engine';
import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import { normalizeDegrees, signedAngularDelta, clamp, publicError } from './utils.js';

const SIGNS = [
  { name: 'Овен', symbol: '♈', element: 'Огонь', mode: 'кардинальный' },
  { name: 'Телец', symbol: '♉', element: 'Земля', mode: 'фиксированный' },
  { name: 'Близнецы', symbol: '♊', element: 'Воздух', mode: 'мутабельный' },
  { name: 'Рак', symbol: '♋', element: 'Вода', mode: 'кардинальный' },
  { name: 'Лев', symbol: '♌', element: 'Огонь', mode: 'фиксированный' },
  { name: 'Дева', symbol: '♍', element: 'Земля', mode: 'мутабельный' },
  { name: 'Весы', symbol: '♎', element: 'Воздух', mode: 'кардинальный' },
  { name: 'Скорпион', symbol: '♏', element: 'Вода', mode: 'фиксированный' },
  { name: 'Стрелец', symbol: '♐', element: 'Огонь', mode: 'мутабельный' },
  { name: 'Козерог', symbol: '♑', element: 'Земля', mode: 'кардинальный' },
  { name: 'Водолей', symbol: '♒', element: 'Воздух', mode: 'фиксированный' },
  { name: 'Рыбы', symbol: '♓', element: 'Вода', mode: 'мутабельный' },
];

const BODIES = [
  ['sun', 'Солнце', '☉', Astronomy.Body.Sun],
  ['moon', 'Луна', '☽', Astronomy.Body.Moon],
  ['mercury', 'Меркурий', '☿', Astronomy.Body.Mercury],
  ['venus', 'Венера', '♀', Astronomy.Body.Venus],
  ['mars', 'Марс', '♂', Astronomy.Body.Mars],
  ['jupiter', 'Юпитер', '♃', Astronomy.Body.Jupiter],
  ['saturn', 'Сатурн', '♄', Astronomy.Body.Saturn],
  ['uranus', 'Уран', '♅', Astronomy.Body.Uranus],
  ['neptune', 'Нептун', '♆', Astronomy.Body.Neptune],
  ['pluto', 'Плутон', '♇', Astronomy.Body.Pluto],
];

const HOUSE_AREAS = [
  'личность, тело и способ входить в жизнь',
  'деньги, ресурсы и самоценность',
  'мышление, речь, обучение и близкое окружение',
  'дом, корни и внутренняя опора',
  'творчество, удовольствие, романтика и авторские проекты',
  'работа, навыки, режим и повседневная эффективность',
  'партнёрство, близкие отношения и договорённости',
  'кризисы, глубокая близость, чужие ресурсы и трансформация',
  'мировоззрение, путешествия, образование и дальний горизонт',
  'призвание, статус и общественный результат',
  'друзья, сообщества, большие проекты и будущее',
  'уединение, бессознательное, завершение циклов и внутренняя тишина',
];

function signData(longitude) {
  const normalized = normalizeDegrees(longitude);
  const signIndex = Math.floor(normalized / 30);
  const sign = SIGNS[signIndex];
  return {
    ...sign,
    index: signIndex,
    degree: normalized - signIndex * 30,
    longitude: normalized,
    opposite: SIGNS[(signIndex + 6) % 12].name,
  };
}

function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function meanNorthNodeLongitude(date) {
  const T = (julianDay(date) - 2451545.0) / 36525;
  return normalizeDegrees(
    125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000,
  );
}

function meanObliquity(date) {
  const T = (julianDay(date) - 2451545.0) / 36525;
  const seconds = 21.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T;
  return 23 + 26 / 60 + seconds / 3600;
}

function anglesFor(date, latitude, longitude) {
  const gstHours = Astronomy.SiderealTime(date);
  const theta = normalizeDegrees(gstHours * 15 + longitude) * (Math.PI / 180);
  const epsilon = meanObliquity(date) * (Math.PI / 180);
  const phi = latitude * (Math.PI / 180);

  const mc = normalizeDegrees(
    Math.atan2(Math.sin(theta), Math.cos(theta) * Math.cos(epsilon)) * (180 / Math.PI),
  );

  // Eastern intersection of ecliptic with the local horizon.
  const ascRaw = Math.atan2(
    -Math.cos(theta),
    Math.sin(theta) * Math.cos(epsilon) + Math.tan(phi) * Math.sin(epsilon),
  ) * (180 / Math.PI);
  const ascendant = normalizeDegrees(ascRaw + 180);

  return { ascendant, mc };
}

function equalHouse(longitude, ascendant) {
  return Math.floor(normalizeDegrees(longitude - ascendant) / 30) + 1;
}

function formatDegree(degree) {
  const totalMinutes = Math.round(degree * 60);
  const whole = Math.floor(totalMinutes / 60) % 30;
  const minutes = totalMinutes % 60;
  return `${whole}°${String(minutes).padStart(2, '0')}′`;
}

function geocentricLongitude(body, date) {
  return normalizeDegrees(Astronomy.Ecliptic(Astronomy.GeoVector(body, date, true)).elon);
}

function calculateRetrograde(body, date) {
  const before = new Date(date.getTime() - 12 * 60 * 60 * 1000);
  const after = new Date(date.getTime() + 12 * 60 * 60 * 1000);
  const previous = geocentricLongitude(body, before);
  const next = geocentricLongitude(body, after);
  return signedAngularDelta(previous, next) < 0;
}

function aspectCandidates(points) {
  const definitions = [
    { type: 'соединение', angle: 0, orb: 8, symbol: '☌', tone: 'fusion' },
    { type: 'секстиль', angle: 60, orb: 5, symbol: '⚹', tone: 'support' },
    { type: 'квадрат', angle: 90, orb: 7, symbol: '□', tone: 'tension' },
    { type: 'тригон', angle: 120, orb: 7, symbol: '△', tone: 'support' },
    { type: 'оппозиция', angle: 180, orb: 8, symbol: '☍', tone: 'tension' },
  ];

  const aspects = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const separation = Math.abs(signedAngularDelta(a.longitude, b.longitude));
      for (const definition of definitions) {
        const luminaryBonus = ['sun', 'moon'].includes(a.key) || ['sun', 'moon'].includes(b.key) ? 1 : 0;
        const allowed = definition.orb + luminaryBonus;
        const orb = Math.abs(separation - definition.angle);
        if (orb <= allowed) {
          aspects.push({
            ...definition,
            from: a.key,
            fromName: a.name,
            to: b.key,
            toName: b.name,
            orb: Number(orb.toFixed(2)),
            exactness: Number(clamp(1 - orb / allowed, 0, 1).toFixed(3)),
          });
          break;
        }
      }
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb).slice(0, 12);
}

async function geocodePlace(place) {
  const query = String(place || '').trim();
  if (!query) throw publicError('Укажите место рождения.');

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'ru');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'HeroStar/0.1 (birth-place geocoding; contact via app domain)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw publicError('Не удалось определить место рождения. Введите город и страну точнее.', 502);
  const results = await response.json();
  if (!results[0]) throw publicError('Место не найдено. Добавьте страну или регион.');

  return {
    label: results[0].display_name,
    latitude: Number(results[0].lat),
    longitude: Number(results[0].lon),
  };
}

export async function calculateNatalChart(input) {
  const name = String(input.name || '').trim().slice(0, 80) || 'Герой';
  const date = String(input.date || '').trim();
  const time = String(input.time || '').trim();
  const unknownTime = Boolean(input.unknownTime);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw publicError('Укажите корректную дату рождения.');
  if (!unknownTime && !/^\d{2}:\d{2}$/.test(time)) throw publicError('Укажите время рождения или отметьте, что оно неизвестно.');

  let location;
  if (Number.isFinite(Number(input.latitude)) && Number.isFinite(Number(input.longitude))) {
    location = {
      label: String(input.place || `${input.latitude}, ${input.longitude}`),
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
    };
  } else {
    location = await geocodePlace(input.place);
  }

  if (!unknownTime && Math.abs(location.latitude) > 66) {
    throw publicError('Для широт выше 66° текущая версия пока не строит дома надёжно. Укажите, что время неизвестно, чтобы получить планетарный портрет без домов.');
  }

  const zone = tzlookup(location.latitude, location.longitude);
  const localIso = `${date}T${unknownTime ? '12:00' : time}`;
  const localDateTime = DateTime.fromISO(localIso, { zone });
  if (!localDateTime.isValid) throw publicError('Дата и время не распознаны.');
  const utcDate = localDateTime.toUTC().toJSDate();

  const angles = unknownTime ? null : anglesFor(utcDate, location.latitude, location.longitude);

  const planets = BODIES.map(([key, nameRu, symbol, body]) => {
    const longitude = geocentricLongitude(body, utcDate);
    const sign = signData(longitude);
    const house = angles ? equalHouse(longitude, angles.ascendant) : null;
    return {
      key,
      name: nameRu,
      symbol,
      longitude,
      sign: sign.name,
      signSymbol: sign.symbol,
      signIndex: sign.index,
      oppositeSign: sign.opposite,
      degree: sign.degree,
      degreeLabel: formatDegree(sign.degree),
      house,
      houseArea: house ? HOUSE_AREAS[house - 1] : null,
      retrograde: !['sun', 'moon'].includes(key) && calculateRetrograde(body, utcDate),
    };
  });

  const nodeLongitude = meanNorthNodeLongitude(utcDate);
  const nodeSign = signData(nodeLongitude);
  const northNode = {
    key: 'northNode',
    name: 'Северный узел',
    symbol: '☊',
    longitude: nodeLongitude,
    sign: nodeSign.name,
    signSymbol: nodeSign.symbol,
    signIndex: nodeSign.index,
    oppositeSign: nodeSign.opposite,
    degree: nodeSign.degree,
    degreeLabel: formatDegree(nodeSign.degree),
    house: angles ? equalHouse(nodeLongitude, angles.ascendant) : null,
    houseArea: angles ? HOUSE_AREAS[equalHouse(nodeLongitude, angles.ascendant) - 1] : null,
    retrograde: true,
  };

  const allPoints = [...planets, northNode];
  const ascSign = angles ? signData(angles.ascendant) : null;
  const mcSign = angles ? signData(angles.mc) : null;

  const chart = {
    version: '0.1-equal-house',
    system: angles ? 'Равнодомная система' : 'Без домов: время рождения неизвестно',
    person: { name },
    birth: {
      date,
      time: unknownTime ? null : time,
      unknownTime,
      place: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: zone,
      utc: utcDate.toISOString(),
    },
    angles: angles
      ? {
          ascendant: {
            key: 'ascendant',
            name: 'Асцендент',
            symbol: 'ASC',
            longitude: angles.ascendant,
            sign: ascSign.name,
            signSymbol: ascSign.symbol,
            degree: ascSign.degree,
            degreeLabel: formatDegree(ascSign.degree),
          },
          mc: {
            key: 'mc',
            name: 'МС',
            symbol: 'MC',
            longitude: angles.mc,
            sign: mcSign.name,
            signSymbol: mcSign.symbol,
            degree: mcSign.degree,
            degreeLabel: formatDegree(mcSign.degree),
          },
        }
      : null,
    planets,
    northNode,
    aspects: aspectCandidates(allPoints),
  };

  return chart;
}

export { SIGNS, HOUSE_AREAS };
