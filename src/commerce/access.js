import { commerceState } from './state.js';
import { active, asDate, chartAccessKey, iso, latestDate } from './helpers.js';

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

export function emptyChartAccess(userId, chartId) {
  return {
    user_id: String(userId),
    chart_id: String(chartId),
    full_map_unlocked: false,
    passport_unlocked: false,
    access_until: null,
    alignment_until: null,
  };
}

export function rowForUser(user) {
  const userId = String(user?.telegram_id || '');
  if (!userId) return null;
  return {
    ...emptyAccess(userId),
    ...(commerceState.memoryAccess.get(userId) || {}),
    ...user,
  };
}

export function rowForChartAccess(userId, chartId) {
  if (!userId || !chartId) return null;
  return {
    ...emptyChartAccess(userId, chartId),
    ...(commerceState.memoryChartAccess.get(chartAccessKey(userId, chartId)) || {}),
  };
}

function normalizedChartEntitlement(value, chartId = null) {
  if (!value) return null;
  return {
    chartId: String(value.chart_id ?? value.chartId ?? chartId ?? ''),
    fullMapUnlocked: Boolean(value.full_map_unlocked ?? value.fullMapUnlocked),
    passportUnlocked: Boolean(value.passport_unlocked ?? value.passportUnlocked),
    accessUntil: iso(value.access_until ?? value.accessUntil),
    alignmentUntil: iso(value.alignment_until ?? value.alignmentUntil),
  };
}

export function normalizeAccess(user, now = new Date(), options = {}) {
  if (!user?.telegram_id) return null;
  const chartId = options.chartId ? String(options.chartId) : null;
  const cloneContext = Boolean(options.cloneContext && chartId);
  const entitlement = normalizedChartEntitlement(user._cloneEntitlement, chartId);
  const legacyUntil = asDate(user.premium_until ?? user.premiumUntil);
  const legacyActive = active(legacyUntil, now);

  const globalDayUntil = asDate(user.clone_access_until ?? user.cloneAccessUntil);
  const globalAlignmentUntil = asDate(user.clone_alignment_until ?? user.cloneAlignmentUntil);
  const globalAlignmentChartId = user.clone_alignment_chart_id ?? user.cloneAlignmentChartId ?? null;
  const dayUntil = cloneContext ? asDate(entitlement?.accessUntil) : globalDayUntil;
  const alignmentUntil = cloneContext ? asDate(entitlement?.alignmentUntil) : globalAlignmentUntil;
  const dayActive = active(dayUntil, now);
  const alignmentActive = active(alignmentUntil, now);
  const cloneAccessActive = legacyActive || dayActive || alignmentActive;

  const mapUnlocked = cloneContext
    ? legacyActive || Boolean(entitlement?.fullMapUnlocked)
    : legacyActive || Boolean(user.full_map_unlocked ?? user.mapUnlocked);
  const clonePassportUnlocked = cloneContext
    ? legacyActive || Boolean(entitlement?.passportUnlocked)
    : legacyActive || Boolean(user.clone_passport_unlocked ?? user.clonePassportUnlocked);
  const cloneAccessUntil = latestDate(
    legacyActive ? legacyUntil : null,
    dayActive ? dayUntil : null,
    alignmentActive ? alignmentUntil : null,
  );
  const clonePlan = alignmentActive ? 'alignment' : dayActive ? 'day' : legacyActive ? 'legacy' : 'free';

  return {
    ...user,
    premium: cloneAccessActive,
    legacyPremiumActive: legacyActive,
    mapUnlocked,
    clonePassportUnlocked,
    cloneAccessActive,
    cloneDayAccessActive: dayActive && !alignmentActive,
    cloneAlignmentActive: alignmentActive,
    clonePlan,
    cloneAccessUntil: iso(cloneAccessUntil),
    cloneAlignmentUntil: iso(alignmentUntil),
    cloneAlignmentChartId: cloneContext
      ? (alignmentActive ? chartId : null)
      : (globalAlignmentChartId ? String(globalAlignmentChartId) : null),
    cloneEntitlementChartId: cloneContext ? chartId : null,
    accessProduct: cloneContext ? 'clone' : 'herostar',
  };
}

export function hasCloneAccessForChart(user, chartId, now = new Date()) {
  if (!user || !chartId) return false;
  if (user.cloneEntitlementChartId) {
    return String(user.cloneEntitlementChartId) === String(chartId)
      && Boolean(user.cloneAccessActive)
      && (!user.cloneAccessUntil || active(user.cloneAccessUntil, now));
  }
  const access = normalizeAccess(user, now);
  if (!access?.cloneAccessActive) return false;
  if (access.legacyPremiumActive) return true;
  if (!access.cloneAlignmentActive) return false;
  return Boolean(access.cloneAlignmentChartId)
    && String(access.cloneAlignmentChartId) === String(chartId);
}

async function getDbAccess(userId) {
  const result = await commerceState.pool.query(
    `SELECT telegram_id, premium_until, full_map_unlocked, clone_passport_unlocked,
            clone_access_until, clone_alignment_until, clone_alignment_chart_id
     FROM users WHERE telegram_id = $1 LIMIT 1`,
    [String(userId)],
  );
  return result.rows[0] || null;
}

async function getDbChartAccess(userId, chartId) {
  const result = await commerceState.pool.query(
    `SELECT user_id, chart_id, full_map_unlocked, passport_unlocked,
            access_until, alignment_until
     FROM clone_chart_entitlements
     WHERE user_id = $1 AND chart_id = $2 LIMIT 1`,
    [String(userId), chartId],
  );
  return result.rows[0] || null;
}

export async function decorateUserAccess(user, now = new Date(), options = {}) {
  if (!user?.telegram_id) return user || null;
  const stored = commerceState.pool ? await getDbAccess(user.telegram_id) : rowForUser(user);
  const chartId = options.chartId ? String(options.chartId) : null;
  const cloneContext = Boolean(options.cloneContext && chartId);
  const chartAccess = cloneContext
    ? (commerceState.pool
      ? await getDbChartAccess(user.telegram_id, chartId)
      : rowForChartAccess(user.telegram_id, chartId))
    : null;
  return normalizeAccess(
    { ...user, ...(stored || {}), _cloneEntitlement: chartAccess },
    now,
    { chartId, cloneContext },
  );
}
