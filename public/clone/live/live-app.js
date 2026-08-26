(() => {
  const CHAT_PATH = /^\/clone\/live\/chat\/?$/;

  function whenReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
      return;
    }
    callback();
  }

  whenReady(() => {
    if (!CHAT_PATH.test(location.pathname)) return;

    const body = document.body;
    const workspace = document.querySelector('#workspace');
    const dialogView = document.querySelector('#dialogView');
    const conversation = document.querySelector('#dialogView .conversation');
    const conversationHead = document.querySelector('#dialogView .conversation-head');
    const messages = document.querySelector('#messages');
    const logicPanel = document.querySelector('#logicPanel');
    const logicFactors = document.querySelector('#logicFactors');
    const question = document.querySelector('#question');
    const navButtons = [...document.querySelectorAll('.side nav [data-tab]')];

    if (!workspace || !dialogView || !conversation || !messages || !logicPanel) return;

    body.classList.add('live-app-ready');

    let savedMessageScrollTop = 0;
    let currentView = 'dialog';
    let factorSyncFrame = 0;

    function installChatTitle() {
      if (!conversationHead || conversationHead.querySelector('.app-chat-title')) return;
      const title = document.createElement('div');
      title.className = 'app-chat-title';
      title.innerHTML = '<strong>Звёздный клон</strong><small>по вашей натальной карте</small>';
      conversationHead.prepend(title);
    }

    function syncNav(view) {
      navButtons.forEach((button) => {
        const active = button.dataset.tab === view;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
    }

    function setAppView(view, { restoreFocus = false } = {}) {
      const next = view === 'profile' ? 'profile' : 'dialog';
      if (next === 'profile' && !conversation.classList.contains('hidden')) {
        savedMessageScrollTop = messages.scrollTop;
      }

      currentView = next;
      body.dataset.liveAppView = next;
      const profileMode = next === 'profile';

      conversation.classList.toggle('hidden', profileMode);
      conversation.setAttribute('aria-hidden', String(profileMode));
      logicPanel.classList.toggle('hidden', !profileMode);
      logicPanel.classList.toggle('profile-mode', profileMode);
      logicPanel.setAttribute('aria-hidden', String(!profileMode));
      syncNav(next);

      if (profileMode) {
        window.requestAnimationFrame(() => {
          const target = logicPanel.querySelector('#clonePassport:not(.hidden) h3, h3, summary');
          if (restoreFocus) target?.focus?.({ preventScroll: true });
          logicPanel.scrollTop = 0;
        });
        return;
      }

      window.requestAnimationFrame(() => {
        messages.scrollTop = Math.min(savedMessageScrollTop, Math.max(0, messages.scrollHeight - messages.clientHeight));
        if (restoreFocus && matchMedia('(pointer: fine)').matches) question?.focus({ preventScroll: true });
      });
    }

    function meaningfulCloneAnswers() {
      const nodes = [...messages.querySelectorAll('.message')];
      return nodes.filter((node, index) => {
        if (!node.classList.contains('clone')) return false;
        if (!nodes.slice(0, index).some((previous) => previous.classList.contains('user'))) return false;
        const text = String(node.textContent || '').trim();
        return text && !/Клон готовит ответ|сопоставляю|размышляет/i.test(text);
      });
    }

    function readFactorSnapshot() {
      if (!logicFactors || logicFactors.classList.contains('hidden')) return null;
      const factors = [...logicFactors.querySelectorAll('.factor')].map((factor) => ({
        title: String(factor.querySelector('strong')?.textContent || '').trim(),
        position: String(factor.querySelector('small')?.textContent || '').trim(),
        role: String(factor.querySelector('p')?.textContent || '').trim(),
      })).filter((factor) => factor.title && factor.role);
      if (!factors.length) return null;
      return {
        note: String(logicFactors.querySelector('.factor-scope-note')?.textContent || '').trim(),
        factors,
      };
    }

    function renderAnswerFactorDetails(answer, snapshot) {
      const content = answer?.querySelector(':scope > div') || answer;
      if (!content || !snapshot?.factors?.length) return;

      let details = content.querySelector(':scope > .answer-factor-details');
      if (!details) {
        details = document.createElement('details');
        details.className = 'answer-factor-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Почему Клон решил так?';
        const bodyElement = document.createElement('div');
        bodyElement.className = 'answer-factor-body';
        details.append(summary, bodyElement);
        content.append(details);
      }

      const bodyElement = details.querySelector('.answer-factor-body');
      bodyElement.replaceChildren();
      if (snapshot.note) {
        const note = document.createElement('p');
        note.className = 'answer-factor-note';
        note.textContent = snapshot.note;
        bodyElement.append(note);
      }

      snapshot.factors.forEach((factor) => {
        const item = document.createElement('div');
        item.className = 'answer-factor-item';
        const heading = document.createElement('strong');
        heading.textContent = factor.title;
        item.append(heading);
        if (factor.position) {
          const position = document.createElement('small');
          position.textContent = factor.position;
          item.append(position);
        }
        const role = document.createElement('p');
        role.textContent = factor.role;
        item.append(role);
        bodyElement.append(item);
      });
    }

    function syncLatestAnswerFactors() {
      window.cancelAnimationFrame(factorSyncFrame);
      factorSyncFrame = window.requestAnimationFrame(() => {
        const snapshot = readFactorSnapshot();
        const answer = meaningfulCloneAnswers().at(-1);
        if (snapshot && answer) renderAnswerFactorDetails(answer, snapshot);
      });
    }

    function syncDialogState() {
      if (dialogView.classList.contains('hidden')) return;
      if (currentView !== 'profile') setAppView('dialog');
      syncLatestAnswerFactors();
    }

    installChatTitle();
    setAppView('dialog');

    navButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setAppView(button.dataset.tab || 'dialog', { restoreFocus: true });
      });
    });

    new MutationObserver(syncDialogState).observe(dialogView, {
      attributes: true,
      attributeFilter: ['class'],
    });

    new MutationObserver(syncLatestAnswerFactors).observe(messages, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    if (logicFactors) {
      new MutationObserver(syncLatestAnswerFactors).observe(logicFactors, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    syncDialogState();
  });
})();