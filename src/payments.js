import crypto from 'node:crypto';
import { publicError } from './utils.js';
import {
  updatePayment,
  claimChart,
  trackEvent,
  getPaymentByIdOrReturnRef,
  reservePaymentCheckout,
  finalizePaymentCheckout,
  failPaymentCheckout,
} from './store.js';
import { currentRequestContext } from './request-context.js';
import {
  OFFER_CODES,
  applyPaymentEntitlement,
  markCommercePaymentStatus,
  recordPaymentOffer,
  resolveOffer,
} from './commerce.js';

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

function providerError(response, payload) {
  const parameter = String(payload?.parameter || '');
  const code = String(payload?.code || '');
  console.error('YooKassa error', response.status, payload);
  if (response.status === 401 || code === 'invalid_credentials') {
    return publicError('ЮKassa отклонила настройки магазина. Сообщите владельцу в Telegram @ainicki.', 502, 'PAYMENT_CREDENTIALS_ERROR');
  }
  if (/receipt|customer|items/i.test(parameter) || /receipt|customer/i.test(String(payload?.description || ''))) {
    return publicError('ЮKassa не приняла данные для электронного чека. Проверьте телефон или email.', 400, 'PAYMENT_RECEIPT_ERROR');
  }
  if (response.status === 429 || code === 'too_many_requests') {
    return publicError('ЮKassa временно ограничила запросы. Подождите минуту и повторите.', 503, 'PAYMENT_RATE_LIMITED');
  }
  return publicError('ЮKassa не смогла создать платёж. Повторите ещё раз или напишите @ainicki.', 502, 'PAYMENT_PROVIDER_ERROR');
}

