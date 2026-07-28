import pg from 'pg';

let analyticsPool = null;

function pool() {
  if (!process.env.DATABASE_URL) return null;
  if (!analyticsPool) {
    analyticsPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 2,
      idleTimeoutMillis: 10_000,
    });
  }
  return analyticsPool;
}

const STAGE_KEYS = [
  'visits',
  'intentCaptured',
  'birthSubmitted',
  'cloneCreated',
  'firstAnswer',
  'secondQuestion',
  'secondAnswer',
  'thirdAnswer',
  'telegramOpened',
  'telegramConnected',
  'premiumInterest',
  'paymentStarted',
  'paymentSucceeded',
];

function emptyStages() {
  return Object.fromEntries(STAGE_KEYS.map((key) => [key, 0]));
}

function percent(part, whole) {
  if (!whole) return null;
  return Math.round((Number(part || 0) / Number(whole)) * 10_000) / 100;
}

function withRates(stages, errors = {}) {
  return {
    stages,
    rates: {
      intentFromVisit: percent(stages.intentCaptured, stages.visits),
      cloneFromIntent: percent(stages.cloneCreated, stages.intentCaptured),
      firstAnswerFromClone: percent(stages.firstAnswer, stages.cloneCreated),
      secondAnswerFromFirst: percent(stages.secondAnswer, stages.firstAnswer),
      telegramFromThirdAnswer: percent(stages.telegramConnected, stages.thirdAnswer),
      paymentStartFromPremiumInterest: percent(stages.paymentStarted, stages.premiumInterest),
      paymentFromStart: percent(stages.paymentSucceeded, stages.paymentStarted),
    },
    errors,
  };
}

async function readWindow(hours) {
  const db = pool();
  if (!db) return withRates(emptyStages(), {});

  const result = await db.query(
    `WITH base AS (
       SELECT
         COALESCE(
           NULLIF(visitor_id, ''),
           CASE WHEN user_id IS NOT NULL THEN 'user:' || user_id END,
           CASE WHEN chart_id IS NOT NULL THEN 'chart:' || chart_id::text END,
           'event:' || id::text
         ) AS actor,
         event_type,
         COALESCE(metadata->>'action', '') AS action,
         metadata
       FROM analytics_events
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
         AND (
           metadata->>'product' = 'clone'
           OR COALESCE(metadata->>'action', '') LIKE 'clone_%'
           OR COALESCE(metadata->>'action', '') = 'premium_entry_click'
         )
     ), actors AS (
       SELECT
         actor,
         BOOL_OR(action = 'clone_page_view') AS visits,
         BOOL_OR(action = 'clone_intent_captured') AS intent_captured,
         BOOL_OR(action = 'clone_birth_submitted') AS birth_submitted,
         BOOL_OR(action = 'clone_created') AS clone_created,
         BOOL_OR(action = 'clone_answered' AND metadata->>'questionNumber' = '1') AS first_answer,
         BOOL_OR(action = 'clone_second_question_sent') AS second_question,
         BOOL_OR(action = 'clone_second_answered') AS second_answer,
         BOOL_OR(action = 'clone_answered' AND metadata->>'questionNumber' = '3') AS third_answer,
         BOOL_OR(action = 'clone_auth_opened') AS telegram_opened,
         BOOL_OR(action = 'clone_login_succeeded') AS telegram_connected,
         BOOL_OR(action IN ('premium_entry_click', 'clone_paywall_opened')) AS premium_interest,
         BOOL_OR(action = 'clone_payment_started') AS payment_started,
         BOOL_OR(action = 'clone_payment_succeeded' OR event_type = 'payment_succeeded') AS payment_succeeded
       FROM base
       GROUP BY actor
     ), errors AS (
       SELECT COALESCE(NULLIF(metadata->>'category', ''), 'other') AS category, COUNT(*)::int AS total
       FROM base
       WHERE action = 'clone_error_shown'
       GROUP BY COALESCE(NULLIF(metadata->>'category', ''), 'other')
     )
     SELECT
       (SELECT COUNT(*)::int FROM actors WHERE visits) AS visits,
       (SELECT COUNT(*)::int FROM actors WHERE intent_captured) AS intent_captured,
       (SELECT COUNT(*)::int FROM actors WHERE birth_submitted) AS birth_submitted,
       (SELECT COUNT(*)::int FROM actors WHERE clone_created) AS clone_created,
       (SELECT COUNT(*)::int FROM actors WHERE first_answer) AS first_answer,
       (SELECT COUNT(*)::int FROM actors WHERE second_question) AS second_question,
       (SELECT COUNT(*)::int FROM actors WHERE second_answer) AS second_answer,
       (SELECT COUNT(*)::int FROM actors WHERE third_answer) AS third_answer,
       (SELECT COUNT(*)::int FROM actors WHERE telegram_opened) AS telegram_opened,
       (SELECT COUNT(*)::int FROM actors WHERE telegram_connected) AS telegram_connected,
       (SELECT COUNT(*)::int FROM actors WHERE premium_interest) AS premium_interest,
       (SELECT COUNT(*)::int FROM actors WHERE payment_started) AS payment_started,
       (SELECT COUNT(*)::int FROM actors WHERE payment_succeeded) AS payment_succeeded,
       COALESCE((SELECT JSONB_OBJECT_AGG(category, total) FROM errors), '{}'::jsonb) AS errors`,
    [hours],
  );

  const row = result.rows[0] || {};
  const stages = {
    visits: Number(row.visits || 0),
    intentCaptured: Number(row.intent_captured || 0),
    birthSubmitted: Number(row.birth_submitted || 0),
    cloneCreated: Number(row.clone_created || 0),
    firstAnswer: Number(row.first_answer || 0),
    secondQuestion: Number(row.second_question || 0),
    secondAnswer: Number(row.second_answer || 0),
    thirdAnswer: Number(row.third_answer || 0),
    telegramOpened: Number(row.telegram_opened || 0),
    telegramConnected: Number(row.telegram_connected || 0),
    premiumInterest: Number(row.premium_interest || 0),
    paymentStarted: Number(row.payment_started || 0),
    paymentSucceeded: Number(row.payment_succeeded || 0),
  };
  return withRates(stages, row.errors || {});
}

