import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live mobile App-shell доставляет компактную внешнюю шапку без уменьшения touch-target', async () => {
  const [styles, loader, html] = await Promise.all([
    read('public/clone/live/live-app.css'),
    read('public/clone-ui-gears.js'),
    read('public/clone/live/index.html'),
  ]);

  assert.match(styles, /body\.live-product\.live-chat-page\.live-app-ready:has\(\.workspace:not\(\.hidden\)\) \.live-topbar\s*\{[^}]*height:\s*44px/s);
  assert.match(styles, /\.live-topbar \.brand,[\s\S]*?\.live-home-link\s*\{\s*min-height:\s*44px;/);
  assert.match(styles, /\.live-product\.live-chat-page\.live-app-ready \.workspace:not\(\.hidden\)\s*\{\s*padding-top:\s*44px;/);

  assert.match(loader, /live-app\.css\?v=20260827-app4/);
  assert.match(loader, /live-app\.js\?v=20260826-app2/);
  assert.match(html, /clone-ui-gears\.js\?v=20260827-polish3/);
  assert.doesNotMatch(html, /clone-ui-gears\.js\?v=20260827-polish2/);
});