async function yookassaRequest(path, options = {}) {
  const { shopId, secretKey } = credentials();
  let response;
  try {
    response = await fetch(`https://api.yookassa.ru/v3${path}`, {
      ...options,
      headers: {
        Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error('YooKassa network error', error);
    throw publicError('Не удалось связаться с ЮKassa. Проверьте интернет и повторите.', 503, 'PAYMENT_NETWORK_ERROR');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response, payload);
  return payload;
}

function normalizeReceiptContact(value) {
  const raw = String(value || '').trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
  if (emailOk) return { email: raw.toLowerCase() };
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15) return { phone: digits };
  throw publicError('Укажите телефон или email для электронного чека.', 400, 'RECEIPT_CONTACT_REQUIRED');
}

function normalizeAppUrlCandidate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const repaired = raw
    .replace(/^https\/\//i, 'https://')
    .replace(/^http\/\//i, 'http://');
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(repaired)
    ? repaired
    : `https://${repaired}`;
}

export function publicAppUrl(env = process.env) {
  const candidates = [
    env.APP_URL,
    env.RAILWAY_PUBLIC_DOMAIN,
    'https://herostar.up.railway.app',
  ];

  for (const value of candidates) {
    const candidate = normalizeAppUrlCandidate(value);
    if (!candidate) continue;

    try {
      const url = new URL(candidate);
      if (!url.hostname || !['http:', 'https:'].includes(url.protocol)) continue;
      if (env.NODE_ENV === 'production' && url.protocol !== 'https:') continue;
      return url.origin;
    } catch {
      // Переходим к Railway-домену или безопасному production fallback.
    }
  }

  throw publicError('Адрес возврата после оплаты настроен неверно.', 503, 'PAYMENT_RETURN_URL_INVALID');
}

function offerCopy(offer) {
  if (offer.code === OFFER_CODES.CLONE_DAY) {
    return {
      description: 'HeroStar — День со Звёздным клоном на 24 часа',
      itemDescription: 'Глубокий режим клона на 24 часа, полная карта и Паспорт клона',
    };
  }
  if (offer.code === OFFER_CODES.CLONE_ALIGNMENT) {
    return {
      description: 'HeroStar — Сонастройка со Звёздным клоном на 30 дней',
      itemDescription: '30 дней глубокого режима клона и Telegram-сопровождения',
    };
  }
  return {
    description: 'HeroStar — полная интерактивная карта',
    itemDescription: 'Доступ к полной интерактивной карте HeroStar',
  };
}

function cloneReturnPath(requestedProduct) {
  return requestedProduct === 'clone_live' ? '/clone/live/' : '/clone/';
}

export async function createPayment({ user, chartId, visitorId = null, receiptContact, offerCode = null }) {
  const context = currentRequestContext();
  const requestedProduct = String(context.product || '').trim().toLowerCase();
  const product = ['clone', 'clone_live'].includes(requestedProduct) ? 'clone' : 'herostar';
  const offer = await resolveOffer({
    user,
    offerCode: offerCode || context.offerCode,
    product,
    chartId,
  });
  const amount = Number(offer.amount).toFixed(2);
  const customer = normalizeReceiptContact(receiptContact);
  const appUrl = publicAppUrl();
  const returnRef = crypto.randomUUID();
  const returnUrl = offer.product === 'clone'
    ? `${appUrl}${cloneReturnPath(requestedProduct)}?payment=return&chart=${encodeURIComponent(chartId || '')}&offer=${encodeURIComponent(offer.code)}&payment_ref=${encodeURIComponent(returnRef)}`
    : `${appUrl}/payment/return?chart=${encodeURIComponent(chartId || '')}&payment_ref=${encodeURIComponent(returnRef)}`;
  const copy = offerCopy(offer);
  const experience = requestedProduct === 'clone_live' ? 'live' : 'standard';
  const metadata = {
    user_id: String(user.telegram_id),
    chart_id: chartId || '',
    product: offer.product,
    experience,
    offer_code: offer.code,
    credit_source_payment_id: offer.creditSourcePaymentId || '',
    return_ref: returnRef,
  };
  const body = {
    amount: { value: amount, currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: returnUrl },
    description: copy.description,
    metadata,
    receipt: {
      customer,
      items: [{
        description: copy.itemDescription,
        quantity: 1.000,
        amount: { value: amount, currency: 'RUB' },
        vat_code: 1,
        payment_mode: 'full_payment',
        payment_subject: 'service',
        measure: 'piece',
      }],
      internet: 'true',
    },
  };

  try {
    await reservePaymentCheckout({
      returnRef,
      userId: user.telegram_id,
      chartId: chartId || null,
      amount,
      offerCode: offer.code,
      creditSourcePaymentId: offer.creditSourcePaymentId,
    });
  } catch (error) {
    if (error?.code === 'PAYMENT_CREDIT_RESERVED') {
      throw publicError(
        'Стоимость Дня уже используется в другом платеже. Завершите его или повторите через двадцать минут.',
        409,
        'PAYMENT_CREDIT_RESERVED',
      );
    }
    if (error?.code === 'PAYMENT_CHECKOUT_ACTIVE') {
      throw publicError(
        'Для этого предложения уже открыт незавершённый платёж. Завершите его или повторите немного позже.',
        409,
        'PAYMENT_CHECKOUT_ACTIVE',
      );
    }
    throw error;
  }

  let payment;
  try {
    payment = await yookassaRequest('/payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': returnRef },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // При сетевом таймауте платёж мог быть создан у провайдера. Оставляем
    // резерв на короткое время, чтобы webhook мог безопасно завершить операцию.
    if (error?.code !== 'PAYMENT_NETWORK_ERROR') {
      await failPaymentCheckout(returnRef, error?.message).catch(() => {});
    }
    throw error;
  }

  // После успешного ответа ЮKassa не освобождаем резерв при ошибке БД:
  // webhook сможет завершить ту же операцию по return_ref.
  await finalizePaymentCheckout(returnRef, payment);
  await recordPaymentOffer({
    paymentId: payment.id,
    userId: user.telegram_id,
    chartId: chartId || null,
    offerCode: offer.code,
    creditSourcePaymentId: offer.creditSourcePaymentId,
  });
  if (chartId) await claimChart(chartId, user.telegram_id);
  await safeTrack({
    eventType: 'payment_created',
    visitorId,
    userId: user.telegram_id,
    chartId: chartId || null,
    metadata: {
      paymentId: payment.id,
      amount: Number(amount),
      status: payment.status,
      product: offer.product,
      experience,
      offerCode: offer.code,
      credited: offer.credited,
    },
  });
  return { ...payment, returnRef };
}

function assertPaymentMatchesSaved(payment, saved) {
  if (!saved) throw publicError('Платёж не найден в HeroStar.', 404, 'PAYMENT_NOT_FOUND');
  const metadata = payment?.metadata || {};
  const returnRef = metadata.return_ref || null;
  if (saved.returnRef && returnRef && String(saved.returnRef) !== String(returnRef)) {
    throw publicError('Платёж не прошёл проверку связи с заказом.', 409, 'PAYMENT_REFERENCE_MISMATCH');
  }
  if (saved.userId && metadata.user_id && String(saved.userId) !== String(metadata.user_id)) {
    throw publicError('Платёж не прошёл проверку владельца.', 409, 'PAYMENT_OWNER_MISMATCH');
  }
  if (saved.chartId && metadata.chart_id && String(saved.chartId) !== String(metadata.chart_id)) {
    throw publicError('Платёж не прошёл проверку выбранного клона.', 409, 'PAYMENT_CHART_MISMATCH');
  }
  if (saved.offerCode && metadata.offer_code && String(saved.offerCode) !== String(metadata.offer_code)) {
    throw publicError('Платёж не прошёл проверку предложения.', 409, 'PAYMENT_OFFER_MISMATCH');
  }
  const savedAmount = Number(saved.amount || 0);
  const providerAmount = Number(payment?.amount?.value || 0);
  if (savedAmount && providerAmount && Math.abs(savedAmount - providerAmount) > 0.001) {
    throw publicError('Сумма платежа не совпала с созданным заказом.', 409, 'PAYMENT_AMOUNT_MISMATCH');
  }
}

async function reconcilePayment(payment, savedOperation = null) {
  const returnRef = payment.metadata?.return_ref || null;
  const saved = savedOperation
    || await getPaymentByIdOrReturnRef({ paymentId: payment.id })
    || (returnRef ? await getPaymentByIdOrReturnRef({ returnRef }) : null);
  assertPaymentMatchesSaved(payment, saved);
  if (returnRef && saved?.id?.startsWith('checkout:')) {
    await finalizePaymentCheckout(returnRef, payment);
  }
  await updatePayment(payment.id, payment.status, payment);
  await markCommercePaymentStatus(payment.id, payment.status);

  if (payment.status === 'succeeded' && payment.paid) {
    const userId = payment.metadata?.user_id;
    const chartId = payment.metadata?.chart_id || null;
    const offerCode = payment.metadata?.offer_code
      || (payment.metadata?.product === 'clone' ? OFFER_CODES.CLONE_DAY : OFFER_CODES.FULL_MAP);
    const creditSourcePaymentId = payment.metadata?.credit_source_payment_id || null;
    if (userId) {
      await applyPaymentEntitlement({
        paymentId: payment.id,
        userId,
        chartId,
        offerCode,
        creditSourcePaymentId,
      });
    }
    if (userId && chartId) await claimChart(chartId, userId);
    await safeTrack({
      eventType: 'payment_succeeded',
      userId: userId || null,
      chartId,
      metadata: {
        paymentId: payment.id,
        amount: Number(payment.amount?.value || 0),
        currency: payment.amount?.currency || 'RUB',
        product: payment.metadata?.product || 'herostar',
        experience: payment.metadata?.experience || 'standard',
        offerCode,
        credited: Boolean(creditSourcePaymentId),
      },
    });
  }
  return payment;
}

export async function refreshPaymentStatus({ paymentId = null, returnRef = null, userId }) {
  const saved = await getPaymentByIdOrReturnRef({ paymentId: returnRef ? null : paymentId, returnRef });
  if (!saved) throw publicError('Платёж не найден.', 404, 'PAYMENT_NOT_FOUND');
  if (!userId || String(saved.userId || '') !== String(userId)) {
    throw publicError('Нет доступа к этому платежу.', 403, 'PAYMENT_FORBIDDEN');
  }

  const providerPaymentId = saved.id?.startsWith('checkout:') ? paymentId : saved.id;
  if (!providerPaymentId) {
    return {
      paymentId: null,
      returnRef: saved.returnRef || returnRef || null,
      chartId: saved.chartId || null,
      offerCode: saved.offerCode || null,
      status: 'pending',
      paid: false,
      amount: Number(saved.amount || 0),
    };
  }
  if (!saved.id?.startsWith('checkout:') && paymentId && String(saved.id) !== String(paymentId)) {
    throw publicError('Платёж не совпадает с сохранённой операцией.', 409, 'PAYMENT_ID_MISMATCH');
  }

  const payment = await yookassaRequest(`/payments/${encodeURIComponent(providerPaymentId)}`, { method: 'GET' });
  await reconcilePayment(payment, saved);
  return {
    paymentId: payment.id,
    returnRef: saved.returnRef || returnRef || null,
    chartId: payment.metadata?.chart_id || saved.chartId || null,
    offerCode: payment.metadata?.offer_code || saved.offerCode || null,
    status: payment.status,
    paid: Boolean(payment.paid),
    amount: Number(payment.amount?.value || saved.amount || 0),
  };
}

export async function processWebhook(notification) {
  const paymentId = notification?.object?.id;
  if (!paymentId) throw publicError('Некорректное уведомление.', 400);
  const payment = await yookassaRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
  const returnRef = payment.metadata?.return_ref || null;
  const saved = await getPaymentByIdOrReturnRef({ paymentId })
    || (returnRef ? await getPaymentByIdOrReturnRef({ returnRef }) : null);
  return reconcilePayment(payment, saved);
}
