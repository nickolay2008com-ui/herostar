const $ = (selector) => document.querySelector(selector);

const els = {
  section: $('#cloneAdmin'),
  metrics: $('#cloneMetrics'),
  funnel: $('#cloneFunnel'),
  topics: $('#cloneTopics'),
  body: $('#cloneChartsBody'),
  empty: $('#cloneEmpty'),
  search: $('#cloneSearchInput'),
  refresh: $('#cloneRefreshButton'),
  scanStatus: $('#cloneScanStatus'),
  drawerBackdrop: $('#drawerBackdrop'),
  drawerTitle: $('#drawerTitle'),
  drawerBody: $('#drawerBody'),
};

const state = {
  items: [],
  loading: false,
};

const actionLabels = {
  clone_page_view: 'Открытие страницы клона',
  clone_creation_started: 'Начато создание клона',
  clone_created: 'Звёздный клон создан',
  clone_auth_opened: 'Открыт вход через Telegram',
  clone_login_succeeded: 'Telegram подключён',
  clone_question_sent: 'Вопрос отправлен клону',
  clone_answered: 'Ответ клона получен',
  clone_paywall_opened: 'Показано предложение оплаты',
  clone_payment_started: 'Оплата начата',
  clone_payment_succeeded: 'Оплата прошла',
};

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
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0))} ₽`;
}

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Не удалось загрузить данные Звёздного клона.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function cloneAction(event) {
  return String(event?.metadata?.action || '');
}

function isCloneEvent(event) {
  return event?.metadata?.product === 'clone' || cloneAction(event).startsWith('clone_');
}

function isCloneQuestion(message) {
  if (message?.role !== 'user') return false;
  if (message.metadata?.product === 'clone') return true;
  const text = String(message.content || '');
  return text.includes('Звёздный клон') && text.includes('Ситуация:');
}

function extractCloneDialogue(messages = []) {
  const dialogue = [];
  let pendingUser = null;
  for (const message of messages) {
    if (isCloneQuestion(message)) {
      pendingUser = { ...message, cleanContent: cleanCloneQuestion(message.content) };
      continue;
    }
    if (message.role === 'assistant' && pendingUser) {
      dialogue.push(pendingUser, message);
      pendingUser = null;
    }
  }
  return dialogue;
}

function cleanCloneQuestion(content) {
  const text = String(content || '').trim();
  const marker = 'Ситуация:';
  const index = text.lastIndexOf(marker);
  return index >= 0 ? text.slice(index + marker.length).trim() : text;
}

function isClonePayment(payment) {
  if (payment?.status !== 'succeeded') return false;
  const payload = payment.payload || {};
  const metadata = payload.metadata || {};
  if (['clone', 'clone_pack_10'].includes(String(metadata.product || metadata.product_id || ''))) return true;
  return /зв[её]здн\w*\s+клон|star\s*clone|clone_pack/i.test(JSON.stringify(payload));
}

function timestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function personName(item) {
  return item.birth?.name || item.user?.firstName || item.user?.username || 'Без имени';
}

function normalizeClone(summary, details) {
  const messages = Array.isArray(details.messages) ? details.messages : [];
  const dialogue = extractCloneDialogue(messages);
  const userMessages = dialogue.filter((message) => message.role === 'user');
  const assistantMessages = dialogue.filter((message) => message.role === 'assistant');
  const events = (details.events || []).filter(isCloneEvent);
  const payments = (details.payments || []).filter(isClonePayment);
  const activityDates = [summary.createdAt, ...dialogue.map((item) => item.createdAt), ...events.map((item) => item.createdAt)];
  const lastActivityAt = activityDates.sort((a, b) => timestamp(b) - timestamp(a))[0] || summary.createdAt;

  return {
    ...summary,
    details,
    dialogue,
    events,
    payments,
    questions: userMessages.map((message) => ({ ...message, cleanContent: message.cleanContent || cleanCloneQuestion(message.content) })),
    answers: assistantMessages,
    questionCount: userMessages.length,
    paid: payments.length > 0,
    revenue: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    lastActivityAt,
  };
}

function belongsToClone(details) {
  return (details.events || []).some(isCloneEvent)
    || (details.messages || []).some(isCloneQuestion);
}

async function loadAllCharts() {
  const all = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const payload = await api(`/api/admin/charts?limit=100&offset=${offset}`);
    total = Number(payload.total || 0);
    all.push(...(payload.items || []));
    offset += payload.items?.length || 0;
    if (!payload.items?.length) break;
  }
  return all;
}

async function scanCloneCharts(charts) {
  const results = [];
  let cursor = 0;
  let processed = 0;
  const workerCount = Math.min(6, Math.max(1, charts.length));

  async function worker() {
    while (cursor < charts.length) {
      const index = cursor++;
      const chart = charts[index];
      try {
        const details = await api(`/api/admin/charts/${encodeURIComponent(chart.id)}`);
        if (belongsToClone(details)) results.push(normalizeClone(chart, details));
      } catch {
        // Одна повреждённая карта не должна ломать всю административную сводку.
      } finally {
        processed += 1;
        if (processed === charts.length || processed % 10 === 0) {
          els.scanStatus.textContent = `Проверено ${processed} из ${charts.length} карт`;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results.sort((a, b) => timestamp(b.lastActivityAt) - timestamp(a.lastActivityAt));
}

function metricCard(label, value, note = '') {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
}

function renderMetrics(items) {
  const since24h = Date.now() - 86400000;
  const withTelegram = items.filter((item) => item.userId).length;
  const dialogs = items.filter((item) => item.questionCount >= 1).length;
  const questions = items.reduce((sum, item) => sum + item.questionCount, 0);
  const reachedThree = items.filter((item) => item.questionCount >= 3).length;
  const paid = items.filter((item) => item.paid).length;
  const revenue = items.reduce((sum, item) => sum + item.revenue, 0);
  const created24h = items.filter((item) => timestamp(item.createdAt) >= since24h).length;

  els.metrics.innerHTML = [
    metricCard('Создано клонов', items.length, `+${created24h} за сутки`),
    metricCard('Подключили Telegram', withTelegram, items.length ? `${Math.round(withTelegram / items.length * 100)}% от клонов` : '0%'),
    metricCard('Начали диалог', dialogs, items.length ? `${Math.round(dialogs / items.length * 100)}% от клонов` : '0%'),
    metricCard('Всего вопросов', questions),
    metricCard('Дошли до 3 вопросов', reachedThree),
    metricCard('Оплаты клона', paid, revenue ? formatMoney(revenue) : 'пока нет'),
  ].join('');
}

function funnelRow(label, count, max) {
  const width = Math.max(count ? 4 : 0, max ? count / max * 100 : 0);
  return `<div class="funnel-row"><div class="funnel-label"><span>${escapeHtml(label)}</span><div class="funnel-track"><i style="width:${width}%"></i></div></div><strong>${count}</strong></div>`;
}

function renderFunnel(items) {
  const stages = [
    ['Клон создан', items.length],
    ['Telegram подключён', items.filter((item) => item.userId).length],
    ['Задан 1-й вопрос', items.filter((item) => item.questionCount >= 1).length],
    ['Задан 2-й вопрос', items.filter((item) => item.questionCount >= 2).length],
    ['Задан 3-й вопрос', items.filter((item) => item.questionCount >= 3).length],
    ['Оплата прошла', items.filter((item) => item.paid).length],
  ];
  const max = Math.max(1, ...stages.map(([, count]) => count));
  els.funnel.innerHTML = stages.map(([label, count]) => funnelRow(label, count, max)).join('');
}

function renderTopics(items) {
  const topics = items.flatMap((item) => item.questions.map((question) => ({
    text: question.cleanContent,
    createdAt: question.createdAt,
    name: personName(item),
  }))).filter((item) => item.text).sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)).slice(0, 12);

  els.topics.innerHTML = topics.length
    ? topics.map((topic) => `<div class="clone-topic"><p>${escapeHtml(topic.text)}</p><small>${escapeHtml(topic.name)} · ${escapeHtml(formatDate(topic.createdAt))}</small></div>`).join('')
    : '<div class="empty">Первые вопросы появятся здесь после начала диалогов.</div>';
}

function cloneStage(item) {
  if (item.paid) return ['Оплачено', 'paid'];
  if (item.questionCount >= 3) return ['Готов к оплате', 'ready'];
  if (item.questionCount > 0) return [`Ещё бесплатно: ${Math.max(0, 3 - item.questionCount)}`, 'active'];
  return ['Клон создан', ''];
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    personName(item),
    item.birth?.place,
    item.user?.username,
    item.user?.firstName,
    item.userId,
    ...item.questions.map((question) => question.cleanContent),
  ].join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderTable() {
  const query = els.search.value.trim();
  const items = state.items.filter((item) => matchesSearch(item, query));
  els.empty.classList.toggle('hidden', Boolean(items.length));
  els.body.innerHTML = items.map((item) => {
    const telegram = item.user?.username ? `@${item.user.username}` : item.userId ? `ID ${item.userId}` : 'Не подключён';
    const [stage, stageClass] = cloneStage(item);
    return `<tr>
      <td><div class="person"><strong>${escapeHtml(personName(item))}</strong><small>${escapeHtml(item.birth?.place || 'место не указано')}</small></div></td>
      <td>${escapeHtml(telegram)}</td>
      <td><div class="clone-question-count"><strong>${item.questionCount}</strong><small>${item.answers.length} ответов</small></div></td>
      <td><span class="clone-stage ${stageClass}">${escapeHtml(stage)}</span></td>
      <td>${escapeHtml(formatDate(item.lastActivityAt))}</td>
      <td><button class="open-button" data-clone-chart-id="${escapeHtml(item.id)}" type="button">Диалог</button></td>
    </tr>`;
  }).join('');
}

function detailStat(label, value) {
  return `<div class="clone-detail-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderDialogue(item) {
  const messages = item.dialogue || [];
  return messages.length
    ? messages.map((message) => {
        const content = message.role === 'user' ? cleanCloneQuestion(message.content) : message.content;
        const roleLabel = message.role === 'user' ? 'Человек' : message.role === 'assistant' ? 'Звёздный клон' : 'Система';
        return `<article class="clone-dialogue-message ${escapeHtml(message.role)}"><header><strong>${escapeHtml(roleLabel)}</strong><time>${escapeHtml(formatDate(message.createdAt))}</time></header>${escapeHtml(content)}</article>`;
      }).join('')
    : '<div class="empty">Диалог ещё не начинался.</div>';
}

