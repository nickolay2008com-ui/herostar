import crypto from 'node:crypto';
import { publicError } from './utils.js';
import {
  grantPremium,
  savePayment,
  updatePayment,
  claimChart,
  trackEvent,
} from './store.js';

async function safeTrack(record) {
  try {
    await trackEvent(record);
  } catch (error) {
    console.error('Payment analytics event was not saved:', error);
  }
}

function credentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) throw publicError('Оплата ещё не настроена.', 503, 'PAYMENTS_NOT_CONFIGURED');
  return { shopId, secretKey };
}

async function yookassaRequest(path, options = {}) {
  const { shopId, secretKey } = credentials();
  const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('YooKassa error', response.status, payload);
    throw publicError('ЮKassa не смогла создать платёж. Попробуйте ещё раз.', 502, 'PAYMENT_PROVIDER_ERROR');
  }
  return payload;
}

export async function createPayment({ user, chartId, visitorId = null }) {
  const amount = Number(process.env.FULL_MAP_PRICE || '990').toFixed(2);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const body = {
    amount: { value: amount, currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: `${appUrl}/payment/return?chart=${encodeURIComponent(chartId || '')}` },
    description: 'HeroStar — полная интерактивная карта личности',
    metadata: { user_id: String(user.telegram_id), chart_id: chartId || '' },
  };

  const payment = await yookassaRequest('/payments', {
    method: 'POST',
    headers: { 'Idempotence-Key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });

  await savePayment({
    id: payment.id,
    userId: String(user.telegram_id),
    chartId: chartId || null,
    status: payment.status,
    amount,
    payload: payment,
  });

  if (chartId) await claimChart(chartId, user.telegram_id);
  await safeTrack({
    eventType: 'payment_created',
    visitorId,
    userId: user.telegram_id,
    chartId: chartId || null,
    metadata: { paymentId: payment.id, amount: Number(amount), status: payment.status },
  });
  return payment;
}

export async function processWebhook(notification) {
  const paymentId = notification?.object?.id;
  if (!paymentId) throw publicError('Некорректное уведомление.', 400);

  // Не доверяем телу webhook: повторно получаем объект напрямую у ЮKassa.
  const payment = await yookassaRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
  await updatePayment(payment.id, payment.status, payment);

  if (payment.status === 'succeeded' && payment.paid) {
    const userId = payment.metadata?.user_id;
    const chartId = payment.metadata?.chart_id;
    if (userId) await grantPremium(userId);
    if (userId && chartId) await claimChart(chartId, userId);
    await safeTrack({
      eventType: 'payment_succeeded',
      userId: userId || null,
      chartId: chartId || null,
      metadata: {
        paymentId: payment.id,
        amount: Number(payment.amount?.value || 0),
        currency: payment.amount?.currency || 'RUB',
      },
    });
  }

  return payment;
}
