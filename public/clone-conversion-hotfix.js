(() => {
  const AUTO_OFFER_KEY = 'starCloneFirstOfferShown';
  const PENDING_PHRASES = [
    'Клон сопоставляет ситуацию',
    'Подключите Telegram',
    'Telegram подключён. Клон продолжает',
  ];

  let config = null;
  let configLoading = null;
  let configLoadedAt = 0;
  let offerTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function savedClone() {
    try {
      return JSON.parse(localStorage.getItem('starClone') || 'null') || {};
    } catch {
      return {};
    }
  }

  function chartId() {
    return new URLSearchParams(location.search).get('chart') || savedClone().chartId || '';
  }

  function sendGoal(name, params = {}) {
    try {
      if (typeof window.ym === 'function') window.ym(110937602, 'reachGoal', name, params);
    } catch {
      // Аналитика не должна вмешиваться в оплату.
    }
  }

  function trackOffer(action) {
    const clone = savedClone();
    const id = chartId();
    const visitor = localStorage.getItem('herostar_visitor_id') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (clone.token) headers['x-chart-token'] = clone.token;
    if (visitor) headers['x-visitor-id'] = visitor;

    fetch('/api/events', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventType: 'paywall_opened',
        chartId: id || null,
        visitorId: visitor || null,
        metadata: { product: 'clone', action },
      }),
    }).catch(() => {});
  }

  function injectStyles() {
    if ($('#cloneConversionStyles')) return;
    const style = document.createElement('style');
    style.id = 'cloneConversionStyles';
    style.textContent = `
      .post-answer-offer {
        margin: 12px 0 4px 44px;
        padding: 14px;
        border: 1px solid rgba(151, 122, 255, .34);
        border-radius: 16px;
        background: rgba(125, 92, 255, .08);
      }
      .post-answer-offer strong { display: block; margin-bottom: 5px; }
      .post-answer-offer p { margin: 0 0 10px; color: var(--muted, #a9a5bd); font-size: 14px; line-height: 1.45; }
      .post-answer-offer button { width: 100%; }
      .paywall-reassurance { margin: 12px 0 0; text-align: center; color: var(--muted, #a9a5bd); font-size: 13px; }
      @media (max-width: 680px) {
        .post-answer-offer { margin-left: 0; }
      }
    `;
    document.head.append(style);
  }

  function completedAnswerExists() {
    const messages = $('#messages');
    if (!messages || $$('.message.user', messages).length < 1) return false;
    const cloneMessages = $$('.message.clone p', messages);
    if (cloneMessages.length < 2) return false;
    const text = String(cloneMessages.at(-1)?.textContent || '').trim();
    if (text.length < 80) return false;
    return !PENDING_PHRASES.some((phrase) => text.includes(phrase));
  }

  function preparePaywallCopy() {
    const eyebrow = $('#clonePaywall .eyebrow');
    const title = $('#clonePaywallTitle');
    const description = $('#clonePaywallTitle + p');
    const benefits = $('#clonePaywall .paywall-benefits');
    const legal = $('#clonePaywall .paywall-legal');

    if (eyebrow) eyebrow.textContent = 'Первый персональный разбор готов';
    if (title) title.textContent = 'Продолжите диалог, пока ситуация ещё живая';
    if (description) {
      description.textContent = 'Клон уже увидел логику решения. Полный доступ открывает безлимитные ситуации и всю карту HeroStar без нового расчёта.';
    }
    if (benefits) {
      benefits.innerHTML = [
        '✓ Разбирайте любые новые ситуации',
        '✓ Клон сохраняет контекст разговора',
        '✓ Полная интерактивная карта HeroStar',
      ].map((item) => `<span>${item}</span>`).join('');
    }
    if (legal && !$('#clonePaywall .paywall-reassurance')) {
      const reassurance = document.createElement('p');
      reassurance.className = 'paywall-reassurance';
      reassurance.textContent = 'Разовая оплата. Доступ сохраняется через Telegram.';
      legal.before(reassurance);
    }
  }

  function openOffer(automatic = false) {
    const paywall = $('#clonePaywall');
    if (!paywall) return;
    preparePaywallCopy();
    paywall.classList.remove('hidden');
    sendGoal('clone_offer_after_first_answer', { automatic });
    sendGoal('clone_paywall', { source: 'first_answer', automatic });
    trackOffer(automatic ? 'clone_first_answer_offer_auto' : 'clone_first_answer_offer_click');
  }

  function addPersistentOffer() {
    const messages = $('#messages');
    if (!messages || $('#postAnswerOffer')) return;

    const price = String($('#clonePrice')?.textContent || '990 ₽').trim();
    const card = document.createElement('div');
    card.className = 'post-answer-offer';
    card.id = 'postAnswerOffer';
    card.innerHTML = `
      <strong>Клон уже собран. Теперь он может разбирать любые ситуации.</strong>
      <p>Откройте полный диалог и карту без повторного ввода данных.</p>
      <button class="primary" type="button">Продолжить без ограничений · ${price}</button>
    `;
    $('button', card).addEventListener('click', () => openOffer(false));
    messages.after(card);
  }

  function maybeShowFirstOffer() {
    if (!completedAnswerExists()) return;
    addPersistentOffer();

    const id = chartId() || 'unknown';
    let shown = {};
    try {
      shown = JSON.parse(localStorage.getItem(AUTO_OFFER_KEY) || '{}') || {};
    } catch {
      shown = {};
    }
    if (shown[id]) return;

    shown[id] = new Date().toISOString();
    localStorage.setItem(AUTO_OFFER_KEY, JSON.stringify(shown));
    clearTimeout(offerTimer);
    offerTimer = setTimeout(() => openOffer(true), 1400);
  }

  function updateTelegramExpectation() {
    const note = $('#questionForm + .composer-note');
    if (!note) return;
    if (config?.user) {
      note.textContent = 'Каждый отправленный вопрос считается одной бесплатной консультацией. Уточняйте важные детали сразу.';
      return;
    }
    note.textContent = 'Перед первым ответом откроется быстрый вход через Telegram. Он нужен только для сохранения клона, ответа и доступа после оплаты.';
  }

  async function loadConfig({ force = false } = {}) {
    if (!force && config && Date.now() - configLoadedAt < 3000) return config;
    if (configLoading) return configLoading;

    configLoading = fetch('/api/config')
      .then(async (response) => (response.ok ? response.json() : null))
      .then((value) => {
        config = value;
        configLoadedAt = Date.now();
        updateTelegramExpectation();
        return config;
      })
      .catch(() => null)
      .finally(() => {
        configLoading = null;
      });

    return configLoading;
  }

  function observeConversation() {
    const messages = $('#messages');
    if (!messages) return;
    const observer = new MutationObserver(() => {
      maybeShowFirstOffer();
      loadConfig({ force: true });
    });
    observer.observe(messages, { childList: true, subtree: true, characterData: true });
    maybeShowFirstOffer();
  }

  function start() {
    injectStyles();
    preparePaywallCopy();
    loadConfig();
    observeConversation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
