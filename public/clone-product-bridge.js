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
    } catch {
      // Маркировка продукта не должна ломать основной запрос.
    }
    return nativeFetch(input, init);
  };
})();
