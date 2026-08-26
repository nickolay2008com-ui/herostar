(() => {
  const PENDING_KEY = 'starClonePendingQuestion';
  const RETURN_KEY = 'starCloneReturnPath';
  const params = new URLSearchParams(location.search);
  const authReturned = params.get('auth') === 'ok';
  const paymentReturned = params.get('payment') === 'return';
  const liveInterface = location.pathname.startsWith('/clone/live');
  const currentPagePath = /^\/clone\/live\/chat\/?$/.test(location.pathname)
    ? '/clone/live/chat'
    : /^\/clone\/live\/?$/.test(location.pathname)
      ? '/clone/live/'
      : '/clone/';
  const currentInterfacePath = liveInterface ? '/clone/live/chat' : '/clone/';
  const storedReturnPath = String(localStorage.getItem(RETURN_KEY) || '').trim();
  const requestedReturnPath = storedReturnPath.startsWith('/clone/live')
    ? '/clone/live/chat'
    : storedReturnPath;

  if (liveInterface) {
    const appStyle = document.createElement('link');
    appStyle.rel = 'stylesheet';
    appStyle.href = '/clone/live/live-app.css?v=20260826-app2';
    document.head.append(appStyle);

    const appScript = document.createElement('script');
    appScript.src = '/clone/live/live-app.js?v=20260826-app2';
    appScript.async = false;
    document.head.append(appScript);
  }

  if ((authReturned || paymentReturned) && requestedReturnPath && requestedReturnPath !== currentPagePath) {
    const target = new URL(requestedReturnPath, location.origin);
    params.forEach((value, key) => target.searchParams.set(key, value));
    location.replace(target.toString());
    return;
  }

  localStorage.setItem(RETURN_KEY, currentInterfacePath);

  const nativeReplaceState = history.replaceState.bind(history);
  history.replaceState = (state, unused, url) => {
    if (url && currentInterfacePath === '/clone/live/chat') {
      try {
        const target = new URL(url, location.href);
        if (target.origin === location.origin && target.pathname === '/clone/') {
          target.pathname = currentInterfacePath;
          return nativeReplaceState(state, unused, `${target.pathname}${target.search}${target.hash}`);
        }
      } catch {
        // Не вмешиваемся, если браузер не смог разобрать переданный URL.
      }
    }
    return nativeReplaceState(state, unused, url);
  };

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

  function installUnknownTimeControl() {
    const form = document.querySelector('#birthForm');
    const timeInput = form?.querySelector('input[name="time"]');
    const grid = timeInput?.closest('.grid');
    if (!form || !timeInput || !grid) return null;
    const existingControl = form.querySelector('#unknownTime');
    if (existingControl) return existingControl;

    timeInput.id = 'birthTime';
    const label = document.createElement('label');
    label.className = 'consent-check unknown-time-check';
    label.innerHTML = '<input id="unknownTime" name="unknownTime" type="checkbox"><span><strong>Время рождения неизвестно</strong><br>Карта будет построена без домов, ASC/DSC и MC/IC — без выдуманной точности.</span>';
    grid.insertAdjacentElement('afterend', label);

    const checkbox = label.querySelector('#unknownTime');
    const sync = () => {
      const unknown = checkbox.checked;
      timeInput.disabled = unknown;
      timeInput.required = !unknown;
      timeInput.setAttribute('aria-disabled', String(unknown));
      if (unknown) timeInput.value = '';
    };
    checkbox.addEventListener('change', sync);
    sync();

    const sideNote = document.querySelector('.side-note p');
    if (sideNote) sideNote.textContent = 'При известном времени карта рассчитывается по Плацидусу. Без времени Клон честно работает без домов и осей.';
    const technical = document.querySelector('#logicPanel details p');
    if (technical) technical.textContent = 'Планеты, знаки, стихии, аспекты и ретроградность рассчитываются всегда. Дома, ASC/DSC и MC/IC — только при известном времени рождения.';
    return checkbox;
  }

  const unknownTime = installUnknownTimeControl();

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'questionForm') savePendingQuestion(document.querySelector('#question')?.value);
    if (event.target?.id === 'birthForm' && unknownTime?.checked) {
      const step = document.querySelector('#buildStep');
      if (step) step.textContent = 'Рассчитываем карту без домов и осей…';
    }
  }, true);

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    let nextInit = init;
    let url = null;
    let method = 'GET';
    try {
      url = new URL(input instanceof Request ? input.url : String(input), location.href);
      method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin === location.origin && url.pathname === '/api/charts' && method === 'POST' && typeof init.body === 'string') {
        const payload = JSON.parse(init.body);
        if (payload?.product === 'clone') {
          payload.unknownTime = Boolean(unknownTime?.checked);
          payload.time = payload.unknownTime ? '' : String(payload.time || '');
          nextInit = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch {
      // Интерфейсный помощник не должен мешать исходному запросу.
    }
    const response = await previousFetch(input, nextInit);
    if (url?.origin === location.origin && url.pathname === '/api/consult' && method === 'POST' && response.ok) {
      clearPendingQuestion();
    }
    return response;
  };

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
