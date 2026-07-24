import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  completeCloneQuestion,
  getCloneQuestionUsage,
  isCloneChart,
  registerCloneChart,
  releaseCloneQuestion,
  reserveCloneQuestion,
} from '../src/clone-quota.js';

const cloneHtmlUrl = new URL('../public/clone.html', import.meta.url);
const cloneScriptUrl = new URL('../public/clone.js', import.meta.url);
const authUrl = new URL('../src/auth.js', import.meta.url);
const paymentsUrl = new URL('../src/payments.js', import.meta.url);

test('сервер атомарно пропускает только три бесплатных вопроса клону', async () => {
  const chartId = `test-${crypto.randomUUID()}`;
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () => reserveCloneQuestion({ chartId, userId: 'test-user', limit: 3 })),
  );

  assert.equal(attempts.filter((item) => item.allowed).length, 3);
  assert.equal(attempts.filter((item) => !item.allowed).length, 1);

  await Promise.all(
    attempts.filter((item) => item.allowed).map((item) => completeCloneQuestion(item.reservationId)),
  );
  const usage = await getCloneQuestionUsage(chartId, 3);
  assert.equal(usage.used, 3);
  assert.equal(usage.remaining, 0);
});

test('неудавшийся ответ освобождает бесплатный вопрос', async () => {
  const chartId = `test-${crypto.randomUUID()}`;
  const reservation = await reserveCloneQuestion({ chartId, userId: 'test-user', limit: 3 });
  assert.equal(reservation.allowed, true);
  await releaseCloneQuestion(reservation.reservationId);
  const usage = await getCloneQuestionUsage(chartId, 3);
  assert.equal(usage.used, 0);
  assert.equal(usage.remaining, 3);
});

test('созданная карта навсегда определяется сервером как карта клона', async () => {
  const chartId = `test-${crypto.randomUUID()}`;
  assert.equal(await isCloneChart(chartId), false);
  await registerCloneChart(chartId);
  assert.equal(await isCloneChart(chartId), true);
});

test('клиент маркирует создание карты, консультацию и оплату как продукт clone', async () => {
  const [html, clone] = await Promise.all([
    readFile(cloneHtmlUrl, 'utf8'),
    readFile(cloneScriptUrl, 'utf8'),
  ]);
  assert.doesNotMatch(html, /clone-product-bridge\.js/);
  assert.match(clone, /\/api\/charts/);
  assert.match(clone, /\/api\/consult/);
  assert.match(clone, /\/api\/payments\/create/);
  assert.match(clone, /product:\s*'clone'/);
});

test('начало оплаты сохраняется через разрешённый публичный тип события', async () => {
  const clone = await readFile(cloneScriptUrl, 'utf8');
  assert.match(clone, /track\('paywall_opened', 'clone_payment_started'/);
  assert.match(clone, /stage:\s*'payment_started'/);
});

test('лимит привязан к карте на сервере, а оплата возвращает в диалог клона', async () => {
  const [auth, payments] = await Promise.all([
    readFile(authUrl, 'utf8'),
    readFile(paymentsUrl, 'utf8'),
  ]);
  assert.match(auth, /registerCloneChart/);
  assert.match(auth, /isCloneChart/);
  assert.match(auth, /reserveCloneQuestion/);
  assert.match(auth, /completeCloneQuestion/);
  assert.match(auth, /releaseCloneQuestion/);
  assert.match(auth, /CLONE_FREE_LIMIT/);
  assert.match(payments, /currentRequestContext/);
  assert.match(payments, /\/clone\/\?payment=return/);
  assert.match(payments, /const metadata = \{[\s\S]*user_id:[\s\S]*product:/);
});
