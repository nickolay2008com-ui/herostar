import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  _resetCommerceForTests,
  applyPaymentEntitlement,
  getCommerceState,
  markCommercePaymentStatus,
  recordPaymentOffer,
  resolveOffer,
} from '../src/commerce.js';
import {
  CLONE_SUPPORT_MAX_AMOUNT,
  CLONE_SUPPORT_MIN_AMOUNT,
  CLONE_SUPPORT_SUGGESTED_AMOUNTS,
  cloneSupportOfferCode,
  parseCloneSupportOfferCode,
} from '../src/commerce/catalog.js';

const DAY = 24 * 60 * 60 * 1000;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test.beforeEach(() => _resetCommerceForTests());

test('добровольная поддержка имеет серверные границы и не принимает подменённую сумму', () => {
  assert.equal(CLONE_SUPPORT_MIN_AMOUNT, 100);
  assert.equal(CLONE_SUPPORT_MAX_AMOUNT, 10000);
  assert.deepEqual(CLONE_SUPPORT_SUGGESTED_AMOUNTS, [199, 499, 999]);
  assert.equal(parseCloneSupportOfferCode('clone_support_99'), null);
  assert.equal(parseCloneSupportOfferCode('clone_support_10001'), null);
  assert.equal(parseCloneSupportOfferCode('clone_support_199.5'), null);
  assert.equal(parseCloneSupportOfferCode('clone_support_abc'), null);
  assert.equal(cloneSupportOfferCode(350), 'clone_support_350');
  assert.equal(parseCloneSupportOfferCode('clone_support_350')?.amount, 350);
});

test('resolveOffer берёт сумму поддержки только из проверенного server-side offer code', async () => {
  const offer = await resolveOffer({
    user: { telegram_id: '42' },
    offerCode: 'clone_support_350',
    product: 'clone',
    chartId: 'chart-1',
  });
  assert.equal(offer.amount, 350);
  assert.equal(offer.product, 'clone');
  assert.equal(offer.support, true);

  await assert.rejects(
    resolveOffer({
      user: { telegram_id: '42' },
      offerCode: 'clone_support_10001',
      product: 'clone',
      chartId: 'chart-1',
    }),
    (error) => error.code === 'UNKNOWN_OFFER' && error.status === 400,
  );
});

test('config отдаёт UI те же min/max и рекомендуемые суммы, что использует сервер', async () => {
  const state = await getCommerceState({ telegram_id: '42' }, new Date(), 'chart-1');
  assert.equal(state.offers.support.minAmount, CLONE_SUPPORT_MIN_AMOUNT);
  assert.equal(state.offers.support.maxAmount, CLONE_SUPPORT_MAX_AMOUNT);
  assert.deepEqual(state.offers.support.suggestedAmounts, CLONE_SUPPORT_SUGGESTED_AMOUNTS);
  assert.equal(state.offers.support.codePrefix, 'clone_support_');
});

test('поддержка навсегда открывает карту и Паспорт и даёт около 24 часов глубокого режима', async () => {
  const offerCode = 'clone_support_350';
  await recordPaymentOffer({ paymentId: 'support-1', userId: '42', chartId: 'chart-1', offerCode });
  await markCommercePaymentStatus('support-1', 'succeeded');
  const before = Date.now();
  const access = await applyPaymentEntitlement({
    paymentId: 'support-1',
    userId: '42',
    chartId: 'chart-1',
    offerCode,
  });

  assert.equal(access.mapUnlocked, true);
  assert.equal(access.clonePassportUnlocked, true);
  assert.equal(access.cloneAccessActive, true);
  assert.equal(access.clonePlan, 'day');
  const duration = new Date(access.cloneAccessUntil).getTime() - before;
  assert.ok(duration >= DAY - 2000 && duration <= DAY + 5000);
});

