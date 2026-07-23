from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'Pattern not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise RuntimeError(f'Pattern is not unique in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement):
    text = read(path)
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Regex matched {count} times in {path}: {pattern[:120]!r}')
    write(path, result)


# 1. Серверная квота больше не внедряет технический маркер в пользовательский текст.
replace_once(
    'src/auth.js',
    "  req.body.question = `[[clone-reservation:${reservation.reservationId}]]\\n${String(req.body.question || '')}`;",
    "  req.cloneReservationId = reservation.reservationId;\n  req.cloneQuestionUsage = reservation;",
)

# 2. Отделяем историю клона от обычных консультаций и от незавершённых вопросов.
write('src/consultation-history.js', """export function isCloneUserMessage(message) {
  if (message?.role !== 'user') return false;
  if (message.metadata?.product === 'clone') return true;
  const content = String(message.content || '');
  return content.includes('Звёздный клон') && content.includes('Ситуация:');
}

function isCloneAssistantMessage(message) {
  return message?.role === 'assistant' && message.metadata?.product === 'clone';
}

function stripLegacyReservation(content) {
  return String(content || '').replace(/^\[\[clone-reservation:[^\]]+\]\]\s*/i, '').trim();
}

export function extractCloneHistory(messages = []) {
  const result = [];
  let pendingUser = null;

  for (const message of messages) {
    if (isCloneUserMessage(message)) {
      pendingUser = { ...message, content: stripLegacyReservation(message.content) };
      continue;
    }

    if (message?.role === 'assistant' && pendingUser) {
      result.push(pendingUser, { ...message, content: stripLegacyReservation(message.content) });
      pendingUser = null;
    }
  }

  return result;
}

export function historyForProduct(messages = [], product = 'herostar') {
  if (product === 'clone') return extractCloneHistory(messages);

  const result = [];
  let skipCloneAssistant = false;
  for (const message of messages) {
    if (isCloneUserMessage(message)) {
      skipCloneAssistant = true;
      continue;
    }
    if (message?.role === 'assistant' && (skipCloneAssistant || isCloneAssistantMessage(message))) {
      skipCloneAssistant = false;
      continue;
    }
    if (message?.metadata?.product === 'clone') continue;
    result.push({ ...message, content: stripLegacyReservation(message.content) });
  }
  return result;
}
""")

# 3. Пользовательский вопрос и ответ сохраняются атомарно только после успешной генерации.
store_marker = "export async function getConsultationMessages(chartId, limit = 200) {"
store_insert = """export async function saveConsultationExchange({
  chartId,
  userId,
  userContent,
  assistantContent,
  userMetadata = null,
  assistantMetadata = null,
}) {
  const normalizedUser = String(userContent || '').trim();
  const normalizedAssistant = String(assistantContent || '').trim();
  if (!normalizedUser || !normalizedAssistant) throw new Error('Consultation exchange requires both messages.');

  if (!pool) {
    const user = {
      id: nextMemoryId(),
      chartId,
      userId: userId ? String(userId) : null,
      role: 'user',
      content: normalizedUser,
      metadata: userMetadata,
      createdAt: nowIso(),
    };
    const assistant = {
      id: nextMemoryId(),
      chartId,
      userId: userId ? String(userId) : null,
      role: 'assistant',
      content: normalizedAssistant,
      metadata: assistantMetadata,
      createdAt: nowIso(),
    };
    memory.messages.push(user, assistant);
    return { user, assistant };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO consultation_messages (chart_id, user_id, role, content, metadata)
       VALUES ($1,$2,'user',$3,$4)
       RETURNING id, chart_id, user_id, role, content, metadata, created_at`,
      [chartId, userId ? String(userId) : null, normalizedUser, userMetadata],
    );
    const assistantResult = await client.query(
      `INSERT INTO consultation_messages (chart_id, user_id, role, content, metadata)
       VALUES ($1,$2,'assistant',$3,$4)
       RETURNING id, chart_id, user_id, role, content, metadata, created_at`,
      [chartId, userId ? String(userId) : null, normalizedAssistant, assistantMetadata],
    );
    await client.query('COMMIT');

    const normalize = (row) => ({
      id: row.id,
      chartId: row.chart_id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.created_at,
    });
    return { user: normalize(userResult.rows[0]), assistant: normalize(assistantResult.rows[0]) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

"""
replace_once('src/store.js', store_marker, store_insert + store_marker)

