import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const authUrl = new URL('../src/auth.js', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);

test('HTML-страницы разрешают официальный счётчик и визуальный редактор Метрики без открытия для чужих сайтов', async () => {
  const [authSource, indexSource] = await Promise.all([
    readFile(authUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
  ]);

  assert.match(authSource, /frame-ancestors/);
  assert.match(authSource, /https:\/\/metrika\.yandex\.ru/);
  assert.match(authSource, /https:\/\/\*\.webvisor\.com/);
  assert.match(authSource, /https:\/\/mc\.webvisor\.com/);
  assert.match(authSource, /https:\/\/yastatic\.net/);
  assert.match(authSource, /mergeCspDirective\(nextPolicy, 'script-src'/);
  assert.match(authSource, /mergeCspDirective\(nextPolicy, 'connect-src'/);
  assert.match(authSource, /mergeCspDirective\(nextPolicy, 'frame-src'/);
  assert.match(authSource, /removeHeader\('X-Frame-Options'\)/);
  assert.match(authSource, /removeHeader\('Cross-Origin-Opener-Policy'\)/);
  assert.match(authSource, /isDocumentRequest/);

  const inlineScript = indexSource.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript, 'Официальный inline-код Метрики должен присутствовать в HTML');
  const hash = crypto.createHash('sha256').update(inlineScript).digest('base64');
  assert.match(authSource, new RegExp(`sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});
