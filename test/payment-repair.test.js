import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('платёж передаёт контакт и корректный чек ЮKassa', () => {
  const payment = read('src/payments.js');
  assert.match(payment, /receipt:\s*\{/);
  assert.match(payment, /vat_code:\s*1/);
  assert.match(payment, /payment_mode:\s*'full_payment'/);
  assert.match(payment, /payment_subject:\s*'service'/);
  assert.match(payment, /internet:\s*'true'/);
  assert.match(payment, /normalizeReceiptContact/);
});

test('клиент требует телефон или email для чека', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  assert.match(html, /id="receiptContact"/);
  assert.match(app, /normalizedReceiptContact/);
  assert.match(app, /receiptContact/);
});

test('публичные серверные ошибки больше не маскируются', () => {
  assert.match(read('src/utils.js'), /error\.expose = true/);
  assert.match(read('server.js'), /error\.expose \? error\.message/);
});

test('production return URL обязан быть HTTPS', () => {
  const payment = read('src/payments.js');
  assert.match(payment, /NODE_ENV === 'production'/);
  assert.match(payment, /url\.protocol !== 'https:'/);
  assert.match(payment, /https:\/\/herostar\.up\.railway\.app/);
});

test('платёжный контакт передаётся из API в модуль ЮKassa', () => {
  const server = read('server.js');
  assert.match(server, /receiptContact:\s*req\.body\.receiptContact/);
});