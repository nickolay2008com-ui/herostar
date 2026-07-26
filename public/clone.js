const METRIKA_ID = 110937602;
const FREE_PREAUTH_QUESTIONS = 3;
const STORAGE_KEY = 'starClone';
const ATTRIBUTION_KEY = 'starCloneAttribution';
const OFFER_DISMISSAL_KEY_PREFIX = 'starCloneOfferDismissed:';
const dismissedOffers = new Set();

const state = {
  chartId: null,
  token: null,
  chart: null,
  chartAccess: null,
  passport: null,
  user: null,
  selectedPlace: null,
  config: null,
  authPoll: null,
  authPollStartedAt: 0,
  pendingRequest: null,
  questionCount: 0,
  localMessages: [],
  asking: false,
  selectedOffer: 'clone_day',
  factorScope: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#039;');
}

function show(id) {
  ['#createView', '#buildingView', '#dialogView'].forEach((selector) => $(selector).classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function toast(text) {
  const element = $('#cloneToast');
  element.textContent = text;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 3200);
}

function goal(name, params = {}) {
  try {
    if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', name, params);
  } catch {
    // Метрика не должна влиять на продукт.
  }
}

function attribution() {
  const params = new URLSearchParams(location.search);
  const current = {
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_content: params.get('utm_content') || '',
    utm_term: params.get('utm_term') || '',
    yclid: params.get('yclid') || '',
    referrer: document.referrer || '',
  };
  const hasCampaign = Object.entries(current).some(([key, value]) => key !== 'referrer' && Boolean(value));
  if (hasCampaign) localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
  try {
    return hasCampaign ? current : JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}');
  } catch {
    return current;
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

async function json(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['x-chart-token'] = state.token;
  headers['x-visitor-id'] = visitorId();
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Не удалось выполнить действие');
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function configEndpoint() {
  return state.chartId
    ? `/api/config?chartId=${encodeURIComponent(state.chartId)}`
    : '/api/config';
}

async function loadConfig() {
  return json(configEndpoint());
}

async function track(eventType, action, metadata = {}) {
  try {
    await json('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        visitorId: visitorId(),
        chartId: state.chartId || null,
        metadata: { product: 'clone', action, ...attribution(), ...metadata },
      }),
    });
  } catch {
    // Аналитика не должна останавливать человека.
  }
}

function savedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function persistState(extra = {}) {
  const previous = savedState() || {};
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...previous,
    chartId: state.chartId,
    token: state.token,
    name: $('#cloneName')?.textContent || previous.name || 'Ваш звёздный клон',
    questionCount: state.questionCount,
    messages: state.localMessages.slice(-30),
    ...extra,
  }));
}

function safeSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) return null;
    if (/^(?:127|10|0)\./.test(hostname) || /^192\.168\./.test(hostname)) return null;
    if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)) return null;
    return { href: url.toString(), domain: hostname };
  } catch {
    return null;
  }
}

function checkedAtLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Проверено сейчас';
  return `Проверено ${date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function quotaResetLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const now = new Date();
  const sameLocalDay = (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
  if (sameLocalDay) return ` Новый поиск — после ${time}.`;
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return ` Новый поиск — ${day} в ${time}.`;
}

function appendCitedText(container, text, citations = []) {
  const normalizedText = String(text || '');
  const normalizedCitations = citations
    .map((citation) => {
      const target = safeSourceUrl(citation?.url);
      const start = Math.max(0, Number(citation?.start) || 0);
      const end = Math.min(normalizedText.length, Math.max(start, Number(citation?.end) || 0));
      return target && end > start ? { ...citation, ...target, start, end } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  let cursor = 0;
  for (const citation of normalizedCitations) {
    if (citation.start < cursor) continue;
    container.append(document.createTextNode(normalizedText.slice(cursor, citation.start)));
    const link = document.createElement('a');
    link.href = citation.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow';
    link.className = 'web-citation';
    link.textContent = normalizedText.slice(citation.start, citation.end);
    link.title = citation.title || citation.domain;
    link.addEventListener('click', () => {
      track('web_result_opened', 'citation_opened', { domain: citation.domain });
    });
    container.append(link);
    cursor = citation.end;
  }
  container.append(document.createTextNode(normalizedText.slice(cursor)));
}

function renderWebSearch(container, webSearch, { trackImpression = true } = {}) {
  container.querySelector('.web-search-result')?.remove();
  if (!webSearch?.requested || webSearch.status === 'not_requested') return;

  const section = document.createElement('section');
  section.className = `web-search-result web-search-${webSearch.status}`;
  section.setAttribute('aria-label', 'Результат поиска в интернете');

  const heading = document.createElement('h3');
  const note = document.createElement('p');
  note.className = 'web-search-note';

  if (webSearch.status === 'completed') {
    heading.textContent = 'Найдено сейчас';
    note.textContent = checkedAtLabel(webSearch.checkedAt);
    section.append(heading, note);

    const summary = document.createElement('div');
    summary.className = 'web-search-summary';
    appendCitedText(summary, webSearch.text, webSearch.citations);
    section.append(summary);

    const sources = (webSearch.sources || [])
      .map((source) => ({ source, target: safeSourceUrl(source?.url) }))
      .filter(({ target }) => target)
      .slice(0, 5);
    if (sources.length) {
      const sourcesTitle = document.createElement('h4');
      sourcesTitle.textContent = 'Источники';
      const list = document.createElement('ol');
      list.className = 'web-search-sources';
      sources.forEach(({ source, target }, index) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = target.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer nofollow';
        link.textContent = source.title || target.domain;
        const domain = document.createElement('span');
        domain.textContent = `${target.domain} ↗`;
        link.append(domain);
        link.addEventListener('click', () => {
          track('web_result_opened', 'source_opened', { domain: target.domain, index: index + 1 });
        });
        item.append(link);
        list.append(item);
      });
      section.append(sourcesTitle, list);
    }

    const disclaimer = document.createElement('small');
    disclaimer.textContent = 'Актуальные данные, цены и наличие могут измениться после проверки.';
    section.append(disclaimer);
  } else if (webSearch.status === 'telegram_required') {
    section.classList.add('web-search-gate');
    heading.textContent = 'Поиск доступен после сохранения Клона';
    note.textContent = 'Подключите Telegram — один актуальный поиск в сутки останется бесплатным.';
    const slot = document.createElement('div');
    slot.className = 'telegram-login-slot';
    section.append(heading, note, slot);
    if (!location.pathname.startsWith('/clone/live')) {
      window.setTimeout(() => mountTelegramLogin(slot), 0);
    }
    if (trackImpression) track('web_search_gate_shown', 'telegram_search_gate');
  } else if (webSearch.status === 'quota_exhausted') {
    section.classList.add('web-search-gate');
    const premiumLimit = webSearch.quota?.accessTier === 'premium'
      || webSearch.quota?.upgradeAvailable === false;
    heading.textContent = premiumLimit ? 'Лимит поиска на сегодня исчерпан' : 'Сравнить больше вариантов';
    note.textContent = premiumLimit
      ? `Обычный диалог продолжает работать.${quotaResetLabel(webSearch.quota?.resetsAt)}`
      : `Бесплатный поиск уже использован.${quotaResetLabel(webSearch.quota?.resetsAt)} В полном режиме Клон проверяет больше источников и помогает сравнить найденное.`;
    const actions = document.createElement('div');
    actions.className = 'web-search-actions';
    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'ghost';
    continueButton.textContent = 'Продолжить разговор';
    continueButton.addEventListener('click', () => {
      if (!premiumLimit) dismissOffer('clone_day', { focusComposer: false });
      section.remove();
      renderCommerceUi();
      $('#question')?.focus();
    });
    if (!premiumLimit) {
      const upgrade = document.createElement('button');
      upgrade.type = 'button';
      upgrade.className = 'primary';
      upgrade.textContent = 'Посмотреть полный режим';
      upgrade.addEventListener('click', () => {
        track('web_search_upgrade_clicked', 'web_search_upgrade');
        if ($('#premiumDiscovery')) openPremiumDiscovery('web_search_gate');
        else openPaywall('clone_day', upgrade);
      });
      actions.append(upgrade);
    }
    actions.append(continueButton);
    section.append(heading, note, actions);
    if (trackImpression) {
      track('web_search_gate_shown', premiumLimit ? 'premium_search_limit' : 'premium_search_gate');
    }
  } else {
    const messages = {
      blocked: 'Этот поиск затрагивает приватность или небезопасное действие, поэтому я его не выполняю.',
      empty: 'Не нашёл данных, которые можно надёжно подтвердить. Не буду придумывать результаты.',
      timeout: 'Поиск занял слишком много времени. Актуальные данные не были подтверждены.',
      temporarily_unavailable: 'Лимит безопасного поиска на сервисе временно исчерпан. Обычный диалог продолжает работать.',
      unavailable: 'Поиск сейчас недоступен. Обычный диалог и ваш вопрос сохранены.',
      failed: 'Не удалось выполнить поиск. Актуальные данные не были подтверждены.',
    };
    heading.textContent = 'Поиск не выполнен';
    note.textContent = messages[webSearch.status] || messages.failed;
    section.append(heading, note);
  }

  container.append(section);
}

function message(role, text, { persist = true, webSearch = null, factors = [], factorScope = null, trackSearchImpression = true } = {}) {
  const element = document.createElement('article');
  element.className = `message ${role}`;
  element.innerHTML = role === 'clone'
    ? '<span class="mini-avatar">✦</span><div><b>Звёздный клон</b><p></p></div>'
    : '<div><b>Вы</b><p></p></div>';
  element.querySelector('p').textContent = text;
  if (role === 'clone' && webSearch) {
    renderWebSearch(element.querySelector('div'), webSearch, {
      trackImpression: trackSearchImpression,
    });
  }
  $('#messages').append(element);
  if (persist) {
    state.localMessages.push({ role, content: text, webSearch, factors, factorScope, createdAt: new Date().toISOString() });
    persistState();
  }
  return element;
}

function inlineOffers() {
  return ['#fullModeOffer', '#alignmentOffer'].map($).filter(Boolean);
}

function resetMessages() {
  const messages = $('#messages');
  const offers = inlineOffers();
  messages.innerHTML = '<article class="message clone"><span class="mini-avatar">✦</span><div><b>Звёздный клон</b><p>Я готов. Опишите ситуацию, в которой мне нужно выбрать, ответить или действовать.</p></div></article>';
  offers.forEach((offer) => messages.append(offer));
}

function renderConversation(messages) {
  resetMessages();
  for (const item of messages) {
    message(item.role === 'assistant' ? 'clone' : item.role, item.content, {
      persist: false,
      webSearch: item.webSearch || item.metadata?.webSearch || null,
      factors: item.factors || item.metadata?.factors || [],
      factorScope: item.factorScope || item.metadata?.factorScope || null,
      trackSearchImpression: false,
    });
  }
  const latest = [...messages].reverse().find((item) => (item.role === 'clone' || item.role === 'assistant') && (item.factors?.length || item.metadata?.factors?.length));
  if (latest) renderAnswerFactors(latest.factors || latest.metadata?.factors, latest.factorScope || latest.metadata?.factorScope);
  syncConversationStarted();
}

function cleanCloneQuestion(content) {
  const text = String(content || '').replace(/^\[\[clone-reservation:[^\]]+\]\]\s*/i, '').trim();
  const marker = 'Ситуация:';
  const index = text.lastIndexOf(marker);
  return index >= 0 ? text.slice(index + marker.length).trim() : text;
}

function isCloneQuestion(item) {
  if (item?.role !== 'user') return false;
  if (item.metadata?.product === 'clone') return true;
  const text = String(item.content || '');
  return text.includes('Звёздный клон') && text.includes('Ситуация:');
}

function extractCloneDialogue(messages = []) {
  const result = [];
  let pendingUser = null;
  for (const item of messages) {
    if (isCloneQuestion(item)) {
      pendingUser = { ...item, role: 'user', content: cleanCloneQuestion(item.content) };
      continue;
    }
    if (item?.role === 'assistant' && pendingUser) {
      result.push(pendingUser, { ...item, role: 'clone' });
      pendingUser = null;
    }
  }
  return result;
}

function selectedPlaceValue(item) {
  return `${item.label || item.name}\u001f${item.latitude}\u001f${item.longitude}`;
}

function currentAccess() {
  return state.chartAccess || state.user || null;
}

function currentCloneAccessActive() {
  return Boolean(currentAccess()?.cloneAccessActive);
}

function accessLabel() {
  const access = currentAccess();
  if (!access?.cloneAccessActive) return null;
  const until = access.cloneAccessUntil ? new Date(access.cloneAccessUntil) : null;
  const date = until && !Number.isNaN(until.getTime())
    ? until.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  if (access.clonePlan === 'alignment') return date ? `Сонастройка активна до ${date}` : 'Сонастройка активна';
  if (access.clonePlan === 'day') return date ? `Глубокий режим открыт до ${date}` : 'День со Звёздным клоном открыт';
  return date ? `Глубокий режим открыт до ${date}` : 'Глубокий режим открыт';
}

function renderAllowance() {
  const element = $('#questionAllowance');
  if (!element) return;
  syncConversationStarted();
  const paidLabel = accessLabel();
  if (paidLabel) {
    element.textContent = paidLabel;
    element.classList.add('unlimited');
    return;
  }
  if (state.user) {
    element.textContent = 'Бесплатный диалог без лимита';
    element.classList.add('unlimited');
    return;
  }
  element.classList.remove('unlimited');
  const remaining = Math.max(0, FREE_PREAUTH_QUESTIONS - state.questionCount);
  element.textContent = remaining
    ? `${remaining} ${remaining === 1 ? 'ответ' : 'ответа'} до сохранения в Telegram`
    : 'Подключите Telegram, чтобы продолжить без лимита';
}

function syncConversationStarted() {
  const started = state.questionCount > 0 || Boolean($('#messages .message.user'));
  $('.conversation')?.classList.toggle('conversation-started', started);
  $('#conversationIntro')?.classList.toggle('hidden', started);
  $('#conversationSuggestions')?.classList.toggle('hidden', started);
}

function syncComposerSubmitState() {
  const form = $('#questionForm');
  const button = form?.querySelector('button[type="submit"]');
  const textarea = $('#question');
  const hasQuestion = Boolean(textarea?.value.trim());
  if (button) {
    button.disabled = state.asking || !hasQuestion;
    button.setAttribute('aria-label', state.asking ? 'Клон формирует ответ' : 'Отправить вопрос');
  }
  form?.setAttribute('aria-busy', String(state.asking));
}

function setComposerBusy(busy) {
  state.asking = busy;
  const button = $('#questionForm button[type="submit"]');
  const textarea = $('#question');
  if (button) {
    button.textContent = busy ? 'Клон размышляет…' : 'Спросить клона';
  }
  if (textarea) textarea.disabled = busy;
  syncComposerSubmitState();
}

function formatPrice(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Number(value || 0))} ₽`;
}

