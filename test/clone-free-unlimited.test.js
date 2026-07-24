// Бесплатный режим ограничивает только анонимное знакомство, а не разговор после сохранения.
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

  assert.ok(auth.includes('CLONE_ANONYMOUS_QUESTION_LIMIT = 3'));
  assert.ok(auth.includes('if (req.user) return'));
  assert.ok(auth.includes('userId: null'));
  assert.ok(auth.includes('CLONE_TELEGRAM_REQUIRED'));
  assert.ok(server.includes("app.post('/api/consult', consultLimiter, async"));
  assert.ok(server.includes("if (!req.user && product !== 'clone')"));
  assert.ok(clone.includes('FREE_PREAUTH_QUESTIONS = 3'));
  assert.ok(clone.includes('Бесплатный режим · сообщения без лимита'));
  assert.ok(!clone.includes("openPaywall('clone_day');\n  return false"));
});

test('бесплатный профиль восстановлен из 11:45 и получает полную карту', async () => {
  const [profiles, ai] = await Promise.all([
    read('src/consultation-profiles.js'),
    read('src/ai.js'),
  ]);

  assert.ok(profiles.includes("promptVersion: '2026-07-23.1145'"));
  assert.ok(profiles.includes("sourceCommit: 'ad915b2bf870b27552eaf185a842702987d80da1'"));
  assert.ok(profiles.includes('2–4 конкретных фактора карты'));
  assert.ok(!profiles.includes("chartDepth: 'core'"));
  assert.equal(profiles.split("chartDepth: 'full'").length - 1, 2);
  assert.ok(ai.includes('northNode: chart.northNode'));
  assert.ok(ai.includes('aspects: chart.aspects'));
  assert.ok(ai.includes('compactChart(chart, profile)'));
});

test('платное предложение показывается добровольно и честно объясняет углубление', async () => {
  const [html, clone] = await Promise.all([
    read('public/clone.html'),
    read('public/clone.js'),
  ]);

  assert.ok(html.includes('id="fullModeOffer"'));
  assert.ok(html.includes('Бесплатный режим уже опирается на полную карту'));
  assert.ok(html.includes('Глубокий разбор 3–6 значимых связей'));
  assert.ok(clone.includes('state.questionCount >= 5'));
  assert.ok(clone.includes('openFullModeOffer'));
});
