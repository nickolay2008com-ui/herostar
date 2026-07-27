import test from 'node:test';
import assert from 'node:assert/strict';
import { startTelegramLinkUpdatePolling } from '../src/telegram-link-auth.js';

test('единый Telegram poller передаёт callback практикам и корректно останавливается', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousDatabase = process.env.DATABASE_URL;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  delete process.env.DATABASE_URL;

  let requestCount = 0;
  const payloads = [];
  let resolveHandled;
  const handled = new Promise((resolve) => { resolveHandled = resolve; });
  const fetchImpl = async (_url, options = {}) => {
    payloads.push(JSON.parse(options.body || '{}'));
    requestCount += 1;
    if (requestCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: [{
            update_id: 41,
            callback_query: { id: 'callback-1', from: { id: 7 }, data: 'alignment:disable' },
          }],
        }),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { ok: true, status: 200, json: async () => ({ ok: true, result: [] }) };
  };

  const received = [];
  const runtime = startTelegramLinkUpdatePolling({
    fetchImpl,
    updateHandlers: [async (updates) => {
      received.push(...updates);
      resolveHandled();
    }],
  });

  try {
    await Promise.race([
      handled,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Telegram handler timeout')), 1000)),
    ]);
    assert.equal(received.length, 1);
    assert.equal(received[0].update_id, 41);
    assert.deepEqual(payloads[0].allowed_updates, ['message', 'callback_query']);
  } finally {
    await runtime?.stop();
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabase;
  }
});
