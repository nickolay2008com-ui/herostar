import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authUrl = new URL('../src/auth.js', import.meta.url);

test('HTML-страницы разрешают iframe только интерфейсам Яндекс Метрики', async () => {
  const source = await readFile(authUrl, 'utf8');

  assert.match(source, /frame-ancestors/);
  assert.match(source, /https:\/\/metrika\.yandex\.ru/);
  assert.match(source, /removeHeader\('X-Frame-Options'\)/);
  assert.match(source, /isDocumentRequest/);
});
