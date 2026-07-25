import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Звёздный клон показывает собственную кнопку подключения Telegram', async () => {
  const client = await read('public/clone-living.js');
  assert.match(client, /telegram-connect-button/);
  assert.match(client, /Подключить Telegram/);
  assert.match(client, /x-chart-token/);
  assert.match(client, /telegram_link/);
});

test('Telegram-ссылка проверяет право на конкретного клона', async () => {
  const auth = await read('src/telegram-link-auth.js');
  assert.match(auth, /verifyChartAccess/);
  assert.match(auth, /record\.accessTokenHash/);
  assert.match(auth, /CHART_TOKEN_REQUIRED/);
  assert.match(auth, /token_hash TEXT PRIMARY KEY/);
});

test('Telegram-вход не зависит от включённой Сонастройки', async () => {
  const [auth, bootstrap] = await Promise.all([
    read('src/telegram-link-auth.js'),
    read('bootstrap.js'),
  ]);
  assert.match(auth, /startTelegramLinkUpdatePolling/);
  assert.match(auth, /PRACTICE_NOTIFICATIONS_ENABLED/);
  assert.match(bootstrap, /startTelegramLinkUpdatePolling/);
});
