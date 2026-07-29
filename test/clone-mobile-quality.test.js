import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('live-страница версионирует CSS и JavaScript, сохраняя HTML без кеша', async () => {
  const [html, bootstrap] = await Promise.all([
    read('public/clone/live/index.html'),
    read('bootstrap.js'),
  ]);

  const assets = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js)[^"]*)"/g)].map((match) => match[1]);
  assert.ok(assets.length >= 10);
  assert.ok(assets.every((asset) => /[?&]v=[A-Za-z0-9._-]+/.test(asset)));
  assert.match(html, /\/clone\.js\?v=20260726-priority1/);
  assert.match(bootstrap, /isVersionedAsset/);
  assert.match(bootstrap, /public, max-age=31536000, immutable/);
  assert.match(bootstrap, /no-cache, no-store, must-revalidate/);
});

test('поиск города работает как доступный combobox с клавиатурой', async () => {
  const [html, clone] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone.js'),
  ]);

  assert.match(html, /id="placeQuery"[^>]*role="combobox"[^>]*aria-expanded="false"[^>]*aria-controls="placeResults"/);
  assert.match(html, /id="placeResults"[^>]*role="listbox"/);
  assert.match(html, /id="placeStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(clone, /setAttribute\('role', 'option'\)/);
  assert.match(clone, /event\.key === 'ArrowDown'/);
  assert.match(clone, /event\.key === 'ArrowUp'/);
  assert.match(clone, /event\.key === 'Enter'/);
  assert.match(clone, /event\.key === 'Escape'/);
  assert.match(clone, /aria-activedescendant/);
});

test('оба modal используют единое управление фокусом и изолируют фон', async () => {
  const clone = await read('public/clone.js');

  assert.match(clone, /function openDialog\(dialog, trigger = document\.activeElement\)/);
  assert.match(clone, /function closeDialog\(dialog,/);
  assert.match(clone, /element\.inert = true/);
  assert.match(clone, /element\.inert = false/);
  assert.match(clone, /event\.key === 'Tab' && activeDialog/);
  assert.match(clone, /focusable\[leavingStart \? focusable\.length - 1 : 0\]\.focus\(\)/);
  assert.match(clone, /activeDialogTrigger\?\.focus\?\.\(\)/);
  assert.match(clone, /openDialog\(\$\('#clonePaywall'\), trigger\)/);
  assert.match(clone, /openDialog\(\$\('#premiumDiscovery'\)\)/);
});

test('ключевые мобильные элементы имеют область нажатия не меньше 44 px', async () => {
  const [liveStyles, polish] = await Promise.all([
    read('public/clone/live/live.css'),
    read('public/clone/live/live-visual-polish.css'),
  ]);

  assert.match(liveStyles, /\.clone-insight-controls button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(liveStyles, /\.clone-insight-cta\s*\{[^}]*min-height:\s*48px/s);
  assert.match(polish, /\.live-product \.modal-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(polish, /\.live-product #dialogView \.chips button\s*\{[^}]*min-height:\s*44px/s);
});