# 4. Сервер: безопасный доступ к заявленной карте, отдельные истории продуктов,
# корректный возврат Telegram в клон и синхронизация квоты с клиентом.
replace_once(
    'server.js',
    "  saveConsultationMessage,\n  getConsultationMessages,",
    "  saveConsultationExchange,\n  getConsultationMessages,",
)
replace_once(
    'server.js',
    "import { randomToken, sha256, publicError } from './src/utils.js';",
    "import { randomToken, sha256, publicError } from './src/utils.js';\nimport { historyForProduct } from './src/consultation-history.js';",
)
replace_once(
    'server.js',
    "function canAccessRecord(record, req) {\n  if (!record) return false;\n  if (req.user && record.userId && String(record.userId) === String(req.user.telegram_id)) return true;\n  return hasAnonymousAccess(record, req.headers['x-chart-token']);\n}",
    "function canAccessRecord(record, req) {\n  if (!record) return false;\n  if (record.userId) {\n    return Boolean(req.user && String(record.userId) === String(req.user.telegram_id));\n  }\n  return hasAnonymousAccess(record, req.headers['x-chart-token']);\n}",
)
replace_once(
    'server.js',
    "      adminConfigured: Boolean(process.env.TELEGRAM_ADMIN_IDS || process.env.TELEGRAM_ADMIN_ID),",
    "      adminConfigured: true,",
)
replace_once(
    'server.js',
    "    await claimChart(record.id, req.user.telegram_id);\n    await safeTrack({",
    "    const claimed = await claimChart(record.id, req.user.telegram_id);\n    if (!claimed) throw publicError('Карта уже принадлежит другому пользователю.', 403);\n    await safeTrack({",
)

new_consult_route = """app.post('/api/consult', consultLimiter, requireUser, async (req, res, next) => {
  try {
    const question = String(req.body.question || '').trim().slice(0, 1600);
    if (question.length < 3) throw publicError('Напишите вопрос чуть подробнее.');
    const record = await getChart(req.body.chartId);
    if (!record) throw publicError('Карта не найдена.', 404);
    if (record.userId && String(record.userId) !== String(req.user.telegram_id)) throw publicError('Нет доступа к карте.', 403);
    if (!record.userId) {
      if (!hasAnonymousAccess(record, req.headers['x-chart-token'])) throw publicError('Нужен ключ этой карты.', 403);
      const claimed = await claimChart(record.id, req.user.telegram_id);
      if (!claimed) throw publicError('Карта уже принадлежит другому пользователю.', 403);
    }

    const requestedProduct = String(req.body.product || '').trim().toLowerCase();
    const product = req.cloneReservationId || requestedProduct === 'clone' ? 'clone' : 'herostar';
    const storedMessages = await getConsultationMessages(record.id, 40);
    const history = historyForProduct(storedMessages, product).slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const answer = await answerConsultation({
      chart: record.chartData,
      portrait: record.portraitData,
      question,
      history,
      product,
    });

    const messageMetadata = product === 'clone'
      ? { product: 'clone', cloneReservationId: req.cloneReservationId || null }
      : { product: 'herostar' };
    await saveConsultationExchange({
      chartId: record.id,
      userId: req.user.telegram_id,
      userContent: question,
      assistantContent: answer,
      userMetadata: messageMetadata,
      assistantMetadata: messageMetadata,
    });

    await safeTrack({
      eventType: 'consultation_answered',
      visitorId: visitorIdFrom(req),
      userId: req.user.telegram_id,
      chartId: record.id,
      metadata: { questionLength: question.length, answerLength: answer.length, product },
    });
    res.json({
      answer,
      cloneUsage: req.cloneQuestionUsage
        ? {
            used: req.cloneQuestionUsage.used,
            remaining: req.cloneQuestionUsage.remaining,
            limit: req.cloneQuestionUsage.limit,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});"""
