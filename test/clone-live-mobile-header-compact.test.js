import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live mobile App-shell оставляет одну шапку без уменьшения touch-target', async () => {
  const [styles, loader, html] = await Promise.all([
    read('public/clone/live/live-app.css'),
    read('public/clone-ui-gears.js'),
    read('public/clone/live/index.html'),
  ]);

  assert.match(html, /id="dialogView"[\s\S]*?class="conversation-head"[\s\S]*?class="app-home-link"/);
  assert.match(styles, /:has\(#dialogView:not\(\.hidden\)\) \.live-topbar\s*\{\s*display:\s*none;/);
  assert.match(styles, /#dialogView > \.conversation-head\s*\{[^}]*min-height:\s*60px/s);
  assert.match(styles, /\.app-home-link,[\s\S]*?#newSituation\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?#dialogView > \.conversation-head\s*\{[^}]*height:\s*56px/s);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.workspace:not\(\.hidden\)\s*\{[^}]*padding-top:\s*0;/s);

  assert.match(loader, /live-app\.css\?v=20260827-app5/);
  assert.match(loader, /live-app\.js\?v=20260827-app3/);
  assert.match(html, /clone-ui-gears\.js\?v=20260827-polish4/);
  assert.doesNotMatch(html, /clone-ui-gears\.js\?v=20260827-polish3/);
});
