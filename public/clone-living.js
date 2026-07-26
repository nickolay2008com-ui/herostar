(() => {
  const question = document.querySelector('#question');
  const questionForm = document.querySelector('#questionForm');
  const messages = document.querySelector('#messages');
  const dialogView = document.querySelector('#dialogView');
  const paywall = document.querySelector('#clonePaywall');
  const jumpToLatest = document.querySelector('#jumpToLatest');
  const TELEGRAM_LINK_PARAM = 'telegram_link';
  const CHART_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const NEAR_BOTTOM_THRESHOLD = 96;

  function resizeComposer() {
    if (!question) return;
    question.style.height = 'auto';
    question.style.height = `${Math.min(Math.max(question.scrollHeight, 70), 180)}px`;
  }

  function focusCurrentAction() {
    if (!dialogView || dialogView.classList.contains('hidden')) return;
    window.setTimeout(() => question?.focus({ preventScroll: true }), 180);
  }

  function savedClone() {
    try {
      return JSON.parse(localStorage.getItem('starClone') || 'null');
    } catch {
      return null;
    }
  }

  function normalizedChartId(value) {
    const id = String(value || '').trim();
    return CHART_ID_PATTERN.test(id) ? id : null;
  }

  function currentCloneAuth() {
    const params = new URLSearchParams(location.search);
    const saved = savedClone();
    const savedChartId = normalizedChartId(saved?.chartId);
    const chartId = normalizedChartId(params.get('chart')) || savedChartId;
    const chartToken = savedChartId === chartId ? String(saved?.token || '').trim() || null : null;
    return { chartId, chartToken };
  }

  async function telegramLinkRequest(path, body, { chartToken = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (chartToken) headers['x-chart-token'] = chartToken;
    const response = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Не удалось подключить Telegram.');
      error.code = data.code || 'TELEGRAM_LINK_FAILED';
      throw error;
    }
    return data;
  }

  function cleanTelegramLinkFromUrl() {
    const url = new URL(location.href);
    url.searchParams.delete(TELEGRAM_LINK_PARAM);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function finishTelegramLink(token, statusNode, { reload = false } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10 * 60 * 1000) {
      const result = await telegramLinkRequest('/api/auth/telegram-link/status', { token });
      if (result.status === 'authorized') {
        statusNode.textContent = 'Telegram подключён. Возвращаем клона…';
        cleanTelegramLinkFromUrl();
        if (reload) location.reload();
        return true;
      }
      if (result.status === 'expired' || result.status === 'missing' || result.status === 'consumed') {
        throw new Error('Ссылка входа устарела. Нажмите кнопку ещё раз.');
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error('Вход не завершён. Нажмите кнопку ещё раз.');
  }

  function enhanceTelegramSlot(slot) {
    if (!slot) return;
    if (slot.dataset.nativeTelegramReady === 'true' && slot.querySelector('.telegram-connect-button')) return;
    slot.dataset.nativeTelegramReady = 'true';
    slot.innerHTML = '';
    slot.classList.add('telegram-connect-card');
    const restoresExistingClone = slot.dataset.telegramMode === 'restore';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'telegram-connect-button';
    button.innerHTML = restoresExistingClone
      ? '<span class="telegram-connect-icon">✈</span><span><strong>Открыть через Telegram</strong><small>Найти сохранённого Клона</small></span>'
      : '<span class="telegram-connect-icon">✈</span><span><strong>Продолжить бесплатно в Telegram</strong><small>Сохранить Клона и историю</small></span>';

    const status = document.createElement('p');
    status.className = 'telegram-connect-status';
    status.textContent = restoresExistingClone
      ? 'Бот безопасно найдёт Клона, связанного с вашим Telegram.'
      : 'Откроется бот. Нажмите «Начать» — Клон сохранится автоматически.';
    slot.append(button, status);

    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = 'Создаём безопасную ссылку входа…';
      const telegramWindow = window.open('about:blank', 'herostarTelegramLogin');
      try {
        const auth = restoresExistingClone
          ? { chartId: null, chartToken: null }
          : currentCloneAuth();
        const linkPayload = auth.chartId ? { chartId: auth.chartId } : {};
        const link = await telegramLinkRequest(
          '/api/auth/telegram-link',
          linkPayload,
          { chartToken: auth.chartToken },
        );
        if (telegramWindow) telegramWindow.location.href = link.telegramUrl;
        else location.href = link.telegramUrl;
        status.textContent = 'В Telegram нажмите «Начать». Эта страница продолжит вход автоматически.';
        await finishTelegramLink(link.token, status, { reload: !slot.closest('.message') });
      } catch (error) {
        telegramWindow?.close();
        status.textContent = error.code === 'INVALID_CHART_ID'
          ? 'Ссылка на Клона устарела. Обновите страницу и попробуйте ещё раз.'
          : error.message;
        button.disabled = false;
      }
    });
  }

  function enhanceTelegramSlots(root = document) {
    root.querySelectorAll?.('.telegram-login-slot').forEach(enhanceTelegramSlot);
  }

  async function resumeTelegramLinkFromUrl() {
    const token = new URLSearchParams(location.search).get(TELEGRAM_LINK_PARAM);
    if (!token) return;
    const status = document.createElement('div');
    status.className = 'telegram-return-status';
    status.textContent = 'Завершаем вход через Telegram…';
    document.body.append(status);
    try {
      await finishTelegramLink(token, status, { reload: true });
    } catch (error) {
      status.textContent = error.message;
      cleanTelegramLinkFromUrl();
      window.setTimeout(() => status.remove(), 5000);
    }
  }

  if (messages) {
    messages.setAttribute('aria-live', 'polite');
    messages.setAttribute('aria-relevant', 'additions text');
    let pinnedToBottom = true;

    const isNearBottom = () => (
      messages.scrollHeight - messages.scrollTop - messages.clientHeight <= NEAR_BOTTOM_THRESHOLD
    );

    const hideJumpToLatest = () => jumpToLatest?.classList.add('hidden');
    const showJumpToLatest = () => jumpToLatest?.classList.remove('hidden');
    const scrollToLatest = (behavior = 'smooth') => {
      messages.scrollTo({ top: messages.scrollHeight, behavior });
      pinnedToBottom = true;
      hideJumpToLatest();
    };

    messages.addEventListener('scroll', () => {
      pinnedToBottom = isNearBottom();
      if (pinnedToBottom) hideJumpToLatest();
    }, { passive: true });

    jumpToLatest?.addEventListener('click', () => scrollToLatest());

    const observer = new MutationObserver(() => {
      const shouldFollowLatest = pinnedToBottom;
      window.requestAnimationFrame(() => {
        enhanceTelegramSlots(messages);
        if (shouldFollowLatest) {
          scrollToLatest();
        } else {
          showJumpToLatest();
        }
      });
    });
    observer.observe(messages, { childList: true, subtree: true, characterData: true });
  }

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const targetSlot = mutation.target instanceof Element
        ? mutation.target.closest('.telegram-login-slot')
        : null;
      if (targetSlot) enhanceTelegramSlot(targetSlot);
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('.telegram-login-slot')) enhanceTelegramSlot(node);
        enhanceTelegramSlots(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.querySelector('#formError')?.setAttribute('role', 'alert');
  document.querySelector('#dialogError')?.setAttribute('role', 'alert');

  question?.addEventListener('input', resizeComposer);
  question?.addEventListener('keydown', (event) => {
    if (event.isComposing || event.key !== 'Enter' || event.shiftKey) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    event.preventDefault();
    if (!question.disabled && question.value.trim()) questionForm?.requestSubmit();
  });

  questionForm?.addEventListener('submit', () => {
    window.setTimeout(resizeComposer, 0);
  });

  document.querySelectorAll('[data-go-create]').forEach((button) => {
    button.addEventListener('click', () => {
      window.setTimeout(() => document.querySelector('#birthForm input[name="name"]')?.focus(), 420);
    });
  });

  document.querySelector('#newSituation')?.addEventListener('click', focusCurrentAction);
  document.querySelectorAll('.chips button').forEach((button) => {
    button.addEventListener('click', () => window.setTimeout(resizeComposer, 0));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || paywall?.classList.contains('hidden')) return;
    document.querySelector('#closeClonePaywall')?.click();
  });

  if (dialogView) {
    new MutationObserver(() => focusCurrentAction())
      .observe(dialogView, { attributes: true, attributeFilter: ['class'] });
  }

  window.mountCloneTelegramLink = enhanceTelegramSlot;
  enhanceTelegramSlots();
  void resumeTelegramLinkFromUrl();
  resizeComposer();
})();
