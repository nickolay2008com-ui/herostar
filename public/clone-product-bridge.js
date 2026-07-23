(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const clonePaths = new Set(['/api/charts', '/api/consult', '/api/payments/create']);
      const isCloneAction = url.origin === location.origin
        && method === 'POST'
        && clonePaths.has(url.pathname);

      if (isCloneAction && typeof init.body === 'string') {
        const payload = JSON.parse(init.body || '{}');
        init = { ...init, body: JSON.stringify({ ...payload, product: 'clone' }) };
      }

      if (url.origin === location.origin && method === 'POST' && url.pathname === '/api/events' && typeof init.body === 'string') {
        const payload = JSON.parse(init.body || '{}');
        if (payload.eventType === 'payment_created' && payload.metadata?.action === 'clone_payment_started') {
          init = {
            ...init,
            body: JSON.stringify({
              ...payload,
              eventType: 'paywall_opened',
              metadata: { ...payload.metadata, stage: 'payment_started' },
            }),
          };
        }
      }
    } catch {
      // Маркировка продукта и аналитики не должна ломать основной запрос.
    }
    return nativeFetch(input, init);
  };
})();
