import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const authUrl = new URL('../src/auth.js', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);
const cloneUrl = new URL('../public/clone.html', import.meta.url);

function inlineMetrikaScript(source) {
  return source.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)?.[1];
}

test('HTML-страницы разрешают официальный счётчик и визуальный редактор Метрики без открытия для чужих сайтов', async () => {
  const [authSource, indexSource, cloneSource] = await Promise.all([
    readFile(authUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
    readFile(cloneUrl, 'utf8'),
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

  const indexScript = inlineMetrikaScript(indexSource);
  const cloneScript = inlineMetrikaScript(cloneSource);
  assert.ok(indexScript, 'Официальный inline-код Метрики должен присутствовать на главной странице');
  assert.ok(cloneScript, 'Официальный inline-код Метрики должен присутствовать на странице клона');
  assert.equal(cloneScript, indexScript, 'Клон должен использовать канонический bootstrap Метрики без расхождения hash');

  const hash = crypto.createHash('sha256').update(indexScript).digest('base64');
  assert.match(authSource, new RegExp(`sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});
