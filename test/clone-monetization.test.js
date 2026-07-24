import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('витрина продаёт день и Сонастройку без автопродления и без подарков Вселенной', async () => {
  const [html, clone, legal] = await Promise.all([
    read('public/clone.html'),
    read('public/clone.js'),
    read('src/legal.js'),
  ]);
  const combined = `${html}\n${clone}\n${legal}`;

  assert.match(combined, /День со Звёздным клоном/);
  assert.match(combined, /499/);
  assert.match(combined, /Сонастройк/);
  assert.match(combined, /1\s?499|1499/);
  assert.match(combined, /1\s?000|1000/);
  assert.match(combined, /24 часа|24 часов/);
  assert.match(combined, /30 дней/);
  assert.match(combined, /не продлевается автоматически|без автоматического продления/i);
  assert.doesNotMatch(combined, /подарк\w* от Вселенной|подарк\w* Вселенной/i);
});

test('три ответа доступны до Telegram, а после входа базовый диалог не ограничен сообщениями', async () => {
  const [html, clone] = await Promise.all([read('public/clone.html'), read('public/clone.js')]);
  assert.match(html, /3 ответа без регистрации/);
  assert.match(html, /без лимита сообщений/);
  assert.match(clone, /const FREE_PREAUTH_QUESTIONS = 3/);
  assert.match(clone, /state\.questionCount >= FREE_PREAUTH_QUESTIONS/);
  assert.match(clone, /Бесплатный режим · сообщения без лимита/);
  assert.match(clone, /openFullModeOffer/);
  assert.doesNotMatch(clone, /setTimeout\(\(\) => openPaywall\('clone_day'\)/);
  assert.doesNotMatch(html, /clone-conversion-hotfix/);
});

test('постоянные материалы и временный диалог представлены разными правами', async () => {
  const [commerce, server] = await Promise.all([read('src/commerce.js'), read('server.js')]);
  assert.match(commerce, /full_map_unlocked/);
  assert.match(commerce, /clone_passport_unlocked/);
  assert.match(commerce, /clone_access_until/);
  assert.match(commerce, /clone_alignment_until/);
  assert.match(server, /mapUnlocked/);
  assert.match(server, /clonePassportUnlocked/);
  assert.match(server, /cloneAccessActive/);
});

test('Telegram-сопровождение включается только при активной Сонастройке', async () => {
  const practice = await read('src/practice-notifications.js');
  assert.match(practice, /clone_alignment_until > NOW\(\)/);
  assert.match(practice, /program = 'clone_alignment'/);
  assert.match(practice, /Оплата не продлевается автоматически/);
  assert.doesNotMatch(practice, /WHERE chart\.user_id IS NOT NULL\s*ORDER BY/);
});
