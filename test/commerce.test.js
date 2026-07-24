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

test('каталог фиксирует утверждённые продукты и не подхватывает устаревшие Railway-переменные', () => {
  const catalog = offerCatalog({ CLONE_DAY_PRICE: '499', CLONE_ALIGNMENT_PRICE: '1499' });
  assert.equal(catalog[OFFER_CODES.CLONE_DAY].amount, 490);
  assert.equal(catalog[OFFER_CODES.CLONE_DAY].durationHours, 168);
  assert.equal(catalog[OFFER_CODES.CLONE_ALIGNMENT].amount, 990);
  assert.equal(catalog[OFFER_CODES.CLONE_ALIGNMENT].upgradeAmount, 500);
  assert.equal(catalog[OFFER_CODES.CLONE_ALIGNMENT].durationDays, 30);
  assert.equal('autoRenew' in catalog[OFFER_CODES.CLONE_ALIGNMENT], false);
});

test('постоянная карта отделена от временного глубокого диалога', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const access = normalizeAccess({
    telegram_id: '42',
    full_map_unlocked: true,
    clone_passport_unlocked: true,
    clone_access_until: '2026-07-24T11:59:59.000Z',
  }, now);

  assert.equal(access.mapUnlocked, true);
  assert.equal(access.clonePassportUnlocked, true);
  assert.equal(access.cloneAccessActive, false);
  assert.equal(access.clonePlan, 'free');
});

test('первый тариф даёт семь дней диалога, но не подменяет месячный тариф с полной картой', async () => {
  const before = Date.now();
  await recordPaymentOffer({
    paymentId: 'day-1',
    userId: '42',
    chartId: 'chart-1',
    offerCode: OFFER_CODES.CLONE_DAY,
  });
  await markCommercePaymentStatus('day-1', 'succeeded');
  const access = await applyPaymentEntitlement({
    paymentId: 'day-1',
    userId: '42',
    chartId: 'chart-1',
    offerCode: OFFER_CODES.CLONE_DAY,
  });

  assert.equal(access.mapUnlocked, false);
  assert.equal(access.clonePassportUnlocked, false);
  assert.equal(access.cloneAccessActive, true);
  assert.equal(access.clonePlan, 'day');
  const duration = new Date(access.cloneAccessUntil).getTime() - before;
  assert.ok(duration >= WEEK - 2000 && duration <= WEEK + 5000);
});

test('успешные семь дней засчитывают 490 рублей в месячный доступ и оставляют 500', async () => {
  await recordPaymentOffer({ paymentId: 'day-2', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY });
  await markCommercePaymentStatus('day-2', 'succeeded');
  await applyPaymentEntitlement({ paymentId: 'day-2', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY });

  const state = await getCommerceState({ telegram_id: '42' }, new Date(), 'chart-1');
  assert.equal(state.offers.alignment.credited, true);
  assert.equal(state.offers.alignment.creditAmount, 490);
  assert.equal(state.offers.alignment.payableAmount, 500);
  assert.equal(state.offers.alignment.creditSourcePaymentId, 'day-2');

  const offer = await resolveOffer({ user: { telegram_id: '42' }, offerCode: OFFER_CODES.CLONE_ALIGNMENT, product: 'clone', chartId: 'chart-1' });
  assert.equal(offer.amount, 500);
  assert.equal(offer.creditSourcePaymentId, 'day-2');
});

test('активный недельный режим нельзя случайно купить второй раз', async () => {
  await recordPaymentOffer({ paymentId: 'day-active', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY });
  await markCommercePaymentStatus('day-active', 'succeeded');
  await applyPaymentEntitlement({ paymentId: 'day-active', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY });

  await assert.rejects(
    resolveOffer({ user: { telegram_id: '42' }, offerCode: OFFER_CODES.CLONE_DAY, product: 'clone', chartId: 'chart-1' }),
    (error) => error.code === 'OFFER_NOT_AVAILABLE' && error.status === 409,
  );
});

test('месячный доступ начинается на 30 дней от покупки, не превращая остаток недели в 37 дней', async () => {
  await recordPaymentOffer({ paymentId: 'day-3', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY });
  await markCommercePaymentStatus('day-3', 'succeeded');
  await applyPaymentEntitlement({ paymentId: 'day-3', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY });

  await recordPaymentOffer({
    paymentId: 'alignment-1',
    userId: '42',
    chartId: 'chart-1',
    offerCode: OFFER_CODES.CLONE_ALIGNMENT,
    creditSourcePaymentId: 'day-3',
  });
  await markCommercePaymentStatus('alignment-1', 'succeeded');
  const before = Date.now();
  const access = await applyPaymentEntitlement({
    paymentId: 'alignment-1',
    userId: '42',
    chartId: 'chart-1',
    offerCode: OFFER_CODES.CLONE_ALIGNMENT,
    creditSourcePaymentId: 'day-3',
  });

  assert.equal(access.clonePlan, 'alignment');
  assert.equal(access.cloneAccessActive, true);
  assert.equal(access.mapUnlocked, true);
  assert.equal(access.clonePassportUnlocked, true);
  const duration = new Date(access.cloneAlignmentUntil).getTime() - before;
  assert.ok(duration >= 30 * DAY - 2000 && duration <= 30 * DAY + 5000);
});

test('повторная обработка одного webhook не продлевает доступ второй раз', async () => {
  await recordPaymentOffer({ paymentId: 'day-idempotent', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY });
  await markCommercePaymentStatus('day-idempotent', 'succeeded');
  const first = await applyPaymentEntitlement({
    paymentId: 'day-idempotent', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY,
  });
  const second = await applyPaymentEntitlement({
    paymentId: 'day-idempotent', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_DAY,
  });
  assert.equal(second.cloneAccessUntil, first.cloneAccessUntil);
});

test('месячный доступ привязан к выбранному клону и не переключается незаметно', async () => {
  await recordPaymentOffer({
    paymentId: 'alignment-bound', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_ALIGNMENT,
  });
  await markCommercePaymentStatus('alignment-bound', 'succeeded');
  const access = await applyPaymentEntitlement({
    paymentId: 'alignment-bound', userId: '42', chartId: 'chart-1', offerCode: OFFER_CODES.CLONE_ALIGNMENT,
  });

  assert.equal(access.cloneAlignmentChartId, 'chart-1');
  await assert.rejects(
    resolveOffer({
      user: { telegram_id: '42' }, offerCode: OFFER_CODES.CLONE_ALIGNMENT, product: 'clone', chartId: 'chart-2',
    }),
    (error) => error.code === 'ALIGNMENT_ACTIVE_FOR_ANOTHER_CHART' && error.status === 409,
  );
});

test('месячный доступ открывает глубокий алгоритм только для оплаченного клона', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const user = {
    telegram_id: '42',
    clone_alignment_until: '2026-08-20T12:00:00.000Z',
    clone_alignment_chart_id: 'chart-1',
  };
  assert.equal(hasCloneAccessForChart(user, 'chart-1', now), true);
  assert.equal(hasCloneAccessForChart(user, 'chart-2', now), false);
  assert.equal(hasCloneAccessForChart({ ...user, clone_alignment_chart_id: null }, 'chart-1', now), false);
});
