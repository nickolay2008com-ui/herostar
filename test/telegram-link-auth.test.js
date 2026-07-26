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

test('Telegram-вход одноразовый, а чувствительный token очищается до Метрики', async () => {
  const [auth, html, sanitizer, client] = await Promise.all([
    read('src/telegram-link-auth.js'),
    read('public/clone/live/index.html'),
    read('public/telegram-link-sanitize.js'),
    read('public/clone-living.js'),
  ]);

  const expiryCheck = auth.indexOf("return { status: 'expired' }");
  const consumedCheck = auth.indexOf("return { status: 'consumed', userId: record.userId");
  assert.ok(expiryCheck >= 0 && consumedCheck > expiryCheck);
  assert.doesNotMatch(auth, /reusableAuthorization/);
  assert.match(auth, /if \(result\.status === 'authorized'\)/);
  assert.match(auth, /const returnToken = crypto\.randomBytes\(24\)/);
  assert.match(auth, /telegram_link: returnToken/);
  assert.match(auth, /\/clone\/live\/\?\$\{new URLSearchParams/);
  assert.match(auth, /\(token_hash, chart_id, expires_at\)[\s\S]+VALUES \(\$1, \$2, \$3\)/);
  assert.match(auth, /VALUES \(\$1, \$2, \$3, \$4, \$5\)/);
  assert.doesNotMatch(auth, /CASE WHEN \$3 IS NULL/);
  assert.ok(
    html.indexOf('/telegram-link-sanitize.js') < html.indexOf('mc.yandex.ru/metrika/tag.js'),
    'telegram link sanitizer must run before Yandex Metrika',
  );
  assert.match(sanitizer, /sessionStorage\.setItem\(storageKey, token\)/);
  assert.match(sanitizer, /window\.__herostarTelegramLinkReturn = token/);
  assert.match(sanitizer, /url\.searchParams\.delete\(parameter\)/);
  assert.match(client, /sessionStorage\.getItem\(TELEGRAM_LINK_STORAGE_KEY\)/);
  assert.match(client, /window\.__herostarTelegramLinkReturn/);
});

test('старый Telegram callback не возвращает повреждённый ID и ведёт в live-интерфейс', async () => {
  const [server, client] = await Promise.all([
    read('server.js'),
    read('public/clone.js'),
  ]);

  assert.match(server, /const cloneChartId = isUuid\(candidate\) \? candidate : null/);
  assert.match(server, /res\.redirect\(`\/clone\/live\/\?auth=ok/);
  assert.doesNotMatch(server, /slice\('clone:'\.length\)\.replace/);
  assert.match(client, /location\.pathname\.startsWith\('\/clone\/live'\) \? '\/clone\/live\/' : '\/clone\/'/);
});
