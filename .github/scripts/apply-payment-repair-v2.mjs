import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, content) { await fs.writeFile(path, content); }
async function replaceExact(path, from, to) {
  const source = await read(path);
  if (!source.includes(from)) throw new Error(`Не найден фрагмент в ${path}: ${from.slice(0, 140)}`);
  await write(path, source.replace(from, to));
}

await replaceExact('src/utils.js', "  error.status = status;\n  error.code = code;\n  return error;", "  error.status = status;\n  error.code = code;\n  error.expose = true;\n  return error;");
await replaceExact('server.js', "    error: status >= 500 ? 'Сервис столкнулся с ошибкой. Повторите действие.' : error.message,", "    error: error.expose ? error.message : status >= 500 ? 'Сервис столкнулся с ошибкой. Повторите действие.' : error.message,");
await replaceExact('server.js', "    const payment = await createPayment({\n      user: req.user,\n      chartId,\n      visitorId: visitorIdFrom(req),\n    });", "    const payment = await createPayment({\n      user: req.user,\n      chartId,\n      visitorId: visitorIdFrom(req),\n      receiptContact: req.body.receiptContact,\n    });");

await replaceExact('public/index.html', "      <button class=\"primary-button\" id=\"payButton\" type=\"button\" disabled>Открыть мои 11 сокровищ — <span id=\"priceLabel\">990 ₽</span></button>\n      <p class=\"microcopy\" id=\"paymentAvailability\">Проверяем готовность оплаты…</p>", "      <label class=\"field payment-contact\">\n        <span>Телефон или email для электронного чека</span>\n        <input id=\"receiptContact\" name=\"receiptContact\" inputmode=\"email\" autocomplete=\"email\" placeholder=\"+7 900 000-00-00 или name@example.com\" maxlength=\"120\">\n        <small id=\"receiptContactHint\">ЮKassa использует контакт только для отправки чека.</small>\n      </label>\n      <button class=\"primary-button\" id=\"payButton\" type=\"button\" disabled>Открыть мои 11 сокровищ — <span id=\"priceLabel\">990 ₽</span></button>\n      <p class=\"microcopy\" id=\"paymentAvailability\">Проверяем готовность оплаты…</p>");

await replaceExact('public/app.js', "  payButton: $('#payButton'),\n  priceLabel: $('#priceLabel'),", "  payButton: $('#payButton'),\n  priceLabel: $('#priceLabel'),\n  receiptContact: $('#receiptContact'),\n  receiptContactHint: $('#receiptContactHint'),");
await replaceExact('public/app.js', "async function startPayment() {\n  if (!state.config?.paymentsConfigured) {\n    toast('Оплата временно недоступна. Связаться можно в Telegram @ainicki.');\n    return;\n  }\n  els.payButton.disabled = true;", "function normalizedReceiptContact() {\n  const raw = String(els.receiptContact?.value || '').trim();\n  const emailOk = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(raw);\n  const phoneDigits = raw.replace(/\\D/g, '');\n  const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 15;\n  if (!emailOk && !phoneOk) {\n    if (els.receiptContactHint) {\n      els.receiptContactHint.textContent = 'Укажите действующий телефон или email — он нужен ЮKassa для чека.';\n      els.receiptContactHint.classList.add('field-error');\n    }\n    els.receiptContact?.focus();\n    return '';\n  }\n  if (els.receiptContactHint) {\n    els.receiptContactHint.textContent = 'ЮKassa использует контакт только для отправки чека.';\n    els.receiptContactHint.classList.remove('field-error');\n  }\n  return emailOk ? raw.toLowerCase() : `+${phoneDigits}`;\n}\n\nasync function startPayment() {\n  if (!state.config?.paymentsConfigured) {\n    toast('Оплата временно недоступна. Связаться можно в Telegram @ainicki.');\n    return;\n  }\n  const receiptContact = normalizedReceiptContact();\n  if (!receiptContact) return;\n  els.payButton.disabled = true;");
await replaceExact('public/app.js', "      body: JSON.stringify({ chartId: state.current?.id }),", "      body: JSON.stringify({ chartId: state.current?.id, receiptContact }),");

const css = await read('public/campaign-readiness.css');
await write('public/campaign-readiness.css', `${css}\n\n.payment-contact { margin: 0 0 14px; }\n.payment-contact input { width: 100%; min-height: 48px; box-sizing: border-box; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; background: rgba(7,8,17,.76); color: #f2eef7; padding: 0 14px; outline: none; }\n.payment-contact input:focus { border-color: rgba(190,171,255,.55); box-shadow: 0 0 0 3px rgba(190,171,255,.08); }\n.payment-contact small { display: block; margin-top: 7px; color: #777281; font-size: 11px; line-height: 1.45; }\n.payment-contact small.field-error { color: #e6a0a0; }\n`);

