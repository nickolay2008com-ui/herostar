import { handleTelegramLinkUpdates } from './telegram-link-auth.js';

const DEFAULT_CADENCE_HOURS = 24;
const DEFAULT_FIRST_DELAY_MINUTES = 30;
const DEFAULT_CYCLE_INTERVAL_MS = 60_000;
const DEFAULT_REMINDER_HOURS = 6;
const TELEGRAM_POLL_TIMEOUT_SECONDS = 25;
const WEEKLY_RESULT_SIZE = 7;

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

function practiceCardData(card = {}) {
  return {
    id: compactText(card.id),
    title: compactText(card.title || card.position || 'Настройка карты'),
    position: compactText(card.position),
    key: sentence(card.key || card.manifestation || card.lead),
    action: sentence(
      stripActionPrefix(card.action)
      || 'Заметьте один реальный момент, когда эта настройка уже проявляется естественно.',
    ),
  };
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
  const data = practiceCardData(card);
  const introductions = [
    'Сегодня не нужно верить описанию карты — достаточно проверить один небольшой ход.',
    'Эта практика нужна не для идеального результата, а чтобы увидеть, что действительно работает именно у вас.',
    'Карта становится полезной только после проверки в реальной ситуации. Сегодня проверим один её элемент.',
  ];
  const introduction = introductions[Math.abs(Number(deliveryCount) || 0) % introductions.length];

  return [
    `✦ <b>Практика по вашей карте: ${escapeTelegramHtml(data.title)}</b>`,
    data.position && data.position !== data.title ? `<i>${escapeTelegramHtml(data.position)}</i>` : '',
    escapeTelegramHtml(introduction),
    data.key ? `<b>На что опереться</b>\n${escapeTelegramHtml(data.key)}` : '',
    `<b>Проверка на 2 минуты</b>\n${escapeTelegramHtml(data.action)}`,
    'После действия нажмите кнопку ниже. AstroHero сохранит не теорию, а ваш реальный результат.',
  ].filter(Boolean).join('\n\n');
}

