const $ = (selector) => document.querySelector(selector);

const els = {
  authView: $('#authView'),
  authText: $('#authText'),
  dashboard: $('#dashboard'),
  status: $('#status'),
  refreshButton: $('#refreshButton'),
  conversationList: $('#conversationList'),
  emptyConversations: $('#emptyConversations'),
  dialogTitle: $('#dialogTitle'),
  dialogMeta: $('#dialogMeta'),
  dialogSummary: $('#dialogSummary'),
  dialogue: $('#dialogue'),
  openCloneLink: $('#openCloneLink'),
  toast: $('#toast'),
};

const state = {
  config: null,
  conversations: [],
  activeId: null,
  loading: false,
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function timestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Не удалось загрузить диалоги Звёздного клона.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function isClonePrompt(content) {
  const text = String(content || '');
  return text.includes('Звёздный клон') && text.includes('Ситуация:');
}

function cleanCloneQuestion(content) {
  const text = String(content || '').trim();
  const marker = 'Ситуация:';
  const index = text.lastIndexOf(marker);
  return index >= 0 ? text.slice(index + marker.length).trim() : text;
}

function extractCloneDialogue(messages = []) {
  const dialogue = [];
  let awaitingAnswer = false;

  for (const message of messages) {
    if (message.role === 'user' && isClonePrompt(message.content)) {
      dialogue.push({ ...message, content: cleanCloneQuestion(message.content) });
      awaitingAnswer = true;
      continue;
    }

    if (message.role === 'assistant' && awaitingAnswer) {
      dialogue.push(message);
      awaitingAnswer = false;
    }
  }

  return dialogue;
}

function personName(conversation) {
  const user = conversation.details?.chart?.user || {};
  return conversation.birth?.name
    || user.firstName
    || user.first_name
    || user.username
    || 'Звёздный клон';
}

function latestQuestion(conversation) {
  return [...conversation.dialogue].reverse().find((message) => message.role === 'user')?.content || 'Диалог без вопроса';
}

async function loadAllCharts() {
  const all = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const payload = await api(`/api/admin/charts?limit=100&offset=${offset}`);
    const items = payload.items || [];
    total = Number(payload.total || 0);
    all.push(...items);
    offset += items.length;
    if (!items.length) break;
  }

  return all;
}

function normalizeConversation(summary, details) {
  const dialogue = extractCloneDialogue(details.messages || []);
  if (!dialogue.length) return null;

  const dates = [summary.createdAt, ...dialogue.map((message) => message.createdAt)];
  const lastActivityAt = dates.sort((a, b) => timestamp(b) - timestamp(a))[0] || summary.createdAt;
  const questionCount = dialogue.filter((message) => message.role === 'user').length;
  const answerCount = dialogue.filter((message) => message.role === 'assistant').length;

  return {
    id: summary.id,
    userId: summary.userId,
    birth: summary.birth || details.chart?.birthData || {},
    createdAt: summary.createdAt || details.chart?.createdAt,
    lastActivityAt,
    questionCount,
    answerCount,
    dialogue,
    details,
  };
}