function dayOffer() {
  return state.config?.cloneOffers?.day || { code: 'clone_day', amount: 499, title: 'День со Звёздным клоном' };
}

function alignmentOffer() {
  return state.config?.cloneOffers?.alignment || {
    code: 'clone_alignment',
    amount: 1499,
    payableAmount: 1499,
    credited: false,
    creditAmount: 0,
  };
}

function offerDismissalKey(offerCode) {
  return `${OFFER_DISMISSAL_KEY_PREFIX}${offerCode}`;
}

function isOfferDismissed(offerCode) {
  if (dismissedOffers.has(offerCode)) return true;
  try {
    return sessionStorage.getItem(offerDismissalKey(offerCode)) === '1';
  } catch {
    return false;
  }
}

function dismissOffer(offerCode, { focusComposer = true } = {}) {
  dismissedOffers.add(offerCode);
  try {
    sessionStorage.setItem(offerDismissalKey(offerCode), '1');
  } catch {
    // Память текущей вкладки уже сохранена в dismissedOffers.
  }
  const offer = document.querySelector(`[data-offer-code="${offerCode}"]`);
  offer?.classList.add('hidden');
  if (focusComposer) $('#question')?.focus();
}

function mountInlineOffer(offer, visible) {
  const messages = $('#messages');
  if (!offer || !messages) return;
  offer.classList.toggle('hidden', !visible);
  if (visible) messages.append(offer);
}

function dismissVisibleInlineOffers() {
  inlineOffers()
    .filter((offer) => !offer.classList.contains('hidden'))
    .forEach((offer) => dismissOffer(offer.dataset.offerCode, { focusComposer: false }));
}

function renderCommerceUi() {
  const alignment = alignmentOffer();
  const access = currentAccess();
  const activeDay = access?.clonePlan === 'day' && access?.cloneAccessActive;
  const showAlignment = Boolean(state.user && access?.clonePlan !== 'alignment' && (activeDay || alignment.credited));
  const showFullMode = Boolean(
    state.user
    && !access?.cloneAccessActive
    && state.questionCount >= 5
    && !showAlignment
  );
  const explicitSearchGateVisible = Boolean($('#messages .web-search-gate'));
  mountInlineOffer($('#fullModeOffer'), showFullMode && !explicitSearchGateVisible && !isOfferDismissed('clone_day'));
  mountInlineOffer($('#alignmentOffer'), showAlignment && !isOfferDismissed('clone_alignment'));
  const showPremiumEntry = Boolean(state.chartId && state.user && !access?.cloneAccessActive);
  $('#openPremiumDiscovery')?.classList.toggle('hidden', !showPremiumEntry);
  $('#productLabel')?.classList.toggle('hidden', showPremiumEntry);
  $('#passportPremiumEntry')?.classList.toggle('hidden', !showPremiumEntry);
  if ($('#alignmentPrice')) $('#alignmentPrice').textContent = formatPrice(alignment.payableAmount || alignment.amount);
  if ($('#alignmentCreditNote')) {
    $('#alignmentCreditNote').textContent = alignment.credited
      ? `499 ₽ уже зачтены · доплата ${formatPrice(alignment.payableAmount)}`
      : '30 дней · без автопродления';
  }
}

