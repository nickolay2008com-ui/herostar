import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('оба публичных адреса клона отдают одну и ту же актуальную страницу', async () => {
  const [canonical, slashRoute] = await Promise.all([
    read('public/clone.html'),
    read('public/clone/index.html'),
  ]);

  assert.equal(slashRoute, canonical);
  assert.match(canonical, /id="birthForm"/);
  assert.match(canonical, /id="questionForm"/);
  assert.match(canonical, /id="clonePaywall"/);
  assert.match(canonical, /id="clonePayButton"/);
  assert.match(canonical, /id="clonePassport"/);
  assert.match(canonical, /id="alignmentOffer"/);
  assert.doesNotMatch(canonical, /clone-product-bridge/);
  assert.doesNotMatch(canonical, /clone-conversion-hotfix/);
});

test('клиент соединяет создание, Telegram, историю, квоту и два платных продукта', async () => {
  const clone = await read('public/clone.js');

  assert.match(clone, /json\('\/api\/charts'/);
  assert.match(clone, /json\('\/api\/consult'/);
  assert.match(clone, /\/api\/charts\/\$\{encodeURIComponent\(state\.chartId\)\}\/messages/);
  assert.match(clone, /\/api\/charts\/\$\{state\.chartId\}\/claim/);
  assert.match(clone, /callback\.searchParams\.set\('state', `clone:/);
  assert.match(clone, /CLONE_FREE_LIMIT/);
  assert.match(clone, /cloneUsage/);
  assert.match(clone, /json\('\/api\/payments\/create'/);
  assert.match(clone, /offerCode,/);
  assert.match(clone, /clone_day/);
  assert.match(clone, /clone_alignment/);
  assert.match(clone, /verifyPaymentReturn/);
  assert.match(clone, /\/api\/payments\/status/);
  assert.match(clone, /\/api\/me\/charts/);
  assert.match(clone, /personalDataConsent/);
  assert.match(clone, /clone_payment_success/);
});

test('каждый денежный и продуктовый шаг сохраняет единый visitor id без перехвата fetch', async () => {
  const clone = await read('public/clone.js');

  assert.match(clone, /herostar_visitor_id/);
  assert.match(clone, /headers\['x-visitor-id'\] = visitorId\(\)/);
  assert.match(clone, /product: 'clone'/);
  assert.match(clone, /visitorId: visitorId\(\)/);
});

test('сервер содержит все звенья публичного и административного пути', async () => {
  const server = await read('server.js');

  for (const route of [
    '/health',
    '/api/config',
    '/api/places',
    '/api/charts',
    '/api/consult',
    '/auth/telegram/callback',
    '/api/payments/create',
    '/api/payments/webhook',
    '/admin',
    '/api/admin/overview',
    '/api/admin/charts',
  ]) {
    assert.match(server, new RegExp(route.replaceAll('/', '\\/')));
  }

  assert.match(server, /rawState\.startsWith\('clone:'\)/);
  assert.match(server, /res\.redirect\(`\/clone\/\?auth=ok/);
  assert.match(server, /requireUser/);
  assert.match(server, /requireAdmin/);
  assert.match(server, /express\.static\('public'/);
  assert.match(server, /initCommerce/);
  assert.match(server, /getCommerceState/);
});

test('серверная квота и ЮKassa замыкают бесплатный день и Сонастройку', async () => {
  const [auth, quota, payments, commerce] = await Promise.all([
    read('src/auth.js'),
    read('src/clone-quota.js'),
    read('src/payments.js'),
    read('src/commerce.js'),
  ]);

  assert.match(auth, /CLONE_FREE_QUESTION_LIMIT = 3/);
  assert.match(auth, /hasCloneAccessForChart/);
  assert.match(auth, /reserveCloneQuestion/);
  assert.match(auth, /completeCloneQuestion/);
  assert.match(auth, /releaseCloneQuestion/);
  assert.match(auth, /CLONE_FREE_LIMIT/);
  assert.match(quota, /FOR UPDATE/);
  assert.match(quota, /status IN \('reserved', 'completed'\)/);
  assert.match(payments, /currentRequestContext/);
  assert.match(payments, /\/clone\/\?payment=return&chart=/);
  assert.match(payments, /applyPaymentEntitlement/);
  assert.match(payments, /offer_code/);
  assert.match(payments, /reservePaymentCheckout/);
  assert.match(payments, /refreshPaymentStatus/);
  assert.match(commerce, /clone_day/);
  assert.match(commerce, /clone_alignment/);
  assert.doesNotMatch(payments, /grantPremium/);
});
