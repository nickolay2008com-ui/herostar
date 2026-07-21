import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('главная содержит локальный favicon', () => {
  assert.match(read('public/index.html'), /href="\/favicon\.svg"/);
  assert.match(read('public/favicon.svg'), /<svg/);
});

test('CSP разрешает служебный WebSocket Метрики', () => {
  assert.match(read('server.js'), /wss:\/\/mc\.yandex\.com/);
});

test('критичные мобильные подписи не мельче 12px', () => {
  const css = read('public/campaign-readiness.css');
  for (const selector of ['.field small', '.microcopy', '.eyebrow', '.proof-row span', '.treasure-legend small']) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${'}()|[\]\\]/g, '\$&')));
  }
  assert.match(css, /font-size:\s*12px/);
});
