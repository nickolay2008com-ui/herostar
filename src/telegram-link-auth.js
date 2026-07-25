import crypto from 'node:crypto';
import pg from 'pg';
import { claimChart, upsertUser } from './store.js';

const LOGIN_TTL_MS = 10 * 60 * 1000;
const COOKIE_NAME = 'herostar_session';
const memoryLinks = new Map();
let poolPromise = null;

function compact(value = '') {
  return String(value).trim();
}

function botUsername() {
  return compact(process.env.TELEGRAM_BOT_USERNAME).replace(/^@/, '');
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function sessionSecret() {
  return process.env.SESSION_SECRET || 'development-only-change-me';
}

function createSessionToken(userId) {
  const body = Buffer.from(JSON.stringify({
    sub: String(userId),
    exp: Date.now() + 30 * 86400000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function setSessionCookie(res, userId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const token = createSessionToken(userId);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
}

function publicBaseUrl() {
  const explicit = compact(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL);
  if (explicit) return explicit.replace(/\/$/, '');
  const railwayDomain = compact(process.env.RAILWAY_PUBLIC_DOMAIN);
  return railwayDomain ? `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : '';
}

async function authPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!poolPromise) {
    poolPromise = (async () => {
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
        max: 2,
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS telegram_login_links (
          token_hash TEXT PRIMARY KEY,
          chart_id UUID REFERENCES charts(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          claimed_at TIMESTAMPTZ,
          consumed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS telegram_login_links_expires_idx
          ON telegram_login_links(expires_at);
      `);
      return pool;
    })().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

async function saveLink({ token, chartId }) {
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + LOGIN_TTL_MS);
  const pool = await authPool();
  if (!pool) {
    memoryLinks.set(hash, {
      chartId: isUuid(chartId) ? chartId : null,
      userId: null,
      expiresAt: expiresAt.toISOString(),
      claimedAt: null,
      consumedAt: null,
    });
    return;
  }
  await pool.query('DELETE FROM telegram_login_links WHERE expires_at < NOW() - INTERVAL \'1 day\'');
  await pool.query(
    `INSERT INTO telegram_login_links (token_hash, chart_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hash, isUuid(chartId) ? chartId : null, expiresAt],
  );
}

async function readLink(token) {
  const hash = tokenHash(token);
  const pool = await authPool();
  if (!pool) return { hash, record: memoryLinks.get(hash) || null, pool: null };
  const result = await pool.query(
    `SELECT token_hash, chart_id, user_id, expires_at, claimed_at, consumed_at
     FROM telegram_login_links WHERE token_hash = $1 LIMIT 1`,
    [hash],
  );
  const row = result.rows[0];
  return {
    hash,
    pool,
    record: row ? {
      chartId: row.chart_id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      claimedAt: row.claimed_at,
      consumedAt: row.consumed_at,
    } : null,
  };
}

async function claimLink(token, telegramUser) {
  const link = await readLink(token);
  const record = link.record;
  if (!record || record.consumedAt || new Date(record.expiresAt).getTime() <= Date.now()) return null;

  const user = await upsertUser({
    telegram_id: String(telegramUser.id),
    username: telegramUser.username || null,
    first_name: telegramUser.first_name || null,
    last_name: telegramUser.last_name || null,
    photo_url: null,
  });

  if (!link.pool) {
    memoryLinks.set(link.hash, { ...record, userId: user.telegram_id, claimedAt: new Date().toISOString() });
  } else {
    await link.pool.query(
      `UPDATE telegram_login_links
       SET user_id = $2, claimed_at = COALESCE(claimed_at, NOW())
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
      [link.hash, user.telegram_id],
    );
  }
  return { user, chartId: record.chartId };
}

async function consumeLink(token) {
  const link = await readLink(token);
  const record = link.record;
  if (!record) return { status: 'missing' };
  if (record.consumedAt) return { status: 'consumed' };
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { status: 'expired' };
  if (!record.userId) return { status: 'pending' };

  if (record.chartId) await claimChart(record.chartId, record.userId).catch(() => null);
  if (!link.pool) {
    memoryLinks.set(link.hash, { ...record, consumedAt: new Date().toISOString() });
  } else {
    const result = await link.pool.query(
      `UPDATE telegram_login_links
       SET consumed_at = NOW()
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
       RETURNING user_id, chart_id`,
      [link.hash],
    );
    if (!result.rows[0]) return { status: 'consumed' };
  }
  return { status: 'authorized', userId: String(record.userId), chartId: record.chartId || null };
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export async function telegramLinkAuthMiddleware(req, res, next) {
  try {
    if (req.method === 'POST' && req.path === '/api/auth/telegram-link') {
      const username = botUsername();
      if (!username || !compact(process.env.TELEGRAM_BOT_TOKEN)) {
        return sendJson(res, 503, { error: 'Telegram-вход временно не настроен.', code: 'TELEGRAM_NOT_CONFIGURED' });
      }
      const token = crypto.randomBytes(24).toString('base64url');
      const chartId = isUuid(req.body?.chartId) ? String(req.body.chartId) : null;
      await saveLink({ token, chartId });
      return sendJson(res, 201, {
        token,
        telegramUrl: `https://t.me/${username}?start=login_${token}`,
        expiresInSeconds: Math.floor(LOGIN_TTL_MS / 1000),
      });
    }

    if (req.method === 'POST' && req.path === '/api/auth/telegram-link/status') {
      const token = compact(req.body?.token);
      if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) {
        return sendJson(res, 400, { error: 'Некорректная ссылка Telegram.', code: 'INVALID_TELEGRAM_LINK' });
      }
      const result = await consumeLink(token);
      if (result.status === 'authorized') {
        setSessionCookie(res, result.userId);
        return sendJson(res, 200, { status: 'authorized', chartId: result.chartId });
      }
      return sendJson(res, 200, result);
    }

    return next();
  } catch (error) {
    console.error('Telegram deep-link auth failed:', error);
    return sendJson(res, 500, { error: 'Не удалось подключить Telegram. Попробуйте ещё раз.', code: 'TELEGRAM_LINK_FAILED' });
  }
}

async function sendTelegramMessage(fetchImpl, token, payload) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status}`);
}

export async function handleTelegramLinkUpdates(updates, { fetchImpl = globalThis.fetch } = {}) {
  const botToken = compact(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken || !Array.isArray(updates)) return;

  for (const update of updates) {
    const message = update?.message;
    const text = compact(message?.text);
    const match = text.match(/^\/start(?:@\w+)?\s+login_([A-Za-z0-9_-]{24,80})$/i);
    if (!match || !message?.from?.id) continue;

    const token = match[1];
    const claimed = await claimLink(token, message.from).catch((error) => {
      console.error('Telegram link claim failed:', error);
      return null;
    });
    if (!claimed) {
      await sendTelegramMessage(fetchImpl, botToken, {
        chat_id: message.chat?.id || message.from.id,
        text: 'Эта ссылка входа уже использована или устарела. Вернитесь к Звёздному клону и нажмите «Подключить Telegram» ещё раз.',
      }).catch(() => {});
      continue;
    }

    const baseUrl = publicBaseUrl();
    const returnUrl = baseUrl
      ? `${baseUrl}/clone/?${new URLSearchParams({ telegram_link: token, ...(claimed.chartId ? { chart: claimed.chartId } : {}) }).toString()}`
      : null;
    await sendTelegramMessage(fetchImpl, botToken, {
      chat_id: message.chat?.id || message.from.id,
      text: '✦ Telegram подключён. Клон и история теперь сохранятся за вами. Вернитесь на страницу — разговор продолжится автоматически.',
      reply_markup: returnUrl ? { inline_keyboard: [[{ text: 'Вернуться к Звёздному клону', url: returnUrl }]] } : undefined,
    }).catch((error) => console.error('Telegram link confirmation failed:', error.message));
  }
}
