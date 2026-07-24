const METRIKA_ID = 110937602;
const FREE_QUESTIONS = 3;
const STORAGE_KEY = 'starClone';
const ATTRIBUTION_KEY = 'starCloneAttribution';

const state = {
  chartId: null,
  token: null,
  chart: null,
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

function message(role, text, { persist = true } = {}) {
  const element = document.createElement('article');
  element.className = `message ${role}`;
  element.innerHTML = role === 'clone'
    ? '<span class="mini-avatar">✦</span><div><b>Звёздный клон</b><p></p></div>'
    : '<div><b>Вы</b><p></p></div>';
  element.querySelector('p').textContent = text;
  $('#messages').append(element);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  if (persist) {
    state.localMessages.push({ role, content: text, createdAt: new Date().toISOString() });
    persistState();
  }
  return element;
}

function resetMessages() {
  $('#messages').innerHTML = '<article class="message clone"><span class="mini-avatar">✦</span><div><b>Звёздный клон</b><p>Я готов. Опишите ситуацию, в которой мне нужно выбрать, ответить или действовать.</p></div></article>';
}

function renderConversation(messages) {
  resetMessages();
  for (const item of messages) message(item.role === 'assistant' ? 'clone' : item.role, item.content, { persist: false });
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

function accessLabel() {
  if (!state.user?.cloneAccessActive) return null;
  const until = state.user.cloneAccessUntil ? new Date(state.user.cloneAccessUntil) : null;
  const date = until && !Number.isNaN(until.getTime())
    ? until.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  if (state.user.clonePlan === 'alignment') return date ? `Сонастройка активна до ${date}` : 'Сонастройка активна';
  if (state.user.clonePlan === 'day') return date ? `Глубокий режим открыт до ${date}` : 'День со Звёздным клоном открыт';
  return date ? `Глубокий режим открыт до ${date}` : 'Глубокий режим открыт';
}

function renderAllowance() {
  const element = $('#questionAllowance');
  if (!element) return;
  const paidLabel = accessLabel();
  if (paidLabel) {
    element.textContent = paidLabel;
    element.classList.add('unlimited');
    return;
  }
  element.classList.remove('unlimited');
  const remaining = Math.max(0, FREE_QUESTIONS - state.questionCount);
  element.textContent = remaining
    ? `${remaining} ${remaining === 1 ? 'бесплатное решение' : 'бесплатных решения'}`
    : 'Бесплатные решения закончились';
}

function setComposerBusy(busy) {
  state.asking = busy;
  const button = $('#questionForm button[type="submit"]');
  const textarea = $('#question');
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? 'Клон размышляет…' : 'Спросить клона';
  }
  if (textarea) textarea.disabled = busy;
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

function renderCommerceUi() {
  const alignment = alignmentOffer();
  const activeDay = state.user?.clonePlan === 'day' && state.user?.cloneAccessActive;
  const showAlignment = Boolean(state.user && !state.user?.clonePlan?.includes('alignment') && (activeDay || alignment.credited));
  $('#alignmentOffer')?.classList.toggle('hidden', !showAlignment);
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
  $('#cloneOfferEyebrow').textContent = isAlignment ? 'Продолжение после знакомства' : 'Первые три решения разобраны';
  $('#clonePaywallTitle').textContent = isAlignment ? 'Сонастройка на 30 дней' : 'День со Звёздным клоном';
  $('#cloneOfferDescription').textContent = isAlignment
    ? 'Ежедневно сверяйте реальные ситуации с клоном, получайте ключевые моменты карты и простые мини-задания в Telegram.'
    : 'Разберите за 24 часа все важные ситуации в глубоком режиме. Полная карта, персональный аватар и Паспорт клона останутся у вас навсегда.';
  $('#cloneOfferBenefits').innerHTML = (isAlignment
    ? ['✓ 30 дней глубоких вопросов клону', '✓ Ключевые моменты карты в Telegram', '✓ Простые мини-задания для проверки в жизни']
    : ['✓ Глубокий алгоритм на 24 часа', '✓ Все важные вопросы в разумном темпе', '✓ Полная карта и Паспорт клона навсегда'])
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

function openPaywall(offerCode = 'clone_day') {
  prepareOffer(offerCode);
  track('paywall_opened', 'clone_paywall_opened', { questionCount: state.questionCount, offerCode });
  goal('clone_paywall', { offer: offerCode });
  $('#clonePaywall').classList.remove('hidden');
}

function closePaywall() {
  $('#clonePaywall').classList.add('hidden');
}

function canAsk() {
  if (state.user?.cloneAccessActive) return true;
  if (state.questionCount < FREE_QUESTIONS) return true;
  openPaywall('clone_day');
  return false;
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
    localStorage.setItem('starClonePendingPayment', JSON.stringify({ offerCode, amount, createdAt: new Date().toISOString() }));
    location.href = result.confirmationUrl;
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function renderFactorsFromChart(chart) {
  if (!chart) return;
  const planets = chart.planets || [];
  const factors = [];
  const mars = planets.find((planet) => planet.key === 'mars');
  const moon = planets.find((planet) => planet.key === 'moon');
  if (mars) factors.push([`${mars.name} в ${mars.sign}${mars.house ? ` · ${mars.house} дом` : ''}`, 'Способ, которым клон переходит от оценки ситуации к действию.']);
  if (moon) factors.push([`${moon.name} в ${moon.sign}${moon.house ? ` · ${moon.house} дом` : ''}`, 'Автоматическая эмоциональная реакция модели.']);
  if (chart.angles?.ascendant) factors.push([`Асцендент · ${chart.angles.ascendant.sign}`, 'То, как клон входит в новую ситуацию и что замечает первым.']);
  if (chart.angles?.mc) factors.push([`MC · ${chart.angles.mc.sign}`, 'Внешний результат, к которому тяготеет решение.']);
  if (!factors.length) return;
  $('#logicEmpty').classList.add('hidden');
  $('#logicFactors').classList.remove('hidden');
  $('#logicFactors').innerHTML = factors.slice(0, 4).map(([title, body]) => `<div class="factor"><strong>${title}</strong><p>${body}</p></div>`).join('');
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
  $('#clonePassportTitle').textContent = passport.title || 'Паспорт клона';
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
      createdAt: item.createdAt,
    }));
    renderConversation(state.localMessages);
    persistState();
    renderAllowance();
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
    question: question.slice(0, 500),
    questionNumber: state.questionCount + 1,
  });
  try {
    const data = await json('/api/consult', {
      method: 'POST',
      body: JSON.stringify({ chartId: state.chartId, question, product: 'clone' }),
    });
    pending.querySelector('p').textContent = data.answer;
    state.localMessages.push(
      { role: 'user', content: question, createdAt: new Date().toISOString() },
      { role: 'clone', content: data.answer, createdAt: new Date().toISOString() },
    );
    state.questionCount = Number(data.cloneUsage?.used || state.questionCount + 1);
    persistState();
    renderAllowance();
    renderCommerceUi();
    track('card_opened', 'clone_answered', {
      questionNumber: state.questionCount,
      questionLength: question.length,
      answerLength: data.answer.length,
    });
    if (state.questionCount === 1) goal('clone_first_answer');
    if (!state.user?.cloneAccessActive && state.questionCount >= FREE_QUESTIONS) {
      goal('clone_third_answer');
      setTimeout(() => openPaywall('clone_day'), 900);
    }
  } catch (error) {
    pending.remove();
    userElement?.remove();
    $('#question').value = question;
    if (error.code === 'CLONE_FREE_LIMIT') {
      state.questionCount = FREE_QUESTIONS;
      renderAllowance();
      openPaywall('clone_day');
    }
    $('#dialogError').textContent = error.message;
  } finally {
    setComposerBusy(false);
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
      const config = await json('/api/config');
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
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.dataset.telegramLogin = state.config.telegramBotUsername;
  script.dataset.size = 'large';
  script.dataset.radius = '12';
  script.dataset.userpic = 'true';
  script.dataset.requestAccess = 'write';
  const callback = new URL('/auth/telegram/callback', location.origin);
  callback.searchParams.set('state', `clone:${state.chartId || ''}`);
  script.dataset.authUrl = callback.toString();
  container.append(script);
}

