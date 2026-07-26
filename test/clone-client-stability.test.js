import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ошибка оплаты остаётся понятной пользователю, а детали — в консоли', async () => {
  const source = await read('public/clone-scroll-fix.js');
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /Оплата временно недоступна\. Попробуйте позже/);
  assert.match(source, /console\.warn\('HeroStar payment configuration is incomplete:'/);
  assert.doesNotMatch(source, /Для оплаты не хватает:/);
});
