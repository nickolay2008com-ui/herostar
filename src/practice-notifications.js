const DEFAULT_CADENCE_HOURS = 24;
const DEFAULT_FIRST_DELAY_MINUTES = 30;
const DEFAULT_CYCLE_INTERVAL_MS = 60_000;
const TELEGRAM_POLL_TIMEOUT_SECONDS = 25;

let startedRuntime = null;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function compactText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function sentence(value = '') {
  const clean = compactText(value);
  if (!clean) return '';
  return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
}

function stripActionPrefix(value = '') {
  return compactText(value)
    .replace(/^(попробуйте сейчас|ваш ход|первый ход|маленький ход)\s*[:—-]\s*/i, '')
    .replace(/^→\s*/, '');
}

function escapeTelegramHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function selectPracticeCards(portrait, _openedCardIds = [], _options = {}) {
  return Array.isArray(portrait?.cards)
    ? portrait.cards.filter((card) => card?.id && !card.locked)
    : [];
}

export function pickNextPracticeCard(cards, lastCardId = null) {
  if (!Array.isArray(cards) || !cards.length) return null;
  if (!lastCardId) return cards[0];
  const index = cards.findIndex((card) => String(card.id) === String(lastCardId));
  return cards[(index + 1 + cards.length) % cards.length];
}

export function buildPracticeMessage(card, deliveryCount = 0) {
  if (!card) return '';
  const title = compactText(card.title || card.position || 'Настройка клона');
  const position = compactText(card.position);
  const key = sentence(card.key || card.manifestation || card.lead);
  const action = sentence(stripActionPrefix(card.action) || 'Заметьте один реальный момент, когда эта настройка уже проявляется естественно.');
  const bridges = [
    'Сегодня проверим одну настройку клона в обычной жизни, без попытки подогнать себя под карту.',
    'Сонастройка строится на наблюдении: подходит, не подходит или работает только в определённых условиях.',
    'Задача не стать клоном, а понять, какая часть его механики действительно даёт вам опору.',
  ];
  const bridge = bridges[Math.abs(Number(deliveryCount) || 0) % bridges.length];

  return [
    `✦ <b>Сонастройка: ${escapeTelegramHtml(title)}</b>`,
    position && position !== title ? `<i>${escapeTelegramHtml(position)}</i>` : '',
    escapeTelegramHtml(bridge),
    key ? `<b>Ключевой момент</b>\n${escapeTelegramHtml(key)}` : '',
    `<b>Мини-задание</b>\n${escapeTelegramHtml(action)}`,
    '<b>Вечером отметьте для себя</b>\nПодошло · частично · не подошло · хочу уточнить.',
  ].filter(Boolean).join('\n\n');
}

