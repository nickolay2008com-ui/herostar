import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { calculateNatalChart } from './src/astro.js';
import { generatePortrait, answerConsultation } from './src/ai.js';
import { initStore, saveChart, getChart, claimChart } from './src/store.js';
import { attachUser, completeTelegramLogin, setSessionCookie, clearSessionCookie, requireUser } from './src/auth.js';
import { createPayment, processWebhook } from './src/payments.js';
import { randomToken, sha256, publicError } from './src/utils.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const freeCardCount = Math.max(1, Number(process.env.FREE_CARD_COUNT || 3));
const demoMode = String(process.env.DEMO_MODE || 'true').toLowerCase() === 'true';

app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://telegram.org', 'https://oauth.telegram.org'],
        frameSrc: ["'self'", 'https://oauth.telegram.org', 'https://telegram.org'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
      },
    },
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

function hasAnonymousAccess(record, token) {
  return Boolean(token && record?.accessTokenHash && sha256(token) === record.accessTokenHash);
}

function canAccessRecord(record, req) {
  if (!record) return false;
  if (req.user && record.userId && String(record.userId) === String(req.user.telegram_id)) return true;
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

app.get('/api/config', (req, res) => {
  res.json({
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
    paymentsConfigured: Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    demoMode,
    freeCardCount,
    price: Number(process.env.FULL_MAP_PRICE || '990'),
    user: req.user
      ? {
          id: req.user.telegram_id,
          firstName: req.user.first_name,
          username: req.user.username,
          photoUrl: req.user.photo_url,
          premium: req.user.premium,
        }
      : null,
  });
});

app.post('/api/charts', generationLimiter, async (req, res, next) => {
  try {
    const isDemo = Boolean(req.body.demo) && demoMode;
    const birthInput = isDemo
      ? {
          name: 'Николай',
          date: '1987-11-06',
          time: '01:15',
          place: 'Донецк, Украина',
          latitude: 48.0159,
          longitude: 37.8029,
        }
      : req.body;

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
    res.json(presentChart(record, req));
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
    await claimChart(record.id, req.user.telegram_id);
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
      await claimChart(record.id, req.user.telegram_id);
    }

    const answer = await answerConsultation({
      chart: record.chartData,
      portrait: record.portraitData,
      question,
      history: Array.isArray(req.body.history) ? req.body.history : [],
    });
    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.get('/auth/telegram/callback', async (req, res, next) => {
  try {
    const { user, token } = await completeTelegramLogin(req.query);
    setSessionCookie(res, token);
    const chartId = String(req.query.state || '').replace(/[^a-f0-9-]/gi, '');
    res.redirect(`/?auth=ok${chartId ? `&chart=${encodeURIComponent(chartId)}` : ''}#map`);
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
    const chartId = String(req.body.chartId || '');
    const record = chartId ? await getChart(chartId) : null;
    if (chartId && !record) throw publicError('Карта не найдена.', 404);
    if (record && !canAccessRecord(record, req) && record.userId) throw publicError('Нет доступа к карте.', 403);
    if (record && !record.userId) {
      if (!hasAnonymousAccess(record, req.headers['x-chart-token'])) throw publicError('Нужен ключ карты.', 403);
      await claimChart(record.id, req.user.telegram_id);
    }
    const payment = await createPayment({ user: req.user, chartId });
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

app.use(express.static('public', { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.use((error, _req, res, _next) => {
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 ? 'Сервис столкнулся с ошибкой. Повторите действие.' : error.message,
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
