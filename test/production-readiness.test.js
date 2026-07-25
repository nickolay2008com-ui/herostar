import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentReadiness } from '../src/production-readiness.js';

function readyProductionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    YOOKASSA_SHOP_ID: 'shop-id',
    YOOKASSA_SECRET_KEY: 'secret-key',
    LEGAL_FULL_NAME: 'Иванов Иван Иванович',
    LEGAL_OGRNIP: '123456789012345',
    DATABASE_URL: 'postgres://example',
    SESSION_SECRET: 'x'.repeat(48),
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    ...overrides,
  };
}

test('Railway public domain без схемы считается корректным HTTPS-адресом', () => {
  const readiness = getPaymentReadiness(readyProductionEnv({
    RAILWAY_PUBLIC_DOMAIN: 'herostar.up.railway.app',
  }));

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.issues, []);
});

test('явный HTTP-адрес не проходит production gate оплаты', () => {
  const readiness = getPaymentReadiness(readyProductionEnv({
    APP_URL: 'http://herostar.up.railway.app',
  }));

  assert.equal(readiness.ready, false);
  assert.ok(readiness.issues.includes('APP_URL_HTTPS'));
});

test('APP_URL имеет приоритет над Railway public domain', () => {
  const readiness = getPaymentReadiness(readyProductionEnv({
    APP_URL: 'https://herostar.up.railway.app',
    RAILWAY_PUBLIC_DOMAIN: 'wrong.example',
  }));

  assert.equal(readiness.ready, true);
});
