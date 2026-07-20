const $ = (selector) => document.querySelector(selector);

const els = {
  authView: $('#authView'),
  dashboard: $('#dashboard'),
  status: $('#status'),
  refreshButton: $('#refreshButton'),
  telegramSlot: $('#telegramSlot'),
  configNote: $('#configNote'),
  authText: $('#authText'),
  metrics: $('#metrics'),
  dailyChart: $('#dailyChart'),
  funnel: $('#funnel'),
  chartsBody: $('#chartsBody'),
  emptyCharts: $('#emptyCharts'),
  recentEvents: $('#recentEvents'),
  daysSelect: $('#daysSelect'),
  searchInput: $('#searchInput'),
  drawerBackdrop: $('#drawerBackdrop'),
  drawerTitle: $('#drawerTitle'),
  drawerBody: $('#drawerBody'),
  closeDrawer: $('#closeDrawer'),
  toast: $('#toast'),
};

const eventLabels = {
  page_view: 'Открытие страницы',
  form_started: 'Начало формы',
  demo_opened: 'Открытие демо',
  chart_created: 'Карта создана',
  chart_viewed: 'Карта просмотрена',
  card_opened: 'Карточка открыта',
  filter_changed: 'Раздел карты',
  auth_opened: 'Открытие Telegram',
  telegram_login: 'Вход через Telegram',
  chart_claimed: 'Карта сохранена',
  consultant_opened: 'Открытие консультанта',
  consultation_answered: 'Ответ консультанта',
  paywall_opened: 'Открытие оплаты',
  payment_created: 'Платёж начат',
  payment_succeeded: 'Оплата прошла',
  share_clicked: 'Поделиться',
  new_chart_clicked: 'Новая карта',
};

