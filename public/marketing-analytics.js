const HERO_STAR_COUNTER_ID = 110937602;
const ATTRIBUTION_KEY = 'herostar_first_touch';
const GOALS = new Set([
  'landing_to_bot',
  'bot_started',
  'free_key_received',
  'bridge_received',
  'paywall_viewed',
  'payment_started',
  'purchase_success',
]);

function readAttribution() {
  const params = new URLSearchParams(location.search);
  const current = Object.fromEntries(
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']
      .map((key) => [key, params.get(key)])
      .filter(([, value]) => value),
  );
  if (Object.keys(current).length) {
    try { localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current)); } catch {}
    return current;
  }
  try { return JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}'); } catch { return {}; }
}

const attribution = readAttribution();

export function reachHeroStarGoal(goal, params = {}) {
  if (!GOALS.has(goal) || typeof window.ym !== 'function') return;
  window.ym(HERO_STAR_COUNTER_ID, 'reachGoal', goal, { ...attribution, ...params });
}

window.herostarReachGoal = reachHeroStarGoal;

const previousFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const response = await previousFetch(input, init);
  try {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin === location.origin && method === 'POST' && response.ok) {
      if (url.pathname === '/api/charts') {
        let request = {};
        try { request = JSON.parse(String(init.body || '{}')); } catch {}
        if (!request.demo) reachHeroStarGoal('free_key_received');
      }
      if (url.pathname === '/api/payments/create') {
        reachHeroStarGoal('payment_started', { order_price: 990, currency: 'RUB' });
      }
    }
  } catch {
    // Аналитика никогда не мешает основному запросу.
  }
  return response;
};

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('auth') === 'ok') reachHeroStarGoal('bot_started');

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.matches('#loginButton')) reachHeroStarGoal('landing_to_bot');
    if (target.matches('[data-open-deep]')) reachHeroStarGoal('bridge_received');
    if (target.matches('[data-open-pay]')) reachHeroStarGoal('paywall_viewed');
  });
});

window.addEventListener('herostar:purchase-success', (event) => {
  reachHeroStarGoal('purchase_success', {
    order_price: Number(event.detail?.price || 990),
    currency: event.detail?.currency || 'RUB',
  });
});