function prepareOffer(offerCode = 'clone_day') {
  state.selectedOffer = offerCode;
  const day = dayOffer();
  const alignment = alignmentOffer();
  const isAlignment = offerCode === 'clone_alignment';
  const offer = isAlignment ? alignment : day;
  $('#cloneOfferEyebrow').textContent = isAlignment ? 'Продолжение после знакомства' : 'Полная глубина карты';
  $('#clonePaywallTitle').textContent = isAlignment ? 'Сонастройка на 30 дней' : 'День со Звёздным клоном';
  $('#cloneOfferDescription').textContent = isAlignment
    ? 'Ежедневно сверяйте реальные ситуации с клоном, получайте ключевые моменты карты и простые мини-задания в Telegram.'
    : 'Бесплатный Клон показывает главный ход и объясняет его через факторы текущего ответа. На 24 часа полный режим связывает 3–6 значимых факторов в единую систему, показывает главное противоречие, альтернативный ход и условие, при котором решение изменится. Полная карта, персональный аватар и Паспорт клона останутся у вас навсегда.';
  $('#cloneOfferBenefits').innerHTML = (isAlignment
    ? ['✓ 30 дней глубоких вопросов клону', '✓ Ключевые моменты карты в Telegram', '✓ Простые мини-задания для проверки в жизни']
    : ['✓ Глубокий разбор 3–6 значимых связей', '✓ Противоречия, альтернативные ходы и условия выбора', '✓ Полный образ, карта и Паспорт клона навсегда'])
    .map((item) => `<span>${item}</span>`).join('');
  const amount = isAlignment ? (offer.payableAmount || offer.amount) : offer.amount;
  $('#clonePrice').textContent = formatPrice(amount);
  $('#clonePayButton').firstChild.textContent = isAlignment ? 'Открыть Сонастройку · ' : 'Открыть на 24 часа · ';
  const credit = $('#cloneOfferCredit');
  if (credit) {
    credit.classList.toggle('hidden', !(isAlignment && offer.credited));
    credit.textContent = isAlignment && offer.credited
      ? `Стоимость дня 499 ₽ полностью зачтена. Сейчас оплачивается только ${formatPrice(amount)}.`
      : '';
  }
}

function openPaywall(offerCode = 'clone_day', trigger = document.activeElement) {
  prepareOffer(offerCode);
  track('paywall_opened', 'clone_paywall_opened', { questionCount: state.questionCount, offerCode });
  goal('clone_paywall', { offer: offerCode });
  openDialog($('#clonePaywall'), trigger);
}

let activeDialog = null;
let activeDialogTrigger = null;

function dialogBackgrounds() {
  return [$('main'), $('.live-topbar')].filter(Boolean);
}

function dialogFocusable(dialog) {
  return [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.classList.contains('hidden'));
}

function openDialog(dialog, trigger = document.activeElement) {
  if (!dialog) return;
  activeDialog = dialog;
  activeDialogTrigger = trigger;
  dialogBackgrounds().forEach((element) => { element.inert = true; });
  dialog.classList.remove('hidden');
  dialogFocusable(dialog)[0]?.focus();
}

function closeDialog(dialog, { restoreFocus = true } = {}) {
  if (!dialog) return;
  dialog.classList.add('hidden');
  if (activeDialog === dialog) activeDialog = null;
  dialogBackgrounds().forEach((element) => { element.inert = false; });
  if (restoreFocus) activeDialogTrigger?.focus?.();
  activeDialogTrigger = null;
}

function openPremiumDiscovery(source = 'header_entry') {
  track('paywall_opened', 'premium_entry_click', {
    source,
    questionCount: state.questionCount,
  });
  openDialog($('#premiumDiscovery'));
}

function closePremiumDiscovery({ restoreFocus = true } = {}) {
  closeDialog($('#premiumDiscovery'), { restoreFocus });
}

function closePaywall() {
  closeDialog($('#clonePaywall'));
}

function canAsk() {
  return Boolean(state.chartId);
}

function normalizedReceiptContact() {
  const input = $('#cloneReceiptContact');
  const hint = $('#cloneReceiptHint');
  const raw = String(input.value || '').trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
  const digits = raw.replace(/\D/g, '');
  const phoneOk = digits.length >= 10 && digits.length <= 15;
  if (!emailOk && !phoneOk) {
    hint.textContent = 'Укажите действующий телефон или email — он нужен ЮKassa для чека.';
    hint.classList.add('field-error');
    input.focus();
    return '';
  }
  hint.textContent = 'Контакт передаётся ЮKassa только для отправки чека.';
  hint.classList.remove('field-error');
  return emailOk ? raw.toLowerCase() : `+${digits}`;
}

