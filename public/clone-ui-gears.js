(() => {
  const PENDING_KEY = 'starClonePendingQuestion';
  const LIVE_RETURN_KEY = 'starCloneLiveReturn';
  const LIVE_STATE_KEY = 'starCloneLive';
  const params = new URLSearchParams(location.search);
  const authReturned = params.get('auth') === 'ok';

  const liveReturn = localStorage.getItem(LIVE_RETURN_KEY);
  let liveChartId = '';
  try {
    liveChartId = String(JSON.parse(localStorage.getItem(LIVE_STATE_KEY) || '{}').chartId || '');
  } catch {
    liveChartId = '';
  }
  const returnedChartId = String(params.get('chart') || '');
  const belongsToLiveDialogue = Boolean(liveReturn && liveChartId && returnedChartId === liveChartId);
  if (params.get('payment') === 'return' && belongsToLiveDialogue) {
    localStorage.removeItem(LIVE_RETURN_KEY);
    const target = new URL(liveReturn, location.origin);
    for (const [key, value] of params.entries()) target.searchParams.set(key, value);
    location.replace(target.toString());
    return;
  }

  function pendingQuestion() {
    return String(localStorage.getItem(PENDING_KEY) || '').trim();
  }

  function savePendingQuestion(value) {
    const question = String(value || '').trim();
    if (question) localStorage.setItem(PENDING_KEY, question);
  }

  function clearPendingQuestion() {
    localStorage.removeItem(PENDING_KEY);
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'questionForm') return;
    savePendingQuestion(document.querySelector('#question')?.value);
  }, true);

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const response = await previousFetch(input, init);
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin === location.origin && url.pathname === '/api/consult' && method === 'POST' && response.ok) {
        clearPendingQuestion();
      }
    } catch {
      // Восстановление текста не должно влиять на сетевой запрос.
    }
    return response;
  };

  function activateTab(name) {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === name);
    });
    const target = name === 'profile' ? document.querySelector('.logic') : document.querySelector('.conversation');
    if (name === 'profile') {
      const details = target?.querySelector('details');
      if (details) details.open = true;
    }
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  const savedQuestion = pendingQuestion();
  if (savedQuestion) {
    const timer = setInterval(() => {
      const dialog = document.querySelector('#dialogView');
      const textarea = document.querySelector('#question');
      const form = document.querySelector('#questionForm');
      if (!dialog || dialog.classList.contains('hidden') || !textarea || !form) return;

      if (!textarea.value.trim()) textarea.value = savedQuestion;
      if (authReturned && !window.opener && !textarea.disabled) {
        clearInterval(timer);
        form.requestSubmit();
        return;
      }
      clearInterval(timer);
    }, 300);
    setTimeout(() => clearInterval(timer), 30000);
  }

  if (authReturned && window.opener && window.opener !== window) {
    setTimeout(() => window.close(), 400);
  }
})();