function publicBaseUrl() {
  const explicit = compactText(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL);
  if (explicit) return explicit.replace(/\/$/, '');
  const railwayDomain = compactText(process.env.RAILWAY_PUBLIC_DOMAIN);
  return railwayDomain ? `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : '';
}

function cloneUrl(chartId) {
  const baseUrl = publicBaseUrl();
  if (!baseUrl) return '';
  return `${baseUrl}/clone/?chart=${encodeURIComponent(chartId || '')}`;
}

async function telegramRequest(token, method, payload = {}, timeoutMs = 35_000) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    const error = new Error(result.description || `Telegram ${method} failed`);
    error.status = response.status;
    error.errorCode = result.error_code;
    throw error;
  }
  return result.result;
}

function notificationKeyboard(subscription, enabled = true) {
  const rows = [];
  const url = cloneUrl(subscription.chart_id || subscription.chartId);
  if (url) rows.push([{ text: 'Открыть Звёздного клона', url }]);
  rows.push([{
    text: enabled ? 'Приостановить Сонастройку' : 'Возобновить сообщения',
    callback_data: enabled ? 'alignment:disable' : 'alignment:enable',
  }]);
  return { inline_keyboard: rows };
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS practice_subscriptions (
      user_id TEXT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      chart_id UUID REFERENCES charts(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      welcome_sent_at TIMESTAMPTZ,
      next_delivery_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_until TIMESTAMPTZ,
      last_card_id TEXT,
      delivery_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE practice_subscriptions ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT 'clone_alignment';
    CREATE INDEX IF NOT EXISTS practice_subscriptions_due_idx
      ON practice_subscriptions(enabled, next_delivery_at)
      WHERE enabled = TRUE;

    CREATE TABLE IF NOT EXISTS practice_runtime (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function syncSubscriptions(pool, firstDelayMinutes) {
  const inserted = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (chart.user_id) chart.user_id, chart.id AS chart_id
       FROM charts AS chart
       JOIN users AS user_record ON user_record.telegram_id = chart.user_id
       WHERE chart.user_id IS NOT NULL
         AND user_record.clone_alignment_until > NOW()
       ORDER BY chart.user_id, chart.created_at DESC
     )
     INSERT INTO practice_subscriptions (user_id, chart_id, program, enabled, next_delivery_at)
     SELECT user_id, chart_id, 'clone_alignment', TRUE, NOW() + ($1::text || ' minutes')::interval
     FROM latest
     ON CONFLICT (user_id) DO UPDATE SET
       chart_id = EXCLUDED.chart_id,
       program = 'clone_alignment',
       enabled = CASE
         WHEN practice_subscriptions.last_error = 'user_paused' OR practice_subscriptions.last_error LIKE 'blocked:%' THEN FALSE
         ELSE TRUE
       END,
       updated_at = NOW()
     RETURNING user_id, chart_id, enabled, welcome_sent_at, next_delivery_at, delivery_count`,
    [String(firstDelayMinutes)],
  );

  await pool.query(`
    UPDATE practice_subscriptions AS subscription
    SET enabled = FALSE,
        locked_until = NULL,
        updated_at = NOW()
    WHERE subscription.program = 'clone_alignment'
      AND NOT EXISTS (
        SELECT 1 FROM users AS user_record
        WHERE user_record.telegram_id = subscription.user_id
          AND user_record.clone_alignment_until > NOW()
      )
  `);

  return inserted.rows.filter((row) => !row.welcome_sent_at && row.enabled);
}

async function loadAlignmentStatus(pool, userId) {
  const result = await pool.query(
    `SELECT clone_alignment_until,
            clone_alignment_until > NOW() AS active
     FROM users WHERE telegram_id = $1 LIMIT 1`,
    [String(userId)],
  );
  return result.rows[0] || { active: false, clone_alignment_until: null };
}

