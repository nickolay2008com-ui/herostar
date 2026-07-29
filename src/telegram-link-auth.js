import crypto from 'node:crypto';
import pg from 'pg';
import { claimChart, getChart, upsertUser } from './store.js';

const LOGIN_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_POLL_TIMEOUT_SECONDS = 25;
const COOKIE_NAME = 'herostar_session';
const memoryLinks = new Map();
let poolPromise = null;
let telegramUpdateRuntime = null;
const telegramUpdateHandlers = new Set();
let botIdentityCache = { username: null, expiresAt: 0 };

function compact(value = '') {
  return String(value ?? '').trim();
}

function configuredBotUsername() {
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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForPromiseOrTimeout(promise, timeoutMs) {
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, timeoutMs);
    timeoutId.unref?.();
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function telegramApiRequest(fetchImpl, token, method, payload = {}, timeoutMs = 10_000) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram ${method} failed: ${response.status}`);
  }
  return result.result;
}

async function resolveBotUsername() {
  const token = compact(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return '';
  if (botIdentityCache.username && botIdentityCache.expiresAt > Date.now()) return botIdentityCache.username;

  try {
    const bot = await telegramApiRequest(globalThis.fetch, token, 'getMe');
    const username = compact(bot?.username).replace(/^@/, '');
    if (username) {
      botIdentityCache = { username, expiresAt: Date.now() + 5 * 60 * 1000 };
      return username;
    }
  } catch {
    // При временной недоступности Telegram используем проверенное значение Railway.
  }

  const fallback = configuredBotUsername();
  if (fallback) botIdentityCache = { username: fallback, expiresAt: Date.now() + 60_000 };
  return fallback;
}

async function verifyChartAccess(req, chartId) {
  if (!chartId) return { ok: true, chartId: null };
  const record = await getChart(chartId);
  if (!record) return { ok: false, status: 404, error: 'Клон не найден.', code: 'CHART_NOT_FOUND' };

  if (record.userId) {
    const ownsChart = Boolean(req.user && String(record.userId) === String(req.user.telegram_id));
    return ownsChart
      ? { ok: true, chartId }
      : { ok: false, status: 403, error: 'Нет доступа к этому клону.', code: 'CHART_FORBIDDEN' };
  }

  const chartToken = compact(req.headers['x-chart-token']);
  const ownsAnonymousChart = Boolean(chartToken && record.accessTokenHash && tokenHash(chartToken) === record.accessTokenHash);
  return ownsAnonymousChart
    ? { ok: true, chartId }
    : { ok: false, status: 403, error: 'Нужен ключ этого клона.', code: 'CHART_TOKEN_REQUIRED' };
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

        CREATE TABLE IF NOT EXISTS telegram_update_runtime (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      return pool;
    })().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

async function saveLink({ token, chartId, userId = null }) {
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + LOGIN_TTL_MS);
  const normalizedUserId = userId ? String(userId) : null;
  const claimedAt = normalizedUserId ? new Date() : null;
  const pool = await authPool();
  if (!pool) {
    memoryLinks.set(hash, {
      chartId: isUuid(chartId) ? chartId : null,
      userId: normalizedUserId,
      expiresAt: expiresAt.toISOString(),
      claimedAt: claimedAt?.toISOString() || null,
      consumedAt: null,
    });
    return;
  }
  await pool.query('DELETE FROM telegram_login_links WHERE expires_at < NOW() - INTERVAL \'1 day\'');
  if (!normalizedUserId) {
    await pool.query(
      `INSERT INTO telegram_login_links (token_hash, chart_id, expires_at)
       VALUES ($1, $2, $3)`,
      [hash, isUuid(chartId) ? chartId : null, expiresAt],
    );
    return;
  }
  await pool.query(
    `INSERT INTO telegram_login_links
       (token_hash, chart_id, user_id, expires_at, claimed_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [hash, isUuid(chartId) ? chartId : null, normalizedUserId, expiresAt, claimedAt],
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
  const telegramId = String(telegramUser.id);
  if (record.userId && String(record.userId) !== telegramId) return null;

  const user = await upsertUser({
    telegram_id: telegramId,
    username: telegramUser.username || null,
    first_name: telegramUser.first_name || null,
    last_name: telegramUser.last_name || null,
    photo_url: null,
  });

  if (!link.pool) {
    const latest = memoryLinks.get(link.hash);
    if (!latest || latest.consumedAt || (latest.userId && String(latest.userId) !== telegramId)) return null;
    memoryLinks.set(link.hash, { ...latest, userId: telegramId, claimedAt: latest.claimedAt || new Date().toISOString() });
  } else {
    const updated = await link.pool.query(
      `UPDATE telegram_login_links
       SET user_id = $2, claimed_at = COALESCE(claimed_at, NOW())
       WHERE token_hash = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
         AND (user_id IS NULL OR user_id = $2)
       RETURNING chart_id`,
      [link.hash, telegramId],
    );
    if (!updated.rows[0]) return null;
  }
  return { user, chartId: record.chartId };
}

async function consumeLink(token) {
  const link = await readLink(token);
  const record = link.record;
  if (!record) return { status: 'missing' };
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { status: 'expired' };
  if (record.consumedAt) return { status: 'consumed', userId: record.userId, chartId: record.chartId || null };
  if (!record.userId) return { status: 'pending' };

  if (record.chartId) {
    const claimedChart = await claimChart(record.chartId, record.userId);
    if (!claimedChart) return { status: 'chart_unavailable' };
  }

  if (!link.pool) {
    const latest = memoryLinks.get(link.hash);
    if (!latest || latest.consumedAt) return { status: 'consumed', userId: latest?.userId || null, chartId: latest?.chartId || null };
    memoryLinks.set(link.hash, { ...latest, consumedAt: new Date().toISOString() });
  } else {
    const result = await link.pool.query(
      `UPDATE telegram_login_links
       SET consumed_at = NOW()
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
       RETURNING user_id, chart_id`,
      [link.hash],
    );
    if (!result.rows[0]) {
      const latest = await readLink(token);
      return { status: 'consumed', userId: latest.record?.userId || null, chartId: latest.record?.chartId || null };
    }
  }
  return { status: 'authorized', userId: String(record.userId), chartId: record.chartId || null };
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export async function telegramLinkAuthMiddleware(req, res, next) {
  try {
    if (req.method === 'POST' && req.path === '/api/auth/telegram-link') {
      const username = await resolveBotUsername();
      if (!username || !compact(process.env.TELEGRAM_BOT_TOKEN)) {
        return sendJson(res, 503, { error: 'Telegram-вход временно не настроен.', code: 'TELEGRAM_NOT_CONFIGURED' });
      }

      const requestedChartId = compact(req.body?.chartId);
      const chartId = isUuid(requestedChartId) ? requestedChartId : null;
      if (requestedChartId && !chartId) {
        return sendJson(res, 400, { error: 'Некорректный ID клона.', code: 'INVALID_CHART_ID' });
      }
      const chartAccess = await verifyChartAccess(req, chartId);
      if (!chartAccess.ok) return sendJson(res, chartAccess.status, { error: chartAccess.error, code: chartAccess.code });

      const token = crypto.randomBytes(24).toString('base64url');
      await saveLink({ token, chartId: chartAccess.chartId });
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
      if (result.status === 'chart_unavailable') {
        return sendJson(res, 409, { error: 'Этот клон уже сохранён в другом профиле.', code: 'CHART_ALREADY_CLAIMED' });
      }
      return sendJson(res, 200, { status: result.status });
    }

    return next();
  } catch (error) {
    console.error('Telegram deep-link auth failed:', error);
    return sendJson(res, 500, { error: 'Не удалось подключить Telegram. Попробуйте ещё раз.', code: 'TELEGRAM_LINK_FAILED' });
  }
}

async function sendTelegramMessage(fetchImpl, token, payload) {
  await telegramApiRequest(fetchImpl, token, 'sendMessage', payload);
}

export async function handleTelegramLinkUpdates(updates, { fetchImpl = globalThis.fetch } = {}) {
  const botToken = compact(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken || !Array.isArray(updates)) return;

  for (const update of updates) {
    const message = update?.message;
    const messageAgeMs = message?.date ? Date.now() - Number(message.date) * 1000 : 0;
    if (messageAgeMs > LOGIN_TTL_MS + 60_000) continue;

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
    const returnToken = crypto.randomBytes(24).toString('base64url');
    await saveLink({
      token: returnToken,
      chartId: claimed.chartId,
      userId: claimed.user.telegram_id,
    });
    const returnUrl = baseUrl
      ? `${baseUrl}/clone/live/chat?${new URLSearchParams({ telegram_link: returnToken, ...(claimed.chartId ? { chart: claimed.chartId } : {}) }).toString()}`
      : null;
    const confirmationText = claimed.chartId
      ? '✦ Telegram подключён. Клон и история теперь сохранятся за вами. Вернитесь на страницу — разговор продолжится автоматически.'
      : '✦ Telegram подтверждён. Возвращаем вас к сохранённому Звёздному клону.';
    await sendTelegramMessage(fetchImpl, botToken, {
      chat_id: message.chat?.id || message.from.id,
      text: confirmationText,
      reply_markup: returnUrl ? { inline_keyboard: [[{ text: 'Вернуться к Звёздному клону', url: returnUrl }]] } : undefined,
    }).catch((error) => console.error('Telegram link confirmation failed:', error.message));
  }
}

async function readTelegramUpdateOffset() {
  try {
    const pool = await authPool();
    if (!pool) return 0;
    const result = await pool.query(
      'SELECT value FROM telegram_update_runtime WHERE key = $1 LIMIT 1',
      ['get_updates_offset'],
    );
    return Math.max(0, Number(result.rows[0]?.value) || 0);
  } catch (error) {
    console.error('HeroStar Telegram offset load failed:', error.message);
    return 0;
  }
}

async function writeTelegramUpdateOffset(offset) {
  try {
    const pool = await authPool();
    if (!pool) return;
    await pool.query(
      `INSERT INTO telegram_update_runtime (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['get_updates_offset', String(Math.max(0, Number(offset) || 0))],
    );
  } catch (error) {
    console.error('HeroStar Telegram offset save failed:', error.message);
  }
}

export function registerTelegramUpdateHandler(handler) {
  if (typeof handler !== 'function') return () => {};
  telegramUpdateHandlers.add(handler);
  return () => telegramUpdateHandlers.delete(handler);
}

async function dispatchTelegramUpdates(updates, { fetchImpl }) {
  await handleTelegramLinkUpdates(updates, { fetchImpl });
  for (const handler of [...telegramUpdateHandlers]) {
    try {
      await handler(updates, { fetchImpl });
    } catch (error) {
      console.error('HeroStar Telegram update handler failed:', error.message);
    }
  }
}

export function startTelegramUpdateRuntime({ fetchImpl = globalThis.fetch, updateHandlers = [] } = {}) {
  for (const handler of updateHandlers) registerTelegramUpdateHandler(handler);
  if (telegramUpdateRuntime) return telegramUpdateRuntime;

  const botToken = compact(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken) return null;

  let stopped = false;
  const done = (async () => {
    let offset = await readTelegramUpdateOffset();
    console.log('HeroStar Telegram использует единый канал обновлений для входа и практик.');
    while (!stopped) {
      try {
        const updates = await telegramApiRequest(fetchImpl, botToken, 'getUpdates', {
          offset,
          timeout: TELEGRAM_POLL_TIMEOUT_SECONDS,
          allowed_updates: ['message', 'callback_query'],
        }, (TELEGRAM_POLL_TIMEOUT_SECONDS + 10) * 1000);

        await dispatchTelegramUpdates(updates || [], { fetchImpl });
        for (const update of updates || []) {
          offset = Math.max(offset, Number(update.update_id) + 1);
        }
        if ((updates || []).length) await writeTelegramUpdateOffset(offset);
      } catch (error) {
        if (stopped) break;
        console.error('HeroStar Telegram polling failed:', error.message);
        await sleep(5000);
      }
    }
  })();

  telegramUpdateRuntime = {
    registerUpdateHandler: registerTelegramUpdateHandler,
    async stop() {
      stopped = true;
      await waitForPromiseOrTimeout(done, 36_000);
      telegramUpdateRuntime = null;
      telegramUpdateHandlers.clear();
    },
  };
  return telegramUpdateRuntime;
}