async function scanOwnCloneConversations(charts) {
  const results = [];
  let cursor = 0;
  let processed = 0;
  const workerCount = Math.min(5, Math.max(1, charts.length));

  async function worker() {
    while (cursor < charts.length) {
      const chart = charts[cursor++];
      try {
        const details = await api(`/api/admin/charts/${encodeURIComponent(chart.id)}`);
        const conversation = normalizeConversation(chart, details);
        if (conversation) results.push(conversation);
      } catch {
        // Повреждённая или удалённая карта не должна блокировать остальные диалоги.
      } finally {
        processed += 1;
        els.status.textContent = `Проверено ${processed} из ${charts.length}`;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results.sort((a, b) => timestamp(b.lastActivityAt) - timestamp(a.lastActivityAt));
}

function detailStat(label, value) {
  return `<div class="clone-detail-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderConversationList() {
  els.emptyConversations.classList.toggle('hidden', Boolean(state.conversations.length));
  els.conversationList.innerHTML = state.conversations.map((conversation) => `
    <button class="clone-conversation-button ${conversation.id === state.activeId ? 'active' : ''}" data-conversation-id="${escapeHtml(conversation.id)}" type="button">
      <strong>${escapeHtml(personName(conversation))}</strong>
      <span>${escapeHtml(latestQuestion(conversation))}</span>
      <small>${escapeHtml(formatDate(conversation.lastActivityAt))} · ${conversation.questionCount} вопр.</small>
    </button>
  `).join('');
}

function renderDialogue(conversation) {
  return conversation.dialogue.map((message) => {
    const roleLabel = message.role === 'user' ? 'Вы' : 'Звёздный клон';
    return `
      <article class="clone-dialogue-message ${escapeHtml(message.role)}">
        <header>
          <strong>${escapeHtml(roleLabel)}</strong>
          <time>${escapeHtml(formatDate(message.createdAt))}</time>
        </header>
        ${escapeHtml(message.content)}
      </article>
    `;
  }).join('');
}

function openConversation(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  state.activeId = conversation.id;
  renderConversationList();

  els.dialogTitle.textContent = personName(conversation);
  els.dialogMeta.textContent = `${conversation.birth?.date || 'Дата не указана'} · ${conversation.birth?.place || 'Место не указано'} · обновлён ${formatDate(conversation.lastActivityAt)}`;
  els.dialogSummary.innerHTML = [
    detailStat('Вопросов', String(conversation.questionCount)),
    detailStat('Ответов', String(conversation.answerCount)),
    detailStat('Сообщений', String(conversation.dialogue.length)),
    detailStat('Создан', formatDate(conversation.createdAt)),
  ].join('');
  els.dialogue.innerHTML = renderDialogue(conversation);
  els.openCloneLink.href = '/clone';
}

function renderEmptyState() {
  els.dialogTitle.textContent = 'Диалогов пока нет';
  els.dialogMeta.textContent = 'Новый разговор появится здесь после первого ответа Звёздного клона.';
  els.dialogSummary.innerHTML = '';
  els.dialogue.innerHTML = '<div class="clone-loading">Откройте Звёздного клона, задайте вопрос — и история сохранится здесь автоматически.</div>';
}

function showAuth(reason = 'login') {
  els.dashboard.classList.add('hidden');
  els.authView.classList.remove('hidden');
  els.refreshButton.classList.add('hidden');
  els.status.textContent = reason === 'forbidden' ? 'Нет доступа' : 'Требуется вход';
  if (reason === 'forbidden') {
    els.authText.textContent = 'Этот Telegram-аккаунт вошёл, но его ID не указан в TELEGRAM_ADMIN_IDS.';
  }
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  els.refreshButton.disabled = true;
  els.status.textContent = 'Ищу последний диалог…';
  els.dialogue.innerHTML = '<div class="clone-loading">Собираю сохранённую историю Звёздного клона.</div>';

  try {
    const charts = await loadAllCharts();
    const currentUserId = String(state.config.user.id);
    const ownCharts = charts.filter((chart) => String(chart.userId || '') === currentUserId);
    state.conversations = await scanOwnCloneConversations(ownCharts);
    state.activeId = state.conversations[0]?.id || null;
    renderConversationList();

    if (state.activeId) openConversation(state.activeId);
    else renderEmptyState();

    els.status.textContent = state.conversations.length
      ? `Найдено диалогов: ${state.conversations.length}`
      : 'Диалогов пока нет';
  } catch (error) {
    els.status.textContent = 'Ошибка загрузки';
    els.dialogue.innerHTML = `<div class="clone-loading">${escapeHtml(error.message)}</div>`;
    toast(error.message);
  } finally {
    state.loading = false;
    els.refreshButton.disabled = false;
  }
}

async function bootstrap() {
  try {
    state.config = await api('/api/config');
    if (!state.config.user) {
      showAuth('login');
      return;
    }
    if (!state.config.user.admin) {
      showAuth('forbidden');
      return;
    }

    els.authView.classList.add('hidden');
    els.dashboard.classList.remove('hidden');
    els.refreshButton.classList.remove('hidden');
    await load();
  } catch (error) {
    if (error.status === 401) showAuth('login');
    else if (error.status === 403) showAuth('forbidden');
    else {
      els.status.textContent = 'Ошибка';
      toast(error.message);
    }
  }
}

els.refreshButton.addEventListener('click', () => load());
els.conversationList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-conversation-id]');
  if (button) openConversation(button.dataset.conversationId);
});

bootstrap();
