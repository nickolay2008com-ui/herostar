import { deepDiveButtonMarkup, openDeepDive } from './deep-dive-ui.js';

const CURRENT_CHART_VERSION = '0.2-placidus';

const state = {
  config: null,
  current: null,
  history: [],
  filter: 'all',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  birthForm: $('#birthForm'),
  demoButton: $('#demoButton'),
  loadingStage: $('#loadingStage'),
  loadingTitle: $('#loadingTitle'),
  loadingText: $('#loadingText'),
  loadingProgress: $('#loadingProgress'),
  loadingSteps: $('#loadingSteps'),
  map: $('#map'),
  mapTitle: $('#mapTitle'),
  mapSubtitle: $('#mapSubtitle'),
  identityName: $('#identityName'),
  identityMeta: $('#identityMeta'),
  archetypeText: $('#archetypeText'),
  accuracyNote: $('#accuracyNote'),
  wheelWrap: $('#wheelWrap'),
  cardStack: $('#cardStack'),
  synthesis: $('#synthesis'),
  modeTabs: $('#modeTabs'),
  unknownTime: $('#unknownTime'),
  timeField: $('#timeField'),
  loginButton: $('#loginButton'),
  userButton: $('#userButton'),
  authModal: $('#authModal'),
  payModal: $('#payModal'),
  telegramSlot: $('#telegramSlot'),
  payButton: $('#payButton'),
  priceLabel: $('#priceLabel'),
  toast: $('#toast'),
  consultFab: $('#consultFab'),
  consultPanel: $('#consultPanel'),
  closeConsult: $('#closeConsult'),
  consultForm: $('#consultForm'),
  chat: $('#chat'),
  questionChips: $('#questionChips'),
  shareButton: $('#shareButton'),
  newMapButton: $('#newMapButton'),
};

const loadingSequence = [
  ['Определяем небесную схему', 'Планеты считаются отдельно. ИИ не получает права сочинять космос, к счастью.', 18, 'Точные положения'],
  ['Строим дома Плацидуса', 'Точное время, место и исторический часовой пояс превращаются в реальные куспиды домов.', 36, 'Плацидус'],
  ['Ищем контрасты', 'Каждое качество сравнивается с противоположным типом, чтобы убрать универсальную кашу.', 58, 'Анти-Барнум'],
  ['Соединяем внутренние механизмы', 'Планеты перестают быть списком и начинают объяснять, как части личности работают вместе.', 78, 'Синтез'],
  ['Собираем маршрут', 'Ловушки переводятся в конкретные ключи и обратимые действия.', 92, 'Практический путь'],
];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Не удалось выполнить действие.');
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function chartToken() {
  return state.current?.accessToken || localStorage.getItem('herostar_chart_token') || '';
}

function chartHeaders() {
  const token = chartToken();
  return token ? { 'X-Chart-Token': token } : {};
}

function clearStoredChart() {
  localStorage.removeItem('herostar_chart_id');
  localStorage.removeItem('herostar_chart_token');
  state.current = null;
  els.map.classList.add('hidden');
  els.consultFab.classList.add('hidden');
  document.querySelector('.hero').classList.remove('hidden');
}

async function loadConfig() {
  state.config = await api('/api/config');
  els.priceLabel.textContent = `${new Intl.NumberFormat('ru-RU').format(state.config.price)} ₽`;
  renderUser();
}

function renderUser() {
  const user = state.config?.user;
  els.loginButton.classList.toggle('hidden', Boolean(user));
  els.userButton.classList.toggle('hidden', !user);
  if (user) {
    els.userButton.textContent = user.premium ? `${user.firstName || 'Профиль'} · полная карта` : user.firstName || user.username || 'Профиль';
  }
}

function setLoading(active) {
  document.querySelector('.hero').classList.toggle('hidden', active);
  els.loadingStage.classList.toggle('hidden', !active);
  if (active) els.map.classList.add('hidden');
}

function runLoadingSequence() {
  let index = 0;
  els.loadingSteps.innerHTML = loadingSequence.map((step) => `<span>${escapeHtml(step[3])}</span>`).join('');
  const advance = () => {
    const [title, text, progress] = loadingSequence[index];
    els.loadingTitle.textContent = title;
    els.loadingText.textContent = text;
    els.loadingProgress.style.width = `${progress}%`;
    [...els.loadingSteps.children].forEach((node, i) => node.classList.toggle('done', i <= index));
    index = Math.min(index + 1, loadingSequence.length - 1);
  };
  advance();
  return setInterval(advance, 950);
}

