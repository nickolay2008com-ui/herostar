(() => {
  const root = document.documentElement;
  const body = document.body;
  const dialog = document.getElementById('dialogView');
  const messages = document.getElementById('messages');
  const question = document.getElementById('question');

  if (!dialog || !messages) return;

  let pinnedToBottom = true;

  const isDialogOpen = () => !dialog.classList.contains('hidden');
  const isNearBottom = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 96;

  const updateViewportHeight = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    root.style.setProperty('--clone-viewport-height', `${Math.round(height)}px`);
  };

  const scrollToLatest = ({ force = false } = {}) => {
    if (!isDialogOpen() || (!force && !pinnedToBottom)) return;
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
      pinnedToBottom = true;
    });
  };

  const syncDialogMode = () => {
    const open = isDialogOpen();
    root.classList.toggle('clone-dialog-open', open);
    body.classList.toggle('clone-dialog-open', open);
    updateViewportHeight();
    if (open) scrollToLatest({ force: true });
  };

  messages.addEventListener('scroll', () => {
    pinnedToBottom = isNearBottom();
  }, { passive: true });

  new MutationObserver(syncDialogMode).observe(dialog, {
    attributes: true,
    attributeFilter: ['class'],
  });

  new MutationObserver(() => scrollToLatest()).observe(messages, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('resize', () => {
    updateViewportHeight();
    scrollToLatest({ force: document.activeElement === question });
  }, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewportHeight, { passive: true });

  question?.addEventListener('focus', () => {
    setTimeout(() => scrollToLatest({ force: true }), 120);
  });

  updateViewportHeight();
  syncDialogMode();
})();

/* Payment readiness UX: never leave the owner with a silent disabled button. */
(() => {
  const button = document.getElementById('clonePayButton');
  const hint = document.getElementById('cloneReceiptHint');
  const toast = document.getElementById('cloneToast');
  if (!button) return;

  const issueLabels = {
    YOOKASSA_SHOP_ID: 'YOOKASSA_SHOP_ID',
    YOOKASSA_SECRET_KEY: 'YOOKASSA_SECRET_KEY',
    LEGAL_DETAILS: 'LEGAL_FULL_NAME и LEGAL_OGRNIP',
    DATABASE_URL: 'DATABASE_URL',
    SESSION_SECRET: 'SESSION_SECRET не короче 32 символов',
    TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
    APP_URL_HTTPS: 'APP_URL или Railway public domain с HTTPS',
  };

  let unavailable = false;
  let unavailableMessage = 'Оплата временно не готова. Проверьте настройки Railway.';

  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 5200);
  };

  const keepButtonClickable = () => {
    if (unavailable && button.disabled) button.disabled = false;
  };

  new MutationObserver(keepButtonClickable).observe(button, {
    attributes: true,
    attributeFilter: ['disabled'],
  });

  const applyUnavailableState = (config) => {
    unavailable = true;
    const issues = Array.isArray(config?.paymentConfigurationIssues)
      ? config.paymentConfigurationIssues
      : [];
    unavailableMessage = issues.length
      ? `Для оплаты не хватает: ${issues.map((item) => issueLabels[item] || item).join(', ')}.`
      : 'Оплата временно не готова. Владелец сервиса уже может проверить обязательные настройки Railway.';

    button.disabled = false;
    button.dataset.paymentUnavailable = 'true';
    button.title = unavailableMessage;
    if (hint) {
      hint.textContent = unavailableMessage;
      hint.classList.add('field-error');
    }
  };

  const applyReadyState = () => {
    unavailable = false;
    delete button.dataset.paymentUnavailable;
    button.removeAttribute('title');
    button.disabled = false;
    if (hint?.classList.contains('field-error')) {
      hint.textContent = 'Контакт передаётся ЮKassa только для отправки чека.';
      hint.classList.remove('field-error');
    }
  };

  const syncPaymentReadiness = async () => {
    try {
      const chartId = new URLSearchParams(location.search).get('chart');
      const endpoint = chartId
        ? `/api/config?chartId=${encodeURIComponent(chartId)}`
        : '/api/config';
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return;
      const config = await response.json();
      if (config.paymentsConfigured) applyReadyState();
      else applyUnavailableState(config);
    } catch {
      // Основной код оплаты сам покажет сетевую ошибку; здесь не мешаем.
    }
  };

  button.addEventListener('click', (event) => {
    if (!unavailable) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (hint) {
      hint.textContent = unavailableMessage;
      hint.classList.add('field-error');
    }
    showToast(unavailableMessage);
  }, true);

  queueMicrotask(syncPaymentReadiness);
  setTimeout(syncPaymentReadiness, 500);
})();