regex_once(
    'server.js',
    r"app\.post\('/api/consult', consultLimiter, requireUser, async \(req, res, next\) => \{.*?\n\}\);\n\napp\.get\('/auth/telegram/callback'",
    new_consult_route + "\n\napp.get('/auth/telegram/callback'",
)
replace_once(
    'server.js',
    "    if (rawState === 'admin') return res.redirect('/admin');\n    const chartId = rawState.replace(/[^a-f0-9-]/gi, '');\n    return res.redirect(`/?auth=ok${chartId ? `&chart=${encodeURIComponent(chartId)}` : ''}#map`);",
    "    if (rawState === 'admin') return res.redirect('/admin');\n    if (rawState.startsWith('clone:')) {\n      const cloneChartId = rawState.slice('clone:'.length).replace(/[^a-f0-9-]/gi, '');\n      return res.redirect(`/clone/?auth=ok${cloneChartId ? `&chart=${encodeURIComponent(cloneChartId)}` : ''}`);\n    }\n    const chartId = rawState.replace(/[^a-f0-9-]/gi, '');\n    return res.redirect(`/?auth=ok${chartId ? `&chart=${encodeURIComponent(chartId)}` : ''}#map`);",
)

# 5. AI знает режим клона на системном уровне и имеет честный локальный fallback.
replace_once(
    'src/ai.js',
    "function localConsultation(portrait, question) {\n  const lower = question.toLowerCase();\n  const related = portrait.cards.find((card) =>\n    [card.title, card.position, card.question].some((value) => lower.includes(String(value).toLowerCase().split(' ')[0])),\n  ) || portrait.cards[0];\n  return `По этой теме я бы начал с раздела «${related.title}». ${related.key} ${related.action} Дальше можно посмотреть, где этот ресурс раскрывается сильнее, или связать его с конкретной ситуацией.`;\n}\n\nexport function consultationSystemPrompt(mode) {",
    "function localConsultation(portrait, question) {\n  const lower = question.toLowerCase();\n  const related = portrait.cards.find((card) =>\n    [card.title, card.position, card.question].some((value) => lower.includes(String(value).toLowerCase().split(' ')[0])),\n  ) || portrait.cards[0];\n  return `По этой теме я бы начал с раздела «${related.title}». ${related.key} ${related.action} Дальше можно посмотреть, где этот ресурс раскрывается сильнее, или связать его с конкретной ситуацией.`;\n}\n\nfunction localCloneConsultation(chart) {\n  const planets = chart.planets || [];\n  const mars = planets.find((planet) => planet.key === 'mars') || planets[0];\n  const moon = planets.find((planet) => planet.key === 'moon') || planets[1];\n  const ascendant = chart.angles?.ascendant;\n  const actionByElement = {\n    'Огонь': 'быстро выбрал проверяемый ход и посмотрел на результат в действии',\n    'Земля': 'сначала уточнил условия, ресурсы и выбрал самый надёжный обратимый шаг',\n    'Воздух': 'собрал недостающие факты, проговорил варианты и только затем зафиксировал решение',\n    'Вода': 'сначала оценил атмосферу и последствия для отношений, а затем действовал бережно, но определённо',\n  };\n  const action = actionByElement[mars?.element] || 'сначала отделил факты от предположений и выбрал небольшой обратимый шаг';\n  const factors = [\n    mars ? `${mars.name} в ${mars.sign}${mars.house ? `, ${mars.house} дом` : ''} — способ переходить к действию` : null,\n    moon ? `${moon.name} в ${moon.sign}${moon.house ? `, ${moon.house} дом` : ''} — автоматическая реакция модели` : null,\n    ascendant ? `Асцендент в ${ascendant.sign} — то, что клон замечает первым` : null,\n  ].filter(Boolean);\n  return `Ваш звёздный клон, вероятнее всего, ${action}.\\n\\nПочему: ${factors.join('; ')}.\\n\\nИтог модели: не угадывать идеальный ответ заранее, а выбрать ход, который соответствует конфигурации карты и даёт ясную обратную связь.`;\n}\n\nexport function consultationSystemPrompt(mode, product = 'herostar') {",
)
replace_once(
    'src/ai.js',
    "Если человек прямо спрашивает, что здесь можно исследовать, или не знает, с чего начать, спокойно предложи три входа без рекламной витрины: разобрать конкретную ситуацию; открыть сильную сторону карты; посмотреть, куда сейчас естественнее направить силы. Затем помоги выбрать один маршрут.`;",
    "Если человек прямо спрашивает, что здесь можно исследовать, или не знает, с чего начать, спокойно предложи три входа без рекламной витрины: разобрать конкретную ситуацию; открыть сильную сторону карты; посмотреть, куда сейчас естественнее направить силы. Затем помоги выбрать один маршрут.`;\n\n  const cloneRules = product === 'clone' ? `\n\nРежим «Звёздный клон» имеет приоритет над общими правилами консультации. Звёздный клон — самостоятельная символическая модель, созданная по натальной карте, а не прогноз поступков пользователя. Не переноси решение клона на человека и не говори «вы поступите» или «вам следует». Формулируй: «ваш звёздный клон, вероятнее всего, поступил бы…». Дай законченный ответ без обязательного встречного вопроса: сначала ход клона, затем 2–4 конкретных фактора карты и короткий итог модели. Если контекста мало, честно назови ограничение, но всё равно предложи наиболее вероятный ход модели. Не выдавай астрологию за научный прогноз.` : '';",
)
replace_once(
    'src/ai.js',
    "Не используй видимые рубрики вроде «Что я услышал», «Где теряется сила», «Ресурс» и «Ближайший шаг», если человек сам не просил структурированный разбор. Обычно достаточно 220–450 слов; простой запрос заслуживает более короткого ответа.`;",
    "Не используй видимые рубрики вроде «Что я услышал», «Где теряется сила», «Ресурс» и «Ближайший шаг», если человек сам не просил структурированный разбор. Обычно достаточно 220–450 слов; простой запрос заслуживает более короткого ответа.${cloneRules}`;",
)
replace_once(
    'src/ai.js',
    "Это продолжение уже начатого разговора. Не повторяй прежний разбор и не начинай знакомство заново. Отвечай на текущую реплику, сохраняя найденную линию и язык человека. За один ответ развивай одну главную мысль; обычно используй 1–2 элемента карты. Не заставляй разговор каждый раз проходить полный маршрут от эмпатии до действия. Не показывай возможности в каждом сообщении: делай это только в естественной точке перехода и не больше двух направлений. Обычно достаточно 100–260 слов, а иногда и нескольких точных предложений.`;",
    "Это продолжение уже начатого разговора. Не повторяй прежний разбор и не начинай знакомство заново. Отвечай на текущую реплику, сохраняя найденную линию и язык человека. За один ответ развивай одну главную мысль; обычно используй 1–2 элемента карты. Не заставляй разговор каждый раз проходить полный маршрут от эмпатии до действия. Не показывай возможности в каждом сообщении: делай это только в естественной точке перехода и не больше двух направлений. Обычно достаточно 100–260 слов, а иногда и нескольких точных предложений.${cloneRules}`;",
)
replace_once(
    'src/ai.js',
    "async function requestConsultation(client, { model, effort, maxOutputTokens, mode, chart, portrait, history, question }) {",
    "async function requestConsultation(client, { model, effort, maxOutputTokens, mode, product, chart, portrait, history, question }) {",
)
replace_once('src/ai.js', "content: consultationSystemPrompt(mode),", "content: consultationSystemPrompt(mode, product),")
replace_once('src/ai.js', "          mode,\n          chart:", "          mode,\n          product,\n          chart:")
replace_once(
    'src/ai.js',
    "export async function answerConsultation({ chart, portrait, question, history = [] }) {\n  const mode = consultationMode(history);\n  const localAnswer = () => localConsultation(portrait, question);",
    "export async function answerConsultation({ chart, portrait, question, history = [], product = 'herostar' }) {\n  const mode = consultationMode(history);\n  const localAnswer = () => product === 'clone' ? localCloneConsultation(chart) : localConsultation(portrait, question);",
)
replace_once('src/ai.js', "      mode,\n      chart,", "      mode,\n      product,\n      chart,")
replace_once('src/ai.js', "          mode,\n          chart,", "          mode,\n          product,\n          chart,")

