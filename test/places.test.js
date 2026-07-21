import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhotonFeature, searchPlaces, unpackSelectedPlace } from '../src/places.js';

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

test('Photon request leaves language negotiation to Accept-Language', async () => {
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
    assert.equal(capturedUrl.searchParams.has('lang'), false);
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
