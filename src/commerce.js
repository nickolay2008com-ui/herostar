const DAY_MS = 24 * 60 * 60 * 1000;
const ALIGNMENT_MS = 30 * DAY_MS;

export const OFFER_CODES = Object.freeze({
  FULL_MAP: 'herostar_full_map',
  CLONE_DAY: 'clone_day',
  CLONE_ALIGNMENT: 'clone_alignment',
});

let pool = null;
const memoryAccess = new Map();
const memoryPayments = new Map();

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(...values) {
  const dates = values.map(asDate).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function active(value, now = new Date()) {
  const date = asDate(value);
  return Boolean(date && date.getTime() > now.getTime());
}

function iso(value) {
  return asDate(value)?.toISOString() || null;
}

function money(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number);
}

export function offerCatalog(env = process.env) {
  return Object.freeze({
    [OFFER_CODES.FULL_MAP]: {
      code: OFFER_CODES.FULL_MAP,
      product: 'herostar',
      title: 'Полная карта HeroStar',
      amount: money(env.FULL_MAP_PRICE, 990),
      durationHours: null,
    },
    [OFFER_CODES.CLONE_DAY]: {
      code: OFFER_CODES.CLONE_DAY,
      product: 'clone',
      title: 'День со Звёздным клоном',
      amount: money(env.CLONE_DAY_PRICE, 499),
      durationHours: 24,
    },
    [OFFER_CODES.CLONE_ALIGNMENT]: {
      code: OFFER_CODES.CLONE_ALIGNMENT,
      product: 'clone',
      title: 'Сонастройка со Звёздным клоном',
      amount: money(env.CLONE_ALIGNMENT_PRICE, 1499),
      upgradeAmount: money(env.CLONE_ALIGNMENT_UPGRADE_PRICE, 1000),
      durationDays: 30,
    },
  });
}

function emptyAccess(userId) {
  return {
    telegram_id: String(userId),
    full_map_unlocked: false,
    clone_passport_unlocked: false,
    clone_access_until: null,
    clone_alignment_until: null,
    clone_alignment_chart_id: null,
  };
}

function rowForUser(user) {
  const userId = String(user?.telegram_id || '');
  if (!userId) return null;
  return {
    ...emptyAccess(userId),
    ...(memoryAccess.get(userId) || {}),
    ...user,
  };
}

export function normalizeAccess(user, now = new Date()) {
  if (!user?.telegram_id) return null;
  const legacyUntil = asDate(user.premium_until);
  const dayUntil = asDate(user.clone_access_until ?? user.cloneAccessUntil);
  const alignmentUntil = asDate(user.clone_alignment_until ?? user.cloneAlignmentUntil);
  const alignmentChartId = user.clone_alignment_chart_id ?? user.cloneAlignmentChartId ?? null;
  const legacyActive = active(legacyUntil, now);
  const dayActive = active(dayUntil, now);
  const alignmentActive = active(alignmentUntil, now);
  const cloneAccessActive = legacyActive || dayActive || alignmentActive;
  const mapUnlocked = legacyActive || Boolean(user.full_map_unlocked ?? user.mapUnlocked);
  const clonePassportUnlocked = legacyActive || Boolean(user.clone_passport_unlocked ?? user.clonePassportUnlocked);
  const cloneAccessUntil = latestDate(
    legacyActive ? legacyUntil : null,
    dayActive ? dayUntil : null,
    alignmentActive ? alignmentUntil : null,
  );
  const clonePlan = alignmentActive
    ? 'alignment'
    : dayActive
      ? 'day'
      : legacyActive
        ? 'legacy'
        : 'free';

  return {
    ...user,
    // Внутренний alias нужен для существующей квоты и выбора AI-профиля.
    // В публичном API отдельно показываются карта и временный диалог.
    premium: cloneAccessActive,
    legacyPremiumActive: legacyActive,
    mapUnlocked,
    clonePassportUnlocked,
    cloneAccessActive,
    cloneDayAccessActive: dayActive,
    cloneAlignmentActive: alignmentActive,
    clonePlan,
    cloneAccessUntil: iso(cloneAccessUntil),
    cloneAlignmentUntil: iso(alignmentUntil),
    cloneAlignmentChartId: alignmentChartId ? String(alignmentChartId) : null,
  };
}

