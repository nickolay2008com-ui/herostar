import pg from 'pg';

const memory = {
  users: new Map(),
  charts: new Map(),
  payments: new Map(),
};

let pool = null;

export async function initStore() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL не задан: используется временное хранилище в памяти.');
    return;
  }

  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      photo_url TEXT,
      premium_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS charts (
      id UUID PRIMARY KEY,
      user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
      access_token_hash TEXT NOT NULL,
      birth_data JSONB NOT NULL,
      chart_data JSONB NOT NULL,
      portrait_data JSONB NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS charts_user_id_idx ON charts(user_id);
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
      chart_id UUID,
      status TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function premiumActive(user) {
  return Boolean(user?.premium_until && new Date(user.premium_until).getTime() > Date.now());
}

export async function upsertUser(user) {
  const normalized = {
    telegram_id: String(user.telegram_id || user.id),
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    photo_url: user.photo_url || null,
    premium_until: user.premium_until || null,
  };

  if (!pool) {
    const existing = memory.users.get(normalized.telegram_id) || {};
    const saved = { ...existing, ...normalized, updated_at: new Date().toISOString() };
    memory.users.set(normalized.telegram_id, saved);
    return { ...saved, premium: premiumActive(saved) };
  }

  const result = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       photo_url = EXCLUDED.photo_url,
       updated_at = NOW()
     RETURNING *`,
    [normalized.telegram_id, normalized.username, normalized.first_name, normalized.last_name, normalized.photo_url],
  );
  return { ...result.rows[0], premium: premiumActive(result.rows[0]) };
}

export async function getUser(telegramId) {
  if (!telegramId) return null;
  if (!pool) {
    const user = memory.users.get(String(telegramId)) || null;
    return user ? { ...user, premium: premiumActive(user) } : null;
  }
  const result = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return result.rows[0] ? { ...result.rows[0], premium: premiumActive(result.rows[0]) } : null;
}

export async function grantPremium(telegramId, days = 3650) {
  const premiumUntil = new Date(Date.now() + days * 86400000).toISOString();
  if (!pool) {
    const user = memory.users.get(String(telegramId)) || { telegram_id: String(telegramId) };
    user.premium_until = premiumUntil;
    memory.users.set(String(telegramId), user);
    return { ...user, premium: true };
  }
  const result = await pool.query(
    `UPDATE users SET premium_until = GREATEST(COALESCE(premium_until, NOW()), NOW()) + ($2 || ' days')::interval, updated_at = NOW()
     WHERE telegram_id = $1 RETURNING *`,
    [String(telegramId), String(days)],
  );
  return result.rows[0] ? { ...result.rows[0], premium: true } : null;
}

export async function saveChart(record) {
  if (!pool) {
    memory.charts.set(record.id, { ...record, created_at: new Date().toISOString() });
    return record;
  }
  await pool.query(
    `INSERT INTO charts (id, user_id, access_token_hash, birth_data, chart_data, portrait_data, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [record.id, record.userId || null, record.accessTokenHash, record.birthData, record.chartData, record.portraitData, record.source],
  );
  return record;
}

export async function getChart(id) {
  if (!id) return null;
  if (!pool) return memory.charts.get(id) || null;
  const result = await pool.query('SELECT * FROM charts WHERE id = $1', [id]);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    accessTokenHash: row.access_token_hash,
    birthData: row.birth_data,
    chartData: row.chart_data,
    portraitData: row.portrait_data,
    source: row.source,
    createdAt: row.created_at,
  };
}

export async function claimChart(id, userId) {
  if (!pool) {
    const chart = memory.charts.get(id);
    if (!chart) return null;
    chart.userId = String(userId);
    memory.charts.set(id, chart);
    return chart;
  }
  const result = await pool.query(
    'UPDATE charts SET user_id = $2 WHERE id = $1 AND (user_id IS NULL OR user_id = $2) RETURNING *',
    [id, String(userId)],
  );
  return result.rows[0] || null;
}

export async function savePayment(record) {
  if (!pool) {
    memory.payments.set(record.id, { ...record, updatedAt: new Date().toISOString() });
    return record;
  }
  await pool.query(
    `INSERT INTO payments (id, user_id, chart_id, status, amount, payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = NOW()`,
    [record.id, record.userId || null, record.chartId || null, record.status, record.amount, record.payload || null],
  );
  return record;
}

export async function updatePayment(id, status, payload) {
  if (!pool) {
    const payment = memory.payments.get(id) || { id };
    Object.assign(payment, { status, payload, updatedAt: new Date().toISOString() });
    memory.payments.set(id, payment);
    return payment;
  }
  const result = await pool.query(
    'UPDATE payments SET status = $2, payload = $3, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, status, payload || null],
  );
  return result.rows[0] || null;
}
