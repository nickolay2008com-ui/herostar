import { commerceState } from './state.js';
import { ALIGNMENT_MS, DAY_MS, OFFER_CODES, isCloneSupportOffer } from './catalog.js';
import { addDuration, chartAccessKey, latestDate } from './helpers.js';
import { decorateUserAccess, emptyChartAccess, rowForChartAccess, rowForUser } from './access.js';

export async function recordPaymentOffer({ paymentId, userId, chartId = null, offerCode, creditSourcePaymentId = null }) {
  if (!commerceState.pool) {
    const previous = commerceState.memoryPayments.get(paymentId) || {};
    commerceState.memoryPayments.set(paymentId, {
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
  await commerceState.pool.query(
    `UPDATE payments SET offer_code = $2, credit_source_payment_id = $3, updated_at = NOW() WHERE id = $1`,
    [paymentId, offerCode, creditSourcePaymentId],
  );
}

export async function markCommercePaymentStatus(paymentId, status) {
  if (!commerceState.pool) {
    const previous = commerceState.memoryPayments.get(paymentId) || { id: paymentId, createdAt: new Date().toISOString() };
    commerceState.memoryPayments.set(paymentId, { ...previous, status });
  }
}

function applyMemoryChartEntitlement({ userId, chartId, offerCode }) {
  if (!chartId) throw new Error('Clone entitlement requires a chart.');
  const key = chartAccessKey(userId, chartId);
  const access = rowForChartAccess(userId, chartId) || emptyChartAccess(userId, chartId);
  access.full_map_unlocked = true;
  access.passport_unlocked = true;
  if (offerCode === OFFER_CODES.CLONE_DAY) {
    access.access_until = addDuration(access.access_until, DAY_MS).toISOString();
  } else if (offerCode === OFFER_CODES.CLONE_ALIGNMENT) {
    const base = latestDate(access.alignment_until, new Date());
    const until = new Date(base.getTime() + ALIGNMENT_MS).toISOString();
    access.access_until = until;
    access.alignment_until = until;
  } else if (!isCloneSupportOffer(offerCode)) {
    throw new Error(`Unsupported clone entitlement: ${offerCode}`);
  }
  commerceState.memoryChartAccess.set(key, access);
  return access;
}

async function applyMemory({ paymentId, userId, chartId, offerCode, creditSourcePaymentId }) {
  const payment = commerceState.memoryPayments.get(paymentId) || {
    id: paymentId,
    userId: String(userId),
    chartId,
    offerCode,
    creditSourcePaymentId,
    status: 'succeeded',
    createdAt: new Date().toISOString(),
  };
  if (!payment.entitlementAppliedAt) {
    const globalAccess = rowForUser({ telegram_id: userId });
    if (offerCode === OFFER_CODES.FULL_MAP) {
      globalAccess.full_map_unlocked = true;
      commerceState.memoryAccess.set(String(userId), globalAccess);
    } else if ([OFFER_CODES.CLONE_DAY, OFFER_CODES.CLONE_ALIGNMENT].includes(offerCode) || isCloneSupportOffer(offerCode)) {
      const chartAccess = applyMemoryChartEntitlement({ userId, chartId, offerCode });
      if (offerCode === OFFER_CODES.CLONE_ALIGNMENT) {
        globalAccess.clone_alignment_until = chartAccess.alignment_until;
        globalAccess.clone_alignment_chart_id = String(chartId);
        commerceState.memoryAccess.set(String(userId), globalAccess);
      }
    } else {
      throw new Error(`Unsupported offer entitlement: ${offerCode}`);
    }
    commerceState.memoryPayments.set(paymentId, {
      ...payment,
      chartId: chartId || payment.chartId || null,
      status: 'succeeded',
      entitlementAppliedAt: new Date().toISOString(),
      creditSourcePaymentId,
    });
  }
  return decorateUserAccess(
    { telegram_id: String(userId) },
    new Date(),
    { chartId, cloneContext: offerCode !== OFFER_CODES.FULL_MAP },
  );
}

export async function applyPaymentEntitlement({ paymentId, userId, chartId = null, offerCode, creditSourcePaymentId = null }) {
  if (!userId || !offerCode) return null;
  if (!commerceState.pool) return applyMemory({ paymentId, userId, chartId, offerCode, creditSourcePaymentId });

  const client = await commerceState.pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id, offer_code, entitlement_applied_at FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId],
    );
    const payment = locked.rows[0];
    if (!payment) throw new Error(`Payment ${paymentId} was not saved before entitlement application.`);
    await client.query(
      `SELECT telegram_id FROM users WHERE telegram_id = $1 FOR UPDATE`,
      [String(userId)],
    );
    const effectiveOffer = payment.offer_code || offerCode;
    if (!payment.entitlement_applied_at) {
      if (effectiveOffer === OFFER_CODES.FULL_MAP) {
        await client.query(`UPDATE users SET full_map_unlocked = TRUE WHERE telegram_id = $1`, [String(userId)]);
      } else if (isCloneSupportOffer(effectiveOffer)) {
        if (!chartId) throw new Error('Clone support entitlement requires a chart.');
        await client.query(
          `INSERT INTO clone_chart_entitlements (
             user_id, chart_id, full_map_unlocked, passport_unlocked
           ) VALUES ($1, $2, TRUE, TRUE)
           ON CONFLICT (user_id, chart_id) DO UPDATE SET
             full_map_unlocked = TRUE,
             passport_unlocked = TRUE,
             updated_at = NOW()`,
          [String(userId), chartId],
        );
      } else if (effectiveOffer === OFFER_CODES.CLONE_DAY) {
        if (!chartId) throw new Error('Clone day entitlement requires a chart.');
        await client.query(
          `INSERT INTO clone_chart_entitlements (
             user_id, chart_id, full_map_unlocked, passport_unlocked, access_until
           ) VALUES ($1, $2, TRUE, TRUE, NOW() + INTERVAL '24 hours')
           ON CONFLICT (user_id, chart_id) DO UPDATE SET
             full_map_unlocked = TRUE,
             passport_unlocked = TRUE,
             access_until = GREATEST(COALESCE(clone_chart_entitlements.access_until, NOW()), NOW()) + INTERVAL '24 hours',
             updated_at = NOW()`,
          [String(userId), chartId],
        );
      } else if (effectiveOffer === OFFER_CODES.CLONE_ALIGNMENT) {
        if (!chartId) throw new Error('Alignment entitlement requires a chart.');
        const active = await client.query(
          `SELECT chart_id FROM clone_chart_entitlements
           WHERE user_id = $1 AND alignment_until > NOW() FOR UPDATE`,
          [String(userId)],
        );
        if (active.rows.some((row) => String(row.chart_id) !== String(chartId))) {
          throw new Error('Alignment is already active for another chart.');
        }
        await client.query(
          `INSERT INTO clone_chart_entitlements (
             user_id, chart_id, full_map_unlocked, passport_unlocked, access_until, alignment_until
           ) VALUES ($1, $2, TRUE, TRUE, NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days')
           ON CONFLICT (user_id, chart_id) DO UPDATE SET
             full_map_unlocked = TRUE,
             passport_unlocked = TRUE,
             access_until = GREATEST(COALESCE(clone_chart_entitlements.alignment_until, NOW()), NOW()) + INTERVAL '30 days',
             alignment_until = GREATEST(COALESCE(clone_chart_entitlements.alignment_until, NOW()), NOW()) + INTERVAL '30 days',
             updated_at = NOW()`,
          [String(userId), chartId],
        );
        const entitlement = await client.query(
          `SELECT alignment_until FROM clone_chart_entitlements WHERE user_id = $1 AND chart_id = $2`,
          [String(userId), chartId],
        );
        await client.query(
          `UPDATE users SET clone_alignment_until = $3, clone_alignment_chart_id = $2 WHERE telegram_id = $1`,
          [String(userId), chartId, entitlement.rows[0]?.alignment_until || null],
        );
      } else {
        throw new Error(`Unsupported offer entitlement: ${effectiveOffer}`);
      }
      await client.query(
        `UPDATE payments SET entitlement_applied_at = NOW(),
           offer_code = COALESCE(offer_code, $2),
           credit_source_payment_id = COALESCE(credit_source_payment_id, $3),
           updated_at = NOW() WHERE id = $1`,
        [paymentId, effectiveOffer, creditSourcePaymentId],
      );
    }
    await client.query('COMMIT');
    return decorateUserAccess(
      { telegram_id: String(userId) },
      new Date(),
      { chartId, cloneContext: effectiveOffer !== OFFER_CODES.FULL_MAP },
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
