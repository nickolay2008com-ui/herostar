import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { calculateNatalChart } from './src/astro.js';
import { generatePortrait, answerConsultation } from './src/ai.js';
import {
  initStore,
  saveChart,
  getChart,
  claimChart,
  saveConsultationExchange,
  getConsultationMessages,
  trackEvent,
  getAdminOverview,
  listAdminCharts,
  getAdminChartDetails,
} from './src/store.js';
import {
  attachUser,
  completeTelegramLogin,
  setSessionCookie,
  clearSessionCookie,
  requireUser,
  requireAdmin,
  isAdminUser,
} from './src/auth.js';
import { createPayment, processWebhook } from './src/payments.js';
import { searchPlaces, unpackSelectedPlace } from './src/places.js';
import { getLegalConfig, renderLegalPage } from './src/legal.js';
import { randomToken, sha256, publicError } from './src/utils.js';
import { historyForProduct } from './src/consultation-history.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const freeCardCount = Math.max(1, Number(process.env.FREE_CARD_COUNT || 3));
const demoMode = String(process.env.DEMO_MODE || 'true').toLowerCase() === 'true';

function telegramBotUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || '')
    .trim()
    .replace(/^@/, '');
}

let telegramConfigCache = { expiresAt: 0, value: null };
let publicStatsCache = { expiresAt: 0, value: null };

async function telegramConfiguration() {
  if (telegramConfigCache.value && telegramConfigCache.expiresAt > Date.now()) {
    return telegramConfigCache.value;
  }

  const envUsername = telegramBotUsername();
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const validEnvUsername = /^[A-Za-z0-9_]{5,32}$/.test(envUsername) && /bot$/i.test(envUsername);

  if (!token) {
    const value = { username: envUsername, configured: false, issue: 'Не задан TELEGRAM_BOT_TOKEN.' };
    telegramConfigCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.result?.username) {
      const value = {
        username: envUsername,
        configured: false,
        issue: 'TELEGRAM_BOT_TOKEN не принят Telegram. Проверьте токен из BotFather.',
      };
      telegramConfigCache = { value, expiresAt: Date.now() + 60_000 };
      return value;
    }

    const actualUsername = String(payload.result.username).replace(/^@/, '');
    const warning = envUsername && actualUsername.toLowerCase() !== envUsername.toLowerCase()
      ? `В Railway указан ${envUsername}, но токен принадлежит @${actualUsername}. HeroStar автоматически использует правильного бота.`
      : null;
    const value = {
      username: actualUsername,
      configured: true,
      issue: warning,
    };
    telegramConfigCache = { value, expiresAt: Date.now() + 5 * 60_000 };
    return value;
  } catch (error) {
    const value = {
      username: envUsername,
      configured: validEnvUsername,
      issue: validEnvUsername
        ? 'Telegram временно не подтвердил настройки, используется TELEGRAM_BOT_USERNAME из Railway.'
        : 'TELEGRAM_BOT_USERNAME должен быть username бота без @ и оканчиваться на bot.',
    };
    telegramConfigCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }
}

function visitorIdFrom(req) {
  return String(req.headers['x-visitor-id'] || req.body?.visitorId || '')
    .trim()
    .slice(0, 120) || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function cleanMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 6000) return JSON.parse(serialized);
    return { truncated: true, preview: serialized.slice(0, 5600) };
  } catch {
    return null;
  }
}

async function safeTrack(record) {
  try {
    await trackEvent(record);
  } catch (error) {
    console.error('Analytics event was not saved:', error);
  }
}