await write('src/payments.js', `import crypto from 'node:crypto';
import { publicError } from './utils.js';
import { grantPremium, savePayment, updatePayment, claimChart, trackEvent } from './store.js';

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
  const raw = String(value || '').trim(); const emailOk = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(raw); if (emailOk) return { email: raw.toLowerCase() };
  const digits = raw.replace(/\\D/g, ''); if (digits.length >= 10 && digits.length <= 15) return { phone: digits };
  throw publicError('Укажите телефон или email для электронного чека.', 400, 'RECEIPT_CONTACT_REQUIRED');
}
function publicAppUrl() {
  const candidate = String(process.env.APP_URL || 'https://herostar.up.railway.app').trim().replace(/\\/+$/, ''); let url;
  try { url = new URL(candidate); } catch { throw publicError('Адрес возврата после оплаты настроен неверно.', 503, 'PAYMENT_RETURN_URL_INVALID'); }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw publicError('Адрес возврата после оплаты должен использовать HTTPS.', 503, 'PAYMENT_RETURN_URL_INVALID');
  return url.toString().replace(/\\/$/, '');
}
export async function createPayment({ user, chartId, visitorId = null, receiptContact }) {
  const amount = Number(process.env.FULL_MAP_PRICE || '990').toFixed(2); const customer = normalizeReceiptContact(receiptContact); const appUrl = publicAppUrl();
  const body = { amount: { value: amount, currency: 'RUB' }, capture: true, confirmation: { type: 'redirect', return_url: `${appUrl}/payment/return?chart=${encodeURIComponent(chartId || '')}` }, description: 'HeroStar — полный доступ к интерактивной карте', metadata: { user_id: String(user.telegram_id), chart_id: chartId || '' }, receipt: { customer, items: [{ description: 'Доступ к полной интерактивной карте HeroStar', quantity: 1.000, amount: { value: amount, currency: 'RUB' }, vat_code: 1, payment_mode: 'full_payment', payment_subject: 'service', measure: 'piece' }], internet: 'true' } };
  const payment = await yookassaRequest('/payments', { method: 'POST', headers: { 'Idempotence-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
  await savePayment({ id: payment.id, userId: String(user.telegram_id), chartId: chartId || null, status: payment.status, amount, payload: payment });
  if (chartId) await claimChart(chartId, user.telegram_id);
  await safeTrack({ eventType: 'payment_created', visitorId, userId: user.telegram_id, chartId: chartId || null, metadata: { paymentId: payment.id, amount: Number(amount), status: payment.status } }); return payment;
}
export async function processWebhook(notification) {
  const paymentId = notification?.object?.id; if (!paymentId) throw publicError('Некорректное уведомление.', 400);
  const payment = await yookassaRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' }); await updatePayment(payment.id, payment.status, payment);
  if (payment.status === 'succeeded' && payment.paid) { const userId = payment.metadata?.user_id; const chartId = payment.metadata?.chart_id; if (userId) await grantPremium(userId); if (userId && chartId) await claimChart(chartId, userId); await safeTrack({ eventType: 'payment_succeeded', userId: userId || null, chartId: chartId || null, metadata: { paymentId: payment.id, amount: Number(payment.amount?.value || 0), currency: payment.amount?.currency || 'RUB' } }); }
  return payment;
}
`);

await write('test/payment-repair.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('платёж передаёт контакт и корректный чек ЮKassa', () => { const payment = read('src/payments.js'); assert.match(payment, /receipt:\\s*\\{/); assert.match(payment, /vat_code:\\s*1/); assert.match(payment, /payment_mode:\\s*'full_payment'/); assert.match(payment, /payment_subject:\\s*'service'/); assert.match(payment, /internet:\\s*'true'/); assert.match(payment, /normalizeReceiptContact/); });
test('клиент требует телефон или email для чека', () => { const html = read('public/index.html'); const app = read('public/app.js'); assert.match(html, /id=\"receiptContact\"/); assert.match(app, /normalizedReceiptContact/); assert.match(app, /receiptContact/); });
test('публичные серверные ошибки больше не маскируются', () => { assert.match(read('src/utils.js'), /error\\.expose = true/); assert.match(read('server.js'), /error\\.expose \\? error\\.message/); });
test('production return URL обязан быть HTTPS', () => { const payment = read('src/payments.js'); assert.match(payment, /NODE_ENV === 'production'/); assert.match(payment, /url\\.protocol !== 'https:'/); assert.match(payment, /https:\\/\\/herostar\\.up\\.railway\\.app/); });
`);

await fs.rm('.github/scripts/apply-payment-repair-v2.mjs');
await fs.rm('.github/workflows/apply-payment-repair-v2.yml');
