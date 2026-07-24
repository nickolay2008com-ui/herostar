import crypto from 'node:crypto';
import pg from 'pg';

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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS clone_question_reservations_chart_idx
        ON clone_question_reservations(chart_id, status, created_at);
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

  const [reservationResult, legacyResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM clone_question_reservations
       WHERE chart_id = $1
         AND (status = 'completed' OR created_at >= NOW() - INTERVAL '15 minutes')`,
      [chartId],
    ),
    db.query(legacyCloneQuestionSql(), [chartId]),
  ]);
  const used = Number(reservationResult.rows[0]?.total || 0) + Number(legacyResult.rows[0]?.total || 0);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function reserveCloneQuestion({ chartId, userId, limit = 3 }) {
  const db = await database();
  const id = crypto.randomUUID();

  if (!db) {
    const active = activeMemoryReservations(chartId);
    if (active.length >= limit) {
      return { allowed: false, reservationId: null, used: active.length, limit, remaining: 0 };
    }
    active.push({ id, chartId, userId: userId ? String(userId) : null, status: 'reserved', createdAt: nowIso() });
    memoryReservations.set(chartId, active);
    return { allowed: true, reservationId: id, used: active.length, limit, remaining: Math.max(0, limit - active.length) };
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

    const reservationResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM clone_question_reservations
       WHERE chart_id = $1 AND status IN ('reserved', 'completed')`,
      [chartId],
    );
    const legacyResult = await client.query(legacyCloneQuestionSql(), [chartId]);
    const used = Number(reservationResult.rows[0]?.total || 0) + Number(legacyResult.rows[0]?.total || 0);

    if (used >= limit) {
      await client.query('ROLLBACK');
      return { allowed: false, reservationId: null, used, limit, remaining: 0 };
    }

    await client.query(
      `INSERT INTO clone_question_reservations (id, chart_id, user_id, status)
       VALUES ($1, $2, $3, 'reserved')`,
      [id, chartId, userId ? String(userId) : null],
    );
    await client.query('COMMIT');
    return { allowed: true, reservationId: id, used: used + 1, limit, remaining: Math.max(0, limit - used - 1) };
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