async function sendWelcome(pool, token, subscription) {
  const status = await loadAlignmentStatus(pool, subscription.user_id);
  if (!status.active) return;
  const until = new Date(status.clone_alignment_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const text = [
    '✦ <b>Сонастройка со Звёздным клоном началась.</b>',
    `До ${escapeTelegramHtml(until)} вы будете получать один ключевой момент карты и одно простое мини-задание в день.`,
    'Задача месяца — не следовать клону вслепую, а проверить его настройки в реальных ситуациях и собрать то, что действительно помогает.',
    'Сообщения можно приостановить кнопкой ниже или командой /stop. Оплата не продлевается автоматически.',
  ].join('\n\n');

  try {
    await telegramRequest(token, 'sendMessage', {
      chat_id: subscription.user_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: notificationKeyboard(subscription, true),
    });
    await pool.query(
      `UPDATE practice_subscriptions
       SET welcome_sent_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE user_id = $1`,
      [subscription.user_id],
    );
  } catch (error) {
    const blocked = Number(error.status) === 403 || Number(error.errorCode) === 403;
    await pool.query(
      `UPDATE practice_subscriptions
       SET enabled = CASE WHEN $2 THEN FALSE ELSE enabled END,
           last_error = $3,
           next_delivery_at = NOW() + INTERVAL '1 hour',
           updated_at = NOW()
       WHERE user_id = $1`,
      [subscription.user_id, blocked, `${blocked ? 'blocked:' : ''}${compactText(error.message)}`.slice(0, 500)],
    );
    console.error('HeroStar alignment welcome failed:', error.message);
  }
}

async function claimDueSubscriptions(pool, limit = 20) {
  const result = await pool.query(
    `WITH due AS (
       SELECT subscription.user_id
       FROM practice_subscriptions AS subscription
       JOIN users AS user_record ON user_record.telegram_id = subscription.user_id
       WHERE subscription.enabled = TRUE
         AND subscription.program = 'clone_alignment'
         AND user_record.clone_alignment_until > NOW()
         AND subscription.welcome_sent_at IS NOT NULL
         AND subscription.next_delivery_at <= NOW()
         AND (subscription.locked_until IS NULL OR subscription.locked_until < NOW())
       ORDER BY subscription.next_delivery_at ASC
       LIMIT $1
       FOR UPDATE OF subscription SKIP LOCKED
     )
     UPDATE practice_subscriptions AS subscription
     SET locked_until = NOW() + INTERVAL '5 minutes', updated_at = NOW()
     FROM due
     WHERE subscription.user_id = due.user_id
     RETURNING subscription.*`,
    [Math.max(1, Math.min(100, Number(limit) || 20))],
  );
  return result.rows;
}

async function loadPracticeContext(pool, subscription) {
  const result = await pool.query(
    `SELECT chart.portrait_data, user_record.clone_alignment_until
     FROM charts AS chart
     JOIN users AS user_record ON user_record.telegram_id = chart.user_id
     WHERE chart.id = $1
       AND chart.user_id = $2
       AND user_record.clone_alignment_until > NOW()
     LIMIT 1`,
    [subscription.chart_id, subscription.user_id],
  );
  if (!result.rows[0]) return null;
  return {
    portrait: result.rows[0].portrait_data,
    alignmentUntil: result.rows[0].clone_alignment_until,
  };
}

async function releaseWithRetry(pool, subscription, error, blocked = false) {
  await pool.query(
    `UPDATE practice_subscriptions
     SET enabled = CASE WHEN $2 THEN FALSE ELSE enabled END,
         locked_until = NULL,
         next_delivery_at = NOW() + INTERVAL '1 hour',
         last_error = $3,
         updated_at = NOW()
     WHERE user_id = $1`,
    [subscription.user_id, blocked, `${blocked ? 'blocked:' : ''}${compactText(error?.message || error)}`.slice(0, 500)],
  );
}

async function deliverPractice(pool, token, subscription, options) {
  try {
    const context = await loadPracticeContext(pool, subscription);
    if (!context) {
      await pool.query(
        `UPDATE practice_subscriptions SET enabled = FALSE, locked_until = NULL, updated_at = NOW() WHERE user_id = $1`,
        [subscription.user_id],
      );
      return;
    }
    const cards = selectPracticeCards(context.portrait);
    const card = pickNextPracticeCard(cards, subscription.last_card_id);
    if (!card) throw new Error('В карте пока нет доступных настроек для Сонастройки.');

    await telegramRequest(token, 'sendMessage', {
      chat_id: subscription.user_id,
      text: buildPracticeMessage(card, subscription.delivery_count),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: notificationKeyboard(subscription, true),
    });

    await pool.query(
      `UPDATE practice_subscriptions
       SET locked_until = NULL,
           next_delivery_at = NOW() + ($2::text || ' hours')::interval,
           last_card_id = $3,
           delivery_count = delivery_count + 1,
           last_error = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [subscription.user_id, String(options.cadenceHours), String(card.id)],
    );
  } catch (error) {
    const blocked = Number(error.status) === 403 || Number(error.errorCode) === 403;
    await releaseWithRetry(pool, subscription, error, blocked);
    console.error('HeroStar alignment notification failed:', error.message);
  }
}

async function runDeliveryCycle(pool, token, options) {
  const inserted = await syncSubscriptions(pool, options.firstDelayMinutes);
  for (const subscription of inserted) await sendWelcome(pool, token, subscription);
  const due = await claimDueSubscriptions(pool, options.batchSize);
  for (const subscription of due) await deliverPractice(pool, token, subscription, options);
}

async function getRuntimeValue(pool, key) {
  const result = await pool.query('SELECT value FROM practice_runtime WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

async function setRuntimeValue(pool, key, value) {
  await pool.query(
    `INSERT INTO practice_runtime (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, String(value)],
  );
}

async function latestChartForUser(pool, userId) {
  const result = await pool.query(
    `SELECT id FROM charts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [String(userId)],
  );
  return result.rows[0]?.id || null;
}

async function setSubscriptionEnabled(pool, userId, enabled) {
  const status = await loadAlignmentStatus(pool, userId);
  if (!status.active) return { subscription: null, active: false, until: status.clone_alignment_until };
  const chartId = await latestChartForUser(pool, userId);
  if (!chartId) return { subscription: null, active: true, until: status.clone_alignment_until };
  const result = await pool.query(
    `INSERT INTO practice_subscriptions (user_id, chart_id, program, enabled, next_delivery_at, last_error)
     VALUES ($1, $2, 'clone_alignment', $3, NOW(), CASE WHEN $3 THEN NULL ELSE 'user_paused' END)
     ON CONFLICT (user_id) DO UPDATE SET
       chart_id = EXCLUDED.chart_id,
       program = 'clone_alignment',
       enabled = EXCLUDED.enabled,
       locked_until = NULL,
       next_delivery_at = CASE WHEN EXCLUDED.enabled THEN NOW() ELSE practice_subscriptions.next_delivery_at END,
       last_error = CASE WHEN EXCLUDED.enabled THEN NULL ELSE 'user_paused' END,
       updated_at = NOW()
     RETURNING *`,
    [String(userId), chartId, Boolean(enabled)],
  );
  return { subscription: result.rows[0] || null, active: true, until: status.clone_alignment_until };
}

async function sendControlConfirmation(token, userId, result, enabled) {
  if (!result.active) {
    const baseUrl = publicBaseUrl();
    await telegramRequest(token, 'sendMessage', {
      chat_id: String(userId),
      text: baseUrl
        ? `Сонастройка сейчас не активна. Открыть программу можно в HeroStar: ${baseUrl}/clone/`
        : 'Сонастройка сейчас не активна. Открыть программу можно на странице Звёздного клона.',
    });
    return;
  }
  const text = enabled
    ? '✦ Сообщения Сонастройки снова включены. Следующий ключевой момент придёт по вашей карте.'
    : 'Сообщения Сонастройки приостановлены. Клон, карта и история сохранены. Вернуть сообщения можно командой /start.';
  await telegramRequest(token, 'sendMessage', {
    chat_id: String(userId),
    text,
    reply_markup: result.subscription ? notificationKeyboard(result.subscription, enabled) : undefined,
  });
}

async function handleTelegramUpdate(pool, token, update) {
  const callback = update.callback_query;
  if (callback) {
    const userId = callback.from?.id;
    const enabled = callback.data === 'alignment:enable';
    if (userId && (enabled || callback.data === 'alignment:disable')) {
      const result = await setSubscriptionEnabled(pool, userId, enabled);
      await telegramRequest(token, 'answerCallbackQuery', {
        callback_query_id: callback.id,
        text: enabled ? 'Сообщения включены' : 'Сообщения приостановлены',
      }).catch(() => {});
      await sendControlConfirmation(token, userId, result, enabled).catch(() => {});
    }
    return;
  }

  const message = update.message;
  const userId = message?.from?.id;
  const text = compactText(message?.text).toLowerCase().split('@')[0];
  if (!userId || !text.startsWith('/')) return;

  if (['/stop', '/off', '/pause'].includes(text)) {
    const result = await setSubscriptionEnabled(pool, userId, false);
    await sendControlConfirmation(token, userId, result, false);
    return;
  }

  if (['/start', '/on', '/resume'].includes(text)) {
    const result = await setSubscriptionEnabled(pool, userId, true);
    await sendControlConfirmation(token, userId, result, true);
    return;
  }

  if (text === '/status') {
    const status = await loadAlignmentStatus(pool, userId);
    const subscription = await pool.query('SELECT * FROM practice_subscriptions WHERE user_id = $1', [String(userId)]);
    const current = subscription.rows[0] || null;
    const until = status.clone_alignment_until
      ? new Date(status.clone_alignment_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      : null;
    await telegramRequest(token, 'sendMessage', {
      chat_id: String(userId),
      text: status.active
        ? `Сонастройка активна до ${until}. Сообщения ${current?.enabled ? 'включены' : 'приостановлены'}. Автопродления нет.`
        : 'Сонастройка сейчас не активна.',
      reply_markup: current ? notificationKeyboard(current, Boolean(current.enabled)) : undefined,
    });
  }
}

async function pollTelegramUpdates(pool, token, signal) {
  let offset = Number(await getRuntimeValue(pool, 'telegram_update_offset')) || 0;
  while (!signal.aborted) {
    try {
      const updates = await telegramRequest(token, 'getUpdates', {
        offset,
        timeout: TELEGRAM_POLL_TIMEOUT_SECONDS,
        allowed_updates: ['message', 'callback_query'],
      }, (TELEGRAM_POLL_TIMEOUT_SECONDS + 10) * 1000);
      for (const update of updates || []) {
        await handleTelegramUpdate(pool, token, update);
        offset = Math.max(offset, Number(update.update_id) + 1);
      }
      if ((updates || []).length) await setRuntimeValue(pool, 'telegram_update_offset', offset);
    } catch (error) {
      if (signal.aborted) break;
      console.error('HeroStar Telegram update polling failed:', error.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export async function startPracticeNotifications() {
  if (startedRuntime) return startedRuntime;
  startedRuntime = (async () => {
    const enabled = String(process.env.PRACTICE_NOTIFICATIONS_ENABLED || 'true').toLowerCase() !== 'false';
    const databaseUrl = compactText(process.env.DATABASE_URL);
    const token = compactText(process.env.TELEGRAM_BOT_TOKEN);
    if (!enabled || !databaseUrl || !token) {
      console.warn('Telegram-Сонастройка не запущена: нужен DATABASE_URL и TELEGRAM_BOT_TOKEN.');
      return { stop: async () => {} };
    }

    const pgModule = await import('pg');
    const Pool = pgModule.Pool || pgModule.default?.Pool;
    if (!Pool) throw new Error('pg.Pool недоступен.');
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 2,
    });
    await ensureSchema(pool);

    const options = {
      cadenceHours: boundedNumber(process.env.PRACTICE_NOTIFICATION_HOURS, DEFAULT_CADENCE_HOURS, 1, 168),
      firstDelayMinutes: boundedNumber(process.env.PRACTICE_FIRST_DELAY_MINUTES, DEFAULT_FIRST_DELAY_MINUTES, 1, 1440),
      cycleIntervalMs: boundedNumber(process.env.PRACTICE_CYCLE_INTERVAL_MS, DEFAULT_CYCLE_INTERVAL_MS, 15_000, 3_600_000),
      batchSize: boundedNumber(process.env.PRACTICE_BATCH_SIZE, 20, 1, 100),
    };

    let cycleRunning = false;
    const cycle = async () => {
      if (cycleRunning) return;
      cycleRunning = true;
      try {
        await runDeliveryCycle(pool, token, options);
      } catch (error) {
        console.error('HeroStar alignment cycle failed:', error);
      } finally {
        cycleRunning = false;
      }
    };

    await cycle();
    const interval = setInterval(cycle, options.cycleIntervalMs);
    interval.unref?.();
    const controller = new AbortController();
    void pollTelegramUpdates(pool, token, controller.signal);

    console.log(`HeroStar alignment notifications started: every ${options.cadenceHours}h.`);
    return {
      async stop() {
        clearInterval(interval);
        controller.abort();
        await pool.end();
      },
    };
  })();
  return startedRuntime;
}
