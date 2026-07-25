(() => {
  'use strict';

  const PINNED_KEY = 'starClonePinnedInsightsV1';
  const MAX_PINNED = 30;

  const byId = (id) => document.getElementById(id);
  const safeText = (value) => String(value || '').trim();

  function readPinned() {
    try {
      const value = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
      return Array.isArray(value) ? value.slice(0, MAX_PINNED) : [];
    } catch {
      return [];
    }
  }

  function writePinned(items) {
    localStorage.setItem(PINNED_KEY, JSON.stringify(items.slice(0, MAX_PINNED)));
  }

  function textId(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `insight-${(hash >>> 0).toString(36)}`;
  }

  function copyText(text, successMessage = 'Скопировано') {
    const value = safeText(text);
    if (!value) return;

    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    };

    const operation = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(value).catch(fallback)
      : Promise.resolve(fallback());

    Promise.resolve(operation).finally(() => {
      if (typeof window.ym === 'function') {
        try { window.ym(110937602, 'reachGoal', 'clone_dialog_copy'); } catch { /* no-op */ }
      }
      showLocalToast(successMessage);
    });
  }

  function showLocalToast(text) {
    const toast = byId('cloneToast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showLocalToast.timer);
    showLocalToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function createButton({ id, className, text, title, pressed }) {
    const button = document.createElement('button');
    button.type = 'button';
    if (id) button.id = id;
    button.className = className;
    button.innerHTML = text;
    if (title) button.title = title;
    if (typeof pressed === 'boolean') button.setAttribute('aria-pressed', String(pressed));
    return button;
  }

  function init() {
    const dialogView = byId('dialogView');
    const conversation = dialogView?.querySelector('.conversation');
    const head = conversation?.querySelector('.conversation-head');
    const messages = byId('messages');
    const composer = byId('questionForm');
    const textarea = byId('question');

    if (!dialogView || !conversation || !head || !messages || !composer || !textarea) return;

    let pinned = readPinned();

    const toolbar = document.createElement('div');
    toolbar.className = 'dialog-toolbar';
    toolbar.setAttribute('aria-label', 'Инструменты диалога');
    toolbar.innerHTML = `
      <div class="dialog-presence" title="История диалога сохраняется на этом устройстве">
        <span class="dialog-presence-dot" aria-hidden="true"></span>
        <span>Диалог сохраняется на этом устройстве</span>
      </div>
      <div class="dialog-toolbar-actions"></div>
    `;

    const toolbarActions = toolbar.querySelector('.dialog-toolbar-actions');
    const insightsButton = createButton({
      id: 'cloneInsightsToggle',
      className: 'dialog-tool-button',
      title: 'Открыть сохранённые выводы',
      pressed: false,
      text: 'Выводы <span class="insights-count" id="cloneInsightsCount">0</span>',
    });
    const focusButton = createButton({
      id: 'cloneFocusToggle',
      className: 'dialog-tool-button',
      title: 'Скрыть всё лишнее и оставить диалог',
      pressed: false,
      text: '<span aria-hidden="true">⛶</span> <span class="tool-label-focus">Фокус</span>',
    });
    toolbarActions.append(insightsButton, focusButton);
    head.insertAdjacentElement('afterend', toolbar);

    const shortcut = document.createElement('span');
    shortcut.className = 'composer-shortcut';
    shortcut.textContent = 'Enter — отправить · Shift+Enter — новая строка';
    composer.insertAdjacentElement('afterend', shortcut);

    const latestButton = createButton({
      id: 'cloneScrollLatest',
      className: 'scroll-to-latest',
      title: 'К последнему сообщению',
      text: '↓',
    });
    latestButton.setAttribute('aria-label', 'Прокрутить к последнему сообщению');
    conversation.append(latestButton);

    const drawer = document.createElement('section');
    drawer.className = 'insights-drawer';
    drawer.id = 'cloneInsightsDrawer';
    drawer.setAttribute('aria-label', 'Сохранённые выводы');
    drawer.innerHTML = `
      <header class="insights-head">
        <div>
          <p class="eyebrow">Личная карта решений</p>
          <h3>Сохранённые выводы</h3>
          <p>Закрепляйте сильные ответы, чтобы не искать их в истории.</p>
        </div>
        <button class="insights-close" type="button" aria-label="Закрыть">×</button>
      </header>
      <div class="insights-list" id="cloneInsightsList"></div>
      <footer class="insights-footer">
        <button class="insights-action" id="cloneCopyInsights" type="button">Скопировать всё</button>
        <button class="insights-action" id="cloneClearInsights" type="button">Очистить</button>
      </footer>
    `;
    document.body.append(drawer);

    const count = byId('cloneInsightsCount');
    const list = byId('cloneInsightsList');
    const closeDrawerButton = drawer.querySelector('.insights-close');

    function isPinned(text) {
      const id = textId(text);
      return pinned.some((item) => item.id === id);
    }

    function syncMessageButtons() {
      messages.querySelectorAll('.message.clone').forEach((message) => {
        const text = safeText(message.querySelector('p')?.textContent);
        const pinButton = message.querySelector('[data-message-pin]');
        if (!pinButton || !text) return;
        const active = isPinned(text);
        pinButton.classList.toggle('is-pinned', active);
        pinButton.textContent = active ? 'Закреплено' : 'Закрепить';
        pinButton.setAttribute('aria-pressed', String(active));
      });
    }

    function renderPinned() {
      count.textContent = String(pinned.length);
      insightsButton.setAttribute('aria-label', `Сохранённые выводы: ${pinned.length}`);
      list.innerHTML = '';

      if (!pinned.length) {
        const empty = document.createElement('div');
        empty.className = 'insights-empty';
        empty.textContent = 'Здесь появятся ответы, которые вы отметите кнопкой «Закрепить».';
        list.append(empty);
      } else {
        pinned.forEach((item) => {
          const card = document.createElement('article');
          card.className = 'insight-card';
          const paragraph = document.createElement('p');
          paragraph.textContent = item.text;
          const footer = document.createElement('footer');
          const date = document.createElement('span');
          date.textContent = new Date(item.createdAt).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
          const remove = createButton({
            className: 'insight-remove',
            text: 'Удалить',
            title: 'Удалить вывод',
          });
          remove.addEventListener('click', () => {
            pinned = pinned.filter((entry) => entry.id !== item.id);
            writePinned(pinned);
            renderPinned();
            syncMessageButtons();
          });
          footer.append(date, remove);
          card.append(paragraph, footer);
          list.append(card);
        });
      }

      syncMessageButtons();
    }

    function togglePinned(text) {
      const clean = safeText(text);
      if (!clean) return;
      const id = textId(clean);
      const existing = pinned.findIndex((item) => item.id === id);
      if (existing >= 0) {
        pinned.splice(existing, 1);
        showLocalToast('Вывод удалён');
      } else {
        pinned.unshift({ id, text: clean, createdAt: new Date().toISOString() });
        pinned = pinned.slice(0, MAX_PINNED);
        showLocalToast('Ответ сохранён в выводы');
        if (typeof window.ym === 'function') {
          try { window.ym(110937602, 'reachGoal', 'clone_dialog_pin'); } catch { /* no-op */ }
        }
      }
      writePinned(pinned);
      renderPinned();
    }

    function enhanceMessage(message) {
      if (!(message instanceof HTMLElement) || !message.matches('.message.clone')) return;
      const bubble = message.querySelector(':scope > div');
      const paragraph = bubble?.querySelector('p');
      const text = safeText(paragraph?.textContent);
      if (!bubble || !paragraph || !text || bubble.querySelector('.message-actions')) return;
      if (/сопоставляет ситуацию|размышляет|^я готов\./i.test(text)) return;

      const actions = document.createElement('div');
      actions.className = 'message-actions';
      const pin = createButton({
        className: 'message-action',
        text: isPinned(text) ? 'Закреплено' : 'Закрепить',
        title: 'Сохранить ответ в личную карту решений',
        pressed: isPinned(text),
      });
      pin.dataset.messagePin = 'true';
      pin.classList.toggle('is-pinned', isPinned(text));
      pin.addEventListener('click', () => togglePinned(paragraph.textContent));

      const copy = createButton({
        className: 'message-action',
        text: 'Копировать',
        title: 'Скопировать ответ',
      });
      copy.addEventListener('click', () => copyText(paragraph.textContent, 'Ответ скопирован'));
      actions.append(pin, copy);
      bubble.append(actions);
    }

    function enhanceAllMessages() {
      messages.querySelectorAll('.message.clone').forEach(enhanceMessage);
    }

    function openDrawer(force) {
      const next = typeof force === 'boolean' ? force : !drawer.classList.contains('is-open');
      drawer.classList.toggle('is-open', next);
      insightsButton.setAttribute('aria-pressed', String(next));
      if (next) renderPinned();
    }

    function setFocus(force) {
      const next = typeof force === 'boolean'
        ? force
        : !document.body.classList.contains('clone-focus-mode');
      document.body.classList.toggle('clone-focus-mode', next);
      focusButton.setAttribute('aria-pressed', String(next));
      focusButton.title = next ? 'Вернуть панель карты' : 'Скрыть всё лишнее и оставить диалог';
    }

    function resizeTextarea() {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 170)}px`;
    }

    function updateLatestButton() {
      const distance = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
      latestButton.classList.toggle('is-visible', distance > 120);
    }

    insightsButton.addEventListener('click', () => openDrawer());
    closeDrawerButton.addEventListener('click', () => openDrawer(false));
    focusButton.addEventListener('click', () => setFocus());
    document.querySelector('[data-tab="profile"]')?.addEventListener('click', () => setFocus(false));
    latestButton.addEventListener('click', () => messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' }));

    byId('cloneCopyInsights')?.addEventListener('click', () => {
      if (!pinned.length) {
        showLocalToast('Пока нечего копировать');
        return;
      }
      copyText(pinned.map((item, index) => `${index + 1}. ${item.text}`).join('\n\n'), 'Все выводы скопированы');
    });

    byId('cloneClearInsights')?.addEventListener('click', () => {
      if (!pinned.length) return;
      pinned = [];
      writePinned(pinned);
      renderPinned();
      showLocalToast('Выводы очищены');
    });

    textarea.addEventListener('input', resizeTextarea);
    textarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      if (!textarea.disabled && safeText(textarea.value)) composer.requestSubmit();
    });

    messages.addEventListener('scroll', updateLatestButton, { passive: true });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const parentMessage = mutation.target instanceof Node
          ? mutation.target.parentElement?.closest?.('.message.clone')
          : null;
        if (parentMessage) enhanceMessage(parentMessage);

        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches('.message.clone')) enhanceMessage(node);
            node.querySelectorAll?.('.message.clone').forEach(enhanceMessage);
          }
        });
      });
      updateLatestButton();
    });
    observer.observe(messages, { childList: true, subtree: true, characterData: true });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drawer.classList.contains('is-open')) {
        openDrawer(false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        setFocus();
      }
    });

    document.addEventListener('click', (event) => {
      if (!drawer.classList.contains('is-open')) return;
      if (drawer.contains(event.target) || insightsButton.contains(event.target)) return;
      openDrawer(false);
    });

    enhanceAllMessages();
    renderPinned();
    resizeTextarea();
    updateLatestButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