async function startPayment() {
  if (!state.config?.paymentsConfigured) {
    toast('Оплата временно недоступна. Связаться можно в Telegram @ainicki.');
    return;
  }
  if (!state.user) {
    closePaywall();
    toast('Сначала подключите Telegram — это сохранит доступ после оплаты.');
    return;
  }
  const receiptContact = normalizedReceiptContact();
  if (!receiptContact) return;
  const button = $('#clonePayButton');
  const offerCode = state.selectedOffer || 'clone_day';
  const offer = offerCode === 'clone_alignment' ? alignmentOffer() : dayOffer();
  const amount = Number(offerCode === 'clone_alignment' ? (offer.payableAmount || offer.amount) : offer.amount);
  button.disabled = true;
  track('paywall_opened', 'clone_payment_started', { stage: 'payment_started', price: amount, offerCode });
  goal('clone_payment_start', { order_price: amount, currency: 'RUB', offer: offerCode });
  try {
    const result = await json('/api/payments/create', {
      method: 'POST',
      body: JSON.stringify({
        chartId: state.chartId,
        receiptContact,
        product: 'clone',
        offerCode,
      }),
    });
    if (!result.confirmationUrl) throw new Error('ЮKassa не вернула ссылку оплаты.');
    localStorage.setItem('starClonePendingPayment', JSON.stringify({
      paymentId: result.paymentId,
      paymentRef: result.paymentRef,
      chartId: state.chartId,
      offerCode,
      amount,
      createdAt: new Date().toISOString(),
    }));
    location.href = result.confirmationUrl;
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function renderFactorsFromChart(chart) {
  state.factorScope = chart?.birth?.unknownTime
    ? {
        unknownTime: true,
        system: chart.system,
        note: 'Время рождения неизвестно: дома, ASC/MC и Луна не используются в объяснении ответа.',
      }
    : null;
  const empty = $('#logicEmpty');
  const list = $('#logicFactors');
  list.classList.add('hidden');
  list.innerHTML = '';
  empty.classList.remove('hidden');
  empty.textContent = chart?.birth?.unknownTime
    ? 'Клон создан без точного времени. После ответа здесь появятся только устойчивые факторы даты — без домов, ASC/MC и Луны.'
    : 'Задайте ситуацию. После ответа здесь появятся только те параметры карты, которые действительно были переданы модели для этого хода.';
  const technical = $('#technicalBasis');
  if (technical) {
    technical.textContent = chart?.birth?.unknownTime
      ? 'Карта без домов: планеты по знакам, устойчивые аспекты и ретроградность. Дома, ASC/DSC, MC/IC и Луна исключены.'
      : 'Натальная карта, система домов Плацидуса, планеты, знаки, дома, аспекты, ретроградность, ASC/DSC и MC/IC.';
  }
}

function renderAnswerFactors(factors = [], scope = null) {
  const items = Array.isArray(factors) ? factors.filter((item) => item?.title && item?.role).slice(0, 6) : [];
  const empty = $('#logicEmpty');
  const list = $('#logicFactors');
  state.factorScope = scope || state.factorScope;
  if (!items.length) {
    list.classList.add('hidden');
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.textContent = scope?.note || 'Для этого ответа не удалось сформировать проверяемый след факторов.';
    return;
  }
  empty.classList.add('hidden');
  list.classList.remove('hidden');
  const scopeNote = scope?.note ? `<p class="factor-scope-note">${escapeHtml(scope.note)}</p>` : '';
  list.innerHTML = `${scopeNote}${items.map((factor) => `
    <div class="factor" data-factor-id="${escapeHtml(factor.id || factor.key || '')}">
      <strong>${escapeHtml(factor.title)}</strong>
      ${factor.position ? `<small>${escapeHtml(factor.position)}</small>` : ''}
      <p>${escapeHtml(factor.role)}</p>
    </div>`).join('')}`;
}

function renderPassport(passport) {
  state.passport = passport || null;
  const panel = $('#clonePassport');
  if (!panel) return;
  panel.classList.toggle('hidden', !passport);
  const sideAvatar = $('#cloneAvatar');
  if (!passport) {
    if (sideAvatar) {
      sideAvatar.textContent = '✦';
      sideAvatar.removeAttribute('style');
    }
    return;
  }

  const from = passport.avatar?.gradient?.from || '#7c3aed';
  const to = passport.avatar?.gradient?.to || '#db2777';
  const initials = passport.avatar?.initials || passport.avatar?.symbol || '✦';
  if (sideAvatar) {
    sideAvatar.textContent = initials;
    sideAvatar.style.background = `linear-gradient(135deg, ${from}, ${to})`;
  }
  const avatar = $('#passportAvatar');
  if (avatar) {
    avatar.style.background = `linear-gradient(135deg, ${from}, ${to})`;
    avatar.innerHTML = `<span>${escapeHtml(initials)}</span><small>${escapeHtml(passport.avatar?.symbol || '✦')}</small>`;
  }
  $('#clonePassportTitle').textContent = passport.title || 'Моя карта';
  $('#passportSubtitle').textContent = [passport.avatar?.signature, passport.subtitle].filter(Boolean).join(' · ');
  $('#passportSections').innerHTML = (passport.sections || []).map((section) => `
    <article class="passport-section">
      <small>${escapeHtml(section.position || '')}</small>
      <h4>${escapeHtml(section.title || '')}</h4>
      <p>${escapeHtml(section.meaning || '')}</p>
      <div><strong>Как применять</strong><span>${escapeHtml(section.application || '')}</span></div>
    </article>
  `).join('');
  const groups = [
    ['Сильные опоры', passport.strengths],
    ['Что проверять', passport.tensions],
    ['Рабочий маршрут', passport.route],
  ].filter(([, items]) => Array.isArray(items) && items.length);
  $('#passportSummary').innerHTML = groups.map(([title, items]) => `
    <div><strong>${escapeHtml(title)}</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
  `).join('');
  $('#passportDisclaimer').textContent = passport.disclaimer || '';
}

function setWorkspaceTab(tab) {
  const profileMode = tab === 'profile';
  $('.conversation')?.classList.toggle('hidden', profileMode);
  $('#logicPanel')?.classList.toggle('profile-mode', profileMode);
  $$('.side nav button').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  if (profileMode) {
    const target = state.passport ? $('#clonePassport') : $('#logicPanel');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}


async function loadHistory() {
  if (!state.chartId || !state.user) return false;
  try {
    const data = await json(`/api/charts/${encodeURIComponent(state.chartId)}/messages`);
    const dialogue = extractCloneDialogue(data.messages || []);
    state.questionCount = dialogue.filter((item) => item.role === 'user').length;
    state.localMessages = dialogue.map((item) => ({
      role: item.role === 'assistant' ? 'clone' : item.role,
      content: item.content,
      webSearch: item.metadata?.webSearch || null,
      factors: item.metadata?.factors || [],
      factorScope: item.metadata?.factorScope || null,
      createdAt: item.createdAt,
    }));
    renderConversation(state.localMessages);
    persistState();
    renderAllowance();
    renderCommerceUi();
    return true;
  } catch {
    return false;
  }
}

async function claimChart() {
  if (!state.chartId || !state.user) return;
  await json(`/api/charts/${state.chartId}/claim`, { method: 'POST', body: '{}' });
}

function stopAuthPoll() {
  if (state.authPoll) clearInterval(state.authPoll);
  state.authPoll = null;
  state.authPollStartedAt = 0;
}

async function askClone(question, pending, userElement) {
  track('consultant_opened', 'clone_question_sent', {
    questionLength: question.length,
    questionNumber: state.questionCount + 1,
  });
  let waitingForTelegram = false;
  try {
    const data = await json('/api/consult', {
      method: 'POST',
      body: JSON.stringify({ chartId: state.chartId, question, product: 'clone' }),
    });
    if (data.webSearch?.status === 'telegram_required') {
      pending.querySelector('p').textContent = 'Подключите Telegram — после входа Клон сам продолжит этот поиск.';
      renderWebSearch(pending.querySelector('div'), data.webSearch);
      state.pendingRequest = { question, userElement };
      waitingForTelegram = true;
      startAuthPoll(pending);
      return;
    }
    pending.querySelector('p').textContent = data.answer;
    renderWebSearch(pending.querySelector('div'), data.webSearch);
    state.localMessages.push(
      { role: 'user', content: question, createdAt: new Date().toISOString() },
      {
        role: 'clone',
        content: data.answer,
        webSearch: data.webSearch || null,
        factors: data.factors || [],
        factorScope: data.factorScope || null,
        createdAt: new Date().toISOString(),
      },
    );
    const countsAsAnonymousAnswer = !(data.webSearch?.requested && !state.user);
    if (countsAsAnonymousAnswer) {
      state.questionCount = Number(data.cloneUsage?.used || state.questionCount + 1);
    }
    renderAnswerFactors(data.factors || [], data.factorScope || null);
    persistState();
    renderAllowance();
    renderCommerceUi();
    track('card_opened', 'clone_answered', {
      questionNumber: state.questionCount,
      questionLength: question.length,
      answerLength: data.answer.length,
    });
    if (state.questionCount === 1) goal('clone_first_answer');
    if (!state.user && state.questionCount === FREE_PREAUTH_QUESTIONS) {
      goal('clone_third_answer');
      setTimeout(showSavePromptAfterFreeAnswers, 700);
    }
  } catch (error) {
    if (error.code === 'CLONE_TELEGRAM_REQUIRED') {
      state.questionCount = FREE_PREAUTH_QUESTIONS;
      renderAllowance();
      waitingForTelegram = true;
      showTelegramContinuation(pending, { question, userElement });
      return;
    }
    pending.remove();
    userElement?.remove();
    $('#question').value = question;
    $('#dialogError').textContent = error.message;
  } finally {
    if (!waitingForTelegram) setComposerBusy(false);
  }
}

function startAuthPoll(pending) {
  stopAuthPoll();
  state.authPollStartedAt = Date.now();
  state.authPoll = setInterval(async () => {
    if (Date.now() - state.authPollStartedAt > 180000) {
      const request = state.pendingRequest;
      state.pendingRequest = null;
      stopAuthPoll();
      request?.userElement?.remove();
      pending.remove();
      if (request?.question) $('#question').value = request.question;
      setComposerBusy(false);
      toast('Вход не завершён. Нажмите «Спросить клона» и попробуйте ещё раз.');
      return;
    }
    try {
      const config = await loadConfig();
      if (!config.user) return;
      state.config = config;
      state.user = config.user;
      stopAuthPoll();
      await claimChart();
      track('filter_changed', 'clone_login_succeeded');
      const widget = pending.querySelector('.telegram-login-slot');
      if (widget) widget.remove();
      const request = state.pendingRequest;
      state.pendingRequest = null;
      if (request) {
        pending.querySelector('p').textContent = 'Telegram подключён. Клон продолжает разбор ситуации…';
        await askClone(request.question, pending, request.userElement);
      } else {
        pending.querySelector('p').textContent = 'Telegram подключён. Теперь можно продолжить консультацию.';
        setComposerBusy(false);
      }
      renderAllowance();
      renderCommerceUi();
    } catch {
      // Ожидаем завершения Telegram popup.
    }
  }, 1200);
}

function mountTelegramLogin(container) {
  container.innerHTML = '';
  if (!state.config?.telegramConfigured) {
    container.textContent = 'Вход временно недоступен: проверьте настройки Telegram-бота.';
    setComposerBusy(false);
    return;
  }
  track('auth_opened', 'clone_auth_opened');
  if (typeof window.mountCloneTelegramLink !== 'function') {
    container.textContent = 'Не удалось открыть Telegram. Обновите страницу и попробуйте ещё раз.';
    setComposerBusy(false);
    return;
  }
  window.mountCloneTelegramLink(container);
}

function showTelegramContinuation(pending, request = null) {
  state.pendingRequest = request;
  pending.querySelector('p').textContent = request
    ? 'Три ответа уже получены. Подключите Telegram, чтобы сохранить клона и продолжить бесплатный разговор без лимита сообщений.'
    : 'Сохраните этого клона в Telegram. После входа бесплатный базовый диалог продолжится без лимита сообщений.';
  let slot = pending.querySelector('.telegram-login-slot');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'telegram-login-slot';
    slot.style.marginTop = '12px';
    pending.querySelector('div').append(slot);
  }
  mountTelegramLogin(slot);
  startAuthPoll(pending);
}

function showSavePromptAfterFreeAnswers() {
  if (state.user || state.questionCount !== FREE_PREAUTH_QUESTIONS) return;
  const prompt = message('clone', 'Сохраните этого клона в Telegram, чтобы продолжить разговор без лимита сообщений.', { persist: false });
  showTelegramContinuation(prompt);
}

function applyChartView(data, savedName) {
  state.chart = data.chart;
  state.chartAccess = data.access || null;
  state.passport = data.clonePassport || null;
  $('#cloneName').textContent = savedName || data.chart?.person?.name || data.chart?.birth?.name || 'Ваш звёздный клон';
  $('#cloneStatus').textContent = data.access?.cloneAccessActive ? accessLabel() : 'модель сохранена';
  $('#intro').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  show('#dialogView');
  renderFactorsFromChart(data.chart);
  renderPassport(data.clonePassport);
  renderCommerceUi();
}

async function restoreClone(saved) {
  if (!saved?.chartId || (!saved?.token && !state.user)) return false;
  state.chartId = saved.chartId;
  state.token = saved.token || null;
  state.questionCount = Number(saved.questionCount || 0);
  state.localMessages = Array.isArray(saved.messages) ? saved.messages : [];
  state.config = await loadConfig();
  state.user = state.config.user;
  const data = await json(`/api/charts/${encodeURIComponent(state.chartId)}`);
  applyChartView(data, saved.name);
  if (state.localMessages.length) renderConversation(state.localMessages);
  if (state.user) {
    await claimChart().catch(() => {});
    await loadHistory();
  }
  renderAllowance();
  renderCommerceUi();
  persistState();
  return true;
}

async function restoreLatestOwnedClone() {
  if (!state.user) return false;
  const library = await json('/api/me/charts?limit=1');
  const latest = library.items?.[0];
  if (!latest?.id) return false;
  const restored = await restoreClone({
    chartId: latest.id,
    token: null,
    name: latest.name,
    questionCount: 0,
    messages: [],
  });
  if (restored) toast('Сохранённый клон восстановлен через Telegram.');
  return restored;
}

function clearClonePaymentReturnState() {
  localStorage.removeItem('starClonePendingPayment');
  const url = new URL(location.href);
  url.searchParams.delete('payment');
  url.searchParams.delete('payment_ref');
  url.searchParams.delete('offer');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function verifyPaymentReturn() {
  toast('Проверяем конкретный платёж…');
  const params = new URLSearchParams(location.search);
  let pendingPayment = null;
  try { pendingPayment = JSON.parse(localStorage.getItem('starClonePendingPayment') || 'null'); } catch { pendingPayment = null; }
  const paymentRef = params.get('payment_ref') || pendingPayment?.paymentRef || null;
  const paymentId = paymentRef ? null : pendingPayment?.paymentId || null;

  if (!paymentId && !paymentRef) {
    toast('Не найден идентификатор платежа. Войдите через Telegram и откройте сохранённого клона.');
    return;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const query = new URLSearchParams();
      if (paymentRef) query.set('ref', paymentRef);
      if (paymentId) query.set('paymentId', paymentId);
      const payment = await json(`/api/payments/status?${query.toString()}`);

      if (payment.status === 'canceled') {
        clearClonePaymentReturnState();
        toast('Платёж отменён. Доступ не изменён.');
        return;
      }
      if (payment.status !== 'succeeded' || !payment.paid) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 700 : 1500));
        continue;
      }

      const offerCode = payment.offerCode || pendingPayment?.offerCode || params.get('offer') || 'clone_day';
      if (payment.chartId && payment.chartId !== state.chartId) {
        await restoreClone({
          chartId: payment.chartId,
          token: null,
          name: null,
          questionCount: 0,
          messages: [],
        });
      }
      state.config = await loadConfig();
      state.user = state.config.user;
      closePaywall();
      goal('clone_payment_success', { order_price: Number(payment.amount || 0), currency: 'RUB', offer: offerCode });
      track('paywall_opened', 'clone_payment_succeeded', {
        stage: 'payment_succeeded',
        price: Number(payment.amount || 0),
        offerCode,
      });
      if (state.chartId) {
        const data = await json(`/api/charts/${encodeURIComponent(state.chartId)}`).catch(() => null);
        if (data) applyChartView(data, $('#cloneName')?.textContent);
      }
      renderAllowance();
      renderCommerceUi();
      clearClonePaymentReturnState();
      toast(offerCode === 'clone_alignment'
        ? 'Сонастройка открыта для выбранного клона на 30 дней. Автопродления нет.'
        : 'Глубокий режим открыт на 24 часа. Карта и Паспорт клона останутся у вас.');
      return;
    } catch (error) {
      lastError = error;
      if (!['PAYMENT_NETWORK_ERROR', 'PAYMENT_RATE_LIMITED', 'PAYMENT_PROVIDER_ERROR'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 700 : 1500));
    }
  }
  if (lastError) console.warn('Clone payment verification remains pending:', lastError.message);
  toast('Платёж ещё подтверждается. Обновите страницу через минуту.');
}

