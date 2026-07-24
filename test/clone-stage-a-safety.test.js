import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requirePersonalDataConsent, PERSONAL_DATA_CONSENT_VERSION } from '../src/consent.js';
import { getPaymentReadiness, requirePaymentReadiness } from '../src/production-readiness.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const productionEnv = {
  NODE_ENV: 'production',
  YOOKASSA_SHOP_ID: 'shop',
  YOOKASSA_SECRET_KEY: 'secret',
  LEGAL_FULL_NAME: 'Иванов Иван Иванович',
  LEGAL_OGRNIP: '123456789012345',
  DATABASE_URL: 'postgres://example',
  SESSION_SECRET: 'a'.repeat(48),
  TELEGRAM_BOT_TOKEN: 'token',
  APP_URL: 'https://example.test',
};

test('персональные данные нельзя отправить без отдельного согласия', () => {
  assert.throws(
    () => requirePersonalDataConsent({ personalDataConsent: false }),
    (error) => error.code === 'PERSONAL_DATA_CONSENT_REQUIRED' && error.status === 400,
  );
  const accepted = requirePersonalDataConsent({ personalDataConsent: true });
  assert.equal(accepted.version, PERSONAL_DATA_CONSENT_VERSION);
  assert.equal(accepted.documentUrl, '/consent');
  assert.equal(requirePersonalDataConsent({}, { demo: true }), null);
});

test('production-gate требует юридические, платёжные и инфраструктурные настройки', () => {
  assert.deepEqual(getPaymentReadiness(productionEnv).issues, []);
  assert.equal(getPaymentReadiness(productionEnv).ready, true);

  const incomplete = getPaymentReadiness({ ...productionEnv, LEGAL_OGRNIP: '', SESSION_SECRET: 'short' });
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.issues.includes('LEGAL_DETAILS'));
  assert.ok(incomplete.issues.includes('SESSION_SECRET'));
  assert.throws(
    () => requirePaymentReadiness({ ...productionEnv, APP_URL: 'http://example.test' }),
    (error) => error.code === 'PAYMENTS_NOT_READY' && error.status === 503,
  );
});

test('возврат после ЮKassa проверяет конкретную операцию и не угадывает успех по старому доступу', async () => {
  const [server, clone, app, payments] = await Promise.all([
    read('server.js'),
    read('public/clone.js'),
    read('public/app.js'),
    read('src/payments.js'),
  ]);

  assert.match(server, /app\.get\('\/api\/payments\/status', requireUser/);
  assert.match(server, /INVALID_PAYMENT_REFERENCE/);
  assert.match(server, /payment_ref/);
  assert.match(clone, /\/api\/payments\/status/);
  assert.match(app, /\/api\/payments\/status/);
  assert.doesNotMatch(clone, /expectedActive/);
  assert.doesNotMatch(app, /paymentSucceeded = Boolean\(state\.config\.user\?\.premium\)/);
  assert.match(payments, /getPaymentByIdOrReturnRef/);
  assert.match(payments, /refreshPaymentStatus/);
  assert.match(payments, /Idempotence-Key': returnRef/);
  assert.match(payments, /reservePaymentCheckout/);
});

test('аналитика не получает сырой текст вопроса', async () => {
  const [server, clone, store] = await Promise.all([
    read('server.js'),
    read('public/clone.js'),
    read('src/store.js'),
  ]);

  assert.match(server, /questionLength: question\.length/);
  assert.match(clone, /questionLength: question\.length/);
  assert.doesNotMatch(clone, /question: question\.slice/);
  assert.match(store, /ANALYTICS_SENSITIVE_KEYS/);
  assert.match(store, /sanitizeAnalyticsMetadata/);
  assert.match(store, /metadata - 'question' - 'answer' - 'content' - 'text'/);
});

test('Сонастройка и восстановление используют явно выбранного клона', async () => {
  const [commerce, practice, server, clone] = await Promise.all([
    read('src/commerce.js'),
    read('src/practice-notifications.js'),
    read('server.js'),
    read('public/clone.js'),
  ]);

  assert.match(commerce, /clone_alignment_chart_id/);
  assert.match(commerce, /ALIGNMENT_ACTIVE_FOR_ANOTHER_CHART/);
  assert.match(practice, /user_record\.clone_alignment_chart_id AS chart_id/);
  assert.doesNotMatch(practice, /latestChartForUser/);
  assert.match(server, /app\.get\('\/api\/me\/charts', requireUser/);
  assert.match(clone, /restoreLatestOwnedClone/);
  assert.match(clone, /\/api\/me\/charts\?limit=1/);
});
