import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'https://herostar.up.railway.app';
const RETRY_DELAY_MS = 10_000;
const MAX_ATTEMPTS = 18;

async function request(path) {
  const response = await fetch(new URL(path, BASE_URL), {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
    headers: { 'Cache-Control': 'no-cache' },
  });
  const body = await response.text();
  return { response, body };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Railway включает оплату после публикации реквизитов ИП', { timeout: 240_000 }, async () => {
  let snapshot = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await request(`/api/config?payment_smoke=${Date.now()}`);
    let config = null;
    try {
      config = JSON.parse(result.body);
    } catch {
      config = null;
    }

    snapshot = {
      attempt,
      status: result.response.status,
      paymentsConfigured: config?.paymentsConfigured,
      legalConfigured: config?.legalConfigured,
      telegramConfigured: config?.telegramConfigured,
    };

    if (
      result.response.status === 200
      && config?.paymentsConfigured === true
      && config?.legalConfigured === true
      && config?.telegramConfigured === true
    ) break;

    if (attempt < MAX_ATTEMPTS) await wait(RETRY_DELAY_MS);
  }

  assert.equal(snapshot?.status, 200, `Production /api/config недоступен: ${JSON.stringify(snapshot)}`);
  assert.equal(snapshot?.legalConfigured, true, `Реквизиты ИП ещё не применились в production: ${JSON.stringify(snapshot)}`);
  assert.equal(snapshot?.telegramConfigured, true, `Telegram-конфигурация не готова: ${JSON.stringify(snapshot)}`);
  assert.equal(snapshot?.paymentsConfigured, true, `Production-gate оплаты всё ещё закрыт: ${JSON.stringify(snapshot)}`);

  const offer = await request(`/offer?payment_smoke=${Date.now()}`);
  assert.equal(offer.response.status, 200, 'Публичная оферта должна открываться');
  assert.doesNotMatch(offer.body, /Приём оплаты временно отключён/);
  assert.match(offer.body, /ОГРНИП/);

  console.log(JSON.stringify({ production: BASE_URL, ...snapshot, offerPublished: true }));
});