let config = null;
let searchTimer = null;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short' });
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0))} ₽`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Не удалось загрузить данные.');
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function buildTelegramWidget() {
  els.telegramSlot.innerHTML = '';
  if (!config?.telegramConfigured) {
    els.authText.textContent = 'Telegram-авторизация настроена неверно.';
    els.configNote.innerHTML = `<strong>Что исправить в Railway:</strong><br>${escapeHtml(config?.telegramConfigurationIssue || 'Проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME.')}<br><br>Username указывается без @, например <code>HeroStarBot</code>. У BotFather домен должен быть <code>herostar.up.railway.app</code>.`;
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.dataset.telegramLogin = config.telegramBotUsername;
  script.dataset.size = 'large';
  script.dataset.radius = '12';
  script.dataset.userpic = 'true';
  script.dataset.requestAccess = 'write';
  const callback = new URL('/auth/telegram/callback', location.origin);
  callback.searchParams.set('state', 'admin');
  script.dataset.authUrl = callback.toString();
  els.telegramSlot.append(script);
  els.configNote.innerHTML = 'Доступ откроется только если Telegram ID этого аккаунта указан в <code>TELEGRAM_ADMIN_IDS</code>. Несколько ID разделяются запятыми.';
}

function showAuth(reason = null) {
  els.dashboard.classList.add('hidden');
  els.authView.classList.remove('hidden');
  els.refreshButton.classList.add('hidden');
  els.status.textContent = 'Требуется вход';
  if (reason === 'forbidden') {
    els.authText.textContent = 'Этот Telegram-аккаунт вошёл успешно, но его ID не включён в список администраторов.';
  }
  buildTelegramWidget();
}

function metricCard(label, value, note = '') {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
}

function renderMetrics(summary) {
  const chartConversion = summary.usersTotal
    ? Math.round((summary.paymentsSucceeded / summary.usersTotal) * 100)
    : 0;
  els.metrics.innerHTML = [
    metricCard('Пользователи Telegram', summary.usersTotal),
    metricCard('Создано разборов', summary.chartsTotal, `+${summary.charts24h} за сутки`),
    metricCard('Сообщений в диалогах', summary.messagesTotal),
    metricCard('Успешных оплат', summary.paymentsSucceeded),
    metricCard('Выручка', formatMoney(summary.revenueTotal)),
    metricCard('Оплаты / пользователи', `${chartConversion}%`),
  ].join('');
}

function renderDaily(items) {
  if (!items.length) {
    els.dailyChart.innerHTML = '<div class="empty">События появятся после первых посещений.</div>';
    return;
  }
  const max = Math.max(1, ...items.flatMap((item) => [item.pageViews, item.charts]));
  els.dailyChart.innerHTML = items.map((item) => {
    const pageHeight = Math.max(2, Math.round(item.pageViews / max * 180));
    const chartHeight = Math.max(2, Math.round(item.charts / max * 180));
    return `<div class="day-column" title="${escapeHtml(`${item.pageViews} посещений · ${item.charts} карт · ${item.consultations} консультаций · ${item.payments} оплат`)}">
      <div class="day-bars">
        <i class="day-bar" style="height:${pageHeight}px"></i>
        <i class="day-bar charts" style="height:${chartHeight}px"></i>
      </div>
      <small>${escapeHtml(formatDate(item.day, false))}</small>
    </div>`;
  }).join('');
}

function renderFunnel(funnel) {
  const order = [
    'page_view',
    'form_started',
    'chart_created',
    'telegram_login',
    'consultation_answered',
    'payment_created',
    'payment_succeeded',
  ];
  const max = Math.max(1, ...order.map((key) => Number(funnel[key] || 0)));
  els.funnel.innerHTML = order.map((key) => {
    const count = Number(funnel[key] || 0);
    return `<div class="funnel-row">
      <div class="funnel-label">
        <span>${escapeHtml(eventLabels[key] || key)}</span>
        <div class="funnel-track"><i style="width:${Math.max(count ? 4 : 0, count / max * 100)}%"></i></div>
      </div>
      <strong>${count}</strong>
    </div>`;
  }).join('');
}

function personName(item) {
  return item.birth?.name || item.user?.firstName || item.user?.username || 'Без имени';
}

function renderCharts(payload) {
  els.emptyCharts.classList.toggle('hidden', Boolean(payload.items.length));
  els.chartsBody.innerHTML = payload.items.map((item) => {
    const telegram = item.user?.username ? `@${item.user.username}` : item.userId ? `ID ${item.userId}` : 'Без Telegram';
    const birthDate = item.birth?.date || 'дата не указана';
    const birthTime = item.birth?.unknownTime ? 'время неизвестно' : item.birth?.time || '—';
    return `<tr>
      <td><div class="person"><strong>${escapeHtml(personName(item))}</strong><small>${escapeHtml(telegram)}</small></div></td>
      <td><div class="birth"><span>${escapeHtml(`${birthDate} · ${birthTime}`)}</span><small>${escapeHtml(item.birth?.place || '—')}</small></div></td>
      <td>${item.messageCount ? `<span class="badge">${item.messageCount} сообщений</span>` : '<span class="badge free">нет диалога</span>'}</td>
      <td>${item.paid ? '<span class="badge">Оплачено</span>' : '<span class="badge free">Бесплатный</span>'}</td>
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
      <td><button class="open-button" data-chart-id="${escapeHtml(item.id)}" type="button">Открыть</button></td>
    </tr>`;
  }).join('');
}

function contextOf(event) {
  const birthName = event.birth?.name;
  const user = event.user?.username ? `@${event.user.username}` : event.user?.firstName;
  const metadata = event.metadata && Object.keys(event.metadata).length ? JSON.stringify(event.metadata) : '';
  return [birthName, user, metadata].filter(Boolean).join(' · ') || event.chartId || event.visitorId || '—';
}

function renderRecent(items) {
  els.recentEvents.innerHTML = items.length
    ? items.map((event) => `<div class="event-row">
        <div class="event-time">${escapeHtml(formatDate(event.createdAt))}</div>
        <div class="event-type">${escapeHtml(eventLabels[event.eventType] || event.eventType)}</div>
        <div class="event-context">${escapeHtml(contextOf(event))}</div>
      </div>`).join('')
    : '<div class="empty">Событий пока нет.</div>';
}

async function loadOverview() {
  const days = els.daysSelect.value;
  const data = await api(`/api/admin/overview?days=${encodeURIComponent(days)}`);
  renderMetrics(data.summary);
  renderDaily(data.daily);
  renderFunnel(data.funnel);
  renderRecent(data.recentEvents);
}

async function loadCharts() {
  const search = els.searchInput.value.trim();
  const data = await api(`/api/admin/charts?limit=100&search=${encodeURIComponent(search)}`);
  renderCharts(data);
}

async function loadDashboard() {
  els.status.textContent = 'Обновление…';
  await Promise.all([loadOverview(), loadCharts()]);
  els.status.textContent = `Администратор: ${config.user.firstName || config.user.username || config.user.id}`;
}

function infoItem(label, value) {
  return `<div class="info-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`;
}

function renderPortrait(portrait) {
  if (!portrait) return '<div class="empty">Разбор не найден.</div>';
  const cards = (portrait.cards || []).map((card) => `<article class="portrait-card">
    <h4>${escapeHtml(`${card.icon || '✦'} ${card.title || card.id || 'Ключ'}`)}</h4>
    <p><strong>${escapeHtml(card.position || '')}</strong></p>
    ${card.lead ? `<p>${escapeHtml(card.lead)}</p>` : ''}
    ${card.manifestation ? `<p>${escapeHtml(card.manifestation)}</p>` : ''}
    ${card.uniqueExample ? `<p><strong>Уникальный пример:</strong> ${escapeHtml(card.uniqueExample)}</p>` : ''}
    ${card.contrast ? `<p><strong>Как бывает иначе:</strong> ${escapeHtml(card.contrast)}</p>` : ''}
    ${card.trap ? `<p><strong>Ловушка:</strong> ${escapeHtml(card.trap)}</p>` : ''}
    ${card.key ? `<p><strong>Ключ:</strong> ${escapeHtml(card.key)}</p>` : ''}
    ${card.action ? `<p><strong>Действие:</strong> ${escapeHtml(card.action)}</p>` : ''}
  </article>`).join('');
  return `<h3>${escapeHtml(portrait.title || 'Разбор')}</h3>
    <p>${escapeHtml(portrait.subtitle || '')}</p>
    <p><strong>Собранный образ:</strong> ${escapeHtml(portrait.archetype || '')}</p>
    ${cards}`;
}