$('#restoreCloneAccess')?.addEventListener('click', async () => {
  try {
    if (state.user) {
      const restored = await restoreLatestOwnedClone();
      if (!restored) toast('В Telegram-профиле пока нет сохранённого клона.');
      return;
    }
    const slot = $('#restoreTelegramSlot');
    slot.classList.remove('hidden');
    mountTelegramLogin(slot);
    track('auth_opened', 'clone_restore_auth_opened');
  } catch (error) {
    toast(error.message);
  }
});

$$('[data-go-create]').forEach((button) => button.addEventListener('click', () => {
  track('form_started', 'clone_creation_started');
  goal('clone_start');
  $('#intro').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  show('#createView');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

let placeTimer;
let activePlaceIndex = -1;

function closePlaceResults(status = '') {
  $('#placeResults').innerHTML = '';
  $('#placeQuery').setAttribute('aria-expanded', 'false');
  $('#placeQuery').removeAttribute('aria-activedescendant');
  $('#placeStatus').textContent = status;
  activePlaceIndex = -1;
}

function setActivePlaceIndex(index) {
  const options = [...$('#placeResults').querySelectorAll('[role="option"]')];
  if (!options.length) return;
  activePlaceIndex = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === activePlaceIndex;
    option.setAttribute('aria-selected', String(active));
    option.classList.toggle('active', active);
  });
  $('#placeQuery').setAttribute('aria-activedescendant', options[activePlaceIndex].id);
  options[activePlaceIndex].scrollIntoView({ block: 'nearest' });
}

$('#placeQuery').addEventListener('input', () => {
  clearTimeout(placeTimer);
  state.selectedPlace = null;
  $('#placeValue').value = '';
  const query = $('#placeQuery').value.trim();
  if (query.length < 2) {
    closePlaceResults();
    return;
  }
  placeTimer = setTimeout(async () => {
    try {
      const data = await json(`/api/places?q=${encodeURIComponent(query)}`);
      if ($('#placeQuery').value.trim() !== query) return;
      const items = (data.items || []).slice(0, 6);
      closePlaceResults(items.length ? `Найдено городов: ${items.length}` : 'Города не найдены');
      items.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `place-option-${index}`;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');
        button.textContent = item.label || item.name;
        button.onclick = () => {
          state.selectedPlace = item;
          $('#placeQuery').value = item.label || item.name;
          $('#placeValue').value = selectedPlaceValue(item);
          closePlaceResults(`Выбран город: ${item.label || item.name}`);
        };
        button.onpointermove = () => setActivePlaceIndex(index);
        $('#placeResults').append(button);
      });
      $('#placeQuery').setAttribute('aria-expanded', String(items.length > 0));
    } catch {
      closePlaceResults('Не удалось загрузить города');
    }
  }, 250);
});