function renderEvents(item) {
  const events = item.events.slice().sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
  return events.length
    ? events.map((event) => `<div class="clone-event"><time>${escapeHtml(formatDate(event.createdAt))}</time><div><strong>${escapeHtml(actionLabels[cloneAction(event)] || cloneAction(event) || event.eventType)}</strong>${event.metadata?.question ? `<br><small>${escapeHtml(event.metadata.question)}</small>` : ''}</div></div>`).join('')
    : '<div class="empty">События начнут собираться после нового деплоя.</div>';
}

function renderPayments(item) {
  return item.payments.length
    ? item.payments.map((payment) => `<div class="clone-event"><time>${escapeHtml(formatDate(payment.created_at || payment.createdAt))}</time><div><strong>${escapeHtml(`${formatMoney(payment.amount)} · ${payment.status}`)}</strong><br><small>${escapeHtml(payment.id || '')}</small></div></div>`).join('')
    : '<div class="empty">Оплат Звёздного клона пока нет.</div>';
}

function openClone(chartId) {
  const item = state.items.find((candidate) => candidate.id === chartId);
  if (!item) return;
  const telegram = item.user?.username ? `@${item.user.username}` : item.userId || 'не подключён';
  const [stage] = cloneStage(item);
  els.drawerBackdrop.classList.remove('hidden');
  els.drawerTitle.textContent = personName(item);
  els.drawerBody.innerHTML = `
    <section class="detail-card">
      <div class="detail-head"><h3>Состояние Звёздного клона</h3></div>
      <div class="detail-content">
        <div class="clone-detail-summary">
          ${detailStat('Вопросов', String(item.questionCount))}
          ${detailStat('Ответов', String(item.answers.length))}
          ${detailStat('Этап', stage)}
          ${detailStat('Оплаты', item.paid ? formatMoney(item.revenue) : 'Нет')}
        </div>
      </div>
    </section>
    <section class="detail-card">
      <div class="detail-head"><h3>Клон и данные рождения</h3></div>
      <div class="detail-content info-grid">
        <div class="info-item"><span>Имя клона</span><strong>${escapeHtml(personName(item))}</strong></div>
        <div class="info-item"><span>Telegram</span><strong>${escapeHtml(telegram)}</strong></div>
        <div class="info-item"><span>Дата</span><strong>${escapeHtml(item.birth?.date || '—')}</strong></div>
        <div class="info-item"><span>Время</span><strong>${escapeHtml(item.birth?.unknownTime ? 'неизвестно' : item.birth?.time || '—')}</strong></div>
        <div class="info-item"><span>Место</span><strong>${escapeHtml(item.birth?.place || '—')}</strong></div>
        <div class="info-item"><span>Создан</span><strong>${escapeHtml(formatDate(item.createdAt))}</strong></div>
      </div>
    </section>
    <section class="detail-card">
      <div class="detail-head"><h3>Полная история диалога · ${item.details.messages.length}</h3></div>
      <div class="detail-content clone-dialogue">${renderDialogue(item)}</div>
    </section>
    <section class="detail-card">
      <div class="detail-head"><h3>Путь внутри продукта · ${item.events.length}</h3></div>
      <div class="detail-content clone-event-list">${renderEvents(item)}</div>
    </section>
    <section class="detail-card">
      <div class="detail-head"><h3>Платежи Звёздного клона</h3></div>
      <div class="detail-content clone-event-list">${renderPayments(item)}</div>
    </section>`;
}

