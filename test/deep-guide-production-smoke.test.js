import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = 'https://herostar.up.railway.app';
const runSmoke = process.env.RUN_DEEP_GUIDE_SMOKE === '1';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(25_000),
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
}

function assertGuide(card) {
  assert.ok(card.deepDive, `${card.id}: deepDive must exist`);
  assert.ok(card.deepDive.headline.length > 40);
  assert.ok(card.deepDive.purpose.length > 60);
  assert.equal(card.deepDive.lifeExamples.length, 3);
  assert.equal(card.deepDive.elementComparison.length, 4);
  assert.equal(card.deepDive.distinguish.length, 3);
  assert.equal(card.deepDive.practice.steps.length, 3);
  assert.ok(card.deepDive.formula.element.text);
  assert.ok(card.deepDive.formula.sign.text);
  assert.ok(card.deepDive.formula.house.text);
}

test('HeroStar deep guide production smoke', { timeout: 120_000, skip: !runSmoke }, async (t) => {
  await t.test('new interface assets are live', async () => {
    const health = await request('/health');
    assert.equal(health.response.status, 200);

    const app = await request('/app.js');
    assert.equal(app.response.status, 200);
    assert.match(app.body, /deep-dive-ui\.js/);
    assert.match(app.body, /deepDiveButtonMarkup/);

    const ui = await request('/deep-dive-ui.js');
    assert.equal(ui.response.status, 200);
    assert.match(ui.body, /Понять глубже/);
    assert.match(ui.body, /В жизни/);
    assert.match(ui.body, /Ресурс и стресс/);
    assert.match(ui.body, /Не путать/);

    const css = await request('/deep-dive.css');
    assert.equal(css.response.status, 200);
    assert.match(css.body, /deep-dive-modal/);
    assert.match(css.body, /deep-life-example/);
  });

  await t.test('ordinary anonymous chart exposes only three deep guides', async () => {
    const created = await request('/api/charts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-visitor-id': `deep-guide-smoke-${Date.now()}`,
      },
      body: JSON.stringify({
        name: 'Проверка',
        date: '1987-11-06',
        time: '01:15',
        place: 'Донецк',
        latitude: 48.0159,
        longitude: 37.8028,
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.portrait.cards.length, 11);

    const cards = created.body.portrait.cards;
    assertGuide(cards[0]);
    assertGuide(cards[1]);
    assertGuide(cards[2]);
    assert.equal(cards[3].locked, true);
    assert.equal('deepDive' in cards[3], false);
    assert.equal(cards[0].title, 'Ваше направление');
    assert.equal(cards[1].title, 'Как восстановить силы');
    assert.equal(cards[2].title, 'Как приходят решения');
    console.log('FREE_GUIDES', cards.slice(0, 3).map((card) => ({ id: card.id, title: card.title, headline: card.deepDive.headline })));
  });

  await t.test('demo chart contains all eleven deep guides', async () => {
    const created = await request('/api/charts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-visitor-id': `deep-guide-demo-${Date.now()}`,
      },
      body: JSON.stringify({ demo: true }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.portrait.version, '2.2-core');
    assert.equal(created.body.portrait.cards.length, 11);
    for (const card of created.body.portrait.cards) assertGuide(card);

    const mars = created.body.portrait.cards.find((card) => card.id === 'mars');
    const jupiter = created.body.portrait.cards.find((card) => card.id === 'jupiter');
    assert.match(mars.deepDive.headline, /действи/iu);
    assert.match(jupiter.deepDive.headline, /будущ|расшир/iu);
    console.log('DEMO_DEEP_GUIDES', created.body.portrait.cards.map((card) => card.id));
  });
});
