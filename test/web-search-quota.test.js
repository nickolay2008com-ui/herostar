import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reserveWebSearchUsage,
  updateWebSearchUsage,
} from '../src/store.js';

const atNoon = new Date('2031-04-12T12:00:00.000Z');

function reserve(userId, overrides = {}) {
  return reserveWebSearchUsage({
    reservationId: crypto.randomUUID(),
    userId,
    chartId: null,
    accessTier: 'free',
    userLimit: 1,
    globalLimit: 100,
    now: atNoon,
    ...overrides,
  });
}

test('free quota атомарно пропускает один поиск пользователя в сутки', async () => {
  const userId = 'quota-free-user';
  const [left, right] = await Promise.all([reserve(userId), reserve(userId)]);
  assert.equal([left.ok, right.ok].filter(Boolean).length, 1);
  const denied = left.ok ? right : left;
  assert.equal(denied.remaining, 0);
  assert.match(denied.resetsAt, /^2031-04-13T00:00:00/);
});

test('попытка поиска учитывается после обращения к провайдеру даже при timeout', async () => {
  const userId = 'quota-failed-user';
  const first = await reserve(userId);
  assert.equal(first.ok, true);
  await updateWebSearchUsage(first.reservationId, 'attempted');
  await updateWebSearchUsage(first.reservationId, 'failed', 'timeout');

  const retry = await reserve(userId);
  assert.equal(retry.ok, false);
  assert.equal(retry.remaining, 0);
});

test('глобальный лимит учитывает reservation до внешнего вызова', async () => {
  const now = new Date('2032-05-20T12:00:00.000Z');
  const first = await reserve('quota-global-first', { globalLimit: 1, now });
  const second = await reserve('quota-global-second', { globalLimit: 1, now });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.globalExhausted, true);
});

test('premium quota остаётся user-scoped, а не chart-scoped', async () => {
  const userId = 'quota-premium-user';
  const first = await reserve(userId, {
    chartId: '11111111-1111-4111-8111-111111111111',
    accessTier: 'premium',
    userLimit: 2,
  });
  const second = await reserve(userId, {
    chartId: '22222222-2222-4222-8222-222222222222',
    accessTier: 'premium',
    userLimit: 2,
  });
  const denied = await reserve(userId, {
    chartId: '33333333-3333-4333-8333-333333333333',
    accessTier: 'premium',
    userLimit: 2,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(denied.ok, false);
});
