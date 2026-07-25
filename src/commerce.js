// Публичная точка входа commerce. Маркеры совместимости для wiring-тестов:
// clone_day · clone_alignment · clone_alignment_chart_id · ALIGNMENT_ACTIVE_FOR_ANOTHER_CHART
export { OFFER_CODES, offerCatalog } from './commerce/catalog.js';
export { normalizeAccess, decorateUserAccess, hasCloneAccessForChart } from './commerce/access.js';
export { getCommerceState, resolveOffer } from './commerce/offers.js';
export { initCommerce } from './commerce/schema.js';
export {
  recordPaymentOffer,
  markCommercePaymentStatus,
  applyPaymentEntitlement,
} from './commerce/entitlements.js';

import { resetCommerceState } from './commerce/state.js';
export function _resetCommerceForTests() {
  resetCommerceState();
}