function renderMessages(messages) {
  return messages.length
    ? messages.map((message) => `<div class="message ${escapeHtml(message.role)}">
        ${escapeHtml(message.content)}
        <small>${escapeHtml(formatDate(message.createdAt))}</small>
      </div>`).join('')
    : '<div class="empty">Диалог ещё не начинался.</div>';
}

function renderTimeline(events) {
  return events.length
    ? events.map((event) => `<div class="timeline-row">
        <span>${escapeHtml(formatDate(event.createdAt))}</span>
        <div><strong>${escapeHtml(eventLabels[event.eventType] || event.eventType)}</strong>${event.metadata ? `<br><small>${escapeHtml(JSON.stringify(event.metadata))}</small>` : ''}</div>
      </div>`).join('')
    : '<div class="empty">Событий по карте нет.</div>';
}

async function openChart(chartId) {
  els.drawerBackdrop.classList.remove('hidden');
  els.drawerTitle.textContent = 'Загрузка…';
  els.drawerBody.innerHTML = '<div class="empty">Собираю полную историю.</div>';
  try {
    const data = await api(`/api/admin/charts/${encodeURIComponent(chartId)}`);
    const chart = data.chart;
    const birth = chart.birthData || {};
    els.drawerTitle.textContent = birth.name || chart.user?.firstName || 'Разбор';
    els.drawerBody.innerHTML = `
      <section class="detail-card">
        <div class="detail-head"><h3>Человек и данные рождения</h3></div>
        <div class="detail-content info-grid">
          ${infoItem('Имя', birth.name)}
          ${infoItem('Telegram', chart.user?.username ? `@${chart.user.username}` : chart.user?.telegramId)}
          ${infoItem('Дата рождения', birth.date)}
          ${infoItem('Время', birth.unknownTime ? 'Неизвестно' : birth.time)}
          ${infoItem('Место', birth.place)}
          ${infoItem('Создан', formatDate(chart.createdAt))}
          ${infoItem('Источник текста', chart.source)}
          ${infoItem('Оплата', data.payments.some((payment) => payment.status === 'succeeded') ? 'Оплачено' : 'Нет')}
        </div>
      </section>
      <section class="detail-card">
        <div class="detail-head"><h3>Полный разбор</h3></div>
        <div class="detail-content">${renderPortrait(chart.portraitData)}</div>
      </section>
      <section class="detail-card">
        <div class="detail-head"><h3>Диалог с консультантом · ${data.messages.length}</h3></div>
        <div class="detail-content">${renderMessages(data.messages)}</div>
      </section>
      <section class="detail-card">
        <div class="detail-head"><h3>Путь пользователя · ${data.events.length}</h3></div>
        <div class="detail-content timeline">${renderTimeline(data.events)}</div>
      </section>
      <section class="detail-card">
        <div class="detail-head"><h3>Технические данные карты</h3></div>
        <div class="detail-content"><pre class="raw">${escapeHtml(JSON.stringify(chart.chartData, null, 2))}</pre></div>
      </section>`;
  } catch (error) {
    els.drawerBody.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function closeDrawer() {
  els.drawerBackdrop.classList.add('hidden');
}

async function bootstrap() {
  try {
    config = await api('/api/config');
    if (!config.user) {
      showAuth();
      return;
    }
    if (!config.user.admin) {
      showAuth('forbidden');
      return;
    }

    els.authView.classList.add('hidden');
    els.dashboard.classList.remove('hidden');
    els.refreshButton.classList.remove('hidden');
    await loadDashboard();
  } catch (error) {
    if (error.status === 401) showAuth();
    else if (error.status === 403) showAuth('forbidden');
    else {
      els.status.textContent = 'Ошибка';
      toast(error.message);
    }
  }
}

els.refreshButton.addEventListener('click', () => loadDashboard().catch((error) => toast(error.message)));
els.daysSelect.addEventListener('change', () => loadOverview().catch((error) => toast(error.message)));
els.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadCharts().catch((error) => toast(error.message)), 280);
});
els.chartsBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-chart-id]');
  if (button) openChart(button.dataset.chartId);
});
els.closeDrawer.addEventListener('click', closeDrawer);
els.drawerBackdrop.addEventListener('click', (event) => {
  if (event.target === els.drawerBackdrop) closeDrawer();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDrawer();
});

bootstrap();
