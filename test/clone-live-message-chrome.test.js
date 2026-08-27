import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live mobile сохраняет естественную ширину ответа и не переписывает data.answer', async () => {
  const [styles, cloneJs] = await Promise.all([
    read('public/clone/live/live-app.css'),
    read('public/clone.js'),
  ]);

  assert.match(styles, /\.conversation-started \.message\.clone > \.mini-avatar,[\s\S]*?\.conversation-started \.message\.clone > div > b\s*\{\s*display:\s*none;/);
  assert.match(styles, /\.conversation-started \.message\.clone > div\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*min\(92%,\s*44rem\);/s);
  assert.match(styles, /\.conversation-started \.message\.clone > div > p:first-of-type\s*\{\s*margin-top:\s*0;/);

  assert.match(cloneJs, /pending\.querySelector\('p'\)\.textContent\s*=\s*data\.answer;/);
  assert.match(cloneJs, /content:\s*data\.answer,/);
});
