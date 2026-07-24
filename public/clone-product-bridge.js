(() => {
  const nativeFetch = window.fetch.bind(window);
  const clonePaths = new Set(['/api/charts', '/api/consult', '/api/payments/create']);

  function visitorId() {
    let id = localStorage.getItem('herostar_visitor_id');
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem('herostar_visitor_id', id);
    }
    return id;
  }

  window.fetch = async (input, init = {}) => {
    try {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input), location.href);
      const method = String(init.method || request?.method || 'GET').toUpperCase();
      const isCloneAction = url.origin === location.origin
        && method === 'POST'
        && clonePaths.has(url.pathname);

      if (isCloneAction) {
        const id = visitorId();
        const headers = new Headers(request?.headers || {});
        new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
        headers.set('x-visitor-id', id);

        let body = init.body;
        if (typeof body === 'string') {
          const payload = JSON.parse(body || '{}');
          body = JSON.stringify({ ...payload, product: 'clone', visitorId: id });
        }

        init = { ...init, headers, body };
      }
    } catch {
      // Страховочная маркировка и атрибуция не должны ломать основной запрос.
    }
    return nativeFetch(input, init);
  };
})();