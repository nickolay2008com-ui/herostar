import crypto from 'node:crypto';
import { parseCookies, publicError, sha256 } from './utils.js';
import { getChart, getUser, upsertUser } from './store.js';
import {
  completeCloneQuestion,
  isCloneChart,
  registerCloneChart,
  releaseCloneQuestion,
  reserveCloneQuestion,
} from './clone-quota.js';
import { runRequestContext } from './request-context.js';
import { decorateUserAccess, hasCloneAccessForChart } from './commerce.js';

const COOKIE_NAME = 'herostar_session';
const METRIKA_INLINE_SCRIPT_HASH = "'sha256-C9Cumf0lnPcYdvKbnC3roPXPzPkdvVTbO7dG0AwnrSQ='";
const CLONE_FREE_QUESTION_LIMIT = 3;
// HeroStar — персональный проект. Публичный Telegram владельца используется как
// безопасный резервный идентификатор, пока в Railway не закреплён числовой ID.
const PROJECT_OWNER_TELEGRAM_USERNAMES = new Set(['ainicki']);
const METRIKA_GENERAL_SOURCES = [
  'https://mc.yandex.ru',
  'https://mc.yandex.com',
  'https://mc.webvisor.com',
  'https://mc.webvisor.org',
  'https://yastatic.net',
];
const METRIKA_SOCKET_SOURCES = [
  'wss://mc.yandex.ru',
  'wss://mc.yandex.com',
  'wss://mc.webvisor.com',
  'wss://mc.webvisor.org',
];
const METRIKA_FRAME_ANCESTORS = [
  "'self'",
  'https://metrika.yandex.ru',
  'https://metrica.yandex.ru',
  'https://analytics.yandex.ru',
  'https://metr.yandex.ru',
  'https://metrika.ya.ru',
  'https://metrica.ya.ru',
  'https://metrika.yandex.by',
  'https://metrika.yandex.com',
  'https://metrika.yandex.com.tr',
  'https://metrika.yandex.kz',
  'https://analytics.yandex.by',
  'https://analytics.yandex.com',
  'https://analytics.yandex.com.tr',
  'https://analytics.yandex.kz',
  'https://metr.yandex.by',
  'https://metr.yandex.com',
  'https://metr.yandex.com.tr',
  'https://metr.yandex.kz',
  'https://metrica.yandex.by',
  'https://metrica.yandex.com',
  'https://metrica.yandex.com.tr',
  'https://metrica.yandex.kz',
  'https://metrika.yandex.uz',
  'https://webvisor.com',
  'https://*.webvisor.com',
];

function mergeCspDirective(policy, name, sources) {
  const pattern = new RegExp(`${name}\\s+([^;]*)`, 'i');
  const match = policy.match(pattern);
  const existing = match?.[1]?.trim().split(/\s+/).filter(Boolean) || [];
  const merged = [...new Set([...existing, ...sources])];
  const directive = `${name} ${merged.join(' ')}`;

  return match
    ? policy.replace(pattern, directive)
    : `${policy.replace(/;?\s*$/, ';')} ${directive};`;
}

function allowMetrikaDocumentEmbedding(req, res) {
  const path = String(req.path || '/');
  const lastSegment = path.split('/').filter(Boolean).at(-1) || '';
  const isDocumentRequest = req.method === 'GET'
    && (path === '/' || path.endsWith('.html') || !lastSegment.includes('.'));

  if (!isDocumentRequest) return;

  const policy = res.getHeader('Content-Security-Policy');
  if (typeof policy === 'string') {
    let nextPolicy = policy;
    nextPolicy = mergeCspDirective(nextPolicy, 'script-src', [
      ...METRIKA_GENERAL_SOURCES,
      METRIKA_INLINE_SCRIPT_HASH,
    ]);
    nextPolicy = mergeCspDirective(nextPolicy, 'connect-src', [
      ...METRIKA_GENERAL_SOURCES,
      ...METRIKA_SOCKET_SOURCES,
    ]);
    nextPolicy = mergeCspDirective(nextPolicy, 'frame-src', ['blob:', ...METRIKA_GENERAL_SOURCES]);
    nextPolicy = mergeCspDirective(nextPolicy, 'child-src', ['blob:', ...METRIKA_GENERAL_SOURCES]);
    nextPolicy = mergeCspDirective(nextPolicy, 'frame-ancestors', METRIKA_FRAME_ANCESTORS);
    res.setHeader('Content-Security-Policy', nextPolicy);
  }

  // X-Frame-Options не умеет точечно разрешать домены Метрики.
  // Доступ ограничивает CSP frame-ancestors выше.
  res.removeHeader('X-Frame-Options');

  // Визуальный редактор открывает сайт из интерфейса Метрики и связывается
  // с новой вкладкой через window.opener. COOP разрывает эту связь.
  res.removeHeader('Cross-Origin-Opener-Policy');
}

function secret() {
  return process.env.SESSION_SECRET || 'development-only-change-me';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function encodeSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decodeSession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = sign(body);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Date.now()) return null;
  return payload;
}

