export const commerceState = {
  pool: null,
  memoryAccess: new Map(),
  memoryChartAccess: new Map(),
  memoryPayments: new Map(),
};

export function resetCommerceState() {
  commerceState.pool = null;
  commerceState.memoryAccess.clear();
  commerceState.memoryChartAccess.clear();
  commerceState.memoryPayments.clear();
}
