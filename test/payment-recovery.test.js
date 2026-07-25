import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recoverPendingPayments } from '../src/payment-recovery.js';

test('фоновая сверка проверяет только незавершённые платежи и продолжает после единичной ошибки', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      assert.match(sql, /status IN \('pending', 'waiting_for_capture'\)/);
      assert.match(sql, /status = 'succeeded' AND entitlement_applied_at IS NULL/);
      assert.match(sql, /id NOT LIKE 'checkout:%'/);
      assert.deepEqual(params, [20]);
      return { rows: [{ id: 'payment-ok' }, { id: 'payment-error' }] };
    },
  };

  const errors = [];
  const result = await recoverPendingPayments({
    pool,
    recoverPayment: async (paymentId) => {
      calls.push(paymentId);
      if (paymentId === 'payment-error') throw new Error('temporary provider error');
    },
    onError: (paymentId, error) => errors.push([paymentId, error.message]),
  });

  assert.deepEqual(calls, ['payment-ok', 'payment-error']);
  assert.deepEqual(errors, [['payment-error', 'temporary provider error']]);
  assert.deepEqual(result, { checked: 2, reconciled: 1, failed: 1 });
});

test('bootstrap запускает восстановление после инициализации сервера', async () => {
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /await import\('\.\/server\.js'\)/);
  assert.match(bootstrap, /startPaymentRecovery/);
  assert.ok(bootstrap.indexOf("await import('./server.js')") < bootstrap.indexOf('startPaymentRecovery'));
});