export function buildReminderMessage(delivery) {
  if (!delivery) return '';
  return [
    `✦ <b>Напоминание: ${escapeTelegramHtml(delivery.card_title || 'практика по карте')}</b>`,
    `<b>Ваш маленький ход</b>\n${escapeTelegramHtml(sentence(delivery.card_action))}`,
    'Когда проверите, отметьте результат одной кнопкой. Это займёт несколько секунд.',
  ].join('\n\n');
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

function controlKeyboard(subscription, enabled = true) {
  const rows = [];
  const url = cloneUrl(subscription.chart_id || subscription.chartId);
  if (url) rows.push([{ text: 'Открыть мою карту', url }]);
  rows.push([{
    text: enabled ? 'Отключить уведомления' : 'Возобновить сообщения',
    callback_data: enabled ? 'alignment:disable' : 'alignment:enable',
  }]);
  return { inline_keyboard: rows };
}

export function buildPracticeKeyboard(subscription, deliveryNumber, { allowReminder = true } = {}) {
  const rows = [[
    { text: '✅ Проверил', callback_data: `alignment:done:${deliveryNumber}` },
    ...(allowReminder
      ? [{ text: '⏰ Напомнить позже', callback_data: `alignment:remind:${deliveryNumber}` }]
      : []),
  ]];
  rows.push([{ text: 'Не подходит сейчас', callback_data: `alignment:notfit:${deliveryNumber}` }]);
  const url = cloneUrl(subscription.chart_id || subscription.chartId);
  if (url) rows.push([{ text: 'Открыть мою карту', url }]);
  rows.push([{ text: 'Отключить уведомления', callback_data: 'alignment:disable' }]);
  return { inline_keyboard: rows };
}

export function buildOutcomeKeyboard(deliveryNumber) {
  return {
    inline_keyboard: [
      [
        { text: 'Стало яснее', callback_data: `alignment:outcome:${deliveryNumber}:clear` },
        { text: 'Есть следующий шаг', callback_data: `alignment:outcome:${deliveryNumber}:step` },
      ],
      [{ text: 'Ничего не изменилось', callback_data: `alignment:outcome:${deliveryNumber}:none` }],
    ],
  };
}

const OUTCOME_LABELS = {
  clear: 'стало яснее',
  step: 'появился следующий шаг',
  none: 'заметного изменения не произошло',
  not_fit: 'практика сейчас не подошла',
};

export function buildWeeklySummary(deliveries = []) {
  const rows = deliveries.filter((row) => OUTCOME_LABELS[row?.outcome]).slice(0, WEEKLY_RESULT_SIZE);
  if (!rows.length) return '';

  const grouped = new Map();
  for (const row of rows) {
    const title = compactText(row.card_title || 'Настройка карты');
    const key = `${title}\u0000${row.outcome}`;
    const current = grouped.get(key) || {
      title,
      cardKey: compactText(row.card_key),
      outcome: row.outcome,
      count: 0,
    };
    current.count += 1;
    grouped.set(key, current);
  }

  const positive = [...grouped.values()].filter((item) => ['clear', 'step'].includes(item.outcome));
  const uncertain = [...grouped.values()].filter((item) => ['none', 'not_fit'].includes(item.outcome));
  const lines = [
    '✦ <b>Что уже подтверждено вашей жизнью</b>',
    `Собраны результаты ${rows.length} последних проверок. Это уже не описание карты, а ваши наблюдения.`,
  ];

  if (positive.length) {
    lines.push('<b>Рабочие опоры</b>');
    for (const item of positive) {
      const detail = item.cardKey || OUTCOME_LABELS[item.outcome];
      const count = item.count > 1 ? ` · ${item.count} раза` : '';
      lines.push(`• <b>${escapeTelegramHtml(item.title)}</b> — ${escapeTelegramHtml(detail)}${count}`);
    }
  } else {
    lines.push('<b>Рабочие опоры</b>\nПока ни одна настройка не дала явного эффекта. Это честный и полезный результат.');
  }

  if (uncertain.length) {
    lines.push('<b>Пока не стало опорой</b>');
    for (const item of uncertain) {
      const count = item.count > 1 ? ` · ${item.count} раза` : '';
      lines.push(`• <b>${escapeTelegramHtml(item.title)}</b> — ${escapeTelegramHtml(OUTCOME_LABELS[item.outcome])}${count}`);
    }
  }

  lines.push('Так постепенно собирается ваша личная карта работающих принципов.');
  return lines.join('\n\n');
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

    CREATE TABLE IF NOT EXISTS practice_deliveries (
      user_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      chart_id UUID NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
      delivery_number INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      card_title TEXT NOT NULL,
      card_key TEXT,
      card_action TEXT NOT NULL,
      delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      message_sent_at TIMESTAMPTZ,
      reminder_at TIMESTAMPTZ,
      reminder_sent_at TIMESTAMPTZ,
      outcome TEXT,
      outcome_at TIMESTAMPTZ,
      PRIMARY KEY (user_id, delivery_number)
    );
    ALTER TABLE practice_deliveries ADD COLUMN IF NOT EXISTS message_sent_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS practice_deliveries_reminder_idx
      ON practice_deliveries(reminder_at)
      WHERE reminder_at IS NOT NULL AND reminder_sent_at IS NULL AND outcome IS NULL;
    CREATE INDEX IF NOT EXISTS practice_deliveries_result_idx
      ON practice_deliveries(user_id, chart_id, outcome_at DESC)
      WHERE outcome IS NOT NULL;

    CREATE TABLE IF NOT EXISTS practice_runtime (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function syncSubscriptions(pool, firstDelayMinutes) {
  const inserted = await pool.query(
    `WITH active_alignment AS (
       SELECT user_record.telegram_id AS user_id, user_record.clone_alignment_chart_id AS chart_id
       FROM users AS user_record
       JOIN charts AS chart
         ON chart.id = user_record.clone_alignment_chart_id
        AND chart.user_id = user_record.telegram_id
       WHERE user_record.clone_alignment_until > NOW()
         AND user_record.clone_alignment_chart_id IS NOT NULL
     )
     INSERT INTO practice_subscriptions (user_id, chart_id, program, enabled, next_delivery_at)
     SELECT user_id, chart_id, 'clone_alignment', TRUE, NOW() + ($1::text || ' minutes')::interval
     FROM active_alignment
     ON CONFLICT (user_id) DO UPDATE SET
       last_card_id = CASE
         WHEN practice_subscriptions.chart_id IS DISTINCT FROM EXCLUDED.chart_id THEN NULL
         ELSE practice_subscriptions.last_card_id
       END,
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
          AND user_record.clone_alignment_chart_id = subscription.chart_id
      )
  `);

  return inserted.rows.filter((row) => !row.welcome_sent_at && row.enabled);
}

async function loadAlignmentStatus(pool, userId) {
  const result = await pool.query(
    `SELECT clone_alignment_until, clone_alignment_chart_id,
            clone_alignment_until > NOW() AS active
     FROM users WHERE telegram_id = $1 LIMIT 1`,
    [String(userId)],
  );
  return result.rows[0] || { active: false, clone_alignment_until: null, clone_alignment_chart_id: null };
}

async function sendWelcome(pool, token, subscription) {
  const status = await loadAlignmentStatus(pool, subscription.user_id);
  if (!status.active) return;
  const until = new Date(status.clone_alignment_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const text = [
    '✦ <b>Практика по вашей карте началась.</b>',
    `До ${escapeTelegramHtml(until)} AstroHero будет присылать один небольшой эксперимент в день.`,
    'После каждого эксперимента вы сможете одним нажатием отметить результат. Через каждые семь проверок бот соберёт выжимку: что действительно даёт вам ясность и следующий шаг, а что пока не работает.',
    'Сообщения можно отключить кнопкой ниже или командой /stop. Оплата не продлевается автоматически.',
  ].join('\n\n');

  try {
    await telegramRequest(token, 'sendMessage', {
      chat_id: subscription.user_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: controlKeyboard(subscription, true),
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
    console.error('HeroStar practice welcome failed:', error.message);
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

async function claimDueReminders(pool, limit = 20) {
  const result = await pool.query(
    `WITH due AS (
       SELECT delivery.user_id, delivery.delivery_number
       FROM practice_deliveries AS delivery
       JOIN practice_subscriptions AS subscription ON subscription.user_id = delivery.user_id
       JOIN users AS user_record ON user_record.telegram_id = delivery.user_id
       WHERE delivery.reminder_at <= NOW()
         AND delivery.reminder_sent_at IS NULL
         AND delivery.outcome IS NULL
         AND subscription.enabled = TRUE
         AND subscription.chart_id = delivery.chart_id
         AND user_record.clone_alignment_until > NOW()
       ORDER BY delivery.reminder_at ASC
       LIMIT $1
       FOR UPDATE OF delivery SKIP LOCKED
     )
     UPDATE practice_deliveries AS delivery
     SET reminder_sent_at = NOW()
     FROM due
     WHERE delivery.user_id = due.user_id
       AND delivery.delivery_number = due.delivery_number
     RETURNING delivery.*`,
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
       AND user_record.clone_alignment_chart_id = chart.id
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
    if (!card) throw new Error('В карте пока нет доступных настроек для практики.');

    const data = practiceCardData(card);
    const deliveryNumber = Number(subscription.delivery_count || 0) + 1;
    const prepared = await pool.query(
      `INSERT INTO practice_deliveries (
         user_id, chart_id, delivery_number, card_id, card_title, card_key, card_action, delivered_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, delivery_number) DO UPDATE SET
         chart_id = EXCLUDED.chart_id,
         card_id = EXCLUDED.card_id,
         card_title = EXCLUDED.card_title,
         card_key = EXCLUDED.card_key,
         card_action = EXCLUDED.card_action
       RETURNING *`,
      [
        subscription.user_id,
        subscription.chart_id,
        deliveryNumber,
        data.id,
        data.title,
        data.key || null,
        data.action,
      ],
    );

    if (!prepared.rows[0]?.message_sent_at) {
      await telegramRequest(token, 'sendMessage', {
        chat_id: subscription.user_id,
        text: buildPracticeMessage(card, subscription.delivery_count),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildPracticeKeyboard(subscription, deliveryNumber),
      });
      await pool.query(
        `UPDATE practice_deliveries
         SET message_sent_at = NOW(), delivered_at = NOW()
         WHERE user_id = $1 AND delivery_number = $2`,
        [subscription.user_id, deliveryNumber],
      );
    }

    await pool.query(
      `UPDATE practice_subscriptions
       SET locked_until = NULL,
           next_delivery_at = NOW() + ($2::text || ' hours')::interval,
           last_card_id = $3,
           delivery_count = $4,
           last_error = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [subscription.user_id, String(options.cadenceHours), data.id, deliveryNumber],
    );
  } catch (error) {
    const blocked = Number(error.status) === 403 || Number(error.errorCode) === 403;
    await releaseWithRetry(pool, subscription, error, blocked);
    console.error('HeroStar practice notification failed:', error.message);
  }
}

async function deliverReminder(pool, token, delivery) {
  try {
    await telegramRequest(token, 'sendMessage', {
      chat_id: delivery.user_id,
      text: buildReminderMessage(delivery),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildPracticeKeyboard({ chart_id: delivery.chart_id }, delivery.delivery_number, { allowReminder: false }),
    });
    await pool.query(
      `UPDATE practice_deliveries
       SET reminder_at = NULL
       WHERE user_id = $1 AND delivery_number = $2`,
      [delivery.user_id, delivery.delivery_number],
    );
  } catch (error) {
    const blocked = Number(error.status) === 403 || Number(error.errorCode) === 403;
    await pool.query(
      `UPDATE practice_deliveries
       SET reminder_sent_at = NULL,
           reminder_at = CASE WHEN $3 THEN NULL ELSE NOW() + INTERVAL '1 hour' END
       WHERE user_id = $1 AND delivery_number = $2`,
      [delivery.user_id, delivery.delivery_number, blocked],
    );
    if (blocked) {
      await pool.query(
        `UPDATE practice_subscriptions
         SET enabled = FALSE, last_error = $2, updated_at = NOW()
         WHERE user_id = $1`,
        [delivery.user_id, `blocked:${compactText(error.message)}`.slice(0, 500)],
      );
    }
    console.error('HeroStar practice reminder failed:', error.message);
  }
}

async function runDeliveryCycle(pool, token, options) {
  const inserted = await syncSubscriptions(pool, options.firstDelayMinutes);
  for (const subscription of inserted) await sendWelcome(pool, token, subscription);
  const reminders = await claimDueReminders(pool, options.batchSize);
  for (const delivery of reminders) await deliverReminder(pool, token, delivery);
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

async function setSubscriptionEnabled(pool, userId, enabled) {
  const status = await loadAlignmentStatus(pool, userId);
  if (!status.active) return { subscription: null, active: false, until: status.clone_alignment_until };
  const chartId = status.clone_alignment_chart_id;
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
        ? `Практика по карте сейчас не активна. Открыть её можно в HeroStar: ${baseUrl}/clone/`
        : 'Практика по карте сейчас не активна. Открыть её можно на странице Звёздного клона.',
    });
    return;
  }
  const text = enabled
    ? '✦ Уведомления снова включены. Следующая практика придёт по вашей карте.'
    : 'Уведомления отключены. Карта, история и уже сохранённые результаты останутся на месте. Вернуть сообщения можно командой /start.';
  await telegramRequest(token, 'sendMessage', {
    chat_id: String(userId),
    text,
    reply_markup: result.subscription ? controlKeyboard(result.subscription, enabled) : undefined,
  });
}

async function answerCallback(token, callbackId, text) {
  await telegramRequest(token, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text,
  }).catch(() => {});
}

async function loadDelivery(pool, userId, deliveryNumber) {
  const result = await pool.query(
    `SELECT * FROM practice_deliveries
     WHERE user_id = $1 AND delivery_number = $2
     LIMIT 1`,
    [String(userId), Number(deliveryNumber)],
  );
  return result.rows[0] || null;
}

async function scheduleReminder(pool, userId, deliveryNumber, reminderHours) {
  const result = await pool.query(
    `UPDATE practice_deliveries
     SET reminder_at = NOW() + ($3::text || ' hours')::interval,
         reminder_sent_at = NULL
     WHERE user_id = $1
       AND delivery_number = $2
       AND outcome IS NULL
       AND reminder_sent_at IS NULL
     RETURNING *`,
    [String(userId), Number(deliveryNumber), String(reminderHours)],
  );
  return result.rows[0] || null;
}

async function recordPracticeOutcome(pool, userId, deliveryNumber, outcome) {
  const result = await pool.query(
    `WITH target AS (
       SELECT user_id, delivery_number, outcome AS previous_outcome
       FROM practice_deliveries
       WHERE user_id = $1 AND delivery_number = $2
       FOR UPDATE
     ), updated AS (
       UPDATE practice_deliveries AS delivery
       SET outcome = $3,
           outcome_at = NOW(),
           reminder_at = NULL
       FROM target
       WHERE delivery.user_id = target.user_id
         AND delivery.delivery_number = target.delivery_number
       RETURNING delivery.*
     )
     SELECT updated.*, target.previous_outcome IS NULL AS first_result
     FROM updated
     JOIN target USING (user_id, delivery_number)`,
    [String(userId), Number(deliveryNumber), outcome],
  );
  return result.rows[0] || null;
}

function outcomeConfirmation(outcome) {
  if (outcome === 'clear') return '✓ Зафиксировано: стало яснее.';
  if (outcome === 'step') return '✓ Зафиксировано: появился следующий шаг.';
  if (outcome === 'none') return '✓ Зафиксировано: заметного изменения не произошло. Это тоже полезный результат.';
  return '✓ Зафиксировано: сейчас не подходит. Не будем выдавать теорию за вашу реальную опору.';
}

async function maybeSendWeeklySummary(pool, token, delivery) {
  if (!delivery?.first_result) return;
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM practice_deliveries
     WHERE user_id = $1 AND chart_id = $2 AND outcome IS NOT NULL`,
    [delivery.user_id, delivery.chart_id],
  );
  const count = Number(countResult.rows[0]?.count || 0);
  if (!count || count % WEEKLY_RESULT_SIZE !== 0) return;

  const recent = await pool.query(
    `SELECT card_title, card_key, outcome
     FROM practice_deliveries
     WHERE user_id = $1 AND chart_id = $2 AND outcome IS NOT NULL
     ORDER BY outcome_at DESC
     LIMIT $3`,
    [delivery.user_id, delivery.chart_id, WEEKLY_RESULT_SIZE],
  );
  const text = buildWeeklySummary(recent.rows);
  if (!text) return;
  await telegramRequest(token, 'sendMessage', {
    chat_id: delivery.user_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: controlKeyboard(delivery, true),
  });
}

async function saveOutcomeAndRespond(pool, token, callback, deliveryNumber, outcome) {
  const delivery = await recordPracticeOutcome(pool, callback.from.id, deliveryNumber, outcome);
  if (!delivery) {
    await answerCallback(token, callback.id, 'Эта практика уже недоступна');
    return;
  }
  await answerCallback(token, callback.id, 'Результат сохранён');
  await telegramRequest(token, 'sendMessage', {
    chat_id: String(callback.from.id),
    text: outcomeConfirmation(outcome),
  }).catch(() => {});
  await maybeSendWeeklySummary(pool, token, delivery).catch((error) => {
    console.error('HeroStar weekly practice summary failed:', error.message);
  });
}

async function handlePracticeCallback(pool, token, callback, reminderHours) {
  const data = compactText(callback.data);
  const userId = callback.from?.id;
  if (!userId) return false;

  const simpleMatch = data.match(/^alignment:(done|remind|notfit):(\d+)$/);
  if (simpleMatch) {
    const action = simpleMatch[1];
    const deliveryNumber = Number(simpleMatch[2]);
    if (action === 'notfit') {
      await saveOutcomeAndRespond(pool, token, callback, deliveryNumber, 'not_fit');
      return true;
    }

    const delivery = await loadDelivery(pool, userId, deliveryNumber);
    if (!delivery) {
      await answerCallback(token, callback.id, 'Эта практика уже недоступна');
      return true;
    }
    if (delivery.outcome) {
      await answerCallback(token, callback.id, 'Результат уже сохранён');
      return true;
    }

    if (action === 'remind') {
      const scheduled = await scheduleReminder(pool, userId, deliveryNumber, reminderHours);
      await answerCallback(token, callback.id, scheduled ? 'Напомню через несколько часов' : 'Напоминание уже было или результат сохранён');
      return true;
    }

    await answerCallback(token, callback.id, 'Осталось отметить результат');
    await telegramRequest(token, 'sendMessage', {
      chat_id: String(userId),
      text: '✦ <b>Что изменилось после практики?</b>\n\nВыберите самый близкий результат. Здесь нет правильного ответа.',
      parse_mode: 'HTML',
      reply_markup: buildOutcomeKeyboard(deliveryNumber),
    });
    return true;
  }

  const outcomeMatch = data.match(/^alignment:outcome:(\d+):(clear|step|none)$/);
  if (outcomeMatch) {
    await saveOutcomeAndRespond(pool, token, callback, Number(outcomeMatch[1]), outcomeMatch[2]);
    return true;
  }

  return false;
}

async function handleTelegramUpdate(pool, token, update, reminderHours) {
  const callback = update.callback_query;
  if (callback) {
    if (await handlePracticeCallback(pool, token, callback, reminderHours)) return;
    const userId = callback.from?.id;
    const enabled = callback.data === 'alignment:enable';
    if (userId && (enabled || callback.data === 'alignment:disable')) {
      const result = await setSubscriptionEnabled(pool, userId, enabled);
      await answerCallback(token, callback.id, enabled ? 'Сообщения включены' : 'Уведомления отключены');
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
    const results = await pool.query(
      'SELECT COUNT(*)::int AS count FROM practice_deliveries WHERE user_id = $1 AND outcome IS NOT NULL',
      [String(userId)],
    );
    const until = status.clone_alignment_until
      ? new Date(status.clone_alignment_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      : null;
    await telegramRequest(token, 'sendMessage', {
      chat_id: String(userId),
      text: status.active
        ? `Практика активна до ${until}. Уведомления ${current?.enabled ? 'включены' : 'отключены'}. Сохранено результатов: ${Number(results.rows[0]?.count || 0)}. Автопродления нет.`
        : 'Практика по карте сейчас не активна.',
      reply_markup: current ? controlKeyboard(current, Boolean(current.enabled)) : undefined,
    });
  }
}

async function pollTelegramUpdates(pool, token, signal, options) {
  let offset = Number(await getRuntimeValue(pool, 'telegram_update_offset')) || 0;
  while (!signal.aborted) {
    try {
      const updates = await telegramRequest(token, 'getUpdates', {
        offset,
        timeout: TELEGRAM_POLL_TIMEOUT_SECONDS,
        allowed_updates: ['message', 'callback_query'],
      }, (TELEGRAM_POLL_TIMEOUT_SECONDS + 10) * 1000);

      await handleTelegramLinkUpdates(updates || [], { fetchImpl: globalThis.fetch }).catch((error) => {
        console.error('HeroStar Telegram login update dispatch failed:', error.message);
      });
      for (const update of updates || []) {
        try {
          await handleTelegramUpdate(pool, token, update, options.reminderHours);
        } catch (error) {
          console.error(`HeroStar Telegram update ${update.update_id} failed:`, error.message);
        } finally {
          offset = Math.max(offset, Number(update.update_id) + 1);
        }
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
      console.warn('Telegram-практика не запущена: нужен DATABASE_URL и TELEGRAM_BOT_TOKEN.');
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
      reminderHours: boundedNumber(process.env.PRACTICE_REMINDER_HOURS, DEFAULT_REMINDER_HOURS, 1, 24),
    };

    let cycleRunning = false;
    const cycle = async () => {
      if (cycleRunning) return;
      cycleRunning = true;
      try {
        await runDeliveryCycle(pool, token, options);
      } catch (error) {
        console.error('HeroStar practice cycle failed:', error);
      } finally {
        cycleRunning = false;
      }
    };

    await cycle();
    const interval = setInterval(cycle, options.cycleIntervalMs);
    interval.unref?.();
    const controller = new AbortController();
    void pollTelegramUpdates(pool, token, controller.signal, options);

    console.log(`HeroStar practice notifications started: every ${options.cadenceHours}h.`);
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