# 6. Канонический возврат оплаты ведёт в существующий каталог /clone/.
replace_once('src/payments.js', "`${appUrl}/clone?payment=return&chart=${encodeURIComponent(chartId || '')}`", "`${appUrl}/clone/?payment=return&chart=${encodeURIComponent(chartId || '')}`")

# 7. Полностью связанный клиент клона.
write('public/clone.js', r"""const METRIKA_ID = 110937602;
const FREE_QUESTIONS = 3;
const STORAGE_KEY = 'starClone';
const ATTRIBUTION_KEY = 'starCloneAttribution';

const state = {
  chartId: null,
  token: null,
  chart: null,
  user: null,
  selectedPlace: null,
  config: null,
  authPoll: null,
  authPollStartedAt: 0,
  pendingRequest: null,
  questionCount: 0,
  localMessages: [],
  asking: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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

function renderAllowance() {
  const element = $('#questionAllowance');
  if (!element) return;
  if (state.user?.premium) {
    element.textContent = 'Безлимитный доступ открыт';
    element.classList.add('unlimited');
    return;
  }
  element.classList.remove('unlimited');
  const remaining = Math.max(0, FREE_QUESTIONS - state.questionCount);
  element.textContent = remaining
    ? `${remaining} ${remaining === 1 ? 'бесплатный вопрос' : 'бесплатных вопроса'}`
    : 'Бесплатные вопросы закончились';
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

function openPaywall() {
  track('paywall_opened', 'clone_paywall_opened', { questionCount: state.questionCount });
  goal('clone_paywall');
  $('#clonePaywall').classList.remove('hidden');
}

function closePaywall() {
  $('#clonePaywall').classList.add('hidden');
}

function canAsk() {
  if (state.user?.premium) return true;
  if (state.questionCount < FREE_QUESTIONS) return true;
  openPaywall();
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
  button.disabled = true;
  track('paywall_opened', 'clone_payment_started', {
    stage: 'payment_started',
    price: Number(state.config.price || 990),
  });
  goal('clone_payment_start', { order_price: Number(state.config.price || 990), currency: 'RUB' });
  try {
    const result = await json('/api/payments/create', {
      method: 'POST',
      body: JSON.stringify({ chartId: state.chartId, receiptContact, product: 'clone' }),
    });
    if (!result.confirmationUrl) throw new Error('ЮKassa не вернула ссылку оплаты.');
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
    track('card_opened', 'clone_answered', {
      questionNumber: state.questionCount,
      questionLength: question.length,
      answerLength: data.answer.length,
    });
    if (state.questionCount === 1) goal('clone_first_answer');
    if (!state.user?.premium && state.questionCount >= FREE_QUESTIONS) {
      goal('clone_third_answer');
      setTimeout(openPaywall, 900);
    }
  } catch (error) {
    pending.remove();
    userElement?.remove();
    $('#question').value = question;
    if (error.code === 'CLONE_FREE_LIMIT') {
      state.questionCount = FREE_QUESTIONS;
      renderAllowance();
      openPaywall();
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
  $('#cloneName').textContent = savedName || data.chart?.person?.name || data.chart?.birth?.name || 'Ваш звёздный клон';
  $('#cloneStatus').textContent = 'модель сохранена';
  $('#intro').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  show('#dialogView');
  renderFactorsFromChart(data.chart);
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
  persistState();
  return true;
}

async function verifyPaymentReturn() {
  toast('Проверяем оплату…');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt ? 1500 : 800));
    state.config = await json('/api/config');
    state.user = state.config.user;
    if (state.user?.premium) {
      closePaywall();
      renderAllowance();
      goal('clone_payment_success', { order_price: Number(state.config.price || 990), currency: 'RUB' });
      track('paywall_opened', 'clone_payment_succeeded', {
        stage: 'payment_succeeded',
        price: Number(state.config.price || 990),
      });
      toast('Полный доступ открыт. Диалог с клоном теперь без ограничений.');
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePaywall();
});

(async () => {
  track('page_view', 'clone_page_view', { path: location.pathname });
  try {
    state.config = await json('/api/config');
    state.user = state.config.user;
    $('#clonePrice').textContent = `${new Intl.NumberFormat('ru-RU').format(Number(state.config.price || 990))} ₽`;
    $('#clonePayButton').disabled = !state.config.paymentsConfigured;

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
""")