$('#placeQuery').addEventListener('keydown', (event) => {
  const options = [...$('#placeResults').querySelectorAll('[role="option"]')];
  if (event.key === 'ArrowDown' && options.length) {
    event.preventDefault();
    setActivePlaceIndex(activePlaceIndex + 1);
  } else if (event.key === 'ArrowUp' && options.length) {
    event.preventDefault();
    setActivePlaceIndex(activePlaceIndex - 1);
  } else if (event.key === 'Enter' && activePlaceIndex >= 0) {
    event.preventDefault();
    options[activePlaceIndex]?.click();
  } else if (event.key === 'Escape') {
    closePlaceResults();
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.place-label')) closePlaceResults();
});

function syncUnknownBirthTime() {
  const checkbox = $('#unknownTime');
  const time = $('#birthTime') || $('#birthForm input[name="time"]');
  const label = $('#birthTimeLabel');
  const note = $('#unknownTimeNote');
  if (!checkbox || !time) return;
  const unknown = checkbox.checked;
  time.disabled = unknown;
  time.required = !unknown;
  if (unknown) time.value = '';
  label?.classList.toggle('is-disabled', unknown);
  if (note) note.textContent = unknown
    ? 'Будет построен режим без домов. В объяснении ответов не используются ASC/MC и Луна — только устойчивые параметры даты.'
    : 'Точное время включает дома Плацидуса и углы карты.';
}

$('#unknownTime')?.addEventListener('change', syncUnknownBirthTime);
syncUnknownBirthTime();

function buildBirthPayload(form, selectedPlace) {
  const formData = new FormData(form);
  const unknownTime = Boolean(form.querySelector('input[name="unknownTime"]:checked'));
  const birthTime = String(formData.get('time') || '').trim();
  return {
    name: formData.get('name'),
    date: formData.get('date'),
    time: unknownTime ? '' : birthTime,
    unknownTime,
    place: selectedPlaceValue(selectedPlace),
    personalDataConsent: formData.get('personalDataConsent') === 'on',
    product: 'clone',
  };
}

$('#birthForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#formError').textContent = '';
  if (!state.selectedPlace) {
    $('#formError').textContent = 'Выберите город из подсказки.';
    return;
  }
  const payload = buildBirthPayload(event.currentTarget, state.selectedPlace);
  show('#buildingView');
  const steps = ['Рассчитываем натальную карту…', 'Определяем характер действия…', 'Сопоставляем дома и аспекты…', 'Формируем логику решений…'];
  let index = 0;
  const timer = setInterval(() => { $('#buildStep').textContent = steps[Math.min(++index, steps.length - 1)]; }, 900);
  try {
    const data = await json('/api/charts', { method: 'POST', body: JSON.stringify(payload) });
    state.chartId = data.id;
    state.token = data.accessToken;
    state.chart = data.chart;
    state.chartAccess = data.access || null;
    state.questionCount = 0;
    state.localMessages = [];
    $('#cloneName').textContent = payload.name;
    $('#cloneStatus').textContent = payload.unknownTime ? 'модель без домов' : 'модель создана';
    persistState({ name: payload.name });
    const url = new URL(location.href);
    url.pathname = location.pathname.startsWith('/clone/live') ? '/clone/live/' : '/clone/';
    url.searchParams.set('chart', state.chartId);
    history.replaceState(null, '', url);
    renderFactorsFromChart(data.chart);
    renderPassport(data.clonePassport);
    show('#dialogView');
    renderAllowance();
    track('new_chart_clicked', 'clone_created', { name: payload.name, place: data.chart?.birth?.place || null });
    goal('clone_created');
  } catch (error) {
    show('#createView');
    $('#formError').textContent = error.message;
  } finally {
    clearInterval(timer);
  }
});