async function publicStats() {
  if (publicStatsCache.value && publicStatsCache.expiresAt > Date.now()) {
    return publicStatsCache.value;
  }

  const overview = await getAdminOverview(7);
  const daily = Array.isArray(overview.daily) ? overview.daily : [];
  const charts7d = daily.reduce((sum, item) => sum + Number(item.charts || 0), 0);
  const value = {
    totalCharts: Math.max(0, Number(overview.summary?.chartsTotal || 0)),
    charts7d: Math.max(0, charts7d),
    charts24h: Math.max(0, Number(overview.summary?.charts24h || 0)),
    updatedAt: new Date().toISOString(),
  };

  publicStatsCache = { value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}

app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://telegram.org', 'https://oauth.telegram.org', 'https://mc.yandex.ru'],
        frameSrc: ["'self'", 'https://oauth.telegram.org', 'https://telegram.org'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://mc.yandex.ru', 'https://mc.yandex.com', 'wss://mc.yandex.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
      },
    },
    // Telegram завершает вход через popup → window.opener. Строгий COOP разрывает эту связь.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(attachUser);

const generationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много расчётов. Сделайте паузу и попробуйте позже.', code: 'RATE_LIMIT' },
});
const consultLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
});
const eventLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => Boolean(req.isAdmin),
});
const placeSearchLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к поиску городов. Сделайте короткую паузу.', code: 'PLACE_RATE_LIMIT' },
});

function hasAnonymousAccess(record, token) {
  return Boolean(token && record?.accessTokenHash && sha256(token) === record.accessTokenHash);
}

function canAccessRecord(record, req) {
  if (!record) return false;
  if (record.userId) {
    return Boolean(req.user && String(record.userId) === String(req.user.telegram_id));
  }
  return hasAnonymousAccess(record, req.headers['x-chart-token']);
}

function redactPortrait(portrait, unlocked) {
  if (unlocked) return portrait;
  return {
    ...portrait,
    cards: portrait.cards.map((card, index) => {
      if (index < freeCardCount) return { ...card, locked: false };
      return {
        id: card.id,
        order: card.order,
        icon: card.icon,
        title: card.title,
        category: card.category,
        position: card.position,
        question: card.question,
        lead: card.lead,
        evidence: card.evidence,
        locked: true,
      };
    }),
    synthesis: unlocked
      ? portrait.synthesis
      : {
          title: portrait.synthesis.title,
          formula: 'Полная формула собирается из всех элементов карты.',
          strengths: portrait.synthesis.strengths.slice(0, 1),
          tensions: ['Главный внутренний конфликт откроется в полной карте.'],
          route: ['Первый шаг появится после соединения всех элементов.'],
          bingo: 'Точка бинго скрыта до открытия полной карты.',
          locked: true,
        },
  };
}

function presentChart(record, req, { forceUnlocked = false } = {}) {
  const premium = Boolean(req.user?.premium);
  const unlocked = forceUnlocked || premium;
  return {
    id: record.id,
    chart: record.chartData,
    portrait: redactPortrait(record.portraitData, unlocked),
    source: record.source,
    access: {
      unlocked,
      premium,
      freeCardCount,
      requiresTelegram: !req.user,
    },
  };
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'herostar' }));

app.get('/api/public/stats', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(await publicStats());
  } catch (error) {
    next(error);
  }
});

