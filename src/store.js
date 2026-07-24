import pg from 'pg';

const memory = {
  users: new Map(),
  charts: new Map(),
  payments: new Map(),
  messages: [],
  events: [],
  consents: [],
  sequence: 1,
};

let pool = null;

function nowIso() {
  return new Date().toISOString();
}

function nextMemoryId() {
  return memory.sequence++;
}

const ANALYTICS_SENSITIVE_KEYS = /^(question|answer|prompt|message|content|text)$/i;

export function sanitizeAnalyticsMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAnalyticsMetadata(item, depth + 1));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ANALYTICS_SENSITIVE_KEYS.test(key))
      .map(([key, item]) => [key, sanitizeAnalyticsMetadata(item, depth + 1)]),
  );
}

export async function initStore() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL не задан: используется временное хранилище в памяти.');
    return null;
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
    CREATE INDEX IF NOT EXISTS charts_created_at_idx ON charts(created_at DESC);

    CREATE TABLE IF NOT EXISTS clone_charts (
      chart_id UUID PRIMARY KEY REFERENCES charts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS personal_data_consents (
      id BIGSERIAL PRIMARY KEY,
      request_id UUID NOT NULL UNIQUE,
      visitor_id TEXT,
      user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
      chart_id UUID REFERENCES charts(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      document_url TEXT NOT NULL,
      source TEXT NOT NULL,
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS personal_data_consents_chart_version_unique
      ON personal_data_consents(chart_id, version)
      WHERE chart_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
      chart_id UUID,
      status TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      return_ref UUID,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
    CREATE INDEX IF NOT EXISTS payments_chart_id_idx ON payments(chart_id);

    CREATE TABLE IF NOT EXISTS consultation_messages (
      id BIGSERIAL PRIMARY KEY,
      chart_id UUID NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS consultation_messages_chart_idx
      ON consultation_messages(chart_id, created_at);

    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      visitor_id TEXT,
      user_id TEXT REFERENCES users(telegram_id) ON DELETE SET NULL,
      chart_id UUID REFERENCES charts(id) ON DELETE CASCADE,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS analytics_events_type_idx
      ON analytics_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS analytics_events_chart_idx
      ON analytics_events(chart_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx
      ON analytics_events(visitor_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS analytics_payment_succeeded_unique
      ON analytics_events ((metadata->>'paymentId'))
      WHERE event_type = 'payment_succeeded' AND metadata ? 'paymentId';

    UPDATE analytics_events
    SET metadata = metadata - 'question' - 'answer' - 'content' - 'text'
    WHERE metadata ?| ARRAY['question', 'answer', 'content', 'text'];
  `);
  return pool;
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
    const saved = { ...existing, ...normalized, updated_at: nowIso(), created_at: existing.created_at || nowIso() };
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

export async function saveChart(record) {
  if (!pool) {
    memory.charts.set(record.id, { ...record, created_at: nowIso() });
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
    for (const consent of memory.consents) {
      if (consent.chartId === id && !consent.userId) consent.userId = String(userId);
    }
    return chart;
  }
  const result = await pool.query(
    'UPDATE charts SET user_id = $2 WHERE id = $1 AND (user_id IS NULL OR user_id = $2) RETURNING *',
    [id, String(userId)],
  );
  if (result.rows[0]) {
    await pool.query(
      'UPDATE personal_data_consents SET user_id = $2 WHERE chart_id = $1 AND user_id IS NULL',
      [id, String(userId)],
    );
  }
  return result.rows[0] || null;
}

export async function savePersonalDataConsent({
  requestId,
  visitorId = null,
  userId = null,
  chartId = null,
  version,
  documentUrl,
  source = 'birth_form',
}) {
  const record = {
    id: nextMemoryId(),
    requestId: String(requestId || ''),
    visitorId: visitorId ? String(visitorId).slice(0, 120) : null,
    userId: userId ? String(userId) : null,
    chartId: chartId || null,
    version: String(version || '').slice(0, 40),
    documentUrl: String(documentUrl || '/consent').slice(0, 240),
    source: String(source || 'birth_form').slice(0, 80),
    acceptedAt: nowIso(),
  };
  if (!record.requestId) throw new Error('Consent request id is required.');
  if (!record.version) throw new Error('Consent version is required.');

  if (!pool) {
    const existing = memory.consents.find((item) => item.requestId === record.requestId);
    if (existing) return existing;
    memory.consents.push(record);
    return record;
  }

  const result = await pool.query(
    `INSERT INTO personal_data_consents (request_id, visitor_id, user_id, chart_id, version, document_url, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (request_id) DO UPDATE SET
       visitor_id = COALESCE(personal_data_consents.visitor_id, EXCLUDED.visitor_id),
       user_id = COALESCE(personal_data_consents.user_id, EXCLUDED.user_id),
       chart_id = COALESCE(personal_data_consents.chart_id, EXCLUDED.chart_id)
     RETURNING id, request_id, visitor_id, user_id, chart_id, version, document_url, source, accepted_at`,
    [record.requestId, record.visitorId, record.userId, record.chartId, record.version, record.documentUrl, record.source],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    requestId: row.request_id,
    visitorId: row.visitor_id,
    userId: row.user_id,
    chartId: row.chart_id,
    version: row.version,
    documentUrl: row.document_url,
    source: row.source,
    acceptedAt: row.accepted_at,
  };
}

export async function linkPersonalDataConsentToChart(requestId, chartId) {
  if (!requestId || !chartId) return null;
  if (!pool) {
    const consent = memory.consents.find((item) => item.requestId === String(requestId));
    if (!consent) return null;
    consent.chartId = chartId;
    return consent;
  }
  const result = await pool.query(
    `UPDATE personal_data_consents
     SET chart_id = COALESCE(chart_id, $2)
     WHERE request_id = $1
     RETURNING id, request_id, visitor_id, user_id, chart_id, version, document_url, source, accepted_at`,
    [String(requestId), chartId],
  );
  return result.rows[0] || null;
}

export async function listUserCloneCharts(userId, limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const normalizedUserId = String(userId || '');
  if (!normalizedUserId) return [];

  if (!pool) {
    return [...memory.charts.values()]
      .filter((chart) => String(chart.userId || '') === normalizedUserId)
      .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0))
      .slice(0, safeLimit)
      .map((chart) => ({
        id: chart.id,
        name: chart.birthData?.name || chart.chartData?.person?.name || 'Звёздный клон',
        place: chart.birthData?.place || null,
        createdAt: chart.created_at || chart.createdAt || null,
      }));
  }

  const result = await pool.query(
    `SELECT chart.id, chart.birth_data, chart.created_at
     FROM charts AS chart
     JOIN clone_charts AS clone ON clone.chart_id = chart.id
     WHERE chart.user_id = $1
     ORDER BY chart.created_at DESC
     LIMIT $2`,
    [normalizedUserId, safeLimit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.birth_data?.name || 'Звёздный клон',
    place: row.birth_data?.place || null,
    createdAt: row.created_at,
  }));
}

export async function getPaymentByIdOrReturnRef({ paymentId = null, returnRef = null } = {}) {
  const id = paymentId ? String(paymentId) : null;
  const ref = returnRef ? String(returnRef) : null;
  if (!id && !ref) return null;

  if (!pool) {
    const payment = ref
      ? [...memory.payments.values()].find((item) => item.returnRef === ref)
      : memory.payments.get(id);
    return payment ? { ...payment } : null;
  }

  const result = ref
    ? await pool.query(
        `SELECT id, user_id, chart_id, status, amount, return_ref, payload,
                offer_code, entitlement_applied_at, credit_source_payment_id, created_at, updated_at
         FROM payments
         WHERE return_ref = $1::uuid
         LIMIT 1`,
        [ref],
      )
    : await pool.query(
        `SELECT id, user_id, chart_id, status, amount, return_ref, payload,
                offer_code, entitlement_applied_at, credit_source_payment_id, created_at, updated_at
         FROM payments
         WHERE id = $1
         LIMIT 1`,
        [id],
      );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    chartId: row.chart_id,
    status: row.status,
    amount: Number(row.amount),
    returnRef: row.return_ref,
    payload: row.payload,
    offerCode: row.offer_code,
    entitlementAppliedAt: row.entitlement_applied_at,
    creditSourcePaymentId: row.credit_source_payment_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function reservePaymentCheckout({
  returnRef,
  userId,
  chartId = null,
  amount,
  offerCode,
  creditSourcePaymentId = null,
}) {
  const checkoutId = `checkout:${returnRef}`;
  const record = {
    id: checkoutId,
    userId: String(userId),
    chartId,
    status: 'checkout_reserved',
    amount: Number(amount),
    returnRef: String(returnRef),
    offerCode,
    creditSourcePaymentId,
    payload: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!pool) {
    const activeCheckout = [...memory.payments.values()].find((item) =>
      item.userId === record.userId
      && String(item.chartId || '') === String(chartId || '')
      && item.offerCode === offerCode
      && ['checkout_reserved', 'pending', 'waiting_for_capture'].includes(item.status));
    if (activeCheckout) {
      const error = new Error('Для этого предложения уже создан незавершённый платёж.');
      error.code = 'PAYMENT_CHECKOUT_ACTIVE';
      throw error;
    }
    if (creditSourcePaymentId && [...memory.payments.values()].some((item) =>
      item.creditSourcePaymentId === creditSourcePaymentId
      && ['checkout_reserved', 'pending', 'waiting_for_capture', 'succeeded'].includes(item.status))) {
      const error = new Error('Стоимость Дня уже зарезервирована для другого платежа.');
      error.code = 'PAYMENT_CREDIT_RESERVED';
      throw error;
    }
    memory.payments.set(checkoutId, record);
    return record;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Один пользователь не должен случайно создать два параллельных платежа
    // за один и тот же продукт и карту из двух вкладок.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [record.userId, `${offerCode}:${chartId || 'none'}`],
    );
    await client.query(
      `UPDATE payments
       SET status = 'checkout_expired', updated_at = NOW()
       WHERE status = 'checkout_reserved'
         AND created_at < NOW() - INTERVAL '20 minutes'`,
    );
    const duplicate = await client.query(
      `SELECT id
       FROM payments
       WHERE user_id = $1
         AND chart_id IS NOT DISTINCT FROM $2::uuid
         AND offer_code = $3
         AND (
           status = 'checkout_reserved'
           OR (status IN ('pending', 'waiting_for_capture') AND created_at >= NOW() - INTERVAL '30 minutes')
           OR (status = 'succeeded' AND entitlement_applied_at IS NULL)
         )
       LIMIT 1`,
      [record.userId, chartId || null, offerCode],
    );
    if (duplicate.rows[0]) {
      const error = new Error('Для этого предложения уже создан незавершённый платёж.');
      error.code = 'PAYMENT_CHECKOUT_ACTIVE';
      throw error;
    }
    await client.query(
      `INSERT INTO payments
         (id, user_id, chart_id, status, amount, return_ref, payload, offer_code, credit_source_payment_id)
       VALUES ($1,$2,$3,'checkout_reserved',$4,$5,NULL,$6,$7)`,
      [checkoutId, record.userId, chartId, record.amount, record.returnRef, offerCode, creditSourcePaymentId],
    );
    await client.query('COMMIT');
    return record;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505' && creditSourcePaymentId) {
      const conflict = new Error('Стоимость Дня уже зарезервирована для другого платежа.');
      conflict.code = 'PAYMENT_CREDIT_RESERVED';
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizePaymentCheckout(returnRef, payment) {
  const checkoutId = `checkout:${returnRef}`;
  if (!pool) {
    const reserved = memory.payments.get(checkoutId);
    if (!reserved) throw new Error('Payment checkout reservation was not found.');
    memory.payments.delete(checkoutId);
    const finalRecord = {
      ...reserved,
      id: payment.id,
      status: payment.status,
      payload: payment,
      updatedAt: nowIso(),
    };
    memory.payments.set(payment.id, finalRecord);
    return finalRecord;
  }

  try {
    const result = await pool.query(
      `UPDATE payments
       SET id = $2,
           status = $3,
           payload = $4,
           updated_at = NOW()
       WHERE return_ref = $1::uuid AND status = 'checkout_reserved'
       RETURNING id, user_id, chart_id, status, amount, return_ref, payload,
                 offer_code, entitlement_applied_at, credit_source_payment_id, created_at, updated_at`,
      [String(returnRef), payment.id, payment.status, payment],
    );
    if (result.rows[0]) return result.rows[0];
  } catch (error) {
    if (error?.code !== '23505') throw error;
  }

  const existing = await getPaymentByIdOrReturnRef({ returnRef: String(returnRef) });
  if (existing?.id === payment.id) return existing;
  throw new Error('Payment checkout reservation was not found.');
}

export async function failPaymentCheckout(returnRef, reason = null) {
  const checkoutId = `checkout:${returnRef}`;
  const payload = reason ? { error: String(reason).slice(0, 500) } : null;
  if (!pool) {
    const reserved = memory.payments.get(checkoutId);
    if (!reserved) return null;
    const failed = { ...reserved, status: 'checkout_failed', payload, updatedAt: nowIso() };
    memory.payments.set(checkoutId, failed);
    return failed;
  }
  const result = await pool.query(
    `UPDATE payments
     SET status = 'checkout_failed', payload = $2, updated_at = NOW()
     WHERE return_ref = $1::uuid AND status = 'checkout_reserved'
     RETURNING id`,
    [String(returnRef), payload],
  );
  return result.rows[0] || null;
}

export async function savePayment(record) {
  if (!pool) {
    memory.payments.set(record.id, { ...record, returnRef: record.returnRef || null, createdAt: nowIso(), updatedAt: nowIso() });
    return record;
  }
  await pool.query(
    `INSERT INTO payments (id, user_id, chart_id, status, amount, return_ref, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       return_ref = COALESCE(payments.return_ref, EXCLUDED.return_ref),
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [record.id, record.userId || null, record.chartId || null, record.status, record.amount, record.returnRef || null, record.payload || null],
  );
  return record;
}

export async function updatePayment(id, status, payload) {
  if (!pool) {
    const payment = memory.payments.get(id) || { id, createdAt: nowIso() };
    Object.assign(payment, { status, payload, updatedAt: nowIso() });
    memory.payments.set(id, payment);
    return payment;
  }
  const result = await pool.query(
    'UPDATE payments SET status = $2, payload = $3, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, status, payload || null],
  );
  return result.rows[0] || null;
}

export async function saveConsultationMessage({ chartId, userId, role, content, metadata = null }) {
  const record = {
    id: nextMemoryId(),
    chartId,
    userId: userId ? String(userId) : null,
    role,
    content: String(content || '').trim(),
    metadata,
    createdAt: nowIso(),
  };
  if (!record.content) return null;

  if (!pool) {
    memory.messages.push(record);
    return record;
  }

  const result = await pool.query(
    `INSERT INTO consultation_messages (chart_id, user_id, role, content, metadata)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, chart_id, user_id, role, content, metadata, created_at`,
    [chartId, record.userId, role, record.content, metadata],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    chartId: row.chart_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export async function saveConsultationExchange({
  chartId,
  userId,
  userContent,
  assistantContent,
  userMetadata = null,
  assistantMetadata = null,
}) {
  const normalizedUser = String(userContent || '').trim();
  const normalizedAssistant = String(assistantContent || '').trim();
  if (!normalizedUser || !normalizedAssistant) throw new Error('Consultation exchange requires both messages.');

  if (!pool) {
    const user = {
      id: nextMemoryId(),
      chartId,
      userId: userId ? String(userId) : null,
      role: 'user',
      content: normalizedUser,
      metadata: userMetadata,
      createdAt: nowIso(),
    };
    const assistant = {
      id: nextMemoryId(),
      chartId,
      userId: userId ? String(userId) : null,
      role: 'assistant',
      content: normalizedAssistant,
      metadata: assistantMetadata,
      createdAt: nowIso(),
    };
    memory.messages.push(user, assistant);
    return { user, assistant };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO consultation_messages (chart_id, user_id, role, content, metadata)
       VALUES ($1,$2,'user',$3,$4)
       RETURNING id, chart_id, user_id, role, content, metadata, created_at`,
      [chartId, userId ? String(userId) : null, normalizedUser, userMetadata],
    );
    const assistantResult = await client.query(
      `INSERT INTO consultation_messages (chart_id, user_id, role, content, metadata)
       VALUES ($1,$2,'assistant',$3,$4)
       RETURNING id, chart_id, user_id, role, content, metadata, created_at`,
      [chartId, userId ? String(userId) : null, normalizedAssistant, assistantMetadata],
    );
    await client.query('COMMIT');

    const normalize = (row) => ({
      id: row.id,
      chartId: row.chart_id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.created_at,
    });
    return { user: normalize(userResult.rows[0]), assistant: normalize(assistantResult.rows[0]) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getConsultationMessages(chartId, limit = 200) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  if (!pool) {
    return memory.messages
      .filter((item) => item.chartId === chartId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-safeLimit);
  }

  const result = await pool.query(
    `SELECT id, chart_id, user_id, role, content, metadata, created_at
     FROM (
       SELECT id, chart_id, user_id, role, content, metadata, created_at
       FROM consultation_messages
       WHERE chart_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) recent
     ORDER BY created_at ASC`,
    [chartId, safeLimit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    chartId: row.chart_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

export async function trackEvent({
  eventType,
  visitorId = null,
  userId = null,
  chartId = null,
  metadata = null,
}) {
  const normalizedType = String(eventType || '').trim().slice(0, 80);
  if (!normalizedType) return null;
  const record = {
    id: nextMemoryId(),
    eventType: normalizedType,
    visitorId: visitorId ? String(visitorId).slice(0, 120) : null,
    userId: userId ? String(userId) : null,
    chartId: chartId || null,
    metadata: metadata && typeof metadata === 'object' ? sanitizeAnalyticsMetadata(metadata) : null,
    createdAt: nowIso(),
  };

  if (!pool) {
    memory.events.push(record);
    return record;
  }

  const result = await pool.query(
    `INSERT INTO analytics_events (event_type, visitor_id, user_id, chart_id, metadata)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, event_type, visitor_id, user_id, chart_id, metadata, created_at`,
    [record.eventType, record.visitorId, record.userId, record.chartId, record.metadata],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    eventType: row.event_type,
    visitorId: row.visitor_id,
    userId: row.user_id,
    chartId: row.chart_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function memoryOverview(days) {
  const since = Date.now() - days * 86400000;
  const events = memory.events.filter((item) => new Date(item.createdAt).getTime() >= since);
  const eventCounts = {};
  for (const event of events) eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
  const succeeded = [...memory.payments.values()].filter((item) => item.status === 'succeeded');
  const revenue = succeeded.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    summary: {
      usersTotal: memory.users.size,
      chartsTotal: memory.charts.size,
      charts24h: [...memory.charts.values()].filter((item) => new Date(item.created_at).getTime() >= Date.now() - 86400000).length,
      messagesTotal: memory.messages.length,
      paymentsSucceeded: succeeded.length,
      revenueTotal: revenue,
    },
    funnel: eventCounts,
    daily: [],
    recentEvents: events.slice(-30).reverse(),
  };
}

export async function getAdminOverview(days = 30) {
  const safeDays = Math.min(365, Math.max(1, Number(days) || 30));
  if (!pool) return memoryOverview(safeDays);

  const summaryResult = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users_total,
      (SELECT COUNT(*)::int FROM charts) AS charts_total,
      (SELECT COUNT(*)::int FROM charts WHERE created_at >= NOW() - INTERVAL '24 hours') AS charts_24h,
      (SELECT COUNT(*)::int FROM consultation_messages) AS messages_total,
      (SELECT COUNT(*)::int FROM payments WHERE status = 'succeeded') AS payments_succeeded,
      (SELECT COALESCE(SUM(amount), 0)::double precision FROM payments WHERE status = 'succeeded') AS revenue_total
  `);

  const funnelResult = await pool.query(
    `SELECT event_type, COUNT(*)::int AS total
     FROM analytics_events
     WHERE created_at >= NOW() - ($1 || ' days')::interval
     GROUP BY event_type
     ORDER BY total DESC`,
    [String(safeDays)],
  );

  const dailyResult = await pool.query(
    `SELECT
       DATE_TRUNC('day', created_at)::date AS day,
       COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
       COUNT(*) FILTER (WHERE event_type = 'chart_created')::int AS charts,
       COUNT(*) FILTER (WHERE event_type = 'consultation_answered')::int AS consultations,
       COUNT(*) FILTER (WHERE event_type = 'payment_succeeded')::int AS payments
     FROM analytics_events
     WHERE created_at >= NOW() - ($1 || ' days')::interval
     GROUP BY DATE_TRUNC('day', created_at)
     ORDER BY day ASC`,
    [String(safeDays)],
  );

  const recentResult = await pool.query(
    `SELECT e.id, e.event_type, e.visitor_id, e.user_id, e.chart_id, e.metadata, e.created_at,
            u.username, u.first_name,
            c.birth_data
     FROM analytics_events e
     LEFT JOIN users u ON u.telegram_id = e.user_id
     LEFT JOIN charts c ON c.id = e.chart_id
     ORDER BY e.created_at DESC
     LIMIT 40`,
  );

  const summary = summaryResult.rows[0];
  return {
    summary: {
      usersTotal: summary.users_total,
      chartsTotal: summary.charts_total,
      charts24h: summary.charts_24h,
      messagesTotal: summary.messages_total,
      paymentsSucceeded: summary.payments_succeeded,
      revenueTotal: Number(summary.revenue_total || 0),
    },
    funnel: Object.fromEntries(funnelResult.rows.map((row) => [row.event_type, row.total])),
    daily: dailyResult.rows.map((row) => ({
      day: row.day,
      pageViews: row.page_views,
      charts: row.charts,
      consultations: row.consultations,
      payments: row.payments,
    })),
    recentEvents: recentResult.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      visitorId: row.visitor_id,
      userId: row.user_id,
      chartId: row.chart_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      user: row.user_id
        ? { username: row.username, firstName: row.first_name }
        : null,
      birth: row.birth_data,
    })),
  };
}

export async function listAdminCharts({ limit = 40, offset = 0, search = '' } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 40));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const cleanSearch = String(search || '').trim().slice(0, 120);

  if (!pool) {
    const needle = cleanSearch.toLowerCase();
    const items = [...memory.charts.values()]
      .filter((chart) => {
        if (!needle) return true;
        const user = chart.userId ? memory.users.get(String(chart.userId)) : null;
        return [
          chart.id,
          chart.birthData?.name,
          chart.birthData?.place,
          user?.username,
          user?.first_name,
        ].some((value) => String(value || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((chart) => {
        const user = chart.userId ? memory.users.get(String(chart.userId)) : null;
        return {
          id: chart.id,
          userId: chart.userId || null,
          birth: chart.birthData,
          source: chart.source,
          createdAt: chart.created_at,
          user: user
            ? { username: user.username, firstName: user.first_name, lastName: user.last_name }
            : null,
          messageCount: memory.messages.filter((item) => item.chartId === chart.id).length,
          paid: [...memory.payments.values()].some((item) => item.chartId === chart.id && item.status === 'succeeded'),
          lastActivityAt: memory.events.filter((item) => item.chartId === chart.id).at(-1)?.createdAt || chart.created_at,
        };
      });
    return { total: items.length, items: items.slice(safeOffset, safeOffset + safeLimit) };
  }

  const pattern = cleanSearch ? `%${cleanSearch}%` : '';
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM charts c
     LEFT JOIN users u ON u.telegram_id = c.user_id
     WHERE $1 = ''
       OR COALESCE(c.birth_data->>'name', '') ILIKE $1
       OR COALESCE(c.birth_data->>'place', '') ILIKE $1
       OR COALESCE(u.username, '') ILIKE $1
       OR COALESCE(u.first_name, '') ILIKE $1
       OR c.id::text ILIKE $1`,
    [pattern],
  );

  const result = await pool.query(
    `SELECT c.id, c.user_id, c.birth_data, c.source, c.created_at,
            u.username, u.first_name, u.last_name, u.photo_url, u.premium_until,
            (SELECT COUNT(*)::int FROM consultation_messages m WHERE m.chart_id = c.id) AS message_count,
            EXISTS(SELECT 1 FROM payments p WHERE p.chart_id = c.id AND p.status = 'succeeded') AS paid,
            COALESCE(
              (SELECT MAX(e.created_at) FROM analytics_events e WHERE e.chart_id = c.id),
              c.created_at
            ) AS last_activity_at
     FROM charts c
     LEFT JOIN users u ON u.telegram_id = c.user_id
     WHERE $3 = ''
       OR COALESCE(c.birth_data->>'name', '') ILIKE $3
       OR COALESCE(c.birth_data->>'place', '') ILIKE $3
       OR COALESCE(u.username, '') ILIKE $3
       OR COALESCE(u.first_name, '') ILIKE $3
       OR c.id::text ILIKE $3
     ORDER BY c.created_at DESC
     LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset, pattern],
  );

  return {
    total: countResult.rows[0].total,
    items: result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      birth: row.birth_data,
      source: row.source,
      createdAt: row.created_at,
      user: row.user_id
        ? {
            username: row.username,
            firstName: row.first_name,
            lastName: row.last_name,
            photoUrl: row.photo_url,
            premiumUntil: row.premium_until,
          }
        : null,
      messageCount: row.message_count,
      paid: row.paid,
      lastActivityAt: row.last_activity_at,
    })),
  };
}

export async function getAdminChartDetails(chartId) {
  if (!pool) {
    const chart = memory.charts.get(chartId);
    if (!chart) return null;
    return {
      chart: {
        ...chart,
        user: chart.userId ? memory.users.get(String(chart.userId)) || null : null,
      },
      messages: await getConsultationMessages(chartId, 500),
      events: memory.events.filter((item) => item.chartId === chartId).slice(-300).reverse(),
      payments: [...memory.payments.values()].filter((item) => item.chartId === chartId),
    };
  }

  const chartResult = await pool.query(
    `SELECT c.*, u.username, u.first_name, u.last_name, u.photo_url, u.premium_until
     FROM charts c
     LEFT JOIN users u ON u.telegram_id = c.user_id
     WHERE c.id = $1`,
    [chartId],
  );
  if (!chartResult.rows[0]) return null;
  const row = chartResult.rows[0];

  const [messagesResult, eventsResult, paymentsResult] = await Promise.all([
    pool.query(
      `SELECT id, chart_id, user_id, role, content, metadata, created_at
       FROM consultation_messages
       WHERE chart_id = $1
       ORDER BY created_at ASC
       LIMIT 500`,
      [chartId],
    ),
    pool.query(
      `SELECT id, event_type, visitor_id, user_id, chart_id, metadata, created_at
       FROM analytics_events
       WHERE chart_id = $1
       ORDER BY created_at DESC
       LIMIT 300`,
      [chartId],
    ),
    pool.query(
      `SELECT id, user_id, chart_id, status, amount, payload, created_at, updated_at
       FROM payments
       WHERE chart_id = $1
       ORDER BY created_at DESC`,
      [chartId],
    ),
  ]);

  return {
    chart: {
      id: row.id,
      userId: row.user_id,
      birthData: row.birth_data,
      chartData: row.chart_data,
      portraitData: row.portrait_data,
      source: row.source,
      createdAt: row.created_at,
      user: row.user_id
        ? {
            telegramId: row.user_id,
            username: row.username,
            firstName: row.first_name,
            lastName: row.last_name,
            photoUrl: row.photo_url,
            premiumUntil: row.premium_until,
          }
        : null,
    },
    messages: messagesResult.rows.map((item) => ({
      id: item.id,
      chartId: item.chart_id,
      userId: item.user_id,
      role: item.role,
      content: item.content,
      metadata: item.metadata,
      createdAt: item.created_at,
    })),
    events: eventsResult.rows.map((item) => ({
      id: item.id,
      eventType: item.event_type,
      visitorId: item.visitor_id,
      userId: item.user_id,
      chartId: item.chart_id,
      metadata: item.metadata,
      createdAt: item.created_at,
    })),
    payments: paymentsResult.rows.map((item) => ({
      id: item.id,
      userId: item.user_id,
      chartId: item.chart_id,
      status: item.status,
      amount: Number(item.amount),
      payload: item.payload,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  };
}
