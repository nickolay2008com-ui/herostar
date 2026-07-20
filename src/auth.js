import crypto from 'node:crypto';
import { parseCookies, publicError } from './utils.js';
import { getUser, upsertUser } from './store.js';

const COOKIE_NAME = 'herostar_session';

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

export async function attachUser(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const session = decodeSession(cookies[COOKIE_NAME]);
    req.user = session?.sub ? await getUser(session.sub) : null;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(publicError('Войдите через Telegram, чтобы продолжить.', 401, 'AUTH_REQUIRED'));
  return next();
}
