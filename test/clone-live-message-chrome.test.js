import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live mobile сохраняет естественную ширину и прячет технический слой data.answer', async () => {
  const [styles, cloneJs] = await Promise.all([
    read('public/clone/live/live-app.css'),
    read('public/clone.js'),
  ]);

  assert.match(styles, /\.conversation-started \.message\.clone > \.mini-avatar,[\s\S]*?\.conversation-started \.message\.clone > div > b\s*\{\s*display:\s*none;/);
  assert.match(styles, /\.message\.clone > div\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*min\(88%,44rem\);/s);
  assert.match(styles, /\.message p\s*\{[^}]*margin:\s*5px 0 0;/s);

  assert.match(cloneJs, /pending\.querySelector\('p'\)\.textContent\s*=\s*displayCloneAnswer\(data\.answer\)/);
  assert.match(cloneJs, /element\.querySelector\('p'\)\.textContent = role === 'clone' \? displayCloneAnswer\(text\) : text/);
  assert.match(cloneJs, /element\.dataset\.answerFactors = JSON\.stringify\(items\)/);
  assert.match(cloneJs, /technicalCloneDetails/);
  assert.match(cloneJs, /title: 'Техническое объяснение'/);
  assert.match(cloneJs, /content:\s*data\.answer,/);
});