function applyChartView(data, savedName) {
  state.chart = data.chart;
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

async function verifyPaymentReturn() {
  toast('Проверяем оплату…');
  const returnedOffer = new URLSearchParams(location.search).get('offer') || 'clone_day';
  let pendingPayment = null;
  try { pendingPayment = JSON.parse(localStorage.getItem('starClonePendingPayment') || 'null'); } catch { pendingPayment = null; }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt ? 1500 : 800));
    state.config = await json('/api/config');
    state.user = state.config.user;
    const expectedActive = returnedOffer === 'clone_alignment'
      ? state.user?.clonePlan === 'alignment'
      : state.user?.cloneAccessActive;
    if (expectedActive) {
      closePaywall();
      renderAllowance();
      renderCommerceUi();
      const offer = returnedOffer === 'clone_alignment' ? alignmentOffer() : dayOffer();
      const amount = Number(pendingPayment?.offerCode === returnedOffer
        ? pendingPayment.amount
        : returnedOffer === 'clone_alignment' ? (offer.payableAmount || offer.amount) : offer.amount);
      goal('clone_payment_success', { order_price: amount, currency: 'RUB', offer: returnedOffer });
      track('paywall_opened', 'clone_payment_succeeded', { stage: 'payment_succeeded', price: amount, offerCode: returnedOffer });
      if (state.chartId) {
        const data = await json(`/api/charts/${encodeURIComponent(state.chartId)}`).catch(() => null);
        if (data) applyChartView(data, $('#cloneName')?.textContent);
      }
      localStorage.removeItem('starClonePendingPayment');
      toast(returnedOffer === 'clone_alignment'
        ? 'Сонастройка открыта на 30 дней. Автопродления нет.'
        : 'Глубокий режим открыт на 24 часа. Карта и Паспорт клона останутся у вас.');
      return;
    }
  }
  toast('Платёж ещё подтверждается. Обновите страницу через минуту.');
}

