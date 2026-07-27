from pathlib import Path
import re
import sys


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_exact(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one source fragment, found {count}')
    return text.replace(old, new, 1)


def replace_regex(text, pattern, replacement, label, flags=re.S):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected one regex match, found {count}')
    return updated


# 1. Telegram auth becomes the single owner of getUpdates.
auth_path = 'src/telegram-link-auth.js'
auth = read(auth_path)
auth = replace_exact(
    auth,
    'let fallbackPollingRuntime = null;\n',
    'let telegramPollingRuntime = null;\nconst telegramUpdateHandlers = new Set();\n',
    'telegram runtime state',
)
auth = replace_exact(
    auth,
    "function fallbackPollingRequired() {\n  const practiceEnabled = String(process.env.PRACTICE_NOTIFICATIONS_ENABLED || 'true').toLowerCase() !== 'false';\n  return !practiceEnabled || !compact(process.env.DATABASE_URL);\n}\n\n",
    '',
    'remove fallback ownership rule',
)
auth = replace_exact(
    auth,
    "        CREATE INDEX IF NOT EXISTS telegram_login_links_expires_idx\n          ON telegram_login_links(expires_at);\n",
    "        CREATE INDEX IF NOT EXISTS telegram_login_links_expires_idx\n          ON telegram_login_links(expires_at);\n\n        CREATE TABLE IF NOT EXISTS telegram_update_runtime (\n          key TEXT PRIMARY KEY,\n          value TEXT,\n          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n        );\n",
    'telegram offset schema',
)

runtime_helpers = r'''async function readTelegramUpdateOffset() {
  try {
    const pool = await authPool();
    if (!pool) return 0;
    const result = await pool.query(
      'SELECT value FROM telegram_update_runtime WHERE key = $1 LIMIT 1',
      ['get_updates_offset'],
    );
    return Math.max(0, Number(result.rows[0]?.value) || 0);
  } catch (error) {
    console.error('HeroStar Telegram offset load failed:', error.message);
    return 0;
  }
}

async function writeTelegramUpdateOffset(offset) {
  try {
    const pool = await authPool();
    if (!pool) return;
    await pool.query(
      `INSERT INTO telegram_update_runtime (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['get_updates_offset', String(Math.max(0, Number(offset) || 0))],
    );
  } catch (error) {
    console.error('HeroStar Telegram offset save failed:', error.message);
  }
}

export function registerTelegramUpdateHandler(handler) {
  if (typeof handler !== 'function') return () => {};
  telegramUpdateHandlers.add(handler);
  return () => telegramUpdateHandlers.delete(handler);
}

async function dispatchTelegramUpdates(updates, { fetchImpl }) {
  await handleTelegramLinkUpdates(updates, { fetchImpl });
  for (const handler of [...telegramUpdateHandlers]) {
    try {
      await handler(updates, { fetchImpl });
    } catch (error) {
      console.error('HeroStar Telegram update handler failed:', error.message);
    }
  }
}

'''
auth = replace_exact(
    auth,
    'export function startTelegramLinkUpdatePolling({ fetchImpl = globalThis.fetch } = {}) {',
    runtime_helpers + 'export function startTelegramLinkUpdatePolling({ fetchImpl = globalThis.fetch, updateHandlers = [] } = {}) {',
    'insert unified runtime helpers',
)

auth = replace_regex(
    auth,
    r"export function startTelegramLinkUpdatePolling\(\{ fetchImpl = globalThis\.fetch, updateHandlers = \[\] \} = \{\}\) \{.*?\n\}\s*$",
    r'''export function startTelegramLinkUpdatePolling({ fetchImpl = globalThis.fetch, updateHandlers = [] } = {}) {
  for (const handler of updateHandlers) registerTelegramUpdateHandler(handler);
  if (telegramPollingRuntime) return telegramPollingRuntime;

  const botToken = compact(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken) return null;

  let stopped = false;
  const done = (async () => {
    let offset = await readTelegramUpdateOffset();
    console.log('HeroStar Telegram использует единый канал обновлений для входа и практик.');
    while (!stopped) {
      try {
        const updates = await telegramApiRequest(fetchImpl, botToken, 'getUpdates', {
          offset,
          timeout: TELEGRAM_POLL_TIMEOUT_SECONDS,
          allowed_updates: ['message', 'callback_query'],
        }, (TELEGRAM_POLL_TIMEOUT_SECONDS + 10) * 1000);

        await dispatchTelegramUpdates(updates || [], { fetchImpl });
        for (const update of updates || []) {
          offset = Math.max(offset, Number(update.update_id) + 1);
        }
        if ((updates || []).length) await writeTelegramUpdateOffset(offset);
      } catch (error) {
        if (stopped) break;
        console.error('HeroStar Telegram polling failed:', error.message);
        await sleep(5000);
      }
    }
  })();

  telegramPollingRuntime = {
    registerUpdateHandler: registerTelegramUpdateHandler,
    async stop() {
      stopped = true;
      await Promise.race([done, sleep(36_000)]);
      telegramPollingRuntime = null;
      telegramUpdateHandlers.clear();
    },
  };
  return telegramPollingRuntime;
}
''',
    'replace Telegram poller',
)
write(auth_path, auth)


# 2. Practices become a consumer of the common stream and never call getUpdates.
practice_path = 'src/practice-notifications.js'
practice = read(practice_path)
practice = replace_exact(
    practice,
    "import { handleTelegramLinkUpdates } from './telegram-link-auth.js';\n\n",
    '',
    'remove practice auth import',
)
practice = replace_exact(
    practice,
    'const TELEGRAM_POLL_TIMEOUT_SECONDS = 25;\n',
    '',
    'remove practice poll timeout',
)
practice = replace_exact(
    practice,
    'let startedRuntime = null;\n',
    "let startedRuntime = null;\nconst MAX_PENDING_PRACTICE_UPDATES = 100;\nconst pendingPracticeUpdates = new Map();\nlet practiceUpdateContext = null;\nlet practiceUpdatesState = 'waiting';\n",
    'practice update state',
)
practice = replace_exact(
    practice,
    "\n    CREATE TABLE IF NOT EXISTS practice_runtime (\n      key TEXT PRIMARY KEY,\n      value TEXT,\n      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );",
    '',
    'remove obsolete practice runtime table',
)
practice = replace_regex(
    practice,
    r"async function getRuntimeValue\(pool, key\) \{.*?\n\}\n\nasync function setRuntimeValue\(pool, key, value\) \{.*?\n\}\n\n",
    '',
    'remove practice offset storage',
)

practice_dispatch = r'''const PRACTICE_COMMANDS = new Set([
  '/start', '/on', '/resume', '/stop', '/off', '/pause', '/status',
]);

function isPracticeTelegramUpdate(update) {
  const callbackData = compactText(update?.callback_query?.data);
  if (callbackData.startsWith('alignment:')) return true;

  const rawText = compactText(update?.message?.text);
  if (!rawText || /^\/start(?:@\w+)?\s+login_/i.test(rawText)) return false;
  const command = rawText.toLowerCase().split(/\s+/)[0].split('@')[0];
  return PRACTICE_COMMANDS.has(command);
}

function queuePracticeTelegramUpdates(updates) {
  for (const update of updates) {
    const numericId = Number(update?.update_id);
    const key = Number.isFinite(numericId)
      ? String(numericId)
      : `fallback:${JSON.stringify(update).slice(0, 500)}`;
    pendingPracticeUpdates.set(key, update);
  }
  while (pendingPracticeUpdates.size > MAX_PENDING_PRACTICE_UPDATES) {
    pendingPracticeUpdates.delete(pendingPracticeUpdates.keys().next().value);
  }
}

async function dispatchPracticeTelegramUpdates(updates, context) {
  for (const update of updates) {
    try {
      await handleTelegramUpdate(context.pool, context.token, update, context.options.reminderHours);
    } catch (error) {
      console.error(`HeroStar Telegram practice update ${update?.update_id ?? 'unknown'} failed:`, error.message);
    }
  }
}

export async function handlePracticeTelegramUpdates(updates = []) {
  const relevant = Array.isArray(updates) ? updates.filter(isPracticeTelegramUpdate) : [];
  if (!relevant.length) return;
  if (['disabled', 'failed', 'stopped'].includes(practiceUpdatesState)) return;
  if (!practiceUpdateContext) {
    queuePracticeTelegramUpdates(relevant);
    return;
  }
  await dispatchPracticeTelegramUpdates(relevant, practiceUpdateContext);
}

async function activatePracticeTelegramUpdates(context) {
  practiceUpdateContext = context;
  practiceUpdatesState = 'ready';
  const queued = [...pendingPracticeUpdates.values()].sort(
    (left, right) => Number(left?.update_id || 0) - Number(right?.update_id || 0),
  );
  pendingPracticeUpdates.clear();
  if (queued.length) await dispatchPracticeTelegramUpdates(queued, context);
}

'''
practice = replace_exact(
    practice,
    'async function handleTelegramUpdate(pool, token, update, reminderHours) {',
    practice_dispatch + 'async function handleTelegramUpdate(pool, token, update, reminderHours) {',
    'insert practice stream consumer',
)
practice = replace_regex(
    practice,
    r"async function pollTelegramUpdates\(pool, token, signal, options\) \{.*?\n\}\n\n",
    '',
    'remove second Telegram poller',
)

practice_start = r'''export async function startPracticeNotifications() {
  if (startedRuntime) return startedRuntime;
  startedRuntime = (async () => {
    const enabled = String(process.env.PRACTICE_NOTIFICATIONS_ENABLED || 'true').toLowerCase() !== 'false';
    const databaseUrl = compactText(process.env.DATABASE_URL);
    const token = compactText(process.env.TELEGRAM_BOT_TOKEN);
    if (!enabled || !databaseUrl || !token) {
      practiceUpdatesState = 'disabled';
      pendingPracticeUpdates.clear();
      console.warn('Telegram-практика не запущена: нужен DATABASE_URL и TELEGRAM_BOT_TOKEN.');
      return { stop: async () => {} };
    }
    practiceUpdatesState = 'starting';

    const pgModule = await import('pg');
    const Pool = pgModule.Pool || pgModule.default?.Pool;
    if (!Pool) throw new Error('pg.Pool недоступен.');
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 2,
    });
    await ensureSchema(pool);

    const options = {
      cadenceHours: boundedNumber(process.env.PRACTICE_NOTIFICATION_HOURS, DEFAULT_CADENCE_HOURS, 1, 168),
      firstDelayMinutes: boundedNumber(process.env.PRACTICE_FIRST_DELAY_MINUTES, DEFAULT_FIRST_DELAY_MINUTES, 1, 1440),
      cycleIntervalMs: boundedNumber(process.env.PRACTICE_CYCLE_INTERVAL_MS, DEFAULT_CYCLE_INTERVAL_MS, 15_000, 3_600_000),
      batchSize: boundedNumber(process.env.PRACTICE_BATCH_SIZE, 20, 1, 100),
      reminderHours: boundedNumber(process.env.PRACTICE_REMINDER_HOURS, DEFAULT_REMINDER_HOURS, 1, 24),
    };
    await activatePracticeTelegramUpdates({ pool, token, options });

    let cycleRunning = false;
    const cycle = async () => {
      if (cycleRunning) return;
      cycleRunning = true;
      try {
        await runDeliveryCycle(pool, token, options);
      } catch (error) {
        console.error('HeroStar practice cycle failed:', error);
      } finally {
        cycleRunning = false;
      }
    };

    await cycle();
    const interval = setInterval(cycle, options.cycleIntervalMs);
    interval.unref?.();

    console.log(`HeroStar practice notifications started: every ${options.cadenceHours}h.`);
    return {
      async stop() {
        clearInterval(interval);
        if (practiceUpdateContext?.pool === pool) practiceUpdateContext = null;
        practiceUpdatesState = 'stopped';
        pendingPracticeUpdates.clear();
        await pool.end();
        startedRuntime = null;
      },
    };
  })().catch((error) => {
    practiceUpdateContext = null;
    practiceUpdatesState = 'failed';
    pendingPracticeUpdates.clear();
    startedRuntime = null;
    throw error;
  });
  return startedRuntime;
}
'''
practice = replace_regex(
    practice,
    r"export async function startPracticeNotifications\(\) \{.*?\n\}\s*$",
    practice_start,
    'replace practice startup',
)
write(practice_path, practice)


# 3. Bootstrap wires the practice consumer into the independent auth runtime.
bootstrap_path = 'bootstrap.js'
bootstrap = read(bootstrap_path)
bootstrap = replace_exact(
    bootstrap,
    "const { startPracticeNotifications } = await import('./src/practice-notifications.js');\nvoid startPracticeNotifications().catch((error) => {\n  console.error('Не удалось запустить практические Telegram-уведомления:', error);\n});\nstartTelegramLinkUpdatePolling();",
    "let practiceModule = null;\ntry {\n  practiceModule = await import('./src/practice-notifications.js');\n} catch (error) {\n  console.error('Не удалось загрузить модуль практических Telegram-уведомлений:', error);\n}\n\nstartTelegramLinkUpdatePolling({\n  updateHandlers: practiceModule?.handlePracticeTelegramUpdates\n    ? [practiceModule.handlePracticeTelegramUpdates]\n    : [],\n});\n\nif (practiceModule?.startPracticeNotifications) {\n  void practiceModule.startPracticeNotifications().catch((error) => {\n    console.error('Не удалось запустить практические Telegram-уведомления:', error);\n  });\n}",
    'bootstrap Telegram ownership',
)
write(bootstrap_path, bootstrap)


# 4. Update the existing contract and add an executable runtime test.
test_path = 'test/telegram-link-auth.test.js'
test_source = read(test_path)
new_contract = r'''test('Telegram-вход не зависит от запуска Сонастройки и владеет единственным getUpdates', async () => {
  const [auth, bootstrap, practice] = await Promise.all([
    read('src/telegram-link-auth.js'),
    read('bootstrap.js'),
    read('src/practice-notifications.js'),
  ]);
  assert.match(auth, /startTelegramLinkUpdatePolling/);
  assert.match(auth, /telegram_update_runtime/);
  assert.match(auth, /allowed_updates: \['message', 'callback_query'\]/);
  assert.doesNotMatch(auth, /fallbackPollingRequired/);
  assert.doesNotMatch(auth, /PRACTICE_NOTIFICATIONS_ENABLED/);
  assert.match(bootstrap, /handlePracticeTelegramUpdates/);
  assert.match(bootstrap, /updateHandlers:/);
  assert.match(practice, /export async function handlePracticeTelegramUpdates/);
  assert.match(practice, /pendingPracticeUpdates/);
  assert.doesNotMatch(practice, /handleTelegramLinkUpdates/);
  assert.doesNotMatch(practice, /getUpdates/);
  assert.equal((`${auth}\n${practice}`.match(/'getUpdates'/g) || []).length, 1);
  assert.doesNotMatch(bootstrap, /globalThis\.fetch\s*=/);
});'''
test_source = replace_regex(
    test_source,
    r"test\('Telegram-вход не зависит от включённой Сонастройки'.*?\n\}\);",
    new_contract,
    'replace Telegram independence contract',
)
write(test_path, test_source)

runtime_test = r'''import test from 'node:test';
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
'''
write('test/telegram-update-runtime.test.js', runtime_test)

print('Unified Telegram runtime applied successfully.')
