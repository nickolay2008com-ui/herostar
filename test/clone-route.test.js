import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serverUrl = new URL('../server.js', import.meta.url);

test('страница клона явно доступна с завершающим слешем и без него', async () => {
  const server = await readFile(serverUrl, 'utf8');
  assert.match(server, /app\.get\(\[\s*['"]\/clone['"]\s*,\s*['"]\/clone\/['"]\s*\]/);
  assert.match(server, /sendFile\(['"]clone\.html['"]/);
});
