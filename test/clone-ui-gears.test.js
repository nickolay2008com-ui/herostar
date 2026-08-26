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

test('кнопки Диалог и Моя карта используют канонические переключатели, а gears их не дублирует', async () => {
  const [html, clone, gears, liveApp] = await Promise.all([
    read('public/clone.html'),
    read('public/clone.js'),
    read('public/clone-ui-gears.js'),
    read('public/clone/live/live-app.js'),
  ]);
  assert.match(html, /data-tab="dialog"/);
  assert.match(html, /data-tab="profile"/);
  assert.match(clone, /function setWorkspaceTab\(tab\)/);
  assert.match(clone, /\$\('\.conversation'\)\?\.classList\.toggle\('hidden', profileMode\)/);
  assert.match(clone, /\$\('#logicPanel'\)\?\.classList\.toggle\('profile-mode', profileMode\)/);
  assert.match(liveApp, /function setAppView\(view/);
  assert.match(liveApp, /logicPanel\.classList\.toggle\('hidden', !profileMode\)/);
  assert.doesNotMatch(gears, /function activateTab|scrollIntoView/);
});