function normalizeAdminIdentifier(value) {
  let normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;

  normalized = normalized
    .replace(/^https?:\/\/t\.me\//, '')
    .replace(/^t\.me\//, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .trim();

  return normalized || null;
}

function configuredAdminIdentifiers() {
  const raw = [
    process.env.TELEGRAM_ADMIN_IDS,
    process.env.TELEGRAM_ADMIN_ID,
    process.env.TELEGRAM_ADMIN_USERNAMES,
    process.env.TELEGRAM_ADMIN_USERNAME,
  ].filter(Boolean).join(',');

  const configured = raw
    .split(/[\s,;]+/)
    .map(normalizeAdminIdentifier)
    .filter(Boolean);

  return new Set([...PROJECT_OWNER_TELEGRAM_USERNAMES, ...configured]);
}

function explicitCloneProduct(req) {
  return String(req.body?.product || '').trim().toLowerCase() === 'clone';
}

function clonePromptMarker(req) {
  const question = String(req.body?.question || '');
  return question.includes('Звёздный клон') && question.includes('Ситуация:');
}

function canUseChartForClone(record, req) {
  if (!record || !req.user) return false;
  if (record.userId) return String(record.userId) === String(req.user.telegram_id);
  const token = String(req.headers['x-chart-token'] || '');
  return Boolean(token && record.accessTokenHash && sha256(token) === record.accessTokenHash);
}

function markCloneChartCreation(req, res) {
  if (req.method !== 'POST' || req.path !== '/api/charts' || !explicitCloneProduct(req)) return;
  let settled = false;
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (settled) return originalJson(payload);
    settled = true;
    const chartId = res.statusCode < 400 ? payload?.id : null;
    if (!chartId) return originalJson(payload);
    Promise.resolve(registerCloneChart(chartId))
      .catch((error) => console.error('Clone chart registration failed:', error))
      .finally(() => originalJson(payload));
    return res;
  };
}

async function prepareCloneQuota(req, res) {
  if (req.method !== 'POST' || req.path !== '/api/consult' || !req.user) return;
  const chartId = String(req.body?.chartId || '').trim();
  if (!chartId) return;
  const record = await getChart(chartId);
  if (!canUseChartForClone(record, req)) return;
  if (hasCloneAccessForChart(req.user, chartId)) return;

  const explicitlyClone = explicitCloneProduct(req) || clonePromptMarker(req);
  const registeredClone = await isCloneChart(chartId);
  if (!explicitlyClone && !registeredClone) return;
  if (explicitlyClone && !registeredClone) await registerCloneChart(chartId);

  const reservation = await reserveCloneQuestion({
    chartId,
    userId: req.user.telegram_id,
    limit: CLONE_FREE_QUESTION_LIMIT,
  });
  if (!reservation.allowed) {
    throw publicError(
      'Три бесплатных решения использованы. Откройте День со Звёздным клоном, чтобы продолжить диалог в глубоком режиме.',
      402,
      'CLONE_FREE_LIMIT',
    );
  }

  req.cloneReservationId = reservation.reservationId;
  req.cloneQuestionUsage = reservation;
  let settled = false;
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (settled) return originalJson(payload);
    settled = true;
    const succeeded = res.statusCode < 400 && Boolean(payload?.answer);
    const operation = succeeded
      ? completeCloneQuestion(reservation.reservationId)
      : releaseCloneQuestion(reservation.reservationId);
    Promise.resolve(operation)
      .catch((error) => console.error('Clone quota finalization failed:', error))
      .finally(() => originalJson(payload));
    return res;
  };
}

export function isAdminUser(user) {
  if (!user?.telegram_id) return false;

  const identifiers = configuredAdminIdentifiers();
  if (identifiers.has(String(user.telegram_id).trim())) return true;

  const username = normalizeAdminIdentifier(user.username);
  return Boolean(username && identifiers.has(username));
}

export function verifyTelegramPayload(payload) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw publicError('Telegram-авторизация ещё не настроена.', 503, 'TELEGRAM_NOT_CONFIGURED');

  const { hash, state: _state, ...fields } = payload;
  if (!hash) throw publicError('Telegram не передал подпись.', 401);
  const authDate = Number(fields.auth_date);
  if (!authDate || Date.now() / 1000 - authDate > 86400) throw publicError('Ссылка авторизации устарела. Войдите ещё раз.', 401);

  const checkString = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (hash.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) {
    throw publicError('Подпись Telegram не прошла проверку.', 401);
  }

  return fields;
}

export async function completeTelegramLogin(payload) {
  const verified = verifyTelegramPayload(payload);
  const user = await upsertUser({ ...verified, telegram_id: String(verified.id) });
  const token = encodeSession({ sub: user.telegram_id, exp: Date.now() + 30 * 86400000 });
  return { user, token };
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export async function attachUser(req, res, next) {
  try {
    allowMetrikaDocumentEmbedding(req, res);
    const cookies = parseCookies(req.headers.cookie || '');
    const session = decodeSession(cookies[COOKIE_NAME]);
    req.user = session?.sub ? await decorateUserAccess(await getUser(session.sub)) : null;
    req.isAdmin = isAdminUser(req.user);
    markCloneChartCreation(req, res);
    await prepareCloneQuota(req, res);
    const product = String(req.body?.product || '').trim().toLowerCase();
    const offerCode = String(req.body?.offerCode || '').trim().toLowerCase();
    return runRequestContext({ product, path: req.path, offerCode }, next);
  } catch (error) {
    return next(error);
  }
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(publicError('Войдите через Telegram, чтобы продолжить.', 401, 'AUTH_REQUIRED'));
  return next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(publicError('Войдите через Telegram под аккаунтом администратора.', 401, 'AUTH_REQUIRED'));
  if (!isAdminUser(req.user)) return next(publicError('У этого Telegram-аккаунта нет доступа к панели.', 403, 'ADMIN_REQUIRED'));
  return next();
}
