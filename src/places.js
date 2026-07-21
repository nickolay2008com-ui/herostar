import { publicError } from './utils.js';

const DEFAULT_PHOTON_URL = 'https://photon.komoot.io/api/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 300;
const cache = new Map();
const pending = new Map();

function cleanText(value, maxLength = 180) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const clean = cleanText(part);
    if (!clean) return false;
    const key = clean.toLocaleLowerCase('ru-RU');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizePhotonFeature(feature, index = 0) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  const primary = cleanText(properties.name || properties.city || properties.locality);

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

  return {
    id: osmType && osmId ? `${osmType}${osmId}` : `place-${index}-${latitude}-${longitude}`,
    label,
    primary,
    secondary,
    latitude,
    longitude,
    countryCode: cleanText(properties.countrycode, 3).toUpperCase(),
    layer: cleanText(properties.type || properties.osm_value || 'place', 40),
  };
}

function remember(key, items) {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, items });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

async function fetchPhoton(query) {
  const endpoint = new URL(process.env.PHOTON_API_URL || DEFAULT_PHOTON_URL);
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('limit', '8');
  endpoint.searchParams.append('layer', 'city');
  endpoint.searchParams.append('layer', 'locality');
  endpoint.searchParams.append('layer', 'state');
  endpoint.searchParams.append('layer', 'country');

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/geo+json, application/json',
      'Accept-Language': 'ru,en;q=0.8',
      'User-Agent': 'HeroStar/0.1 (+https://herostar.up.railway.app; birth-place suggestions)',
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
  const seen = new Set();
  return (payload.features || [])
    .map(normalizePhotonFeature)
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.label.toLocaleLowerCase('ru-RU')}|${item.latitude.toFixed(4)}|${item.longitude.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

export async function searchPlaces(rawQuery) {
  const query = cleanText(rawQuery, 120);
  if (query.length < 2) return [];

  const key = query.toLocaleLowerCase('ru-RU');
  const cached = cache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.items;
  cache.delete(key);

  if (pending.has(key)) return pending.get(key);
  const request = fetchPhoton(query)
    .then((items) => {
      remember(key, items);
      return items;
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
