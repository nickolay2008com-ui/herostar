import test from 'node:test';
import assert from 'node:assert/strict';
import {
  failPaymentCheckout,
  reservePaymentCheckout,
} from '../src/store.js';

test('две вкладки не создают параллельные платежи за одно предложение и карту', async () => {
  await reservePaymentCheckout({
    returnRef: '10000000-0000-4000-8000-000000000001',
    userId: 'checkout-user-1',
    chartId: '20000000-0000-4000-8000-000000000001',
    amount: 499,
    offerCode: 'clone_day',
  });

  await assert.rejects(
    reservePaymentCheckout({
      returnRef: '10000000-0000-4000-8000-000000000002',
      userId: 'checkout-user-1',
      chartId: '20000000-0000-4000-8000-000000000001',
      amount: 499,
      offerCode: 'clone_day',
    }),
    (error) => error.code === 'PAYMENT_CHECKOUT_ACTIVE',
  );

  await failPaymentCheckout('10000000-0000-4000-8000-000000000001', 'user canceled');
  const retry = await reservePaymentCheckout({
    returnRef: '10000000-0000-4000-8000-000000000003',
    userId: 'checkout-user-1',
    chartId: '20000000-0000-4000-8000-000000000001',
    amount: 499,
    offerCode: 'clone_day',
  });
  assert.equal(retry.status, 'checkout_reserved');
});
