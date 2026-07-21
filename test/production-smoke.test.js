import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = 'https://herostar.up.railway.app';
const runSmoke = process.env.RUN_PRODUCTION_SMOKE === '1';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
}

test('HeroStar place autocomplete production smoke', { timeout: 90_000, skip: !runSmoke }, async (t) => {
  await t.test('service and autocomplete assets are live', async () => {
    const health = await request('/health');
    assert.equal(health.response.status, 200);
    assert.deepEqual(health.body, { ok: true, service: 'herostar' });

    const treasure = await request('/treasure-experience.js');
    assert.equal(treasure.response.status, 200);
    assert.match(treasure.body, /place-autocomplete\.js/);

    const autocomplete = await request('/place-autocomplete.js');
    assert.equal(autocomplete.response.status, 200);
    assert.match(autocomplete.body, /\/api\/places/);
    assert.match(autocomplete.body, /координаты подтверждены/);
  });

  await t.test('diagnose Photon response', async () => {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', 'Сан');
    url.searchParams.set('limit', '8');
    url.searchParams.set('lang', 'ru');
    url.searchParams.append('layer', 'city');
    url.searchParams.append('layer', 'locality');
    url.searchParams.append('layer', 'state');
    url.searchParams.append('layer', 'country');
    const response = await fetch(url, {
      headers: {
        Accept: 'application/geo+json, application/json',
        'Accept-Language': 'ru,en;q=0.8',
        'User-Agent': 'HeroStar/0.1 (+https://herostar.up.railway.app; birth-place suggestions)',
      },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    console.log('PHOTON_RESPONSE', response.status, text.slice(0, 1000));
  });

  await t.test('production returns recognized cities for Russian input', async () => {
    const result = await request(`/api/places?q=${encodeURIComponent('Сан')}`);
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.ok(Array.isArray(result.body.items));
    assert.ok(result.body.items.length > 0, 'По запросу «Сан» должны вернуться варианты');

    const item = result.body.items[0];
    assert.equal(typeof item.label, 'string');
    assert.ok(item.label.length > 2);
    assert.ok(Number.isFinite(item.latitude));
    assert.ok(Number.isFinite(item.longitude));
    assert.ok(Math.abs(item.latitude) <= 90);
    assert.ok(Math.abs(item.longitude) <= 180);
    console.log('PLACE_SUGGESTION', JSON.stringify(item));
  });

  await t.test('existing v2.2 chart flow still works', async () => {
    const created = await request('/api/charts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ demo: true }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.portrait.version, '2.2-core');
    assert.equal(created.body.portrait.cards.length, 11);
  });
});
