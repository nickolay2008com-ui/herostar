import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Звёздный клон показывает собственную кнопку подключения Telegram', async () => {
  const [html, client] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone-living.js'),
  ]);
  assert.match(client, /telegram-connect-button/);
  assert.match(client, /Продолжить бесплатно в Telegram/);
  assert.match(client, /Открыть через Telegram/);
  assert.match(client, /x-chart-token/);
  assert.match(client, /telegram_link/);
  assert.match(client, /normalizedChartId/);
  assert.match(client, /restoresExistingClone\s*\?\s*\{\s*chartId:\s*null,\s*chartToken:\s*null\s*\}/s);
  assert.match(client, /const linkPayload = auth\.chartId \? \{ chartId: auth\.chartId \} : \{\}/);
  assert.match(html, /id="restoreTelegramSlot"[^>]*data-telegram-mode="restore"/);
});

test('Telegram-ссылка проверяет право на конкретного клона', async () => {
  const auth = await read('src/telegram-link-auth.js');
  assert.match(auth, /String\(value \?\? ''\)\.trim\(\)/);
  assert.match(auth, /verifyChartAccess/);
  assert.match(auth, /record\.accessTokenHash/);
  assert.match(auth, /CHART_TOKEN_REQUIRED/);
  assert.match(auth, /token_hash TEXT PRIMARY KEY/);
});

test('Telegram-вход не зависит от включённой Сонастройки', async () => {
  const [auth, bootstrap, practice] = await Promise.all([
    read('src/telegram-link-auth.js'),
    read('bootstrap.js'),
    read('src/practice-notifications.js'),
  ]);
  assert.match(auth, /startTelegramLinkUpdatePolling/);
  assert.match(auth, /PRACTICE_NOTIFICATIONS_ENABLED/);
  assert.match(bootstrap, /startTelegramLinkUpdatePolling/);
  assert.match(practice, /handleTelegramLinkUpdates\(updates/);
  assert.doesNotMatch(bootstrap, /globalThis\.fetch\s*=/);
});

test('Telegram-вход повторно устанавливает сессию только пока короткая ссылка не истекла', async () => {
  const auth = await read('src/telegram-link-auth.js');

  const expiryCheck = auth.indexOf("return { status: 'expired' }");
  const consumedCheck = auth.indexOf("return { status: 'consumed', userId: record.userId");
  assert.ok(expiryCheck >= 0 && consumedCheck > expiryCheck);
  assert.match(auth, /reusableAuthorization\s*=\s*result\.status === 'consumed' && result\.userId/);
  assert.match(auth, /\/clone\/live\/\?\$\{new URLSearchParams/);
});

test('старый Telegram callback не возвращает повреждённый ID и ведёт в live-интерфейс', async () => {
  const server = await read('server.js');

  assert.match(server, /const cloneChartId = isUuid\(candidate\) \? candidate : null/);
  assert.match(server, /res\.redirect\(`\/clone\/live\/\?auth=ok/);
  assert.doesNotMatch(server, /slice\('clone:'\.length\)\.replace/);
});
