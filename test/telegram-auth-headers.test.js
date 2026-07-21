import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Telegram Login сохраняет связь с popup после подтверждения пользователя', async () => {
  const server = await read('server.js');

  assert.match(
    server,
    /crossOriginOpenerPolicy:\s*\{\s*policy:\s*['"]same-origin-allow-popups['"]\s*\}/,
    'COOP same-origin блокирует window.opener и оставляет Telegram Login без завершения',
  );
  assert.doesNotMatch(
    server,
    /crossOriginOpenerPolicy:\s*\{\s*policy:\s*['"]same-origin['"]\s*\}/,
  );
});
