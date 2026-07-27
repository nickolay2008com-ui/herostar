import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startTelegramUpdateRuntime,
  telegramLinkAuthMiddleware,
} from '../src/telegram-link-auth.js';

function responseRecorder() {
  let statusCode = 200;
  let payload = null;
  const headers = new Map();
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    snapshot() {
      return { statusCode, payload, headers };
    },
  };
}

async function callAuthMiddleware({ path, body = {}, headers = {} }) {
  const response = responseRecorder();
  let nextCalled = false;
  await telegramLinkAuthMiddleware({
    method: 'POST',
    path,
    body,
    headers,
    user: null,
  }, response, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false, `${path} должен быть обработан Telegram middleware`);
  return response.snapshot();
}

test('единый Telegram runtime проводит полный вход и передаёт callback практикам', async () => {
  const previous = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    username: process.env.TELEGRAM_BOT_USERNAME,
    database: process.env.DATABASE_URL,
    fetch: globalThis.fetch,
  };
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_BOT_USERNAME = 'herostar_test_bot';
  delete process.env.DATABASE_URL;

  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/getMe$/);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { username: 'herostar_test_bot' } }),
    };
  };

  let runtime = null;
  try {
    const created = await callAuthMiddleware({ path: '/api/auth/telegram-link' });
    assert.equal(created.statusCode, 201);
    assert.match(created.payload.token, /^[A-Za-z0-9_-]{24,80}$/);
    assert.equal(
      created.payload.telegramUrl,
      `https://t.me/herostar_test_bot?start=login_${created.payload.token}`,
    );

    let getUpdatesCalls = 0;
    const getUpdatesPayloads = [];
    const sentMessages = [];
    const receivedByPractice = [];
    let resolveHandled;
    const handled = new Promise((resolve) => { resolveHandled = resolve; });
    const fetchImpl = async (url, options = {}) => {
      const method = new URL(String(url)).pathname.split('/').pop();
      const requestBody = JSON.parse(options.body || '{}');
      if (method === 'getUpdates') {
        getUpdatesPayloads.push(requestBody);
        getUpdatesCalls += 1;
        if (getUpdatesCalls === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: [
                {
                  update_id: 40,
                  message: {
                    date: Math.floor(Date.now() / 1000),
                    chat: { id: 7 },
                    from: { id: 7, username: 'tester', first_name: 'Test' },
                    text: `/start login_${created.payload.token}`,
                  },
                },
                {
                  update_id: 41,
                  callback_query: {
                    id: 'callback-1',
                    from: { id: 7 },
                    data: 'alignment:disable',
                  },
                },
              ],
            }),
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { ok: true, status: 200, json: async () => ({ ok: true, result: [] }) };
      }
      if (method === 'sendMessage') {
        sentMessages.push(requestBody);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 1 } }),
        };
      }
      throw new Error(`Unexpected Telegram method: ${method}`);
    };

    runtime = startTelegramUpdateRuntime({
      fetchImpl,
      updateHandlers: [async (updates) => {
        receivedByPractice.push(...updates);
        resolveHandled();
      }],
    });

    await Promise.race([
      handled,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Telegram runtime timeout')), 1000)),
    ]);

    assert.deepEqual(receivedByPractice.map((update) => update.update_id), [40, 41]);
    assert.equal(getUpdatesPayloads[0].offset, 0);
    assert.equal(getUpdatesPayloads[0].timeout, 25);
    assert.deepEqual(getUpdatesPayloads[0].allowed_updates, ['message', 'callback_query']);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].chat_id, 7);
    assert.match(sentMessages[0].text, /Telegram подтверждён/);

    const authorized = await callAuthMiddleware({
      path: '/api/auth/telegram-link/status',
      body: { token: created.payload.token },
    });
    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.payload.status, 'authorized');
    assert.equal(authorized.payload.chartId, null);
    assert.match(authorized.headers.get('set-cookie'), /^herostar_session=/);

    const stopStartedAt = Date.now();
    await runtime.stop();
    runtime = null;
    assert.ok(Date.now() - stopStartedAt < 1000, 'остановка runtime не должна оставлять 36-секундный таймер');
  } finally {
    await runtime?.stop();
    if (previous.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previous.token;
    if (previous.username === undefined) delete process.env.TELEGRAM_BOT_USERNAME;
    else process.env.TELEGRAM_BOT_USERNAME = previous.username;
    if (previous.database === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.database;
    globalThis.fetch = previous.fetch;
  }
});
