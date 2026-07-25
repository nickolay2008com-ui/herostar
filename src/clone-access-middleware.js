import { decorateUserAccess } from './commerce.js';
import { isCloneChart } from './clone-quota.js';

function requestChartId(req) {
  const direct = req.body?.chartId || req.query?.chartId || req.query?.chart || null;
  if (direct) return String(direct).trim();
  const match = String(req.path || '').match(/^\/api\/charts\/([0-9a-f-]{36})(?:\/|$)/i);
  return match?.[1] || null;
}

function explicitCloneRequest(req) {
  const product = String(req.body?.product || '').trim().toLowerCase();
  const offerCode = String(req.body?.offerCode || '').trim().toLowerCase();
  const question = String(req.body?.question || '');
  return product === 'clone'
    || offerCode === 'clone_day'
    || offerCode === 'clone_alignment'
    || (question.includes('Звёздный клон') && question.includes('Ситуация:'));
}

export async function scopeCloneAccess(req, _res, next) {
  try {
    if (!req.user) return next();
    const chartId = requestChartId(req);
    if (!chartId) return next();
    const cloneContext = explicitCloneRequest(req) || await isCloneChart(chartId);
    if (!cloneContext) return next();
    req.user = await decorateUserAccess(req.user, new Date(), { chartId, cloneContext: true });
    return next();
  } catch (error) {
    return next(error);
  }
}