app.get('/api/config', async (req, res, next) => {
  try {
    const telegram = await telegramConfiguration();
    res.json({
      telegramBotUsername: telegram.username,
      telegramConfigured: telegram.configured,
      telegramConfigurationIssue: telegram.issue,
      paymentsConfigured: Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      adminConfigured: true,
      demoMode,
      freeCardCount,
      price: Number(process.env.FULL_MAP_PRICE || '990'),
      legalConfigured: getLegalConfig().configured,
      legalContactUrl: getLegalConfig().contactUrl,
      legalContactLabel: getLegalConfig().contactLabel,
      user: req.user
        ? {
            id: req.user.telegram_id,
            firstName: req.user.first_name,
            username: req.user.username,
            photoUrl: req.user.photo_url,
            premium: req.user.premium,
            admin: isAdminUser(req.user),
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/places', placeSearchLimiter, async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 120);
    if (query.length < 2) return res.json({ items: [] });
    const items = await searchPlaces(query);
    res.set('Cache-Control', 'private, max-age=300');
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

const publicEventTypes = new Set([
  'page_view',
  'form_started',
  'demo_opened',
  'card_opened',
  'filter_changed',
  'paywall_opened',
  'auth_opened',
  'consultant_opened',
  'share_clicked',
  'new_chart_clicked',
]);

app.post('/api/events', eventLimiter, async (req, res, next) => {
  try {
    const eventType = String(req.body.eventType || '').trim();
    if (!publicEventTypes.has(eventType)) throw publicError('Неизвестное событие.', 400, 'UNKNOWN_EVENT');
    const chartId = String(req.body.chartId || '').trim() || null;
    if (chartId) {
      if (!isUuid(chartId)) throw publicError('Некорректный ID карты.', 400, 'INVALID_CHART_ID');
      const record = await getChart(chartId);
      if (!record || !canAccessRecord(record, req)) throw publicError('Нет доступа к карте.', 403);
    }
    await safeTrack({
      eventType,
      visitorId: visitorIdFrom(req),
      userId: req.user?.telegram_id || null,
      chartId,
      metadata: cleanMetadata(req.body.metadata),
    });
    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/charts', generationLimiter, async (req, res, next) => {
  try {
    const isDemo = Boolean(req.body.demo) && demoMode;
    const birthInput = isDemo
      ? {
          name: 'Демо-профиль',
          date: '1990-01-01',
          time: '12:00',
          place: 'Тестовая локация',
          latitude: 55.7558,
          longitude: 37.6173,
        }
      : { ...req.body, ...unpackSelectedPlace(req.body.place) };

    const chart = await calculateNatalChart(birthInput);
    const { portrait, source } = await generatePortrait(chart);
    const id = crypto.randomUUID();
    const accessToken = randomToken();
    const record = {
      id,
      userId: req.user?.telegram_id || null,
      accessTokenHash: sha256(accessToken),
      birthData: chart.birth,
      chartData: chart,
      portraitData: portrait,
      source,
    };
    await saveChart(record);
    await safeTrack({
      eventType: 'chart_created',
      visitorId: visitorIdFrom(req),
      userId: req.user?.telegram_id || null,
      chartId: id,
      metadata: { demo: isDemo, source, unknownTime: Boolean(chart.birth?.unknownTime) },
    });

    res.status(201).json({
      ...presentChart(record, req, { forceUnlocked: isDemo }),
      accessToken,
      demo: isDemo,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/charts/:id', async (req, res, next) => {
  try {
    const record = await getChart(req.params.id);
    if (!record) throw publicError('Карта не найдена.', 404, 'CHART_NOT_FOUND');
    if (!canAccessRecord(record, req)) throw publicError('Нет доступа к этой карте.', 403, 'CHART_FORBIDDEN');
    await safeTrack({
      eventType: 'chart_viewed',
      visitorId: visitorIdFrom(req),
      userId: req.user?.telegram_id || null,
      chartId: record.id,
    });
    res.json(presentChart(record, req));
  } catch (error) {
    next(error);
  }
});

app.get('/api/charts/:id/messages', requireUser, async (req, res, next) => {
  try {
    const record = await getChart(req.params.id);
    if (!record) throw publicError('Карта не найдена.', 404);
    if (record.userId && String(record.userId) !== String(req.user.telegram_id)) throw publicError('Нет доступа к карте.', 403);
    if (!record.userId && !hasAnonymousAccess(record, req.headers['x-chart-token'])) throw publicError('Нужен ключ карты.', 403);
    const messages = await getConsultationMessages(record.id, 200);
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

app.post('/api/charts/:id/claim', requireUser, async (req, res, next) => {
  try {
    const record = await getChart(req.params.id);
    if (!record) throw publicError('Карта не найдена.', 404);
    if (!canAccessRecord(record, req) && record.userId) throw publicError('Карта уже принадлежит другому пользователю.', 403);
    if (!record.userId && !hasAnonymousAccess(record, req.headers['x-chart-token'])) throw publicError('Нужен ключ этой карты.', 403);
    const claimed = await claimChart(record.id, req.user.telegram_id);
    if (!claimed) throw publicError('Карта уже принадлежит другому пользователю.', 403);
    await safeTrack({
      eventType: 'chart_claimed',
      visitorId: visitorIdFrom(req),
      userId: req.user.telegram_id,
      chartId: record.id,
    });
    const updated = await getChart(record.id);
    res.json(presentChart(updated, req));
  } catch (error) {
    next(error);
  }
});

app.post('/api/consult', consultLimiter, requireUser, async (req, res, next) => {
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
});

app.get('/auth/telegram/callback', async (req, res, next) => {
  try {
    const { user, token } = await completeTelegramLogin(req.query);
    setSessionCookie(res, token);
    await safeTrack({
      eventType: 'telegram_login',
      userId: user.telegram_id,
      metadata: { username: user.username || null },
    });

    const rawState = String(req.query.state || '');
    if (rawState === 'admin') return res.redirect('/admin');
    if (rawState.startsWith('clone:')) {
      const cloneChartId = rawState.slice('clone:'.length).replace(/[^a-f0-9-]/gi, '');
      return res.redirect(`/clone/?auth=ok${cloneChartId ? `&chart=${encodeURIComponent(cloneChartId)}` : ''}`);
    }
    const chartId = rawState.replace(/[^a-f0-9-]/gi, '');
    return res.redirect(`/?auth=ok${chartId ? `&chart=${encodeURIComponent(chartId)}` : ''}#map`);
  } catch (error) {
    next(error);
  }
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/payments/create', requireUser, async (req, res, next) => {
  try {
    if (!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY)) {
      throw publicError('Оплата временно недоступна. Попробуйте позже.', 503, 'PAYMENTS_NOT_CONFIGURED');
    }
    const chartId = String(req.body.chartId || '');
    const record = chartId ? await getChart(chartId) : null;
    if (chartId && !record) throw publicError('Карта не найдена.', 404);
    if (record && !canAccessRecord(record, req) && record.userId) throw publicError('Нет доступа к карте.', 403);
    if (record && !record.userId) {
      if (!hasAnonymousAccess(record, req.headers['x-chart-token'])) throw publicError('Нужен ключ карты.', 403);
      await claimChart(record.id, req.user.telegram_id);
    }
    const payment = await createPayment({
      user: req.user,
      chartId,
      visitorId: visitorIdFrom(req),
      receiptContact: req.body.receiptContact,
    });
    res.json({ paymentId: payment.id, confirmationUrl: payment.confirmation?.confirmation_url });
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/webhook', async (req, res, next) => {
  try {
    await processWebhook(req.body);
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/payment/return', (_req, res) => {
  res.redirect('/?payment=return#map');
});

for (const kind of ['privacy', 'consent', 'terms', 'offer', 'refunds']) {
  app.get(`/${kind}`, (_req, res) => {
    res.type('html').send(renderLegalPage(kind));
  });
}

app.get('/admin', (_req, res) => {
  res.redirect('/admin.html');
});

app.get('/api/admin/overview', requireAdmin, async (req, res, next) => {
  try {
    res.json(await getAdminOverview(req.query.days));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/charts', requireAdmin, async (req, res, next) => {
  try {
    res.json(await listAdminCharts({
      limit: req.query.limit,
      offset: req.query.offset,
      search: req.query.search,
    }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/charts/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw publicError('Некорректный ID разбора.', 400);
    const details = await getAdminChartDetails(req.params.id);
    if (!details) throw publicError('Разбор не найден.', 404);
    res.json(details);
  } catch (error) {
    next(error);
  }
});

app.use(express.static('public', { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.use((error, _req, res, _next) => {
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: error.expose ? error.message : status >= 500 ? 'Сервис столкнулся с ошибкой. Повторите действие.' : error.message,
    code: error.code || 'INTERNAL_ERROR',
  });
});

await initStore();
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`HeroStar запущен на порту ${port}`);
});

function shutdown(signal) {
  console.log(`${signal}: корректное завершение`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
