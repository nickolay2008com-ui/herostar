import crypto from 'node:crypto';
import pg from 'pg';

const LIVE_TRIAL_MS = 24 * 60 * 60 * 1000;
const LIVE_MIN_ANSWERS = 3;
const memoryReservations = new Map();
const memoryCloneCharts = new Set();
let pool = null;
let initPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function activeMemoryReservations(chartId) {
  const staleBefore = Date.now() - 15 * 60 * 1000;
  const items = memoryReservations.get(chartId) || [];
  const active = items.filter((item) => item.status === 'completed' || new Date(item.createdAt).getTime() >= staleBefore);
  memoryReservations.set(chartId, active);
  return active;
}

async function database() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 2,
    });
  }
  if (!initPromise) {
    initPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS clone_charts (
        chart_id UUID PRIMARY KEY REFERENCES charts(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS clone_question_reservations (
        id UUID PRIMARY KEY,
        chart_id UUID NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'completed')),
        experience TEXT NOT NULL DEFAULT 'standard',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      ALTER TABLE clone_question_reservations
        ADD COLUMN IF NOT EXISTS experience TEXT NOT NULL DEFAULT 'standard';
      CREATE INDEX IF NOT EXISTS clone_question_reservations_chart_idx
        ON clone_question_reservations(chart_id, status, created_at);
      CREATE INDEX IF NOT EXISTS clone_question_reservations_experience_idx
        ON clone_question_reservations(chart_id, experience, status, completed_at);
    `);
  }
  await initPromise;
  return pool;
}

function legacyCloneQuestionSql() {
  return `
    SELECT COUNT(*)::int AS total
    FROM consultation_messages
    WHERE chart_id = $1
      AND role = 'user'
      AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'cloneReservationId')
      AND NOT (COALESCE(metadata, '{}'::jsonb) @> '{"quotaExempt":true}'::jsonb)
      AND NOT (content ILIKE '%[[clone-reservation:%')
      AND (
        COALESCE(metadata->>'product', '') = 'clone'
        OR (content ILIKE '%Звёздный клон%' AND content ILIKE '%Ситуация:%')
      )
  `;
}

async function liveExperienceForChart(client, chartId) {
  const result = await client.query(
    `SELECT 1
     FROM analytics_events
     WHERE chart_id = $1
       AND (
         COALESCE(metadata->>'product', '') = 'clone_live'
         OR COALESCE(metadata->>'action', '') LIKE 'clone_live_%'
       )
     LIMIT 1`,
    [chartId],
  );
  return Boolean(result.rows[0]);
}

function liveTrialState({ completed, firstCompletedAt, now = new Date() }) {
  const first = firstCompletedAt ? new Date(firstCompletedAt) : null;
  const expiresAt = first ? new Date(first.getTime() + LIVE_TRIAL_MS) : null;
  const timeOpen = !expiresAt || expiresAt.getTime() > now.getTime();
  const minimumOpen = completed < LIVE_MIN_ANSWERS;
  return {
    allowed: timeOpen || minimumOpen,
    completed,
    minimum: LIVE_MIN_ANSWERS,
    expiresAt: expiresAt?.toISOString() || null,
    timeOpen,
    minimumOpen,
  };
}

export async function registerCloneChart(chartId) {
  if (!chartId) return;
  const db = await database();
  if (!db) {
    memoryCloneCharts.add(String(chartId));
    return;
  }
  await db.query(
    `INSERT INTO clone_charts (chart_id) VALUES ($1)
     ON CONFLICT (chart_id) DO NOTHING`,
    [chartId],
  );
}

export async function isCloneChart(chartId) {
  if (!chartId) return false;
  const db = await database();
  if (!db) return memoryCloneCharts.has(String(chartId));
  const result = await db.query('SELECT 1 FROM clone_charts WHERE chart_id = $1', [chartId]);
  return Boolean(result.rows[0]);
}

export async function getCloneQuestionUsage(chartId, limit = 3) {
  const db = await database();
  if (!db) {
    const used = activeMemoryReservations(chartId).length;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  const client = await db.connect();
  try {
    const live = await liveExperienceForChart(client, chartId);
    if (live) {
      const result = await client.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                MIN(completed_at) FILTER (WHERE status = 'completed') AS first_completed_at
         FROM clone_question_reservations
         WHERE chart_id = $1 AND experience = 'live'`,
        [chartId],
      );
      const completed = Number(result.rows[0]?.completed || 0);
      const trial = liveTrialState({ completed, firstCompletedAt: result.rows[0]?.first_completed_at });
      return {
        used: completed,
        limit: LIVE_MIN_ANSWERS,
        remaining: Math.max(0, LIVE_MIN_ANSWERS - completed),
        mode: 'live',
        trialExpiresAt: trial.expiresAt,
        trialOpen: trial.allowed,
      };
    }

    const [reservationResult, legacyResult] = await Promise.all([
      client.query(
        `SELECT COUNT(*)::int AS total
         FROM clone_question_reservations
         WHERE chart_id = $1
           AND experience = 'standard'
           AND (status = 'completed' OR created_at >= NOW() - INTERVAL '15 minutes')`,
        [chartId],
      ),
      client.query(legacyCloneQuestionSql(), [chartId]),
    ]);
    const used = Number(reservationResult.rows[0]?.total || 0) + Number(legacyResult.rows[0]?.total || 0);
    return { used, limit, remaining: Math.max(0, limit - used), mode: 'standard' };
  } finally {
    client.release();
  }
}

