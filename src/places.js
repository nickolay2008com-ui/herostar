import { publicError } from './utils.js';

const DEFAULT_PHOTON_URL = 'https://photon.komoot.io/api/';
const DEFAULT_PHOTON_STRUCTURED_URL = 'https://photon.komoot.io/structured';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 300;
const RESULT_LIMIT = 8;
const cache = new Map();
const pending = new Map();

// Короткий локальный слой для неоднозначных городов, которые внешние индексы
// иногда ранжируют ниже одноимённых небольших населённых пунктов.
const VERIFIED_PLACES = [
  {
    id: 'verified-geonames-709717',
    aliases: ['донецк', 'донецьк', 'donetsk', 'doneck', 'donezk'],
    label: 'Донецк, Донецкая область',
    primary: 'Донецк',
    secondary: 'Донецкая область',
    latitude: 48.023,
    longitude: 37.80224,
    countryCode: '',
    layer: 'city',
  },
];

function cleanText(value, maxLength = 180) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function searchKey(value) {
  return cleanText(value, 240)
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cityQueryKey(value) {
  return searchKey(String(value || '').split(',')[0]);
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const clean = cleanText(part);
    if (!clean) return false;
    const key = searchKey(clean);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verifiedMatches(query) {
  const key = cityQueryKey(query);
  if (key.length < 3) return [];
  return VERIFIED_PLACES
    .filter((place) => place.aliases.some((alias) => searchKey(alias).startsWith(key)))
    .map(({ aliases: _aliases, ...place }) => ({ ...place }));
}

export function normalizePhotonFeature(feature, index = 0) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  const primary = cleanText(
    properties.name
      || properties.city
      || properties.town
      || properties.village
      || properties.locality,
  );

  if (!primary || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const region = cleanText(
    properties.state
      || properties.county
      || properties.district
      || properties.city
      || properties.locality,
  );
  const country = cleanText(properties.country);
  const label = uniqueParts([primary, region, country]).join(', ');
  const secondary = uniqueParts([region, country]).join(', ');
  const osmType = cleanText(properties.osm_type, 4);
  const osmId = cleanText(properties.osm_id, 40);
  const layer = cleanText(properties.osm_value || properties.type || 'place', 40).toLocaleLowerCase('en-US');

  return {
    id: osmType && osmId ? `${osmType}${osmId}` : `place-${index}-${latitude}-${longitude}`,
    label,
    primary,
    secondary,
    latitude,
    longitude,
    countryCode: cleanText(properties.countrycode, 3).toUpperCase(),
    layer,
  };
}

function scorePlace(item, query, providerIndex) {
  const queryKey = searchKey(query);
  const queryCity = cityQueryKey(query);
  const primary = searchKey(item.primary);
  const label = searchKey(item.label);
  let score = 0;

  if (item.id.startsWith('verified-')) score += 1200;
  if (primary === queryCity) score += 500;
  else if (primary.startsWith(queryCity)) score += 260;
  else if (primary.includes(queryCity)) score += 120;

  const tokens = queryKey.split(' ').filter(Boolean);
  if (tokens.length && tokens.every((token) => label.includes(token))) score += 90;

  const kindScores = {
    city: 190,
    town: 140,
    municipality: 115,
    borough: 95,
    village: 65,
    locality: 45,
    district: 20,
    county: -30,
    state: -90,
    country: -140,
  };
  score += kindScores[item.layer] ?? 0;
  if (String(item.id).startsWith('R')) score += 16;
  score -= providerIndex * 0.1;
  return score;
}

function distanceKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function rankPlaces(rawItems, query, limit = RESULT_LIMIT) {
  const sorted = rawItems
    .filter(Boolean)
    .map((item, index) => ({ item, score: scorePlace(item, query, index) }))
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'ru'));

  const result = [];
  const labels = new Set();
  for (const { item } of sorted) {
    const labelKey = searchKey(item.label);
    if (labels.has(labelKey)) continue;
    if (result.some((existing) => distanceKm(existing, item) < 2.5)) continue;
    labels.add(labelKey);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function remember(key, items) {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, items });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

async function requestPhoton(endpoint, configure) {
  configure(endpoint.searchParams);
  endpoint.searchParams.set('limit', '40');
  endpoint.searchParams.set('dedupe', '0');
  endpoint.searchParams.append('layer', 'city');
  endpoint.searchParams.append('layer', 'locality');
  endpoint.searchParams.append('layer', 'district');

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/geo+json, application/json',
      'Accept-Language': 'ru,en;q=0.8',
      'User-Agent': 'HeroStar/0.2 (+https://herostar.up.railway.app; birth-place suggestions)',
    },
    signal: AbortSignal.timeout(7000),
  });

  if (response.status === 429) {
    throw publicError('Поиск городов временно занят. Повторите через несколько секунд.', 503, 'PLACE_SEARCH_BUSY');
  }
  if (!response.ok) {
    throw publicError('Не удалось загрузить варианты городов.', 502, 'PLACE_SEARCH_FAILED');
  }

  const payload = await response.json().catch(() => ({}));
  return (payload.features || []).map(normalizePhotonFeature).filter(Boolean);
}

async function fetchPhoton(query) {
  const simpleEndpoint = new URL(process.env.PHOTON_API_URL || DEFAULT_PHOTON_URL);
  const simple = await requestPhoton(simpleEndpoint, (params) => params.set('q', query));
  const hasExactCity = simple.some((item) => {
    const exact = searchKey(item.primary) === cityQueryKey(query);
    return exact && ['city', 'town', 'municipality'].includes(item.layer);
  });

  if (hasExactCity) return simple;

  try {
    const structuredEndpoint = new URL(process.env.PHOTON_STRUCTURED_URL || DEFAULT_PHOTON_STRUCTURED_URL);
    const structured = await requestPhoton(structuredEndpoint, (params) => params.set('city', String(query).split(',')[0].trim()));
    return [...simple, ...structured];
  } catch {
    return simple;
  }
}

export async function searchPlaces(rawQuery) {
  const query = cleanText(rawQuery, 120);
  if (query.length < 2) return [];

  const key = searchKey(query);
  const cached = cache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.items;
  cache.delete(key);

  if (pending.has(key)) return pending.get(key);
  const request = fetchPhoton(query)
    .then((items) => {
      const ranked = rankPlaces([...verifiedMatches(query), ...items], query);
      remember(key, ranked);
      return ranked;
    })
    .catch((error) => {
      const verified = rankPlaces(verifiedMatches(query), query);
      if (verified.length) {
        remember(key, verified);
        return verified;
      }
      throw error;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function unpackSelectedPlace(value) {
  const raw = String(value || '');
  const parts = raw.split('\u001f');
  if (parts.length !== 3) return { place: raw };

  const place = cleanText(parts[0], 240);
  const latitude = Number(parts[1]);
  const longitude = Number(parts[2]);
  if (!place || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return { place: raw };
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { place: raw };

  return { place, latitude, longitude };
}
