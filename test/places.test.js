import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhotonFeature, rankPlaces, searchPlaces, unpackSelectedPlace } from '../src/places.js';

test('Photon result becomes a concise city option', () => {
  const option = normalizePhotonFeature({
    properties: {
      name: 'Сан-Диего',
      state: 'Калифорния',
      country: 'США',
      countrycode: 'US',
      osm_type: 'R',
      osm_id: 253832,
      osm_value: 'city',
    },
    geometry: { coordinates: [-117.1611, 32.7157] },
  });

  assert.deepEqual(option, {
    id: 'R253832',
    label: 'Сан-Диего, Калифорния, США',
    primary: 'Сан-Диего',
    secondary: 'Калифорния, США',
    latitude: 32.7157,
    longitude: -117.1611,
    countryCode: 'US',
    layer: 'city',
  });
});

test('Invalid Photon coordinates are ignored', () => {
  const option = normalizePhotonFeature({
    properties: { name: 'Ошибка' },
    geometry: { coordinates: [300, 120] },
  });
  assert.equal(option, null);
});

test('exact large city outranks similarly named localities', () => {
  const results = rankPlaces([
    {
      id: 'N1', label: 'Донецкое, Северо-Казахстанская область, Казахстан', primary: 'Донецкое',
      secondary: 'Северо-Казахстанская область, Казахстан', latitude: 54.1, longitude: 69.2, countryCode: 'KZ', layer: 'village',
    },
    {
      id: 'N2', label: 'Донецк, Ростовская область, Россия', primary: 'Донецк',
      secondary: 'Ростовская область, Россия', latitude: 48.33, longitude: 39.95, countryCode: 'RU', layer: 'town',
    },
    {
      id: 'verified-geonames-709717', label: 'Донецк, Донецкая область', primary: 'Донецк',
      secondary: 'Донецкая область', latitude: 48.023, longitude: 37.80224, countryCode: '', layer: 'city',
    },
  ], 'донецк');

  assert.equal(results[0].id, 'verified-geonames-709717');
  assert.equal(results[0].label, 'Донецк, Донецкая область');
});

test('near-identical Photon duplicates collapse into one option', () => {
  const results = rankPlaces([
    { id: 'N1', label: 'Donetsk, Rostov Oblast, Russia', primary: 'Donetsk', secondary: 'Rostov Oblast, Russia', latitude: 48.332, longitude: 39.944, countryCode: 'RU', layer: 'town' },
    { id: 'R2', label: 'Донецк, Ростовская область, Россия', primary: 'Донецк', secondary: 'Ростовская область, Россия', latitude: 48.333, longitude: 39.945, countryCode: 'RU', layer: 'town' },
  ], 'донецк');

  assert.equal(results.length, 1);
});

test('Photon request uses a broad result set and explicit Russian language', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedHeaders;
  globalThis.fetch = async (url, options) => {
    capturedUrl = new URL(url);
    capturedHeaders = options.headers;
    return new Response(JSON.stringify({
      features: [{
        properties: {
          name: 'Сан-Диего',
          state: 'California',
          country: 'United States',
          countrycode: 'US',
          osm_type: 'R',
          osm_id: 253832,
          osm_value: 'city',
        },
        geometry: { coordinates: [-117.1611, 32.7157] },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const items = await searchPlaces(`Сан-${Date.now()}`);
    assert.equal(capturedUrl.searchParams.get('limit'), '40');
    assert.equal(capturedUrl.searchParams.get('lang'), 'ru');
    assert.equal(capturedUrl.searchParams.get('dedupe'), '0');
    assert.equal(capturedHeaders['Accept-Language'], 'ru,en;q=0.8');
    assert.equal(items.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Selected city carries exact coordinates into chart input', () => {
  const packed = `Сан-Диего, Калифорния, США\u001f32.7157\u001f-117.1611`;
  assert.deepEqual(unpackSelectedPlace(packed), {
    place: 'Сан-Диего, Калифорния, США',
    latitude: 32.7157,
    longitude: -117.1611,
  });
});

test('Ordinary place text stays compatible with fallback geocoding', () => {
  assert.deepEqual(unpackSelectedPlace('Донецк, Россия'), { place: 'Донецк, Россия' });
});
