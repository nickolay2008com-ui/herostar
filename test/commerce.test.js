import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFER_CODES,
  _resetCommerceForTests,
  applyPaymentEntitlement,
  getCommerceState,
  hasCloneAccessForChart,
  normalizeAccess,
  offerCatalog,
  recordPaymentOffer,
  markCommercePaymentStatus,
  resolveOffer,
} from '../src/commerce.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

test.beforeEach(() => _resetCommerceForTests());

test('старый и живой клон имеют отдельные предложения', () => {
  const catalog = offerCatalog({});
  assert.equal(catalog[OFFER_CODES.CLONE_DAY].amount, 499);
  assert.equal(catalog[OFFER_CODES.CLONE_DAY].durationHours, 24);
  assert.equal(catalog[OFFER_CODES.CLONE_ALIGNMENT].amount, 1499);
  assert.equal(catalog[OFFER_CODES.CLONE_LIVE_WEEK].amount, 490);
  assert.equal(catalog[OFFER_CODES.CLONE_LIVE_WEEK].durationHours, 168);
  assert.equal(catalog[OFFER_CODES.CLONE_LIVE_MONTH].amount, 990);
  assert.equal(catalog[OFFER_CODES.CLONE_LIVE_MONTH].upgradeAmount, 500);
});

test('постоянная карта отделена от временного диалога', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const access = normalizeAccess({
    telegram_id: '42',
    full_map_unlocked: true,
    clone_access_until: '2026-07-24T11:59:59.000Z',
  }, now);
  assert.equal(access.mapUnlocked, true);
  assert.equal(access.cloneAccessActive, false);
});

test('старый однодневный тариф сохраняет прежнюю полную карту', async () => {
  await recordPaymentOffer({ paymentId:'old-day', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_DAY });
  await markCommercePaymentStatus('old-day', 'succeeded');
  const before = Date.now();
  const access = await applyPaymentEntitlement({
    paymentId:'old-day', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_DAY,
  });
  assert.equal(access.mapUnlocked, true);
  assert.equal(access.clonePassportUnlocked, true);
  const duration = new Date(access.cloneAccessUntil).getTime() - before;
  assert.ok(duration >= DAY - 2000 && duration <= DAY + 5000);
});

test('live-неделя даёт семь дней диалога без подмены полной карты', async () => {
  await recordPaymentOffer({ paymentId:'live-week', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_WEEK });
  await markCommercePaymentStatus('live-week', 'succeeded');
  const before = Date.now();
  const access = await applyPaymentEntitlement({
    paymentId:'live-week', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_WEEK,
  });
  assert.equal(access.mapUnlocked, false);
  assert.equal(access.clonePassportUnlocked, false);
  assert.equal(access.cloneAccessActive, true);
  const duration = new Date(access.cloneAccessUntil).getTime() - before;
  assert.ok(duration >= WEEK - 2000 && duration <= WEEK + 5000);
});

test('live-неделя засчитывается в live-месяц', async () => {
  await recordPaymentOffer({ paymentId:'live-week-2', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_WEEK });
  await markCommercePaymentStatus('live-week-2', 'succeeded');
  await applyPaymentEntitlement({
    paymentId:'live-week-2', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_WEEK,
  });

  const offer = await resolveOffer({
    user:{ telegram_id:'42' }, offerCode:OFFER_CODES.CLONE_LIVE_MONTH,
    product:'clone', chartId:'chart-1',
  });
  assert.equal(offer.amount, 500);
  assert.equal(offer.creditSourcePaymentId, 'live-week-2');
});

test('live-месяц открывает полную карту и привязан к выбранному клону', async () => {
  await recordPaymentOffer({ paymentId:'live-month', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_MONTH });
  await markCommercePaymentStatus('live-month', 'succeeded');
  const access = await applyPaymentEntitlement({
    paymentId:'live-month', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_MONTH,
  });
  assert.equal(access.mapUnlocked, true);
  assert.equal(access.clonePassportUnlocked, true);
  assert.equal(access.cloneAlignmentChartId, 'chart-1');
  assert.equal(hasCloneAccessForChart(access, 'chart-1'), true);
  assert.equal(hasCloneAccessForChart(access, 'chart-2'), false);
});

test('повторный webhook не продлевает live-доступ второй раз', async () => {
  await recordPaymentOffer({ paymentId:'live-idempotent', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_WEEK });
  await markCommercePaymentStatus('live-idempotent', 'succeeded');
  const first = await applyPaymentEntitlement({
    paymentId:'live-idempotent', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_WEEK,
  });
  const second = await applyPaymentEntitlement({
    paymentId:'live-idempotent', userId:'42', chartId:'chart-1', offerCode:OFFER_CODES.CLONE_LIVE_WEEK,
  });
  assert.equal(second.cloneAccessUntil, first.cloneAccessUntil);
});

test('неавторизованный пользователь видит оба набора предложений', async () => {
  const state = await getCommerceState(null, new Date(), null);
  assert.equal(state.offers.day.code, OFFER_CODES.CLONE_DAY);
  assert.equal(state.offers.liveWeek.code, OFFER_CODES.CLONE_LIVE_WEEK);
  assert.equal(state.offers.liveMonth.code, OFFER_CODES.CLONE_LIVE_MONTH);
});