$$('[data-go-create]').forEach((button) => button.addEventListener('click', () => {
  track('form_started', 'clone_creation_started');
  goal('clone_start');
  $('#intro').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  show('#createView');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

let placeTimer;
$('#placeQuery').addEventListener('input', () => {
  clearTimeout(placeTimer);
  state.selectedPlace = null;
  $('#placeValue').value = '';
  const query = $('#placeQuery').value.trim();
  if (query.length < 2) {
    $('#placeResults').innerHTML = '';
    return;
  }
  placeTimer = setTimeout(async () => {
    try {
      const data = await json(`/api/places?q=${encodeURIComponent(query)}`);
      $('#placeResults').innerHTML = '';
      (data.items || []).slice(0, 6).forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label || item.name;
        button.onclick = () => {
          state.selectedPlace = item;
          $('#placeQuery').value = item.label || item.name;
          $('#placeValue').value = selectedPlaceValue(item);
          $('#placeResults').innerHTML = '';
        };
        $('#placeResults').append(button);
      });
    } catch {
      $('#placeResults').innerHTML = '';
    }
  }, 250);
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.place-label')) $('#placeResults').innerHTML = '';
});

$('#birthForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#formError').textContent = '';
  if (!state.selectedPlace) {
    $('#formError').textContent = 'Выберите город из подсказки.';
    return;
  }
  const formData = new FormData(event.currentTarget);
  show('#buildingView');
  const steps = ['Рассчитываем натальную карту…', 'Определяем характер действия…', 'Сопоставляем дома и аспекты…', 'Формируем логику решений…'];
  let index = 0;
  const timer = setInterval(() => { $('#buildStep').textContent = steps[Math.min(++index, steps.length - 1)]; }, 900);
  try {
    const payload = {
      name: formData.get('name'),
      date: formData.get('date'),
      time: formData.get('time'),
      place: selectedPlaceValue(state.selectedPlace),
      product: 'clone',
    };
    const data = await json('/api/charts', { method: 'POST', body: JSON.stringify(payload) });
    state.chartId = data.id;
    state.token = data.accessToken;
    state.chart = data.chart;
    state.questionCount = 0;
    state.localMessages = [];
    $('#cloneName').textContent = payload.name;
    $('#cloneStatus').textContent = 'модель создана';
    persistState({ name: payload.name });
    const url = new URL(location.href);
    url.pathname = '/clone/';
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
  $('#question').value = button.textContent;
  $('#question').focus();
}));

$('#newSituation').addEventListener('click', () => {
  if (!canAsk()) return;
  $('#question').value = '';
  $('#question').focus();
});

$('#questionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.asking) return;
  const question = $('#question').value.trim();
  if (!question || !canAsk()) return;
  $('#dialogError').textContent = '';
  setComposerBusy(true);
  const userElement = message('user', question, { persist: false });
  $('#question').value = '';
  const pending = message('clone', 'Клон сопоставляет ситуацию с конфигурацией карты…', { persist: false });
  try {
    state.config = await json('/api/config');
    state.user = state.config.user;
    renderAllowance();
    if (!state.user) {
      state.pendingRequest = { question, userElement };
      pending.querySelector('p').textContent = 'Подключите Telegram — он сохранит клона, три бесплатных вопроса и историю разговора.';
      const slot = document.createElement('div');
      slot.className = 'telegram-login-slot';
      slot.style.marginTop = '12px';
      pending.querySelector('div').append(slot);
      mountTelegramLogin(slot);
      startAuthPoll(pending);
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
$('#openAlignmentOffer')?.addEventListener('click', () => openPaywall('clone_alignment'));
$$('.side nav button').forEach((button) => button.addEventListener('click', () => setWorkspaceTab(button.dataset.tab || 'dialog')));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePaywall();
});

(async () => {
  track('page_view', 'clone_page_view', { path: location.pathname });
  try {
    state.config = await json('/api/config');
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
    if (params.get('payment') === 'return') await verifyPaymentReturn();
  } catch (error) {
    toast(error.message);
  }
})();
