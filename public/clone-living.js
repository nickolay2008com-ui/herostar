(() => {
  const question = document.querySelector('#question');
  const questionForm = document.querySelector('#questionForm');
  const messages = document.querySelector('#messages');
  const dialogView = document.querySelector('#dialogView');
  const paywall = document.querySelector('#clonePaywall');
  const TELEGRAM_LINK_PARAM = 'telegram_link';

  function resizeComposer() {
    if (!question) return;
    question.style.height = 'auto';
    question.style.height = `${Math.min(Math.max(question.scrollHeight, 70), 180)}px`;
  }

  function focusCurrentAction() {
    if (!dialogView || dialogView.classList.contains('hidden')) return;
    window.setTimeout(() => question?.focus({ preventScroll: true }), 180);
  }

  function currentChartId() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('chart');
    if (fromUrl) return fromUrl;
    try {
      return JSON.parse(localStorage.getItem('starClone') || 'null')?.chartId || null;
    } catch {
      return null;
    }
  }

  async function telegramLinkRequest(path, body) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось подключить Telegram.');
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
    if (!slot || slot.dataset.nativeTelegramReady === 'true') return;
    slot.dataset.nativeTelegramReady = 'true';
    slot.innerHTML = '';
    slot.classList.add('telegram-connect-card');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'telegram-connect-button';
    button.innerHTML = '<span class="telegram-connect-icon">✈</span><span><strong>Подключить Telegram</strong><small>Сохранить клона и продолжить без лимита</small></span>';

    const status = document.createElement('p');
    status.className = 'telegram-connect-status';
    status.textContent = 'Откроется бот. Нажмите «Начать» — возвращаться вручную не обязательно.';
    slot.append(button, status);

    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = 'Создаём безопасную ссылку входа…';
      const telegramWindow = window.open('about:blank', 'herostarTelegramLogin');
      try {
        const link = await telegramLinkRequest('/api/auth/telegram-link', { chartId: currentChartId() });
        if (telegramWindow) telegramWindow.location.href = link.telegramUrl;
        else location.href = link.telegramUrl;
        status.textContent = 'В Telegram нажмите «Начать». Эта страница продолжит вход автоматически.';
        await finishTelegramLink(link.token, status);
      } catch (error) {
        telegramWindow?.close();
        status.textContent = error.message;
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
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        enhanceTelegramSlots(messages);
        messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
      });
    });
    observer.observe(messages, { childList: true, subtree: true, characterData: true });
  }

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
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

  enhanceTelegramSlots();
  void resumeTelegramLinkFromUrl();
  resizeComposer();
})();
