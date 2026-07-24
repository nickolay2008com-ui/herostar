import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('анонимный пользователь получает три ответа, а Telegram снимает продуктовый лимит', async () => {
  const [auth, server, clone] = await Promise.all([
    read('src/auth.js'),
    read('server.js'),
    read('public/clone.js'),
  ]);

  assert.match(auth, /CLONE_ANONYMOUS_QUESTION_LIMIT = 3/);
  assert.match(auth, /if \(req\.user\) return/);
  assert.match(auth, /userId: null/);
  assert.match(auth, /CLONE_TELEGRAM_REQUIRED/);
  assert.match(server, /app\.post\('\/api\/consult', consultLimiter, async/);
  assert.match(server, /if \(!req\.user && product !== 'clone'\)/);
  assert.match(clone, /FREE_PREAUTH_QUESTIONS = 3/);
  assert.match(clone, /Бесплатный режим · сообщения без лимита/);
  assert.doesNotMatch(clone, /openPaywall\('clone_day'\);\s*return false/);
});

test('платный режим действительно получает более полную проекцию карты', async () => {
  const [profiles, ai] = await Promise.all([
    read('src/consultation-profiles.js'),
    read('src/ai.js'),
  ]);

  assert.match(profiles, /chartDepth: 'core'/);
  assert.match(profiles, /chartDepth: 'full'/);
  assert.match(profiles, /historyLimit: 16/);
  assert.match(ai, /corePlanetKeys/);
  assert.match(ai, /scope: 'core'/);
  assert.match(ai, /northNode: chart\.northNode/);
  assert.match(ai, /aspects: chart\.aspects/);
  assert.match(ai, /compactChart\(chart, profile\)/);
});

test('платное предложение показывается добровольно и объясняет разницу глубины', async () => {
  const [html, clone] = await Promise.all([
    read('public/clone.html'),
    read('public/clone.js'),
  ]);

  assert.match(html, /id="fullModeOffer"/);
  assert.match(html, /Бесплатный режим опирается на основные настройки карты/);
  assert.match(html, /планеты, дома, аспекты, оси и внутренние противоречия/);
  assert.match(clone, /state\.questionCount >= 5/);
  assert.match(clone, /openFullModeOffer/);
});