async function readCampaigns() {
  const db = pool();
  if (!db) return [];

  const result = await db.query(
    `WITH base AS (
       SELECT
         COALESCE(
           NULLIF(visitor_id, ''),
           CASE WHEN user_id IS NOT NULL THEN 'user:' || user_id END,
           CASE WHEN chart_id IS NOT NULL THEN 'chart:' || chart_id::text END,
           'event:' || id::text
         ) AS actor,
         COALESCE(NULLIF(metadata->>'utm_source', ''), 'direct') AS source,
         COALESCE(NULLIF(metadata->>'utm_medium', ''), 'none') AS medium,
         COALESCE(NULLIF(metadata->>'utm_campaign', ''), 'none') AS campaign,
         COALESCE(NULLIF(metadata->>'utm_content', ''), 'none') AS content,
         COALESCE(metadata->>'action', '') AS action,
         event_type,
         metadata
       FROM analytics_events
       WHERE created_at >= NOW() - INTERVAL '7 days'
         AND (
           metadata->>'product' = 'clone'
           OR COALESCE(metadata->>'action', '') LIKE 'clone_%'
           OR COALESCE(metadata->>'action', '') = 'premium_entry_click'
         )
     ), actors AS (
       SELECT
         actor, source, medium, campaign, content,
         BOOL_OR(action = 'clone_page_view') AS visits,
         BOOL_OR(action = 'clone_created') AS clone_created,
         BOOL_OR(action = 'clone_answered' AND metadata->>'questionNumber' = '1') AS first_answer,
         BOOL_OR(action = 'clone_second_answered') AS second_answer,
         BOOL_OR(action = 'clone_login_succeeded') AS telegram_connected,
         BOOL_OR(action = 'clone_payment_succeeded' OR event_type = 'payment_succeeded') AS payment_succeeded
       FROM base
       GROUP BY actor, source, medium, campaign, content
     )
     SELECT
       source, medium, campaign, content,
       COUNT(*) FILTER (WHERE visits)::int AS visitors,
       COUNT(*) FILTER (WHERE clone_created)::int AS clone_created,
       COUNT(*) FILTER (WHERE first_answer)::int AS first_answer,
       COUNT(*) FILTER (WHERE second_answer)::int AS second_answer,
       COUNT(*) FILTER (WHERE telegram_connected)::int AS telegram_connected,
       COUNT(*) FILTER (WHERE payment_succeeded)::int AS payment_succeeded
     FROM actors
     GROUP BY source, medium, campaign, content
     HAVING COUNT(*) FILTER (WHERE visits) > 0
     ORDER BY visitors DESC, second_answer DESC
     LIMIT 20`,
  );

  return result.rows.map((row) => ({
    source: row.source,
    medium: row.medium,
    campaign: row.campaign,
    content: row.content,
    visitors: Number(row.visitors || 0),
    cloneCreated: Number(row.clone_created || 0),
    firstAnswer: Number(row.first_answer || 0),
    secondAnswer: Number(row.second_answer || 0),
    telegramConnected: Number(row.telegram_connected || 0),
    paymentSucceeded: Number(row.payment_succeeded || 0),
  }));
}

export async function publicCloneFunnelHandler(_req, res) {
  try {
    const [last24h, last7d, campaigns7d] = await Promise.all([
      readWindow(24),
      readWindow(24 * 7),
      readCampaigns(),
    ]);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      product: 'clone',
      privacy: 'aggregate_only_no_personal_data_no_message_texts',
      updatedAt: new Date().toISOString(),
      windows: { last24h, last7d },
      campaigns7d,
    });
  } catch (error) {
    console.error('Public clone funnel failed:', error);
    res.status(503).json({
      error: 'Агрегированная воронка временно недоступна.',
      code: 'PUBLIC_FUNNEL_UNAVAILABLE',
    });
  }
}
