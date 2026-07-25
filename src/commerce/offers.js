import { commerceState } from './state.js';
import { active } from './helpers.js';
import { OFFER_CODES, DAY_MS, offerCatalog } from './catalog.js';
import { decorateUserAccess, hasCloneAccessForChart } from './access.js';

async function activeAlignmentForUser(userId, now = new Date()) {
  if (!userId) return null;
  if (!commerceState.pool) {
    return [...commerceState.memoryChartAccess.values()].find((item) =>
      String(item.user_id) === String(userId) && active(item.alignment_until, now)) || null;
  }
  const result = await commerceState.pool.query(
    `SELECT chart_id, alignment_until FROM clone_chart_entitlements
     WHERE user_id = $1 AND alignment_until > $2
     ORDER BY alignment_until DESC LIMIT 1`,
    [String(userId), now.toISOString()],
  );
  return result.rows[0] || null;
}

async function eligibleDayPayment(userId, chartId = null, now = new Date()) {
  if (!userId) return null;
  if (!commerceState.pool) {
    return [...commerceState.memoryPayments.values()]
      .filter((payment) => payment.userId === String(userId)
        && (!chartId || String(payment.chartId || '') === String(chartId))
        && payment.offerCode === OFFER_CODES.CLONE_DAY
        && payment.status === 'succeeded'
        && payment.entitlementAppliedAt
        && new Date(payment.entitlementAppliedAt).getTime() >= now.getTime() - DAY_MS
        && ![...commerceState.memoryPayments.values()].some((candidate) =>
          candidate.creditSourcePaymentId === payment.id
          && ['checkout_reserved', 'pending', 'waiting_for_capture', 'succeeded'].includes(candidate.status)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  }
  const result = await commerceState.pool.query(
    `SELECT day.id, day.created_at FROM payments AS day
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
     ORDER BY day.created_at DESC LIMIT 1`,
    [String(userId), OFFER_CODES.CLONE_DAY, chartId || null],
  );
  return result.rows[0] || null;
}

export async function getCommerceState(user, now = new Date(), chartId = null) {
  const cloneContext = Boolean(chartId && (
    user?.accessProduct === 'clone'
    || String(user?.cloneEntitlementChartId || '') === String(chartId)
  ));
  const access = await decorateUserAccess(user, now, { chartId, cloneContext });
  const catalog = offerCatalog();
  if (!access) {
    return {
      access: null,
      offers: {
        day: { ...catalog[OFFER_CODES.CLONE_DAY], available: true },
        alignment: {
          ...catalog[OFFER_CODES.CLONE_ALIGNMENT],
          payableAmount: catalog[OFFER_CODES.CLONE_ALIGNMENT].amount,
          credited: false,
        },
      },
    };
  }
  const creditPayment = await eligibleDayPayment(access.telegram_id, chartId, now);
  const alignment = catalog[OFFER_CODES.CLONE_ALIGNMENT];
  return {
    access,
    offers: {
      day: { ...catalog[OFFER_CODES.CLONE_DAY], available: !hasCloneAccessForChart(access, chartId, now) },
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

function offerError(message, code) {
  const error = new Error(message);
  error.status = code === 'UNKNOWN_OFFER' || code === 'OFFER_PRODUCT_MISMATCH' || code === 'CLONE_CHART_REQUIRED' ? 400 : 409;
  error.code = code;
  error.expose = true;
  return error;
}

export async function resolveOffer({ user, offerCode, product, chartId = null }) {
  const catalog = offerCatalog();
  const code = String(offerCode || '').trim().toLowerCase()
    || (product === 'clone' ? OFFER_CODES.CLONE_DAY : OFFER_CODES.FULL_MAP);
  const offer = catalog[code];
  if (!offer) throw offerError('Неизвестное предложение оплаты.', 'UNKNOWN_OFFER');
  if (offer.product !== product) throw offerError('Предложение не относится к выбранному продукту.', 'OFFER_PRODUCT_MISMATCH');
  if (offer.product === 'clone' && !chartId) throw offerError('Сначала выберите Звёздного клона для покупки.', 'CLONE_CHART_REQUIRED');

  const scopedUser = offer.product === 'clone'
    ? { ...user, accessProduct: 'clone', cloneEntitlementChartId: String(chartId) }
    : user;
  if (code === OFFER_CODES.CLONE_DAY) {
    const state = await getCommerceState(scopedUser, new Date(), chartId);
    if (hasCloneAccessForChart(state.access, chartId)) {
      throw offerError('Глубокий режим уже активен. Продолжить его можно через Сонастройку.', 'OFFER_NOT_AVAILABLE');
    }
  }
  if (code === OFFER_CODES.CLONE_ALIGNMENT) {
    const current = await activeAlignmentForUser(user?.telegram_id);
    if (current) {
      const sameChart = String(current.chart_id ?? current.chartId ?? '') === String(chartId);
      throw offerError(
        sameChart ? 'Сонастройка для этого клона уже активна.' : 'Сонастройка уже активна для другого клона. Сначала завершите текущий период.',
        sameChart ? 'ALIGNMENT_ALREADY_ACTIVE' : 'ALIGNMENT_ACTIVE_FOR_ANOTHER_CHART',
      );
    }
    const state = await getCommerceState(scopedUser, new Date(), chartId);
    return {
      ...offer,
      amount: state.offers.alignment.payableAmount,
      creditSourcePaymentId: state.offers.alignment.creditSourcePaymentId,
      credited: state.offers.alignment.credited,
    };
  }
  return { ...offer, creditSourcePaymentId: null, credited: false };
}
