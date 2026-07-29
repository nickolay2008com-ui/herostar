import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('защитный слой использует существующий переключатель неизвестного времени', async () => {
  const source = await read('public/clone-ui-gears.js');
  assert.match(source, /const existingControl = form\.querySelector\('#unknownTime'\)/);
  assert.match(source, /if \(existingControl\) return existingControl/);
  assert.match(source, /payload\.unknownTime = Boolean\(unknownTime\?\.checked\)/);
});

test('обновлённый защитный слой не остаётся в immutable-кэше', async () => {
  const pages = await Promise.all([
    read('public/clone.html'),
    read('public/clone/index.html'),
    read('public/clone/live/index.html'),
  ]);
  assert.ok(pages.every((html) => html.includes('/clone-ui-gears.js?v=20260729-routes1')));
});