async function loadCloneAdmin() {
  if (state.loading) return;
  state.loading = true;
  els.refresh.disabled = true;
  els.scanStatus.textContent = 'Загружаю список карт…';
  try {
    const charts = await loadAllCharts();
    els.scanStatus.textContent = `Проверяю ${charts.length} карт…`;
    state.items = await scanCloneCharts(charts);
    renderMetrics(state.items);
    renderFunnel(state.items);
    renderTopics(state.items);
    renderTable();
    els.scanStatus.textContent = `Найдено ${state.items.length} клонов · обновлено ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    els.scanStatus.textContent = error.message;
    els.metrics.innerHTML = '<div class="clone-scan-note">Не удалось собрать статистику. Проверьте административный доступ и обновите страницу.</div>';
  } finally {
    state.loading = false;
    els.refresh.disabled = false;
  }
}

async function bootstrap() {
  try {
    const config = await api('/api/config');
    if (!config.user?.admin) return;
    await loadCloneAdmin();
  } catch {
    // Основная admin.js сама покажет экран входа или ошибку доступа.
  }
}

els.refresh.addEventListener('click', loadCloneAdmin);
els.search.addEventListener('input', renderTable);
els.body.addEventListener('click', (event) => {
  const button = event.target.closest('[data-clone-chart-id]');
  if (button) openClone(button.dataset.cloneChartId);
});

bootstrap();