# Страховочный bridge оставляет только маркировку продукта без подмены аналитических событий.
write('public/clone-product-bridge.js', """(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const clonePaths = new Set(['/api/charts', '/api/consult', '/api/payments/create']);
      if (url.origin === location.origin && method === 'POST' && clonePaths.has(url.pathname) && typeof init.body === 'string') {
        const payload = JSON.parse(init.body || '{}');
        init = { ...init, body: JSON.stringify({ ...payload, product: 'clone' }) };
      }
    } catch {
      // Страховочная маркировка не должна ломать основной запрос.
    }
    return nativeFetch(input, init);
  };
})();
""")

# 8. Обе административные страницы считают только завершённые пары вопрос–ответ.
replace_once(
    'public/clone-admin-page.js',
    "function isClonePrompt(content) {\n  const text = String(content || '');\n  return text.includes('Звёздный клон') && text.includes('Ситуация:');\n}",
    "function isCloneQuestion(message) {\n  if (message?.role !== 'user') return false;\n  if (message.metadata?.product === 'clone') return true;\n  const text = String(message.content || '');\n  return text.includes('Звёздный клон') && text.includes('Ситуация:');\n}",
)
regex_once(
    'public/clone-admin-page.js',
    r"function extractCloneDialogue\(messages = \[\]\) \{.*?\n\}",
    """function extractCloneDialogue(messages = []) {
  const dialogue = [];
  let pendingUser = null;
  for (const message of messages) {
    if (isCloneQuestion(message)) {
      pendingUser = { ...message, content: cleanCloneQuestion(message.content) };
      continue;
    }
    if (message.role === 'assistant' && pendingUser) {
      dialogue.push(pendingUser, message);
      pendingUser = null;
    }
  }
  return dialogue;
}""",
)
replace_once('public/clone-admin-page.js', "  els.openCloneLink.href = '/clone';", "  els.openCloneLink.href = `/clone/?chart=${encodeURIComponent(conversation.id)}`;")
replace_once(
    'public/clone-admin-page.js',
    "    els.authText.textContent = 'Этот Telegram-аккаунт вошёл, но его ID не указан в TELEGRAM_ADMIN_IDS.';",
    "    els.authText.textContent = 'Этот Telegram-аккаунт вошёл, но не указан среди администраторов HeroStar.';",
)

