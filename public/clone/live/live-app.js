(() => {
  const CHAT_PATH = /^\/clone\/live\/chat\/?$/;
  const SUPPORT_DISMISS_KEY = 'starCloneHeartSupportDismissed';
  const SUPPORT_CONFIG_TTL = 1500;

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
    const questionAllowance = document.querySelector('#questionAllowance');
    const navButtons = [...document.querySelectorAll('.side nav [data-tab]')];

    if (!workspace || !dialogView || !conversation || !messages || !logicPanel) return;

    body.classList.add('live-app-ready', 'live-heart-support');

    let savedMessageScrollTop = 0;
    let currentView = 'dialog';
    let factorSyncFrame = 0;
    let supportSyncTimer = 0;
    let supportConfigCache = null;
    let supportConfigPromise = null;
    let supportCard = null;
    let supportModal = null;
    let supportModalTrigger = null;
    let selectedSupportAmount = null;

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

    function currentChartId() {
      const queryChart = String(new URLSearchParams(location.search).get('chart') || '').trim();
      if (queryChart) return queryChart;
      try {
        const saved = JSON.parse(localStorage.getItem('starClone') || 'null');
        return String(saved?.chartId || '').trim();
      } catch {
        return '';
      }
    }

    function visitorId() {
      let id = localStorage.getItem('herostar_visitor_id');
      if (!id) {
        id = globalThis.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem('herostar_visitor_id', id);
      }
      return id;
    }

    function supportDismissed() {
      try {
        return sessionStorage.getItem(SUPPORT_DISMISS_KEY) === '1';
      } catch {
        return false;
      }
    }

    function dismissSupport(trigger = null) {
      try {
        sessionStorage.setItem(SUPPORT_DISMISS_KEY, '1');
      } catch {
        // Закрытие всё равно действует до перезагрузки текущего DOM.
      }
      const visibleCard = trigger?.closest?.('.live-support-card') || supportCard;
      visibleCard?.remove();
      if (supportCard && supportCard !== visibleCard) supportCard.remove();
      supportCard = null;
      closeSupportModal();
      question?.focus?.({ preventScroll: true });
    }

    function validSupportConfig(config) {
      const support = config?.cloneOffers?.support;
      const minAmount = Number(support?.minAmount);
      const maxAmount = Number(support?.maxAmount);
      const suggested = Array.isArray(support?.suggestedAmounts)
        ? support.suggestedAmounts.map(Number).filter(Number.isInteger)
        : [];
      return support
        && Number.isInteger(minAmount)
        && Number.isInteger(maxAmount)
        && minAmount > 0
        && maxAmount >= minAmount
        && suggested.length > 0
        && typeof support.codePrefix === 'string'
        && support.codePrefix.startsWith('clone_support_');
    }

    async function loadSupportConfig({ force = false } = {}) {
      const chartId = currentChartId();
      if (!chartId) return null;
      if (!force && supportConfigCache && Date.now() - supportConfigCache.at < SUPPORT_CONFIG_TTL) {
        return supportConfigCache.value;
      }
      if (supportConfigPromise) return supportConfigPromise;
      supportConfigPromise = fetch(`/api/config?chartId=${encodeURIComponent(chartId)}`, {
        credentials: 'same-origin',
        headers: { 'x-visitor-id': visitorId() },
      })
        .then(async (response) => {
          if (!response.ok) return null;
          const value = await response.json().catch(() => null);
          const result = validSupportConfig(value) ? value : null;
          supportConfigCache = { at: Date.now(), value: result };
          return result;
        })
        .catch(() => null)
        .finally(() => { supportConfigPromise = null; });
      return supportConfigPromise;
    }

    function supportEligible(config, answers) {
      if (!config || answers.length < 3 || supportDismissed()) return false;
      if (!config.user || !config.paymentsConfigured) return false;
      if (config.user.cloneAccessActive) return false;
      return Boolean(currentChartId());
    }

    function ensureSupportCard() {
      if (supportCard?.isConnected) return supportCard;
      const existingCard = messages.querySelector('.live-support-card');
      if (existingCard) {
        supportCard = existingCard;
        return existingCard;
      }
      const card = document.createElement('aside');
      card.className = 'live-support-card';
      card.setAttribute('aria-label', 'Добровольная поддержка HeroStar');
      card.innerHTML = `
        <div class="live-support-mark" aria-hidden="true">♡</div>
        <div class="live-support-copy">
          <strong>HeroStar оказался полезен?</strong>
          <p>Можно поддержать развитие проекта любой удобной суммой. Это добровольно — бесплатный диалог продолжит работать независимо от оплаты.</p>
          <div class="live-support-actions">
            <button class="live-support-open" type="button">Поддержать HeroStar</button>
            <button class="live-support-dismiss" type="button">Не сейчас</button>
          </div>
        </div>`;
      const openButton = card.querySelector('.live-support-open');
      const dismissButton = card.querySelector('.live-support-dismiss');
      openButton.addEventListener('click', () => openSupportModal(openButton));
      openButton.addEventListener('pointerup', () => {
        if (matchMedia('(pointer: coarse)').matches) openSupportModal(openButton);
      });
      dismissButton.addEventListener('click', () => dismissSupport(dismissButton));
      supportCard = card;
      return card;
    }

    function renderSupportCard(config, answers) {
      if (!supportEligible(config, answers)) {
        supportCard?.remove();
        supportCard = null;
        return;
      }
      const card = ensureSupportCard();
      const latestAnswer = answers.at(-1);
      if (latestAnswer && card.previousElementSibling !== latestAnswer) latestAnswer.after(card);
    }

    function scheduleSupportSync({ force = false } = {}) {
      window.clearTimeout(supportSyncTimer);
      supportSyncTimer = window.setTimeout(async () => {
        const answers = meaningfulCloneAnswers();
        if (answers.length < 3 || supportDismissed()) {
          renderSupportCard(null, answers);
          return;
        }
        const config = await loadSupportConfig({ force });
        renderSupportCard(config, answers);
      }, 90);
    }

    function normalizeReceiptContact(value) {
      const raw = String(value || '').trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) return raw.toLowerCase();
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
      return '';
    }

    function supportModalElements() {
      if (!supportModal) return {};
      return {
        form: supportModal.querySelector('.live-support-form'),
        amountButtons: [...supportModal.querySelectorAll('[data-support-amount]')],
        customAmount: supportModal.querySelector('#liveSupportCustomAmount'),
        contact: supportModal.querySelector('#liveSupportReceiptContact'),
        error: supportModal.querySelector('#liveSupportError'),
        submit: supportModal.querySelector('.live-support-submit'),
      };
    }

    function syncSupportForm() {
      const { amountButtons = [], customAmount, contact, error, submit } = supportModalElements();
      if (!submit) return;
      amountButtons.forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.supportAmount) === selectedSupportAmount));
      });
      const config = supportConfigCache?.value;
      const support = config?.cloneOffers?.support;
      const min = Number(support?.minAmount);
      const max = Number(support?.maxAmount);
      const amountOk = Number.isInteger(selectedSupportAmount) && selectedSupportAmount >= min && selectedSupportAmount <= max;
      const contactOk = Boolean(normalizeReceiptContact(contact?.value));
      submit.disabled = !amountOk || !contactOk;
      submit.textContent = amountOk ? `Поддержать на ${selectedSupportAmount} ₽` : 'Выберите сумму';
      if (error && customAmount?.value) {
        const typed = Number(customAmount.value);
        error.textContent = Number.isInteger(typed) && typed >= min && typed <= max
          ? ''
          : `Введите целую сумму от ${min} до ${max} ₽.`;
      } else if (error && (!contact?.value || contactOk)) {
        error.textContent = '';
      }
    }

    function selectSupportAmount(amount, { custom = false } = {}) {
      const config = supportConfigCache?.value;
      const support = config?.cloneOffers?.support;
      const min = Number(support?.minAmount);
      const max = Number(support?.maxAmount);
      selectedSupportAmount = Number.isInteger(amount) && amount >= min && amount <= max ? amount : null;
      const { customAmount } = supportModalElements();
      if (!custom && customAmount) customAmount.value = '';
      syncSupportForm();
    }

    function trapSupportFocus(event) {
      if (event.key !== 'Tab' || !supportModal || supportModal.classList.contains('hidden')) return;
      const focusable = [...supportModal.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function setModalBackgroundInert(inert) {
      [workspace, document.querySelector('.topbar')].filter(Boolean).forEach((element) => {
        element.inert = inert;
      });
    }

    function closeSupportModal({ restoreFocus = true } = {}) {
      if (!supportModal || supportModal.classList.contains('hidden')) return;
      supportModal.classList.add('hidden');
      supportModal.setAttribute('aria-hidden', 'true');
      setModalBackgroundInert(false);
      selectedSupportAmount = null;
      const { customAmount, contact, error } = supportModalElements();
      if (customAmount) customAmount.value = '';
      if (contact) contact.value = '';
      if (error) error.textContent = '';
      if (restoreFocus) supportModalTrigger?.focus?.();
      supportModalTrigger = null;
    }

    async function startSupportCheckout() {
      const config = await loadSupportConfig({ force: true });
      const support = config?.cloneOffers?.support;
      const chartId = currentChartId();
      const { contact, error, submit } = supportModalElements();
      const receiptContact = normalizeReceiptContact(contact?.value);
      const min = Number(support?.minAmount);
      const max = Number(support?.maxAmount);
      const amount = selectedSupportAmount;

      if (!config?.user || !config?.paymentsConfigured || !chartId) {
        if (error) error.textContent = 'Оплата сейчас недоступна. Диалог продолжает работать бесплатно.';
        return;
      }
      if (!Number.isInteger(amount) || amount < min || amount > max || !receiptContact) {
        syncSupportForm();
        if (error && !receiptContact) error.textContent = 'Укажите телефон или email для электронного чека.';
        return;
      }

      const offerCode = `${support.codePrefix}${amount}`;
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Открываем ЮKassa…';
      }
      try {
        const response = await fetch('/api/payments/create', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'x-visitor-id': visitorId(),
          },
          body: JSON.stringify({
            chartId,
            receiptContact,
            product: 'clone',
            offerCode,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Не удалось создать платёж.');
        if (!result.confirmationUrl) throw new Error('ЮKassa не вернула ссылку оплаты.');
        localStorage.setItem('starClonePendingPayment', JSON.stringify({
          paymentId: result.paymentId,
          paymentRef: result.paymentRef,
          chartId,
          offerCode,
          amount,
          createdAt: new Date().toISOString(),
        }));
        location.assign(result.confirmationUrl);
      } catch (checkoutError) {
        if (error) error.textContent = checkoutError.message;
        syncSupportForm();
      }
    }

    function ensureSupportModal(config) {
      if (supportModal?.isConnected) return supportModal;
      const support = config.cloneOffers.support;
      const modal = document.createElement('div');
      modal.className = 'live-support-backdrop hidden';
      modal.id = 'liveHeartSupportModal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'liveSupportTitle');
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <section class="live-support-modal-card">
          <button class="live-support-close" type="button" aria-label="Закрыть">×</button>
          <div class="live-support-modal-mark" aria-hidden="true">♡</div>
          <p class="live-support-eyebrow">Добровольная поддержка</p>
          <h2 id="liveSupportTitle">Поддержать HeroStar</h2>
          <p class="live-support-intro">Если Клон оказался полезен, вы можете поддержать развитие проекта удобной суммой. Бесплатный диалог останется доступен независимо от оплаты.</p>
          <div class="live-support-thanks"><strong>В благодарность</strong><span>Полная карта и Паспорт клона останутся у вас, а глубокий режим включится на 24 часа.</span></div>
          <form class="live-support-form">
            <fieldset>
              <legend>Выберите сумму</legend>
              <div class="live-support-suggestions"></div>
              <label class="live-support-custom">Другая сумма, ₽<input id="liveSupportCustomAmount" inputmode="numeric" type="number" min="${support.minAmount}" max="${support.maxAmount}" step="1" placeholder="От ${support.minAmount} до ${support.maxAmount}"></label>
            </fieldset>
            <label class="live-support-contact">Телефон или email для электронного чека<input id="liveSupportReceiptContact" autocomplete="email" placeholder="name@example.com или +7…"></label>
            <p class="live-support-error" id="liveSupportError" aria-live="polite"></p>
            <button class="live-support-submit" type="submit" disabled>Выберите сумму</button>
          </form>
          <p class="live-support-legal">Разовая оплата через ЮKassa, без автопродления. Нажимая кнопку оплаты, вы принимаете <a href="/offer" target="_blank" rel="noopener">оферту</a> и <a href="/refunds" target="_blank" rel="noopener">условия возврата</a>.</p>
        </section>`;

      const suggestions = modal.querySelector('.live-support-suggestions');
      support.suggestedAmounts.forEach((amount) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.supportAmount = String(amount);
        button.setAttribute('aria-pressed', 'false');
        button.textContent = `${amount} ₽`;
        button.addEventListener('click', () => selectSupportAmount(Number(amount)));
        suggestions.append(button);
      });
      modal.querySelector('.live-support-close').addEventListener('click', () => closeSupportModal());
      modal.querySelector('#liveSupportCustomAmount').addEventListener('input', (event) => {
        const raw = String(event.currentTarget.value || '').trim();
        selectSupportAmount(raw ? Number(raw) : null, { custom: true });
      });
      modal.querySelector('#liveSupportReceiptContact').addEventListener('input', syncSupportForm);
      modal.querySelector('.live-support-form').addEventListener('submit', (event) => {
        event.preventDefault();
        startSupportCheckout();
      });
      modal.addEventListener('pointerdown', (event) => {
        if (event.target === modal) closeSupportModal();
      });
      modal.addEventListener('keydown', trapSupportFocus);
      document.body.append(modal);
      supportModal = modal;
      return modal;
    }

    function openSupportModal(trigger) {
      const config = supportConfigCache?.value;
      if (!validSupportConfig(config) || !config.user || !config.paymentsConfigured) {
        scheduleSupportSync({ force: true });
        return;
      }
      supportModalTrigger = trigger || document.activeElement;
      const modal = ensureSupportModal(config);
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      setModalBackgroundInert(true);
      selectedSupportAmount = null;
      syncSupportForm();
      modal.querySelector('.live-support-close')?.focus();
    }

    function syncDialogState() {
      if (dialogView.classList.contains('hidden')) return;
      if (currentView !== 'profile') setAppView('dialog');
      syncLatestAnswerFactors();
      scheduleSupportSync();
    }

    installChatTitle();
    setAppView('dialog');

    navButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setAppView(button.dataset.tab || 'dialog', { restoreFocus: true });
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
      const currentMessages = document.querySelector('#messages');
      const openButton = target.closest('.live-support-open');
      if (openButton && currentMessages?.contains(openButton)) {
        openSupportModal(openButton);
        return;
      }
      const dismissButton = target.closest('.live-support-dismiss');
      if (dismissButton && currentMessages?.contains(dismissButton)) dismissSupport(dismissButton);
    }, true);

    new MutationObserver(syncDialogState).observe(dialogView, {
      attributes: true,
      attributeFilter: ['class'],
    });

    new MutationObserver(() => {
      syncLatestAnswerFactors();
      scheduleSupportSync();
    }).observe(messages, {
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

    if (questionAllowance) {
      new MutationObserver(() => scheduleSupportSync({ force: true })).observe(questionAllowance, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && supportModal && !supportModal.classList.contains('hidden')) {
        event.preventDefault();
        closeSupportModal();
      }
    });

    syncDialogState();
  });
})();