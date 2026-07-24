import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('кнопка оплаты включается по готовности ЮKassa', () => {
  const source = read('public/app.js');
  assert.match(source, /Boolean\(state\.config\.paymentsConfigured\)/);
  assert.match(source, /els\.payButton\.disabled = !paymentReady/);
});

test('оферта и возвраты остаются рядом с оплатой', () => {
  const html = read('public/index.html');
  assert.match(html, /href="\/offer"/);
  assert.match(html, /href="\/refunds"/);
});

test('платёжный endpoint требует Telegram-пользователя и полную production-готовность', () => {
  const server = read('server.js');
  const readiness = read('src/production-readiness.js');
  assert.match(server, /app\.post\('\/api\/payments\/create', requireUser/);
  assert.match(server, /requirePaymentReadiness/);
  assert.match(readiness, /YOOKASSA_SHOP_ID/);
  assert.match(readiness, /YOOKASSA_SECRET_KEY/);
  assert.match(readiness, /LEGAL_DETAILS/);
  assert.match(readiness, /DATABASE_URL/);
  assert.match(readiness, /SESSION_SECRET/);
  assert.match(readiness, /APP_URL_HTTPS/);
});