replace_once(
    'public/admin-clone.js',
    "function isClonePrompt(content) {\n  const text = String(content || '');\n  return text.includes('Звёздный клон') && text.includes('Ситуация:');\n}",
    "function isCloneQuestion(message) {\n  if (message?.role !== 'user') return false;\n  if (message.metadata?.product === 'clone') return true;\n  const text = String(message.content || '');\n  return text.includes('Звёздный клон') && text.includes('Ситуация:');\n}\n\nfunction extractCloneDialogue(messages = []) {\n  const dialogue = [];\n  let pendingUser = null;\n  for (const message of messages) {\n    if (isCloneQuestion(message)) {\n      pendingUser = { ...message, cleanContent: cleanCloneQuestion(message.content) };\n      continue;\n    }\n    if (message.role === 'assistant' && pendingUser) {\n      dialogue.push(pendingUser, message);\n      pendingUser = null;\n    }\n  }\n  return dialogue;\n}",
)
regex_once(
    'public/admin-clone.js',
    r"function normalizeClone\(summary, details\) \{.*?\n\}",
    """function normalizeClone(summary, details) {
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
}""",
)
replace_once(
    'public/admin-clone.js',
    "  return (details.events || []).some(isCloneEvent)\n    || (details.messages || []).some((message) => message.role === 'user' && isClonePrompt(message.content));",
    "  return (details.events || []).some(isCloneEvent)\n    || (details.messages || []).some(isCloneQuestion);",
)
replace_once(
    'public/admin-clone.js',
    "  const messages = item.details.messages || [];\n  return messages.length\n    ? messages.map((message) => {",
    "  const messages = item.dialogue || [];\n  return messages.length\n    ? messages.map((message) => {",
)

# 9. Сквозные тесты: реальный HTTP-сервер, разделение истории и контракты связок.
write('test/consultation-history.test.js', """import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCloneHistory, historyForProduct } from '../src/consultation-history.js';

const messages = [
  { role: 'user', content: 'Обычный вопрос', metadata: { product: 'herostar' } },
  { role: 'assistant', content: 'Обычный ответ', metadata: { product: 'herostar' } },
  { role: 'user', content: 'Вопрос клону', metadata: { product: 'clone' } },
  { role: 'assistant', content: 'Ответ клона', metadata: { product: 'clone' } },
  { role: 'user', content: 'Незавершённый вопрос', metadata: { product: 'clone' } },
];

test('история клона содержит только завершённые пары вопрос–ответ', () => {
  assert.deepEqual(extractCloneHistory(messages).map((item) => item.content), ['Вопрос клону', 'Ответ клона']);
});

test('обычная консультация не получает сообщения Звёздного клона', () => {
  assert.deepEqual(historyForProduct(messages, 'herostar').map((item) => item.content), ['Обычный вопрос', 'Обычный ответ']);
});
""")

