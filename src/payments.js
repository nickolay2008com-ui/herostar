import crypto from 'node:crypto';
import { publicError } from './utils.js';
import { grantPremium, savePayment, updatePayment, claimChart, trackEvent } from './store.js';
import { currentRequestContext } from './request-context.js';

async function safeTrack(record) { try { await trackEvent(record); } catch (error) { console.error('Payment analytics event was not saved:', error); } }
function credentials() { const shopId = process.env.YOOKASSA_SHOP_ID; const secretKey = process.env.YOOKASSA_SECRET_KEY; if (!shopId || !secretKey) throw publicError('Оплата ещё не настроена.', 503, 'PAYMENTS_NOT_CONFIGURED'); return { shopId, secretKey }; }
function providerError(response, payload) {
  const parameter = String(payload?.parameter || ''); const code = String(payload?.code || '');
  console.error('YooKassa error', response.status, payload);
  if (response.status === 401 || code === 'invalid_credentials') return publicError('ЮKassa отклонила настройки магазина. Сообщите владельцу в Telegram @ainicki.', 502, 'PAYMENT_CREDENTIALS_ERROR');
  if (/receipt|customer|items/i.test(parameter) || /receipt|customer/i.test(String(payload?.description || ''))) return publicError('ЮKassa не приняла данные для электронного чека. Проверьте телефон или email.', 400, 'PAYMENT_RECEIPT_ERROR');
  if (response.status === 429 || code === 'too_many_requests') return publicError('ЮKassa временно ограничила запросы. Подождите минуту и повторите.', 503, 'PAYMENT_RATE_LIMITED');
  return publicError('ЮKassa не смогла создать платёж. Повторите ещё раз или напишите @ainicki.', 502, 'PAYMENT_PROVIDER_ERROR');
}
async function yookassaRequest(path, options = {}) {
  const { shopId, secretKey } = credentials(); let response;
  try { response = await fetch(`https://api.yookassa.ru/v3${path}`, { ...options, headers: { Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`, 'Content-Type': 'application/json', ...(options.headers || {}) }, signal: AbortSignal.timeout(15000) }); }
  catch (error) { console.error('YooKassa network error', error); throw publicError('Не удалось связаться с ЮKassa. Проверьте интернет и повторите.', 503, 'PAYMENT_NETWORK_ERROR'); }
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw providerError(response, payload); return payload;
}
function normalizeReceiptContact(value) {
  const raw = String(value || '').trim(); const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw); if (emailOk) return { email: raw.toLowerCase() };
  const digits = raw.replace(/\D/g, ''); if (digits.length >= 10 && digits.length <= 15) return { phone: digits };
  throw publicError('Укажите телефон или email для электронного чека.', 400, 'RECEIPT_CONTACT_REQUIRED');
}
function publicAppUrl() {
  const candidate = String(process.env.APP_URL || 'https://herostar.up.railway.app').trim().replace(/\/+$/, ''); let url;
  try { url = new URL(candidate); } catch { throw publicError('Адрес возврата после оплаты настроен неверно.', 503, 'PAYMENT_RETURN_URL_INVALID'); }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw publicError('Адрес возврата после оплаты должен использовать HTTPS.', 503, 'PAYMENT_RETURN_URL_INVALID');
  return url.toString().replace(/\/$/, '');
}
export async function createPayment({ user, chartId, visitorId = null, receiptContact }) {
  const amount = Number(process.env.FULL_MAP_PRICE || '990').toFixed(2); const customer = normalizeReceiptContact(receiptContact); const appUrl = publicAppUrl();
  const product = currentRequestContext().product === 'clone' ? 'clone' : 'herostar';
  const returnUrl = product === 'clone'
    ? `${appUrl}/clone?payment=return&chart=${encodeURIComponent(chartId || '')}`
    : `${appUrl}/payment/return?chart=${encodeURIComponent(chartId || '')}`;
  const description = product === 'clone'
    ? 'HeroStar — полный доступ и безлимитный диалог со Звёздным клоном'
    : 'HeroStar — полный доступ к интерактивной карте';
  const itemDescription = product === 'clone'
    ? 'Полный доступ HeroStar и диалог со Звёздным клоном'
    : 'Доступ к полной интерактивной карте HeroStar';
  const body = { amount: { value: amount, currency: 'RUB' }, capture: true, confirmation: { type: 'redirect', return_url: returnUrl }, description, metadata: { user_id: String(user.telegram_id), chart_id: chartId || '', product }, receipt: { customer, items: [{ description: itemDescription, quantity: 1.000, amount: { value: amount, currency: 'RUB' }, vat_code: 1, payment_mode: 'full_payment', payment_subject: 'service', measure: 'piece' }], internet: 'true' } };
  const payment = await yookassaRequest('/payments', { method: 'POST', headers: { 'Idempotence-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
  await savePayment({ id: payment.id, userId: String(user.telegram_id), chartId: chartId || null, status: payment.status, amount, payload: payment });
  if (chartId) await claimChart(chartId, user.telegram_id);
  await safeTrack({ eventType: 'payment_created', visitorId, userId: user.telegram_id, chartId: chartId || null, metadata: { paymentId: payment.id, amount: Number(amount), status: payment.status, product } }); return payment;
}
export async function processWebhook(notification) {
  const paymentId = notification?.object?.id; if (!paymentId) throw publicError('Некорректное уведомление.', 400);
  const payment = await yookassaRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' }); await updatePayment(payment.id, payment.status, payment);
  if (payment.status === 'succeeded' && payment.paid) { const userId = payment.metadata?.user_id; const chartId = payment.metadata?.chart_id; if (userId) await grantPremium(userId); if (userId && chartId) await claimChart(chartId, userId); await safeTrack({ eventType: 'payment_succeeded', userId: userId || null, chartId: chartId || null, metadata: { paymentId: payment.id, amount: Number(payment.amount?.value || 0), currency: payment.amount?.currency || 'RUB', product: payment.metadata?.product || 'herostar' } }); }
  return payment;
}
