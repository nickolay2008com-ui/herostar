const VISITOR_KEY = 'herostar_visitor_id';

function createVisitorId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const visitorId = localStorage.getItem(VISITOR_KEY) || createVisitorId();
localStorage.setItem(VISITOR_KEY, visitorId);

const originalFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  try {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('X-Visitor-Id', visitorId);
      return originalFetch(input, { ...init, headers });
    }
  } catch {
    // Не мешаем основному запросу из-за аналитики.
  }
  return originalFetch(input, init);
};

function currentChartId() {
  return localStorage.getItem('herostar_chart_id') || null;
}

function track(eventType, metadata = null, chartId = currentChartId()) {
  const body = JSON.stringify({ eventType, metadata, chartId, visitorId });
  originalFetch('/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Visitor-Id': visitorId,
    },
    body,
    keepalive: true,
  }).catch(() => {});
}

function textOf(element) {
  return String(element?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

document.addEventListener('DOMContentLoaded', () => {
  track('page_view', {
    path: location.pathname,
    referrer: document.referrer || null,
    query: location.search || null,
  }, null);

  const birthForm = document.querySelector('#birthForm');
  if (birthForm) {
    birthForm.addEventListener('input', () => {
      track('form_started', { field: document.activeElement?.name || null }, null);
    }, { once: true });
  }

  document.querySelector('#demoButton')?.addEventListener('click', () => {
    track('demo_opened', null, null);
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a');
    if (!target) return;

    const card = target.closest('.treasure-card');
    if (target.matches('.card-trigger') && card) {
      track('card_opened', {
        cardId: card.dataset.treasureId || null,
        title: textOf(card.querySelector('.card-title strong')),
        locked: card.classList.contains('locked-card'),
      });
      return;
    }

    if (target.matches('#modeTabs button[data-category]')) {
      track('filter_changed', {
        category: target.dataset.category,
        label: textOf(target),
      });
      return;
    }

    if (target.matches('[data-open-pay], #payButton')) {
      track('paywall_opened', { source: target.id || target.dataset.openPay || 'card' });
      return;
    }

    if (target.matches('#loginButton')) {
      track('auth_opened', { source: 'header' });
      return;
    }

    if (target.matches('#consultFab')) {
      track('consultant_opened');
      return;
    }

    if (target.matches('#shareButton')) {
      track('share_clicked');
      return;
    }

    if (target.matches('#newMapButton')) {
      track('new_chart_clicked');
    }
  });
});
