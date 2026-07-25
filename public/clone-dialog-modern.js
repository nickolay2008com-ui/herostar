(() => {
  'use strict';

  const PINNED_KEY = 'starClonePinnedInsightsV1';
  const MAX_PINNED = 30;
  const MAX_VISIBLE_REASONS = 2;

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

  function paragraphsFrom(text) {
    const clean = safeText(text);
    if (!clean) return [];
    const paragraphs = clean
      .split(/\n\s*\n+/)
      .map((item) => item.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean);
    return paragraphs.length ? paragraphs : [clean];
  }

  function summaryFrom(text, limit = 330) {
    const first = paragraphsFrom(text)[0] || safeText(text);
    return first.length > limit ? `${first.slice(0, limit).trim()}…` : first;
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
        try { window.ym(110937602, 'reachGoal', 'clone_dialog_copy'); } catch { /* analytics cannot break UI */ }
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

  function createButton({ id, className, text, title, pressed, ariaLabel }) {
    const button = document.createElement('button');
    button.type = 'button';
    if (id) button.id = id;
    button.className = className;
    button.innerHTML = text;
    if (title) button.title = title;
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
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
    const logicPanel = byId('logicPanel');
    const cloneNameSource = byId('cloneName');
    const cloneStatusSource = byId('cloneStatus');
    const allowance = byId('questionAllowance');
    const newSituation = byId('newSituation');

    if (!dialogView || !conversation || !head || !messages || !composer || !textarea || !logicPanel) return;

    document.body.classList.add('clone-dialog-candy');
    let pinned = readPinned();

    const legacyHead = head.querySelector(':scope > div:first-child');
    if (legacyHead) legacyHead.classList.add('dialog-head-legacy');

    const identity = document.createElement('div');
    identity.className = 'dialog-identity';
    identity.innerHTML = `
      <span class="dialog-identity-avatar" aria-hidden="true">✦</span>
      <span class="dialog-identity-copy">
        <span class="dialog-identity-kicker">Звёздный клон</span>
        <strong class="dialog-identity-name">Ваш клон</strong>
        <span class="dialog-identity-meta"><span class="dialog-identity-status">модель готова</span></span>
      </span>
    `;

    const identityName = identity.querySelector('.dialog-identity-name');
    const identityStatus = identity.querySelector('.dialog-identity-status');
    const identityMeta = identity.querySelector('.dialog-identity-meta');
    if (allowance) identityMeta.append(allowance);

    const actions = document.createElement('div');
    actions.className = 'dialog-head-actions';

    const mapButton = createButton({
      id: 'cloneMapToggle',
      className: 'dialog-head-button',
      title: 'Показать, какие элементы карты сформировали решение',
      ariaLabel: 'Открыть объяснение по карте',
      pressed: false,
      text: '<span class="dialog-button-icon" aria-hidden="true">✦</span><span class="button-label">Почему так</span>',
    });

    const insightsButton = createButton({
      id: 'cloneInsightsToggle',
      className: 'dialog-head-button',
      title: 'Открыть сохранённые решения',
      ariaLabel: 'Открыть сохранённые решения',
      pressed: false,
      text: '<span class="dialog-button-icon" aria-hidden="true">◇</span><span class="button-label">Сохранённое</span><span class="insights-count" id="cloneInsightsCount">0</span>',
    });

    if (newSituation) {
      newSituation.classList.add('dialog-new-situation');
      newSituation.innerHTML = '<span aria-hidden="true">＋</span><span class="button-label">Новая ситуация</span>';
      actions.append(newSituation);
    }
    actions.append(mapButton, insightsButton);

    head.innerHTML = '';
    head.append(identity, actions);

    const latestButton = createButton({
      id: 'cloneScrollLatest',
      className: 'scroll-to-latest',
      title: 'К последнему сообщению',
      ariaLabel: 'Прокрутить к последнему сообщению',
      text: '↓',
    });
    conversation.append(latestButton);

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'clone-workspace-backdrop';
    backdrop.setAttribute('aria-label', 'Закрыть дополнительную панель');
    document.body.append(backdrop);

    const logicHead = document.createElement('header');
    logicHead.className = 'logic-drawer-head';
    logicHead.innerHTML = `
      <div><strong>Почему клон выбрал это</strong><small>Факторы карты для текущего решения</small></div>
      <button class="logic-drawer-close" type="button" aria-label="Закрыть">×</button>
    `;
    logicPanel.prepend(logicHead);

    const drawer = document.createElement('section');
    drawer.className = 'insights-drawer';
    drawer.id = 'cloneInsightsDrawer';
    drawer.setAttribute('aria-label', 'Сохранённые решения');
    drawer.innerHTML = `
      <header class="insights-head">
        <div>
          <p class="eyebrow">Личная карта решений</p>
          <h3>Сохранённое</h3>
          <p>Здесь остаются сильные ходы, к которым стоит вернуться.</p>
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
    const closeLogicButton = logicHead.querySelector('.logic-drawer-close');

    function syncIdentity() {
      const name = safeText(cloneNameSource?.textContent) || 'Ваш звёздный клон';
      const status = safeText(cloneStatusSource?.textContent) || 'модель готова';
      identityName.textContent = name;
      identityStatus.textContent = status;
    }

    function panelIsOpen() {
      return document.body.classList.contains('clone-map-open') || drawer.classList.contains('is-open');
    }

    function syncBackdrop() {
      document.body.classList.toggle('clone-insights-open', drawer.classList.contains('is-open'));
      backdrop.tabIndex = panelIsOpen() ? 0 : -1;
    }

    function closePanels() {
      document.body.classList.remove('clone-map-open');
      drawer.classList.remove('is-open');
      mapButton.setAttribute('aria-pressed', 'false');
      insightsButton.setAttribute('aria-pressed', 'false');
      syncBackdrop();
    }

    function openMap(force) {
      const next = typeof force === 'boolean'
        ? force
        : !document.body.classList.contains('clone-map-open');
      drawer.classList.remove('is-open');
      insightsButton.setAttribute('aria-pressed', 'false');
      document.body.classList.toggle('clone-map-open', next);
      mapButton.setAttribute('aria-pressed', String(next));
      syncBackdrop();
    }

    function openDrawer(force) {
      const next = typeof force === 'boolean' ? force : !drawer.classList.contains('is-open');
      document.body.classList.remove('clone-map-open');
      mapButton.setAttribute('aria-pressed', 'false');
      drawer.classList.toggle('is-open', next);
      insightsButton.setAttribute('aria-pressed', String(next));
      if (next) renderPinned();
      syncBackdrop();
    }

    function isPinned(text) {
      const id = textId(text);
      return pinned.some((item) => item.id === id);
    }

    function originalMessageText(message) {
      return safeText(message?.dataset?.originalText || message?.querySelector('p')?.textContent);
    }

    function syncMessageButtons() {
      messages.querySelectorAll('.message.clone').forEach((message) => {
        const text = originalMessageText(message);
        const pinButton = message.querySelector('[data-message-pin]');
        if (!pinButton || !text) return;
        const active = isPinned(text);
        pinButton.classList.toggle('is-pinned', active);
        pinButton.textContent = active ? 'Сохранено' : 'Сохранить решение';
        pinButton.setAttribute('aria-pressed', String(active));
      });
    }

    function renderPinned() {
      count.textContent = String(pinned.length);
      insightsButton.setAttribute('aria-label', `Сохранённые решения: ${pinned.length}`);
      list.innerHTML = '';

      if (!pinned.length) {
        const empty = document.createElement('div');
        empty.className = 'insights-empty';
        empty.textContent = 'Сохраните сильный ответ — и он останется здесь как готовый ориентир.';
        list.append(empty);
      } else {
        pinned.forEach((item) => {
          const card = document.createElement('article');
          card.className = 'insight-card';
          const paragraph = document.createElement('p');
          paragraph.textContent = summaryFrom(item.text);
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
            title: 'Удалить сохранённое решение',
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
        showLocalToast('Решение удалено из сохранённого');
      } else {
        pinned.unshift({ id, text: clean, createdAt: new Date().toISOString() });
        pinned = pinned.slice(0, MAX_PINNED);
        showLocalToast('Решение сохранено');
        if (typeof window.ym === 'function') {
          try { window.ym(110937602, 'reachGoal', 'clone_dialog_pin'); } catch { /* analytics cannot break UI */ }
        }
      }
      writePinned(pinned);
      renderPinned();
    }

    function buildDecisionCard(message, bubble, paragraph, text) {
      const parts = paragraphsFrom(text);
      if (parts.length < 2 || text.length < 280) return false;

      message.dataset.originalText = text;
      message.classList.add('is-decision-card');
      bubble.classList.add('decision-bubble');

      const answer = document.createElement('div');
      answer.className = 'decision-answer';

      const primary = document.createElement('section');
      primary.className = 'decision-primary';
      const primaryLabel = document.createElement('span');
      primaryLabel.className = 'decision-label';
      primaryLabel.textContent = 'Ход клона';
      const primaryText = document.createElement('p');
      primaryText.textContent = parts[0];
      primary.append(primaryLabel, primaryText);
      answer.append(primary);

      const reasons = parts.slice(1);
      const reasonsSection = document.createElement('section');
      reasonsSection.className = 'decision-reasons';
      const reasonsHead = document.createElement('div');
      reasonsHead.className = 'decision-reasons-head';
      const reasonsTitle = document.createElement('span');
      reasonsTitle.className = 'decision-reasons-title';
      reasonsTitle.textContent = 'Что сформировало выбор';
      reasonsHead.append(reasonsTitle);

      const grid = document.createElement('div');
      grid.className = 'decision-grid';
      reasons.forEach((reason, index) => {
        const card = document.createElement('article');
        card.className = 'decision-reason';
        if (index >= MAX_VISIBLE_REASONS) card.classList.add('is-hidden');
        const marker = document.createElement('span');
        marker.className = 'decision-reason-index';
        marker.textContent = String(index + 1).padStart(2, '0');
        const body = document.createElement('p');
        body.textContent = reason;
        card.append(marker, body);
        grid.append(card);
      });

      if (reasons.length > MAX_VISIBLE_REASONS) {
        const expand = createButton({
          className: 'decision-expand',
          text: `Показать ещё ${reasons.length - MAX_VISIBLE_REASONS}`,
          title: 'Показать весь разбор',
          pressed: false,
        });
        expand.addEventListener('click', () => {
          const expanded = expand.getAttribute('aria-pressed') === 'true';
          const nextExpanded = !expanded;
          grid.querySelectorAll('.decision-reason').forEach((card, index) => {
            card.classList.toggle('is-hidden', !nextExpanded && index >= MAX_VISIBLE_REASONS);
          });
          expand.setAttribute('aria-pressed', String(nextExpanded));
          expand.textContent = nextExpanded ? 'Свернуть разбор' : `Показать ещё ${reasons.length - MAX_VISIBLE_REASONS}`;
        });
        reasonsHead.append(expand);
      }

      reasonsSection.append(reasonsHead, grid);
      answer.append(reasonsSection);
      paragraph.replaceWith(answer);
      return true;
    }

    function enhanceMessage(message) {
      if (!(message instanceof HTMLElement) || !message.matches('.message.clone')) return;
      const bubble = message.querySelector(':scope > div');
      const paragraph = bubble?.querySelector(':scope > p');
      const text = safeText(paragraph?.textContent);
      if (!bubble || !paragraph || !text) return;
      if (/сопоставляет ситуацию|размышляет|^я готов\./i.test(text)) return;
      if (message.dataset.enhancedText === text) return;

      message.dataset.enhancedText = text;
      message.dataset.originalText = text;
      buildDecisionCard(message, bubble, paragraph, text);

      if (bubble.querySelector('.message-actions')) return;
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'message-actions';
      const pin = createButton({
        className: 'message-action',
        text: isPinned(text) ? 'Сохранено' : 'Сохранить решение',
        title: 'Сохранить этот ход в личную карту решений',
        pressed: isPinned(text),
      });
      pin.dataset.messagePin = 'true';
      pin.classList.toggle('is-pinned', isPinned(text));
      pin.addEventListener('click', () => togglePinned(message.dataset.originalText));

      const copy = createButton({
        className: 'message-action',
        text: 'Копировать',
        title: 'Скопировать полный ответ',
      });
      copy.addEventListener('click', () => copyText(message.dataset.originalText, 'Ответ скопирован'));
      actionsContainer.append(pin, copy);
      bubble.append(actionsContainer);
    }

    function enhanceAllMessages() {
      messages.querySelectorAll('.message.clone').forEach(enhanceMessage);
    }

    function resizeTextarea() {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 170)}px`;
    }

    function updateLatestButton() {
      const distance = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
      latestButton.classList.toggle('is-visible', distance > 120);
    }

    function updateDialogueState() {
      conversation.classList.toggle('has-dialogue', Boolean(messages.querySelector('.message.user')));
    }

    mapButton.addEventListener('click', () => openMap());
    insightsButton.addEventListener('click', () => openDrawer());
    closeDrawerButton.addEventListener('click', () => openDrawer(false));
    closeLogicButton.addEventListener('click', () => openMap(false));
    backdrop.addEventListener('click', closePanels);
    latestButton.addEventListener('click', () => messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' }));

    byId('cloneCopyInsights')?.addEventListener('click', () => {
      if (!pinned.length) {
        showLocalToast('Пока нечего копировать');
        return;
      }
      copyText(pinned.map((item, index) => `${index + 1}. ${item.text}`).join('\n\n'), 'Все решения скопированы');
    });

    byId('cloneClearInsights')?.addEventListener('click', () => {
      if (!pinned.length) return;
      pinned = [];
      writePinned(pinned);
      renderPinned();
      showLocalToast('Сохранённое очищено');
    });

    textarea.addEventListener('input', resizeTextarea);
    textarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      if (!textarea.disabled && safeText(textarea.value)) composer.requestSubmit();
    });

    messages.addEventListener('scroll', updateLatestButton, { passive: true });

    const messageObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const parentMessage = mutation.target instanceof Node
          ? mutation.target.parentElement?.closest?.('.message.clone')
          : null;
        if (parentMessage) window.requestAnimationFrame(() => enhanceMessage(parentMessage));

        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches('.message.clone')) window.requestAnimationFrame(() => enhanceMessage(node));
          node.querySelectorAll?.('.message.clone').forEach((item) => window.requestAnimationFrame(() => enhanceMessage(item)));
        });
      });
      updateDialogueState();
      updateLatestButton();
    });
    messageObserver.observe(messages, { childList: true, subtree: true, characterData: true });

    const identityObserver = new MutationObserver(syncIdentity);
    if (cloneNameSource) identityObserver.observe(cloneNameSource, { childList: true, characterData: true, subtree: true });
    if (cloneStatusSource) identityObserver.observe(cloneStatusSource, { childList: true, characterData: true, subtree: true });
    if (allowance) identityObserver.observe(allowance, { childList: true, characterData: true, subtree: true, attributes: true });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panelIsOpen()) closePanels();
    });

    syncIdentity();
    enhanceAllMessages();
    renderPinned();
    resizeTextarea();
    updateDialogueState();
    updateLatestButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
