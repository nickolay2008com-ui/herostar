import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'https://herostar.up.railway.app';

async function request(path, options = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    ...options,
  });
  const body = await response.text();
  return { response, body };
}

function scriptPosition(html, filename) {
  return html.indexOf(filename);
}

test('production отдаёт актуальный Telegram-клиент в правильном порядке', { timeout: 60_000 }, async () => {
  for (const path of ['/clone/', '/clone/live/']) {
    const { response, body } = await request(path);
    assert.equal(response.status, 200, `${path} должен открываться`);

    const telegramClient = scriptPosition(body, '/clone-living.js?v=20260726-auth2');
    const cloneClient = scriptPosition(body, '/clone.js?v=20260726-auth2');
    assert.ok(telegramClient >= 0, `${path} должен загружать clone-living.js auth2`);
    assert.ok(cloneClient > telegramClient, `${path}: Telegram-клиент должен загрузиться раньше clone.js`);
  }

  const living = await request('/clone-living.js?v=20260726-auth2');
  assert.equal(living.response.status, 200);
  assert.match(living.body, /window\.mountCloneTelegramLink = enhanceTelegramSlot/);
  assert.match(living.body, /\/api\/auth\/telegram-link/);

  const clone = await request('/clone.js?v=20260726-auth2');
  assert.equal(clone.response.status, 200);
  assert.match(clone.body, /window\.mountCloneTelegramLink\(container\)/);
});

test('production API создаёт и сохраняет ожидающую Telegram-ссылку', { timeout: 60_000 }, async () => {
  const configResult = await request('/api/config');
  assert.equal(configResult.response.status, 200, '/api/config должен отвечать');
  const config = JSON.parse(configResult.body);
  assert.equal(config.telegramConfigured, true, 'Telegram должен быть настроен в Railway');

  const createdResult = await request('/api/auth/telegram-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(createdResult.response.status, 201, `создание ссылки: ${createdResult.body}`);
  const created = JSON.parse(createdResult.body);
  assert.match(created.token, /^[A-Za-z0-9_-]{24,80}$/);
  assert.match(created.telegramUrl, /^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=login_[A-Za-z0-9_-]{24,80}$/);
  assert.ok(Number(created.expiresInSeconds) >= 500);

  const statusResult = await request('/api/auth/telegram-link/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: created.token }),
  });
  assert.equal(statusResult.response.status, 200, `проверка ссылки: ${statusResult.body}`);
  const status = JSON.parse(statusResult.body);
  assert.equal(status.status, 'pending', 'новая ссылка должна храниться в БД и ждать /start в Telegram');
  assert.equal(statusResult.response.headers.get('set-cookie'), null, 'до подтверждения Telegram сессия не выдаётся');

  console.log(JSON.stringify({
    production: BASE_URL,
    telegramConfigured: config.telegramConfigured,
    linkCreated: true,
    persistedStatus: status.status,
    bot: new URL(created.telegramUrl).pathname.slice(1),
  }));
});
