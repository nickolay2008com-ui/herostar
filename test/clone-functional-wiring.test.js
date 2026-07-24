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
  assert.ok(canonical.indexOf('/clone-product-bridge.js') < canonical.indexOf('/clone.js'));
});

test('клиент соединяет создание, Telegram, историю, квоту и оплату', async () => {
  const clone = await read('public/clone.js');

  assert.match(clone, /json\('\/api\/charts'/);
  assert.match(clone, /json\('\/api\/consult'/);
  assert.match(clone, /\/api\/charts\/\$\{encodeURIComponent\(state\.chartId\)\}\/messages/);
  assert.match(clone, /\/api\/charts\/\$\{state\.chartId\}\/claim/);
  assert.match(clone, /callback\.searchParams\.set\('state', `clone:/);
  assert.match(clone, /CLONE_FREE_LIMIT/);
  assert.match(clone, /cloneUsage/);
  assert.match(clone, /json\('\/api\/payments\/create'/);
  assert.match(clone, /verifyPaymentReturn/);
  assert.match(clone, /clone_payment_success/);
});

test('каждый денежный и продуктовый шаг сохраняет единый visitor id', async () => {
  const bridge = await read('public/clone-product-bridge.js');

  assert.match(bridge, /herostar_visitor_id/);
  assert.match(bridge, /\/api\/charts/);
  assert.match(bridge, /\/api\/consult/);
  assert.match(bridge, /\/api\/payments\/create/);
  assert.match(bridge, /headers\.set\('x-visitor-id', id\)/);
  assert.match(bridge, /product: 'clone', visitorId: id/);
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
});

test('серверная квота и ЮKassa замыкают бесплатный и платный контуры', async () => {
  const [auth, quota, payments] = await Promise.all([
    read('src/auth.js'),
    read('src/clone-quota.js'),
    read('src/payments.js'),
  ]);

  assert.match(auth, /CLONE_FREE_QUESTION_LIMIT = 3/);
  assert.match(auth, /reserveCloneQuestion/);
  assert.match(auth, /completeCloneQuestion/);
  assert.match(auth, /releaseCloneQuestion/);
  assert.match(auth, /CLONE_FREE_LIMIT/);
  assert.match(quota, /FOR UPDATE/);
  assert.match(quota, /status IN \('reserved', 'completed'\)/);
  assert.match(payments, /currentRequestContext/);
  assert.match(payments, /\/clone\/\?payment=return&chart=/);
  assert.match(payments, /product === 'clone'/);
  assert.match(payments, /grantPremium/);
});