export function hasCloneAccessForChart(user, chartId, now = new Date()) {
  const access = normalizeAccess(user, now);
  if (!access?.cloneAccessActive) return false;
  if (access.legacyPremiumActive || access.cloneDayAccessActive) return true;
  if (!access.cloneAlignmentActive) return false;
  if (!access.cloneAlignmentChartId || !chartId) return false;
  return String(access.cloneAlignmentChartId) === String(chartId);
}

async function getDbAccess(userId) {
  if (!pool) return null;
  const result = await pool.query(
    `SELECT telegram_id, premium_until, full_map_unlocked, clone_passport_unlocked,
            clone_access_until, clone_alignment_until, clone_alignment_chart_id
     FROM users WHERE telegram_id = $1 LIMIT 1`,
    [String(userId)],
  );
  return result.rows[0] || null;
}

export async function decorateUserAccess(user, now = new Date()) {
  if (!user?.telegram_id) return user || null;
  const stored = pool
    ? await getDbAccess(user.telegram_id)
    : rowForUser(user);
  return normalizeAccess({ ...user, ...(stored || {}) }, now);
}

async function eligibleDayPayment(userId, chartId = null, now = new Date()) {
  if (!userId) return null;
  if (!pool) {
    return [...memoryPayments.values()]
      .filter((payment) => payment.userId === String(userId)
        && (!chartId || String(payment.chartId || '') === String(chartId))
        && payment.offerCode === OFFER_CODES.CLONE_DAY
        && payment.status === 'succeeded'
        && payment.entitlementAppliedAt
        && new Date(payment.entitlementAppliedAt).getTime() >= now.getTime() - DAY_MS
        && ![...memoryPayments.values()].some((candidate) => candidate.creditSourcePaymentId === payment.id && ['checkout_reserved', 'pending', 'waiting_for_capture', 'succeeded'].includes(candidate.status)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  }

  const result = await pool.query(
    `SELECT day.id, day.created_at
     FROM payments AS day
     WHERE day.user_id = $1
       AND ($3::uuid IS NULL OR day.chart_id = $3::uuid)
       AND day.offer_code = $2
       AND day.status = 'succeeded'
       AND day.entitlement_applied_at IS NOT NULL
       AND day.entitlement_applied_at >= NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM payments AS upgrade
         WHERE upgrade.credit_source_payment_id = day.id
           AND upgrade.status IN ('checkout_reserved', 'pending', 'waiting_for_capture', 'succeeded')
       )
     ORDER BY day.created_at DESC
     LIMIT 1`,
    [String(userId), OFFER_CODES.CLONE_DAY, chartId || null],
  );
  return result.rows[0] || null;
}

export async function getCommerceState(user, now = new Date(), chartId = null) {
  const access = await decorateUserAccess(user, now);
  const catalog = offerCatalog();
  if (!access) {
    return {
      access: null,
      offers: {
        day: { ...catalog[OFFER_CODES.CLONE_DAY], available: true },
        alignment: { ...catalog[OFFER_CODES.CLONE_ALIGNMENT], payableAmount: catalog[OFFER_CODES.CLONE_ALIGNMENT].amount, credited: false },
      },
    };
  }

  const creditPayment = await eligibleDayPayment(access.telegram_id, chartId, now);
  const alignment = catalog[OFFER_CODES.CLONE_ALIGNMENT];
  return {
    access,
    offers: {
      day: {
        ...catalog[OFFER_CODES.CLONE_DAY],
        available: !hasCloneAccessForChart(access, chartId, now),
      },
      alignment: {
        ...alignment,
        payableAmount: creditPayment ? alignment.upgradeAmount : alignment.amount,
        credited: Boolean(creditPayment),
        creditAmount: creditPayment ? catalog[OFFER_CODES.CLONE_DAY].amount : 0,
        creditSourcePaymentId: creditPayment?.id || null,
      },
    },
  };
}

export async function resolveOffer({ user, offerCode, product, chartId = null }) {
  const catalog = offerCatalog();
  const normalized = String(offerCode || '').trim().toLowerCase();
  const code = normalized || (product === 'clone' ? OFFER_CODES.CLONE_DAY : OFFER_CODES.FULL_MAP);
  const offer = catalog[code];
  if (!offer) {
    const error = new Error('Неизвестное предложение оплаты.');
    error.status = 400;
    error.code = 'UNKNOWN_OFFER';
    error.expose = true;
    throw error;
  }

  if (offer.product !== product) {
    const error = new Error('Предложение не относится к выбранному продукту.');
    error.status = 400;
    error.code = 'OFFER_PRODUCT_MISMATCH';
    error.expose = true;
    throw error;
  }
  if (offer.product === 'clone' && !chartId) {
    const error = new Error('Сначала выберите Звёздного клона для покупки.');
    error.status = 400;
    error.code = 'CLONE_CHART_REQUIRED';
    error.expose = true;
    throw error;
  }

  if (code === OFFER_CODES.CLONE_DAY) {
    const state = await getCommerceState(user, new Date(), chartId);
    if (hasCloneAccessForChart(state.access, chartId)) {
      const error = new Error('Глубокий режим уже активен. Продолжить его можно через Сонастройку.');
      error.status = 409;
      error.code = 'OFFER_NOT_AVAILABLE';
      error.expose = true;
      throw error;
    }
  }

  if (code === OFFER_CODES.CLONE_ALIGNMENT) {
    const state = await getCommerceState(user, new Date(), chartId);
    if (state.access?.cloneAlignmentActive) {
      const sameChart = String(state.access.cloneAlignmentChartId || '') === String(chartId);
      const error = new Error(sameChart
        ? 'Сонастройка для этого клона уже активна.'
        : 'Сонастройка уже активна для другого клона. Сначала завершите текущий период.');
      error.status = 409;
      error.code = sameChart ? 'ALIGNMENT_ALREADY_ACTIVE' : 'ALIGNMENT_ACTIVE_FOR_ANOTHER_CHART';
      error.expose = true;
      throw error;
    }
    return {
      ...offer,
      amount: state.offers.alignment.payableAmount,
      creditSourcePaymentId: state.offers.alignment.creditSourcePaymentId,
      credited: state.offers.alignment.credited,
    };
  }
  return { ...offer, creditSourcePaymentId: null, credited: false };
}

export async function initCommerce(storePool = null) {
  pool = storePool;
  if (!pool) return;
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_map_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_passport_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_access_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_alignment_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_alignment_chart_id UUID REFERENCES charts(id) ON DELETE SET NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS return_ref UUID;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS offer_code TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS entitlement_applied_at TIMESTAMPTZ;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS credit_source_payment_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS payments_return_ref_unique ON payments(return_ref) WHERE return_ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS payments_offer_user_idx ON payments(user_id, offer_code, created_at DESC);
    DROP INDEX IF EXISTS payments_day_credit_active_unique;
    CREATE UNIQUE INDEX payments_day_credit_active_unique
      ON payments(credit_source_payment_id)
      WHERE credit_source_payment_id IS NOT NULL
        AND status IN ('checkout_reserved', 'pending', 'waiting_for_capture', 'succeeded');
    CREATE INDEX IF NOT EXISTS users_clone_alignment_idx ON users(clone_alignment_until) WHERE clone_alignment_until IS NOT NULL;

    UPDATE users AS user_record
    SET clone_alignment_chart_id = (
      SELECT chart.id
      FROM charts AS chart
      JOIN clone_charts AS clone ON clone.chart_id = chart.id
      WHERE chart.user_id = user_record.telegram_id
      ORDER BY chart.created_at DESC
      LIMIT 1
    )
    WHERE user_record.clone_alignment_until IS NOT NULL
      AND user_record.clone_alignment_chart_id IS NULL;
  `);
}

export async function recordPaymentOffer({ paymentId, userId, chartId = null, offerCode, creditSourcePaymentId = null }) {
  if (!pool) {
    const previous = memoryPayments.get(paymentId) || {};
    memoryPayments.set(paymentId, {
      ...previous,
      id: paymentId,
      userId: String(userId),
      chartId: chartId || previous.chartId || null,
      offerCode,
      creditSourcePaymentId,
      status: previous.status || 'pending',
      createdAt: previous.createdAt || new Date().toISOString(),
    });
    return;
  }
  await pool.query(
    `UPDATE payments
     SET offer_code = $2, credit_source_payment_id = $3, updated_at = NOW()
     WHERE id = $1`,
    [paymentId, offerCode, creditSourcePaymentId],
  );
}

export async function markCommercePaymentStatus(paymentId, status) {
  if (!pool) {
    const previous = memoryPayments.get(paymentId) || { id: paymentId, createdAt: new Date().toISOString() };
    memoryPayments.set(paymentId, { ...previous, status });
  }
}

function addDuration(base, milliseconds) {
  return new Date(Math.max(Date.now(), asDate(base)?.getTime() || 0) + milliseconds);
}

export async function applyPaymentEntitlement({ paymentId, userId, chartId = null, offerCode, creditSourcePaymentId = null }) {
  if (!userId || !offerCode) return null;
  if (!pool) {
    const payment = memoryPayments.get(paymentId) || {
      id: paymentId,
      userId: String(userId),
      offerCode,
      creditSourcePaymentId,
      status: 'succeeded',
      createdAt: new Date().toISOString(),
    };
    if (payment.entitlementAppliedAt) return decorateUserAccess(rowForUser({ telegram_id: userId }));
    const access = rowForUser({ telegram_id: userId }) || emptyAccess(userId);
    if (offerCode === OFFER_CODES.FULL_MAP) {
      access.full_map_unlocked = true;
    } else if (offerCode === OFFER_CODES.CLONE_DAY) {
      access.full_map_unlocked = true;
      access.clone_passport_unlocked = true;
      access.clone_access_until = addDuration(access.clone_access_until, DAY_MS).toISOString();
    } else if (offerCode === OFFER_CODES.CLONE_ALIGNMENT) {
      if (!chartId) throw new Error('Alignment entitlement requires a chart.');
      access.full_map_unlocked = true;
      access.clone_passport_unlocked = true;
      const base = latestDate(access.clone_alignment_until, new Date());
      const until = new Date(base.getTime() + ALIGNMENT_MS).toISOString();
      access.clone_access_until = until;
      access.clone_alignment_until = until;
      access.clone_alignment_chart_id = String(chartId);
    }
    memoryAccess.set(String(userId), access);
    memoryPayments.set(paymentId, {
      ...payment,
      status: 'succeeded',
      entitlementAppliedAt: new Date().toISOString(),
      creditSourcePaymentId,
    });
    return decorateUserAccess({ telegram_id: String(userId) });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id, offer_code, entitlement_applied_at, credit_source_payment_id
       FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId],
    );
    const payment = locked.rows[0];
    if (!payment) throw new Error(`Payment ${paymentId} was not saved before entitlement application.`);
    if (payment.entitlement_applied_at) {
      await client.query('COMMIT');
      return decorateUserAccess({ telegram_id: String(userId) });
    }
    const effectiveOffer = payment.offer_code || offerCode;

    if (effectiveOffer === OFFER_CODES.FULL_MAP) {
      await client.query(
        `UPDATE users SET full_map_unlocked = TRUE WHERE telegram_id = $1`,
        [String(userId)],
      );
    } else if (effectiveOffer === OFFER_CODES.CLONE_DAY) {
      await client.query(
        `UPDATE users
         SET full_map_unlocked = TRUE,
             clone_passport_unlocked = TRUE,
             clone_access_until = GREATEST(COALESCE(clone_access_until, NOW()), NOW()) + INTERVAL '24 hours'
         WHERE telegram_id = $1`,
        [String(userId)],
      );
    } else if (effectiveOffer === OFFER_CODES.CLONE_ALIGNMENT) {
      if (!chartId) throw new Error('Alignment entitlement requires a chart.');
      await client.query(
        `UPDATE users
         SET full_map_unlocked = TRUE,
             clone_passport_unlocked = TRUE,
             clone_access_until = GREATEST(COALESCE(clone_alignment_until, NOW()), NOW()) + INTERVAL '30 days',
             clone_alignment_until = GREATEST(COALESCE(clone_alignment_until, NOW()), NOW()) + INTERVAL '30 days',
             clone_alignment_chart_id = $2
         WHERE telegram_id = $1`,
        [String(userId), chartId],
      );
    } else {
      throw new Error(`Unsupported offer entitlement: ${effectiveOffer}`);
    }

    await client.query(
      `UPDATE payments
       SET entitlement_applied_at = NOW(),
           offer_code = COALESCE(offer_code, $2),
           credit_source_payment_id = COALESCE(credit_source_payment_id, $3),
           updated_at = NOW()
       WHERE id = $1`,
      [paymentId, effectiveOffer, creditSourcePaymentId],
    );
    await client.query('COMMIT');
    return decorateUserAccess({ telegram_id: String(userId) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function _resetCommerceForTests() {
  memoryAccess.clear();
  memoryPayments.clear();
}
