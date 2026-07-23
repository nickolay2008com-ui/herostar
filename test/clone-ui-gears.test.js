import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('страница подключает сохранение вопроса до основной логики клона', async () => {
  const [html, gears] = await Promise.all([
    read('public/clone.html'),
    read('public/clone-ui-gears.js'),
  ]);
  assert.ok(html.indexOf('/clone-ui-gears.js') < html.indexOf('/clone.js'));
  assert.match(gears, /starClonePendingQuestion/);
  assert.match(gears, /form\.requestSubmit\(\)/);
  assert.match(gears, /window\.opener/);
  assert.match(gears, /response\.ok/);
});

test('кнопки Диалог и Логика модели ведут к рабочим областям', async () => {
  const [html, gears] = await Promise.all([
    read('public/clone.html'),
    read('public/clone-ui-gears.js'),
  ]);
  assert.match(html, /data-tab="dialog"/);
  assert.match(html, /data-tab="profile"/);
  assert.match(gears, /document\.querySelector\('\.logic'\)/);
  assert.match(gears, /document\.querySelector\('\.conversation'\)/);
  assert.match(gears, /scrollIntoView/);
});