$$('.chips button').forEach((button) => button.addEventListener('click', () => {
  $('#question').value = button.dataset.prompt || button.textContent;
  syncComposerSubmitState();
  $('#question').focus();
}));

$('#newSituation').addEventListener('click', () => {
  if (!canAsk()) return;
  $('#question').value = '';
  syncComposerSubmitState();
  $('#question').focus();
});

$('#question').addEventListener('input', syncComposerSubmitState);

$('#questionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.asking) return;
  const question = $('#question').value.trim();
  if (!question || !canAsk()) return;
  $('#dialogError').textContent = '';
  setComposerBusy(true);
  dismissVisibleInlineOffers();
  const userElement = message('user', question, { persist: false });
  syncConversationStarted();
  $('#question').value = '';
  const pending = message('clone', 'Клон готовит ответ…', { persist: false });
  try {
    state.config = await loadConfig();
    state.user = state.config.user;
    renderAllowance();
    if (!state.user && state.questionCount >= FREE_PREAUTH_QUESTIONS) {
      showTelegramContinuation(pending, { question, userElement });
      return;
    }
    await askClone(question, pending, userElement);
  } catch (error) {
    pending.remove();
    userElement.remove();
    $('#question').value = question;
    $('#dialogError').textContent = error.message;
    setComposerBusy(false);
  }
});

$('#closeClonePaywall').addEventListener('click', closePaywall);
$('#clonePaywall').addEventListener('click', (event) => {
  if (event.target === $('#clonePaywall')) closePaywall();
});
$('#clonePayButton').addEventListener('click', startPayment);
$('#openFullModeOffer')?.addEventListener('click', () => openPaywall('clone_day'));
$('#openAlignmentOffer')?.addEventListener('click', () => openPaywall('clone_alignment'));
$('#openPremiumDiscovery')?.addEventListener('click', () => openPremiumDiscovery('header_entry'));
$('#openPassportPremium')?.addEventListener('click', () => openPremiumDiscovery('passport_entry'));
$('#closePremiumDiscovery')?.addEventListener('click', () => closePremiumDiscovery());
$('#returnToDialog')?.addEventListener('click', () => closePremiumDiscovery());
$('#continueToFullMode')?.addEventListener('click', () => {
  const discoveryTrigger = activeDialogTrigger;
  closePremiumDiscovery({ restoreFocus: false });
  openPaywall('clone_day', discoveryTrigger);
});
$('#premiumDiscovery')?.addEventListener('click', (event) => {
  if (event.target === $('#premiumDiscovery')) closePremiumDiscovery();
});
$$('[data-dismiss-offer]').forEach((button) => button.addEventListener('click', () => dismissOffer(button.dataset.dismissOffer)));
$$('.side nav button').forEach((button) => button.addEventListener('click', () => setWorkspaceTab(button.dataset.tab || 'dialog')));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && activeDialog) {
    const focusable = dialogFocusable(activeDialog);
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(document.activeElement);
    const leavingStart = event.shiftKey && currentIndex <= 0;
    const leavingEnd = !event.shiftKey && currentIndex === focusable.length - 1;
    if (leavingStart || leavingEnd) {
      event.preventDefault();
      focusable[leavingStart ? focusable.length - 1 : 0].focus();
    }
    return;
  }
  if (event.key !== 'Escape' || !activeDialog) return;
  if (activeDialog === $('#premiumDiscovery')) closePremiumDiscovery();
  else closePaywall();
});

(async () => {
  syncComposerSubmitState();
  track('page_view', 'clone_page_view', { path: location.pathname });
  try {
    state.config = await loadConfig();
    state.user = state.config.user;
    prepareOffer('clone_day');
    $('#clonePayButton').disabled = !state.config.paymentsConfigured;
    renderAllowance();
    renderCommerceUi();

    const params = new URLSearchParams(location.search);
    const requestedChartId = params.get('chart');
    const saved = savedState();
    let restored = false;
    if (requestedChartId && state.user) {
      restored = await restoreClone({
        chartId: requestedChartId,
        token: saved?.chartId === requestedChartId ? saved.token : null,
        name: saved?.chartId === requestedChartId ? saved.name : null,
        questionCount: 0,
        messages: [],
      }).catch(() => false);
    }
    if (!restored && saved) restored = await restoreClone(saved).catch(() => false);
    if (!restored && saved) localStorage.removeItem(STORAGE_KEY);
    if (!restored && state.user) restored = await restoreLatestOwnedClone().catch(() => false);
    if (params.get('payment') === 'return') await verifyPaymentReturn();
  } catch (error) {
    toast(error.message);
  }
})();
