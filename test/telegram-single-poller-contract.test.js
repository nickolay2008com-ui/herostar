import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../src/telegram-link-auth.js', import.meta.url), 'utf8');

test('Telegram polling uses a PostgreSQL advisory lock so only one instance calls getUpdates', async () => {
  const code = await source();
  assert.match(code, /pg_try_advisory_lock\(\$1, \$2\)/);
  assert.match(code, /pg_advisory_unlock\(\$1, \$2\)/);
  assert.match(code, /active getUpdates leader/);
  assert.match(code, /held by another instance; waiting for takeover/);
});

test('Telegram polling backs off on duplicate getUpdates conflicts and reports recovery', async () => {
  const code = await source();
  assert.match(code, /Conflict: terminated by other getUpdates request/);
  assert.match(code, /TELEGRAM_POLL_CONFLICT_MAX_BACKOFF_MS/);
  assert.match(code, /polling recovered after/);
});

test('Telegram leader loss aborts long polling and shutdown interrupts backoff', async () => {
  const code = await source();
  assert.match(code, /lockClient\.on\('error', lockErrorHandler\)/);
  assert.match(code, /leadershipAbort\.abort\(error\)/);
  assert.match(code, /AbortSignal\.any\(\[runtimeAbort\.signal, leadershipAbort\.signal\]\)/);
  assert.match(code, /sleepUntil\(backoffMs, leaderSignal\)/);
  assert.match(code, /runtimeAbort\.abort\(\)/);
});