async function createChart(payload) {
  setLoading(true);
  const interval = runLoadingSequence();
  try {
    const result = await api('/api/charts', { method: 'POST', body: JSON.stringify(payload) });
    state.current = result;
    localStorage.setItem('herostar_chart_id', result.id);
    localStorage.setItem('herostar_chart_token', result.accessToken);
    await new Promise((resolve) => setTimeout(resolve, 420));
    renderMap();
    setLoading(false);
    els.map.classList.remove('hidden');
    els.consultFab.classList.remove('hidden');
    requestAnimationFrame(() => els.map.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } catch (error) {
    setLoading(false);
    document.querySelector('.hero').classList.remove('hidden');
    toast(error.message);
  } finally {
    clearInterval(interval);
  }
}

function birthLabel(chart) {
  const birth = chart.birth;
  const date = new Date(`${birth.date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = birth.unknownTime ? 'время неизвестно' : birth.time;
  return `${date} · ${time}<br>${escapeHtml(birth.place)}`;
}

function polarPoint(angle, radius, center = 160) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: center + Math.cos(radians) * radius, y: center + Math.sin(radians) * radius };
}

function normalizedArc(from, to) {
  return ((to - from) % 360 + 360) % 360;
}

function renderWheel(chart) {
  const signs = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  const points = [...chart.planets, chart.northNode];
  const cusps = chart.houses?.cusps?.length === 12 ? chart.houses.cusps : [];
  const houseAxes = cusps.map((cusp) => {
    const end = polarPoint(cusp.longitude, 136);
    return `<line class="house-axis" x1="160" y1="160" x2="${end.x}" y2="${end.y}"/>`;
  }).join('');
  const houseLabels = cusps.map((cusp, index) => {
    const next = cusps[(index + 1) % 12];
    const middle = cusp.longitude + normalizedArc(cusp.longitude, next.longitude) / 2;
    const p = polarPoint(middle, 104);
    return `<text class="house-label" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="middle">${cusp.house}</text>`;
  }).join('');
  const signLabels = signs.map((sign, index) => {
    const p = polarPoint(index * 30 + 15, 146);
    return `<text class="sign-label" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="middle">${sign}</text>`;
  }).join('');
  const dots = points.map((point, index) => {
    const radius = 88 + (index % 3) * 13;
    const p = polarPoint(point.longitude, radius);
    return `<g data-card-id="${point.key}" role="button" tabindex="0">
      <circle class="planet-dot" cx="${p.x}" cy="${p.y}" r="4.4" fill="${index % 2 ? '#87e8dc' : '#c4b0ff'}"></circle>
      <text class="planet-label" x="${p.x}" y="${p.y - 9}" text-anchor="middle">${escapeHtml(point.symbol)}</text>
    </g>`;
  }).join('');

  const angleMark = (angle, label, stroke, radius = 137) => {
    if (!Number.isFinite(angle)) return '';
    const p = polarPoint(angle, radius);
    return `<line class="angle-axis" x1="160" y1="160" x2="${p.x}" y2="${p.y}" stroke="${stroke}"/>
      <text class="angle-label" x="${p.x}" y="${p.y}" fill="${stroke}" text-anchor="middle">${label}</text>`;
  };
  const ascMark = angleMark(chart.angles?.ascendant?.longitude, 'ASC', '#e7c782');
  const mcMark = angleMark(chart.angles?.mc?.longitude, 'MC', '#87e8dc', 132);

  els.wheelWrap.innerHTML = `<svg class="wheel" viewBox="0 0 320 320" aria-label="Натальная карта: ${escapeHtml(chart.system)}">
    <circle class="ring" cx="160" cy="160" r="139"/>
    <circle class="ring" cx="160" cy="160" r="116"/>
    <circle class="ring" cx="160" cy="160" r="72"/>
    ${houseAxes}${signLabels}${houseLabels}${ascMark}${mcMark}${dots}
    <circle cx="160" cy="160" r="23" fill="rgba(169,137,255,.12)" stroke="rgba(169,137,255,.25)"/>
    <text x="160" y="165" text-anchor="middle" fill="#c4b0ff" font-size="16">✦</text>
  </svg>`;

  els.wheelWrap.querySelectorAll('[data-card-id]').forEach((node) => {
    const open = () => {
      state.filter = 'all';
      renderCards();
      const card = document.querySelector(`[data-treasure-id="${node.dataset.cardId}"]`);
      if (card) {
        card.classList.add('open');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    node.addEventListener('click', open);
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
}

function cardTemplate(card, index) {
  const locked = Boolean(card.locked);
  const body = locked
    ? `<div class="card-content">
        <div class="locked-preview">
          <p class="card-question">${escapeHtml(card.question)}</p>
          <p>${escapeHtml(card.lead)}</p>
          <div class="insight-grid"><div class="insight"><span>Уникальный пример</span><p>Личный жизненный сценарий раскрывается здесь…</p></div><div class="insight contrast"><span>Как бывает иначе</span><p>Сравнение с противоположным типом…</p></div></div>
        </div>
        <div class="unlock-overlay"><div class="unlock-box"><b>Здесь спрятан личный ключ</b><p>Откройте контраст, ловушку и практическое действие именно для этого положения.</p><button data-open-pay type="button">Открыть полную карту</button></div></div>
      </div>`
    : `<div class="card-content">
        <p class="card-question">${escapeHtml(card.question)}</p>
        <p>${escapeHtml(card.lead)}</p>
        <p>${escapeHtml(card.manifestation)}</p>
        <div class="insight-grid">
          <div class="insight"><span>Уникальный пример</span><p>${escapeHtml(card.uniqueExample)}</p></div>
          <div class="insight contrast"><span>Как бывает иначе</span><p>${escapeHtml(card.contrast)}</p></div>
          <div class="insight trap"><span>Главная ловушка</span><p>${escapeHtml(card.trap)}</p></div>
          <div class="insight"><span>Личный ключ</span><p>${escapeHtml(card.key)}</p></div>
        </div>
        <div class="action-box"><b>→</b><p>${escapeHtml(card.action)}</p></div>
        <div class="evidence-row">${(card.evidence || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
        ${deepDiveButtonMarkup(card)}
      </div>`;

  return `<article class="treasure-card ${locked ? 'locked-card' : ''} ${index === 0 ? 'open' : ''}" data-treasure-id="${escapeHtml(card.id)}">
    <button class="card-trigger" type="button" aria-expanded="${index === 0}">
      <span class="card-icon">${escapeHtml(card.icon)}</span>
      <span class="card-title"><small>Ключ ${String(card.order).padStart(2,'0')}</small><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.position)}</span></span>
      <span class="card-chevron">+</span>
    </button>
    <div class="card-body"><div class="card-body-inner">${body}</div></div>
  </article>`;
}

function renderCards() {
  if (!state.current) return;
  const cards = state.current.portrait.cards.filter((card) => state.filter === 'all' || card.category === state.filter);
  els.cardStack.innerHTML = cards.map(cardTemplate).join('');
  els.modeTabs.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.category === state.filter));
  els.cardStack.querySelectorAll('.card-trigger').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.treasure-card');
      const next = !card.classList.contains('open');
      card.classList.toggle('open', next);
      button.setAttribute('aria-expanded', String(next));
    });
  });
  els.cardStack.querySelectorAll('[data-open-deep]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const card = state.current.portrait.cards.find((item) => item.id === button.dataset.openDeep);
    if (card) openDeepDive(card);
  }));
  els.cardStack.querySelectorAll('[data-open-pay]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    openPurchase();
  }));
}

function renderSynthesis() {
  const synthesis = state.current.portrait.synthesis;
  const locked = Boolean(synthesis.locked);
  els.synthesis.innerHTML = `<div class="synthesis-head">
    <div><div class="panel-kicker">Итоговый синтез</div><h3>${escapeHtml(synthesis.title)}</h3></div>
    <div class="formula">${escapeHtml(synthesis.formula)}</div>
  </div>
  <div class="synthesis-grid">
    <div class="synthesis-block"><h4>Сильные опоры</h4><ul>${synthesis.strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    <div class="synthesis-block"><h4>Внутренние узлы</h4><ul>${synthesis.tensions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    <div class="synthesis-block"><h4>Маршрут</h4><ol>${synthesis.route.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></div>
  </div>
  <div class="bingo">${escapeHtml(synthesis.bingo)}${locked ? ' ' : ''}${locked ? '<button class="text-button" data-open-pay type="button">Открыть итоговую формулу →</button>' : ''}</div>`;
  els.synthesis.querySelector('[data-open-pay]')?.addEventListener('click', openPurchase);
}

function renderMap() {
  const { chart, portrait, source } = state.current;
  if (chart.version !== CURRENT_CHART_VERSION) {
    clearStoredChart();
    toast('Эта карта была рассчитана в прежней системе домов. Постройте её заново по Плацидусу.');
    return;
  }
  els.mapTitle.textContent = portrait.title;
  els.mapSubtitle.textContent = portrait.subtitle;
  els.identityName.textContent = chart.person.name;
  els.identityMeta.innerHTML = birthLabel(chart);
  els.archetypeText.textContent = portrait.archetype;
  els.accuracyNote.textContent = `${chart.system}. Текст: ${source === 'openai' ? 'персональный AI-синтез' : 'локальная интерпретация'}. ${portrait.disclaimer}`;
  renderWheel(chart);
  renderCards();
  renderSynthesis();
}

function openModal(modal) {
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function buildTelegramWidget() {
  els.telegramSlot.innerHTML = '';
  if (!state.config?.telegramConfigured) {
    els.telegramSlot.innerHTML = '<div class="telegram-placeholder">Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME в Railway.</div>';
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.dataset.telegramLogin = state.config.telegramBotUsername;
  script.dataset.size = 'large';
  script.dataset.radius = '12';
  script.dataset.userpic = 'true';
  script.dataset.requestAccess = 'write';
  const callback = new URL('/auth/telegram/callback', location.origin);
  if (state.current?.id) callback.searchParams.set('state', state.current.id);
  script.dataset.authUrl = callback.toString();
  els.telegramSlot.append(script);
}

function openAuth() {
  buildTelegramWidget();
  openModal(els.authModal);
}

function openPurchase() {
  if (!state.config?.user) {
    toast('Сначала привяжем карту к Telegram. Без паролей и почтового фольклора.');
    openAuth();
    return;
  }
  if (state.config.user.premium) {
    refreshCurrentChart();
    return;
  }
  openModal(els.payModal);
}

async function refreshCurrentChart() {
  const id = state.current?.id || localStorage.getItem('herostar_chart_id');
  if (!id) return;
  try {
    const result = await api(`/api/charts/${id}`, { headers: chartHeaders() });
    if (result.chart?.version !== CURRENT_CHART_VERSION) {
      clearStoredChart();
      toast('Прежняя карта удалена из устройства. Постройте новую карту по Плацидусу.');
      return;
    }
    state.current = { ...state.current, ...result, accessToken: chartToken() };
    renderMap();
    els.map.classList.remove('hidden');
    els.consultFab.classList.remove('hidden');
  } catch (error) {
    if (error.status === 404 || error.code === 'CHART_REBUILD_REQUIRED') {
      clearStoredChart();
      toast('Постройте новую карту по Плацидусу.');
      return;
    }
    if (error.status !== 403) toast(error.message);
  }
}

async function claimCurrentChart() {
  const id = state.current?.id || localStorage.getItem('herostar_chart_id');
  if (!id || !state.config?.user) return;
  try {
    await api(`/api/charts/${id}/claim`, { method: 'POST', headers: chartHeaders(), body: '{}' });
    await refreshCurrentChart();
  } catch (error) {
    if (error.code === 'CHART_REBUILD_REQUIRED') clearStoredChart();
    if (error.status !== 403) toast(error.message);
  }
}

async function startPayment() {
  els.payButton.disabled = true;
  try {
    const result = await api('/api/payments/create', {
      method: 'POST',
      headers: chartHeaders(),
      body: JSON.stringify({ chartId: state.current?.id }),
    });
    if (!result.confirmationUrl) throw new Error('ЮKassa не вернула ссылку оплаты.');
    location.href = result.confirmationUrl;
  } catch (error) {
    toast(error.message);
    els.payButton.disabled = false;
  }
}

function toggleConsult(open) {
  if (open && !state.config?.user) {
    openAuth();
    toast('Войдите через Telegram, чтобы консультант мог продолжать разговор.');
    return;
  }
  els.consultPanel.classList.toggle('open', open);
  els.consultPanel.setAttribute('aria-hidden', String(!open));
  if (open && !els.chat.children.length) {
    addMessage('ai', 'Выберите готовый вопрос или опишите ситуацию. Я свяжу её с конкретными элементами вашей карты и предложу один проверяемый шаг.');
  }
}

function addMessage(role, text) {
  const node = document.createElement('div');
  node.className = `message ${role}`;
  node.textContent = text;
  els.chat.append(node);
  els.chat.scrollTop = els.chat.scrollHeight;
}

async function askQuestion(question) {
  const clean = question.trim();
  if (!clean || !state.current?.id) return;
  addMessage('user', clean);
  state.history.push({ role: 'user', content: clean });
  const pending = document.createElement('div');
  pending.className = 'message ai';
  pending.textContent = 'Собираю связи карты…';
  els.chat.append(pending);
  els.chat.scrollTop = els.chat.scrollHeight;
  try {
    const result = await api('/api/consult', {
      method: 'POST',
      headers: chartHeaders(),
      body: JSON.stringify({ chartId: state.current.id, question: clean, history: state.history.slice(-6) }),
    });
    pending.textContent = result.answer;
    state.history.push({ role: 'assistant', content: result.answer });
  } catch (error) {
    pending.textContent = error.message;
    if (error.code === 'AUTH_REQUIRED') openAuth();
  }
}

els.birthForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(els.birthForm);
  createChart({
    name: data.get('name'),
    date: data.get('date'),
    time: data.get('time'),
    place: data.get('place'),
    unknownTime: data.get('unknownTime') === 'on',
  });
});
els.demoButton.addEventListener('click', () => createChart({ demo: true }));
els.unknownTime.addEventListener('change', () => {
  const input = els.timeField.querySelector('input');
  input.disabled = els.unknownTime.checked;
  input.required = !els.unknownTime.checked;
  els.timeField.style.opacity = els.unknownTime.checked ? '.42' : '1';
});
els.modeTabs.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  state.filter = button.dataset.category;
  renderCards();
});
els.loginButton.addEventListener('click', openAuth);
els.userButton.addEventListener('click', () => toast(state.config.user?.premium ? 'Полная карта открыта.' : 'Профиль привязан. Осталось открыть полную карту.'));
els.payButton.addEventListener('click', startPayment);
els.consultFab.addEventListener('click', () => toggleConsult(true));
els.closeConsult.addEventListener('click', () => toggleConsult(false));
els.consultForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const textarea = event.target.elements.question;
  const question = textarea.value;
  textarea.value = '';
  askQuestion(question);
});
els.questionChips.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) askQuestion(button.textContent);
});
els.newMapButton.addEventListener('click', () => {
  clearStoredChart();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
els.shareButton.addEventListener('click', async () => {
  const text = state.current ? `${state.current.portrait.title}: ${state.current.portrait.archetype}` : 'HeroStar';
  try {
    if (navigator.share) await navigator.share({ title: 'HeroStar', text, url: location.origin });
    else {
      await navigator.clipboard.writeText(`${text}\n${location.origin}`);
      toast('Описание и ссылка скопированы.');
    }
  } catch {
    // Пользователь отменил системный диалог.
  }
});
$$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop'))));
$$('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => {
  if (event.target === backdrop) closeModal(backdrop);
}));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $$('.modal-backdrop:not(.hidden)').forEach(closeModal);
    toggleConsult(false);
  }
});

async function bootstrap() {
  try {
    await loadConfig();
    const params = new URLSearchParams(location.search);
    if (params.get('auth') === 'ok') {
      toast('Telegram подключён. Карта сохранена.');
      await claimCurrentChart();
    }
    if (params.get('payment') === 'return') {
      toast('Проверяем оплату…');
      setTimeout(async () => {
        await loadConfig();
        await refreshCurrentChart();
        toast(state.config.user?.premium ? 'Полная карта открыта.' : 'Платёж ещё подтверждается. Обновите карту чуть позже.');
      }, 1800);
    } else {
      await refreshCurrentChart();
    }
  } catch (error) {
    toast(error.message);
  }
}

bootstrap();