write('test/clone-gears-contract.test.js', """import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Telegram возвращает пользователя в клон, а выбранный диалог восстанавливается по chart', async () => {
  const [server, clone, admin] = await Promise.all([
    read('server.js'),
    read('public/clone.js'),
    read('public/clone-admin-page.js'),
  ]);
  assert.match(server, /rawState\.startsWith\('clone:'\)/);
  assert.match(server, /res\.redirect\(`\/clone\/\?auth=ok/);
  assert.match(clone, /callback\.searchParams\.set\('state', `clone:/);
  assert.match(clone, /requestedChartId/);
  assert.match(admin, /\/clone\/\?chart=/);
});

test('вопрос и ответ сохраняются одной транзакцией после генерации', async () => {
  const [server, store, auth] = await Promise.all([
    read('server.js'),
    read('src/store.js'),
    read('src/auth.js'),
  ]);
  assert.match(store, /saveConsultationExchange/);
  assert.match(store, /BEGIN[\s\S]+COMMIT/);
  assert.ok(server.indexOf('answerConsultation({') < server.indexOf('saveConsultationExchange({'));
  assert.match(auth, /req\.cloneReservationId = reservation\.reservationId/);
  assert.doesNotMatch(auth, /req\.body\.question = `\[\[clone-reservation:/);
});

test('режим клона закреплён на сервере и имеет безопасный fallback', async () => {
  const ai = await read('src/ai.js');
  assert.match(ai, /product === 'clone'/);
  assert.match(ai, /Ваш звёздный клон, вероятнее всего/);
  assert.match(ai, /не прогноз поступков пользователя/);
});

test('заявленная карта больше не открывается старым анонимным ключом', async () => {
  const server = await read('server.js');
  assert.match(server, /if \(record\.userId\) \{[\s\S]+String\(record\.userId\) === String\(req\.user\.telegram_id\)/);
});
""")

write('test/clone-http-smoke.test.js', """import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function waitFor(url, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start: ${url}`);
}

test('публичная цепочка клона открывается на реальном Express-сервере', { timeout: 40000 }, async (t) => {
  const port = 19000 + (process.pid % 1000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_URL: '',
      OPENAI_API_KEY: '',
      TELEGRAM_BOT_TOKEN: '',
      YOOKASSA_SHOP_ID: '',
      YOOKASSA_SECRET_KEY: '',
      DEMO_MODE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));

  await waitFor(`${base}/health`);
  for (const path of ['/clone', '/clone/', '/clone/admin/', '/api/config']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
  }

  const clonePage = await (await fetch(`${base}/clone/`)).text();
  assert.match(clonePage, /Звёздный клон/);
  assert.match(clonePage, /clone\.js/);

  const created = await fetch(`${base}/api/charts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ demo: true, product: 'clone' }),
  });
  assert.equal(created.status, 201);
  const chart = await created.json();
  assert.ok(chart.id);
  assert.ok(chart.accessToken);

  const restored = await fetch(`${base}/api/charts/${chart.id}`, {
    headers: { 'x-chart-token': chart.accessToken },
  });
  assert.equal(restored.status, 200);
});
""")

# Обновляем старый контракт: bridge больше не подменяет события, клиент отправляет допустимый тип сам.
replace_once(
    'test/clone-launch.test.js',
    "test('начало оплаты сохраняется через разрешённый публичный тип события', async () => {\n  const bridge = await readFile(bridgeUrl, 'utf8');\n  assert.match(bridge, /clone_payment_started/);\n  assert.match(bridge, /eventType:\\s*'paywall_opened'/);\n  assert.match(bridge, /stage:\\s*'payment_started'/);\n});",
    "test('начало оплаты сохраняется через разрешённый публичный тип события', async () => {\n  const [bridge, clone] = await Promise.all([readFile(bridgeUrl, 'utf8'), readFile(new URL('../public/clone.js', import.meta.url), 'utf8')]);\n  assert.doesNotMatch(bridge, /clone_payment_started/);\n  assert.match(clone, /track\('paywall_opened', 'clone_payment_started'/);\n  assert.match(clone, /stage:\\s*'payment_started'/);\n});",
)
replace_once('test/clone-launch.test.js', "/\\/clone\\?payment=return/", "/\\/clone\\/\\?payment=return/")

# Временные файлы не должны попасть в итоговый PR.
(ROOT / 'scripts/clone-audit-fix.py').unlink(missing_ok=True)
(ROOT / '.github/workflows/clone-audit-fix.yml').unlink(missing_ok=True)
