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

  window.addEventListener('pageshow', () => {
    updateViewportHeight();
    if (isDialogOpen()) scrollToLatest({ force: true });
  });

  updateViewportHeight();
  syncDialogMode();
})();

/* Payment readiness UX: never leave a user with a silent disabled button. */
(() => {
  const button = document.getElementById('clonePayButton');
  const hint = document.getElementById('cloneReceiptHint');
  const toast = document.getElementById('cloneToast');
  if (!button) return;

  const publicUnavailableMessage = 'Оплата временно недоступна. Попробуйте позже или напишите в Telegram @ainicki.';
  let unavailable = false;
  let unavailableMessage = publicUnavailableMessage;

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
    unavailableMessage = publicUnavailableMessage;
    const issues = Array.isArray(config?.paymentConfigurationIssues)
      ? config.paymentConfigurationIssues
      : [];

    if (issues.length) {
      console.warn('HeroStar payment configuration is incomplete:', issues);
    }

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

  window.addEventListener('online', syncPaymentReadiness);
  window.addEventListener('pageshow', syncPaymentReadiness);
  queueMicrotask(syncPaymentReadiness);
  setTimeout(syncPaymentReadiness, 500);
})();
