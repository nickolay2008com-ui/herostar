import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = 'https://herostar.up.railway.app';
const timeout = 20_000;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeout),
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
}

test('HeroStar production smoke test', { timeout: 90_000 }, async (t) => {
  await t.test('health endpoint', async () => {
    const { response, body } = await request('/health');
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, service: 'herostar' });
  });

  await t.test('main page and static assets', async () => {
    const home = await request('/');
    assert.equal(home.response.status, 200);
    assert.match(home.body, /id="birthForm"/);
    assert.match(home.body, /src="\/app\.js"/);

    for (const path of ['/app.js', '/styles.css', '/analytics.js']) {
      const asset = await request(path);
      assert.equal(asset.response.status, 200, `${path} must be available`);
      assert.ok(String(asset.body).length > 100, `${path} must not be empty`);
    }
  });

  let config;
  await t.test('public configuration', async () => {
    const result = await request('/api/config');
    assert.equal(result.response.status, 200);
    config = result.body;
    for (const key of ['telegramConfigured', 'paymentsConfigured', 'openaiConfigured', 'adminConfigured', 'demoMode']) {
      assert.equal(typeof config[key], 'boolean', `${key} must be boolean`);
    }
    assert.equal(typeof config.freeCardCount, 'number');
    assert.equal(typeof config.price, 'number');
    console.log('PRODUCTION_CONFIG', JSON.stringify({
      telegramConfigured: config.telegramConfigured,
      telegramConfigurationIssue: config.telegramConfigurationIssue,
      paymentsConfigured: config.paymentsConfigured,
      openaiConfigured: config.openaiConfigured,
      adminConfigured: config.adminConfigured,
      demoMode: config.demoMode,
      freeCardCount: config.freeCardCount,
      price: config.price,
    }));
  });

  let chart;
  await t.test('create and read a v2.2 demo chart', async () => {
    const created = await request('/api/charts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-visitor-id': `production-smoke-${Date.now()}`,
      },
      body: JSON.stringify({ demo: true }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    chart = created.body;
    assert.match(chart.id, /^[0-9a-f-]{36}$/i);
    assert.ok(chart.accessToken);
    assert.equal(chart.demo, true);
    assert.equal(chart.source, 'local-v2.2');
    assert.equal(chart.portrait.version, '2.2-core');
    assert.equal(chart.portrait.cards.length, 11);
    assert.equal(chart.portrait.cards[0].id, 'sun');
    assert.equal(chart.portrait.cards.at(-1).id, 'northNode');
    assert.ok(chart.portrait.cards.every((card) => card.locked !== true));
    assert.ok(chart.portrait.cards.every((card) => card.matrix?.function && card.matrix?.action));
    assert.ok(chart.portrait.synthesis.formula);
    assert.ok(chart.portrait.synthesis.route.length >= 3);

    const fetched = await request(`/api/charts/${chart.id}`, {
      headers: { 'x-chart-token': chart.accessToken },
    });
    assert.equal(fetched.response.status, 200, JSON.stringify(fetched.body));
    assert.equal(fetched.body.id, chart.id);
    assert.equal(fetched.body.portrait.version, '2.2-core');
  });

  await t.test('protected routes stay protected', async () => {
    const admin = await request('/api/admin/overview');
    assert.equal(admin.response.status, 401);

    const consult = await request('/api/consult', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chartId: chart.id, question: 'Проверка доступа' }),
    });
    assert.equal(consult.response.status, 401);

    const payment = await request('/api/payments/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chartId: chart.id }),
    });
    assert.equal(payment.response.status, 401);
  });

  await t.test('admin page and analytics endpoint', async () => {
    const adminPage = await request('/admin', { redirect: 'follow' });
    assert.equal(adminPage.response.status, 200);
    assert.match(adminPage.body, /админ|admin/i);

    const event = await request('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'page_view', visitorId: `production-smoke-${Date.now()}` }),
    });
    assert.equal(event.response.status, 202);
    assert.equal(event.body.ok, true);
  });
});
