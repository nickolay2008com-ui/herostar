import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleTelegramLinkUpdates,
  telegramLinkAuthMiddleware,
} from '../src/telegram-link-auth.js';

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
  };
}

async function callMiddleware({ path, body }) {
  const req = {
    method: 'POST',
    path,
    body,
    headers: {},
    user: null,
  };
  const res = responseRecorder();
  await telegramLinkAuthMiddleware(req, res, () => {
    throw new Error(`Unexpected next() for ${path}`);
  });
  return res;
}

test('восстановление существующего Клона создаёт ссылку и завершает вход return-токеном', async () => {
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };
  const previousFetch = globalThis.fetch;
  const telegramMessages = [];

  delete process.env.DATABASE_URL;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_BOT_USERNAME = 'HeroStarTestBot';
  process.env.APP_BASE_URL = 'https://herostar.example';
  globalThis.fetch = async (url, options = {}) => {
    const method = String(url).split('/').pop();
    const payload = JSON.parse(options.body || '{}');
    if (method === 'getMe') {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { username: 'HeroStarTestBot' } }),
      };
    }
    if (method === 'sendMessage') telegramMessages.push(payload);
    return {
      ok: true,
      json: async () => ({ ok: true, result: true }),
    };
  };

  try {
    const created = await callMiddleware({
      path: '/api/auth/telegram-link',
      body: {},
    });
    assert.equal(created.statusCode, 201);
    assert.match(created.payload.token, /^[A-Za-z0-9_-]{24,80}$/);
    assert.equal(
      created.payload.telegramUrl,
      `https://t.me/HeroStarTestBot?start=login_${created.payload.token}`,
    );

    const pending = await callMiddleware({
      path: '/api/auth/telegram-link/status',
      body: { token: created.payload.token },
    });
    assert.deepEqual(pending.payload, { status: 'pending' });

    await handleTelegramLinkUpdates([{
      message: {
        date: Math.floor(Date.now() / 1000),
        text: `/start login_${created.payload.token}`,
        from: { id: 4242, username: 'existing_clone_owner', first_name: 'Owner' },
        chat: { id: 4242 },
      },
    }]);

    const confirmation = telegramMessages.at(-1);
    const returnUrl = confirmation.reply_markup.inline_keyboard[0][0].url;
    const parsedReturnUrl = new URL(returnUrl);
    const returnToken = parsedReturnUrl.searchParams.get('telegram_link');
    assert.equal(parsedReturnUrl.pathname, '/clone/live/chat');
    assert.match(returnToken, /^[A-Za-z0-9_-]{24,80}$/);

    const authorized = await callMiddleware({
      path: '/api/auth/telegram-link/status',
      body: { token: returnToken },
    });
    assert.deepEqual(authorized.payload, { status: 'authorized', chartId: null });
    assert.match(authorized.headers['set-cookie'], /^herostar_session=/);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
