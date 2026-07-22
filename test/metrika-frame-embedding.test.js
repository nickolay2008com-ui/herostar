import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authUrl = new URL('../src/auth.js', import.meta.url);

test('HTML-страницы разрешают визуальный редактор Яндекс Метрики без открытия для чужих сайтов', async () => {
  const source = await readFile(authUrl, 'utf8');

  assert.match(source, /frame-ancestors/);
  assert.match(source, /https:\/\/metrika\.yandex\.ru/);
  assert.match(source, /https:\/\/\*\.webvisor\.com/);
  assert.match(source, /https:\/\/mc\.webvisor\.com/);
  assert.match(source, /https:\/\/yastatic\.net/);
  assert.match(source, /mergeCspDirective\(nextPolicy, 'script-src'/);
  assert.match(source, /mergeCspDirective\(nextPolicy, 'connect-src'/);
  assert.match(source, /mergeCspDirective\(nextPolicy, 'frame-src'/);
  assert.match(source, /removeHeader\('X-Frame-Options'\)/);
  assert.match(source, /isDocumentRequest/);
});
