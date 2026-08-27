import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Live помечает стартовое сообщение и доставляет свежий UI-helper', async () => {
  const [html, gears] = await Promise.all([
    readFile(new URL('../public/clone/live/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/clone-ui-gears.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /class="message clone" data-conversation-onboarding/);
  assert.match(html, /clone-ui-gears\.js\?v=20260827-polish2/);
  assert.match(gears, /function installLiveConversationOnboarding\(\)/);
  assert.match(gears, /messages\.querySelector\(':scope > \.message\.user'\)/);
  assert.match(gears, /querySelectorAll\(':scope > \[data-conversation-onboarding\]'\)/);
  assert.match(gears, /classList\.toggle\('hidden', started\)/);
  assert.match(gears, /setAttribute\('aria-hidden', String\(started\)\)/);
});