test('повторная обработка одного support webhook не начисляет второй день', async () => {
  const offerCode = 'clone_support_499';
  await recordPaymentOffer({ paymentId: 'support-idempotent', userId: '42', chartId: 'chart-1', offerCode });
  await markCommercePaymentStatus('support-idempotent', 'succeeded');
  const first = await applyPaymentEntitlement({
    paymentId: 'support-idempotent',
    userId: '42',
    chartId: 'chart-1',
    offerCode,
  });
  const second = await applyPaymentEntitlement({
    paymentId: 'support-idempotent',
    userId: '42',
    chartId: 'chart-1',
    offerCode,
  });
  assert.equal(second.cloneAccessUntil, first.cloneAccessUntil);
});

test('ЮKassa получает честное описание поддержки как услуги, а не фиктивное пожертвование', async () => {
  const payments = await read('src/payments.js');
  assert.match(payments, /if \(offer\.support\)/);
  assert.match(payments, /поддержка развития Звёздного клона/);
  assert.match(payments, /24-часовым бонусом глубокого режима/);
  assert.doesNotMatch(payments, /пожертвован/i);
  assert.match(payments, /amount: \{ value: amount, currency: 'RUB' \}/);
  assert.match(payments, /offer_code: offer\.code/);
});

test('Live показывает поддержку только после пользы и никогда не блокирует бесплатный диалог', async () => {
  const [app, styles] = await Promise.all([
    read('public/clone/live/live-app.js'),
    read('public/clone/live/live-app.css'),
  ]);
  assert.match(app, /answers\.length < 3/);
  assert.match(app, /!config\.user \|\| !config\.paymentsConfigured/);
  assert.match(app, /config\.user\.cloneAccessActive/);
  assert.match(app, /Это добровольно — бесплатный диалог продолжит работать независимо от оплаты/);
  assert.match(app, /selectedSupportAmount = null/);
  assert.match(app, /suggestedAmounts\.forEach/);
  assert.match(styles, /#fullModeOffer,[\s\S]*?#alignmentOffer,[\s\S]*?#clonePaywall,[\s\S]*?display:\s*none !important;/);
  assert.match(styles, /\.live-support-open,[\s\S]*?min-height:\s*44px/);
});

test('Live действия поддержки переживают пересборку DOM истории и touch-перехват', async () => {
  const app = await read('public/clone/live/live-app.js');
  assert.match(app, /const existingCard = messages\.querySelector\('\.live-support-card'\)/);
  assert.match(app, /document\.addEventListener\('click'/);
  assert.match(app, /const currentMessages = document\.querySelector\('#messages'\)/);
  assert.match(app, /currentMessages\?\.contains\(openButton\)/);
  assert.match(app, /currentMessages\?\.contains\(dismissButton\)/);
  assert.match(app, /target\.closest\('\.live-support-open'\)/);
  assert.match(app, /target\.closest\('\.live-support-dismiss'\)/);
  assert.match(app, /dismissSupport\(dismissButton\)/);
  assert.match(app, /\}, true\);/);
});

test('Live открывает modal синхронно из уже проверенного config, а checkout перепроверяет config перед оплатой', async () => {
  const app = await read('public/clone/live/live-app.js');
  assert.match(app, /function openSupportModal\(trigger\) \{\s*const config = supportConfigCache\?\.value;/);
  assert.doesNotMatch(app, /async function openSupportModal/);
  assert.match(app, /async function startSupportCheckout\(\) \{\s*const config = await loadSupportConfig\(\{ force: true \}\);/);
});

test('Live checkout передаёт только offerCode, а итоговую сумму заново определяет сервер', async () => {
  const app = await read('public/clone/live/live-app.js');
  const start = app.indexOf("fetch('/api/payments/create'");
  const end = app.indexOf('const result =', start);
  assert.ok(start > 0 && end > start);
  const checkoutCall = app.slice(start, end);
  assert.match(checkoutCall, /product:\s*'clone'/);
  assert.match(checkoutCall, /offerCode/);
  assert.doesNotMatch(checkoutCall, /\bamount\s*[:,]/);
  assert.match(app, /const offerCode = `\$\{support\.codePrefix\}\$\{amount\}`/);
  assert.match(app, /amount < min \|\| amount > max/);
  assert.match(app, /starClonePendingPayment/);
});