export async function reserveCloneQuestion({ chartId, userId, limit = 3 }) {
  const db = await database();
  const id = crypto.randomUUID();

  if (!db) {
    const active = activeMemoryReservations(chartId);
    if (active.length >= limit) {
      return { allowed: false, reservationId: null, used: active.length, limit, remaining: 0, mode: 'standard' };
    }
    active.push({ id, chartId, userId: String(userId), status: 'reserved', experience: 'standard', createdAt: nowIso() });
    memoryReservations.set(chartId, active);
    return { allowed: true, reservationId: id, used: active.length, limit, remaining: Math.max(0, limit - active.length), mode: 'standard' };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const chartResult = await client.query('SELECT id FROM charts WHERE id = $1 FOR UPDATE', [chartId]);
    if (!chartResult.rows[0]) {
      await client.query('ROLLBACK');
      return { allowed: false, reservationId: null, used: 0, limit, remaining: limit, missingChart: true };
    }

    await client.query(
      `DELETE FROM clone_question_reservations
       WHERE chart_id = $1 AND status = 'reserved' AND created_at < NOW() - INTERVAL '15 minutes'`,
      [chartId],
    );

    const live = await liveExperienceForChart(client, chartId);
    if (live) {
      const result = await client.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE status = 'reserved')::int AS active,
                MIN(completed_at) FILTER (WHERE status = 'completed') AS first_completed_at
         FROM clone_question_reservations
         WHERE chart_id = $1 AND experience = 'live'`,
        [chartId],
      );
      const completed = Number(result.rows[0]?.completed || 0);
      const active = Number(result.rows[0]?.active || 0);
      const trial = liveTrialState({ completed, firstCompletedAt: result.rows[0]?.first_completed_at });
      if (!trial.allowed || active >= 1) {
        await client.query('ROLLBACK');
        return {
          allowed: false,
          reservationId: null,
          used: completed,
          limit: LIVE_MIN_ANSWERS,
          remaining: Math.max(0, LIVE_MIN_ANSWERS - completed),
          mode: 'live',
          busy: active >= 1,
          trialExpiresAt: trial.expiresAt,
        };
      }

      await client.query(
        `INSERT INTO clone_question_reservations (id, chart_id, user_id, status, experience)
         VALUES ($1, $2, $3, 'reserved', 'live')`,
        [id, chartId, String(userId)],
      );
      await client.query('COMMIT');
      return {
        allowed: true,
        reservationId: id,
        used: completed + 1,
        limit: LIVE_MIN_ANSWERS,
        remaining: Math.max(0, LIVE_MIN_ANSWERS - completed - 1),
        mode: 'live',
        trialExpiresAt: trial.expiresAt,
      };
    }

    const reservationResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM clone_question_reservations
       WHERE chart_id = $1 AND experience = 'standard' AND status IN ('reserved', 'completed')`,
      [chartId],
    );
    const legacyResult = await client.query(legacyCloneQuestionSql(), [chartId]);
    const used = Number(reservationResult.rows[0]?.total || 0) + Number(legacyResult.rows[0]?.total || 0);

    if (used >= limit) {
      await client.query('ROLLBACK');
      return { allowed: false, reservationId: null, used, limit, remaining: 0, mode: 'standard' };
    }

    await client.query(
      `INSERT INTO clone_question_reservations (id, chart_id, user_id, status, experience)
       VALUES ($1, $2, $3, 'reserved', 'standard')`,
      [id, chartId, String(userId)],
    );
    await client.query('COMMIT');
    return { allowed: true, reservationId: id, used: used + 1, limit, remaining: Math.max(0, limit - used - 1), mode: 'standard' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function completeCloneQuestion(reservationId) {
  if (!reservationId) return;
  const db = await database();
  if (!db) {
    for (const [chartId, items] of memoryReservations.entries()) {
      const item = items.find((entry) => entry.id === reservationId);
      if (item) {
        item.status = 'completed';
        item.completedAt = nowIso();
        memoryReservations.set(chartId, items);
        return;
      }
    }
    return;
  }
  await db.query(
    `UPDATE clone_question_reservations
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1 AND status = 'reserved'`,
    [reservationId],
  );
}

export async function releaseCloneQuestion(reservationId) {
  if (!reservationId) return;
  const db = await database();
  if (!db) {
    for (const [chartId, items] of memoryReservations.entries()) {
      const filtered = items.filter((entry) => entry.id !== reservationId);
      if (filtered.length !== items.length) {
        memoryReservations.set(chartId, filtered);
        return;
      }
    }
    return;
  }
  await db.query(
    `DELETE FROM clone_question_reservations WHERE id = $1 AND status = 'reserved'`,
    [reservationId],
  );
}
