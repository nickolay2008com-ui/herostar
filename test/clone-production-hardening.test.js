import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  OFFER_CODES,
  _resetCommerceForTests,
  applyPaymentEntitlement,
  getCommerceState,
  markCommercePaymentStatus,
  recordPaymentOffer,
  resolveOffer,
} from '../src/commerce.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test.beforeEach(() => _resetCommerceForTests());

test('покупка одного клона не открывает карту, паспорт и глубокий режим другого', async () => {
  await recordPaymentOffer({
    paymentId: 'scoped-day',
    userId: 'scope-user',
    chartId: 'chart-one',
    offerCode: OFFER_CODES.CLONE_DAY,
  });
  await markCommercePaymentStatus('scoped-day', 'succeeded');
  await applyPaymentEntitlement({
    paymentId: 'scoped-day',
    userId: 'scope-user',
    chartId: 'chart-one',
    offerCode: OFFER_CODES.CLONE_DAY,
  });

  const first = await getCommerceState({
    telegram_id: 'scope-user',
    accessProduct: 'clone',
    cloneEntitlementChartId: 'chart-one',
  }, new Date(), 'chart-one');
  const second = await getCommerceState({
    telegram_id: 'scope-user',
    accessProduct: 'clone',
    cloneEntitlementChartId: 'chart-two',
  }, new Date(), 'chart-two');

  assert.equal(first.access.mapUnlocked, true);
  assert.equal(first.access.clonePassportUnlocked, true);
  assert.equal(first.access.cloneAccessActive, true);
  assert.equal(second.access.mapUnlocked, false);
  assert.equal(second.access.clonePassportUnlocked, false);
  assert.equal(second.access.cloneAccessActive, false);

  await assert.rejects(
    resolveOffer({
      user: { telegram_id: 'scope-user' },
      product: 'clone',
      offerCode: OFFER_CODES.CLONE_DAY,
      chartId: 'chart-one',
    }),
    (error) => error.code === 'OFFER_NOT_AVAILABLE',
  );
  const secondOffer = await resolveOffer({
    user: { telegram_id: 'scope-user' },
    product: 'clone',
    offerCode: OFFER_CODES.CLONE_DAY,
    chartId: 'chart-two',
  });
  assert.equal(secondOffer.code, OFFER_CODES.CLONE_DAY);
});

test('сервер подставляет права конкретного клона и удаляет старые глобальные дубли', async () => {
  const [bootstrap, middleware, schema] = await Promise.all([
    read('bootstrap.js'),
    read('src/clone-access-middleware.js'),
    read('src/commerce/schema.js'),
  ]);
  assert.match(bootstrap, /handler\.name === 'attachUser'/);
  assert.match(bootstrap, /scopeCloneAccess/);
  assert.match(middleware, /await isCloneChart\(chartId\)/);
  assert.match(middleware, /decorateUserAccess\(req\.user, new Date\(\), \{ chartId, cloneContext: true \}\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS clone_chart_entitlements/);
  assert.match(schema, /PRIMARY KEY \(user_id, chart_id\)/);
  assert.match(schema, /SET clone_passport_unlocked = FALSE,/);
  assert.match(schema, /clone_access_until = NULL/);
  assert.match(schema, /map_payment\.offer_code = 'herostar_full_map' OR map_payment\.offer_code IS NULL/);
});

test('неизвестное время отключает вымышленную точность до отправки карты', async () => {
  const ui = await read('public/clone-ui-gears.js');
  assert.match(ui, /id="unknownTime"/);
  assert.match(ui, /timeInput\.required = !unknown/);
  assert.match(ui, /payload\.unknownTime = Boolean\(unknownTime\?\.checked\)/);
  assert.match(ui, /payload\.time = payload\.unknownTime \? ''/);
  assert.match(ui, /без домов, ASC\/DSC и MC\/IC/);
});

test('статика больше не смешивает старый HTML с новым JavaScript', async () => {
  const bootstrap = await read('bootstrap.js');
  assert.match(bootstrap, /maxAge: 0/);
  assert.match(bootstrap, /no-cache, no-store, must-revalidate/);
  assert.match(bootstrap, /Pragma/);
  assert.match(bootstrap, /Expires/);
});
