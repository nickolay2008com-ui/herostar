import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('скидка честно показана на главной и в начале разбора', async () => {
  const html = await read('public/index.html');
  const placements = html.match(/data-full-map-offer/g) || [];

  assert.equal(placements.length, 2);
  assert.match(html, /Полная карта —/);
  assert.match(html, /Открыть все 11 сокровищ —/);
  assert.match(html, /data-offer-original-price>999 ₽/);
  assert.match(html, /data-offer-price>199 ₽/);
  assert.doesNotMatch(html, /скидка действует|успейте|осталось \d+/i);
});

test('публичная цена скидки синхронизируется с серверным каталогом', async () => {
  const app = await read('public/app.js');

  assert.match(app, /const price = Number\(state\.config\.price\)/);
  assert.match(app, /const originalPrice = Number\(state\.config\.originalPrice \|\| 0\)/);
  assert.match(app, /\$\$\('\[data-offer-price\]'\)/);
  assert.match(app, /\$\$\('\[data-offer-original-price\]'\)/);
  assert.match(app, /const hasDiscount = originalPrice > price/);
});
