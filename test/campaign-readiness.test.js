import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateNatalChart } from '../src/astro.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const YANDEX_METRIKA_ID = '110937602';

test('поиск городов не отправляет Photon неподдерживаемый lang=ru', () => {
  const source = read('src/places.js');
  assert.doesNotMatch(source, /searchParams\.set\(['"]lang['"],\s*['"]ru['"]\)/);
});

test('рекламная аналитика содержит подтверждённый счётчик и цели', () => {
  const html = read('public/index.html');
  const cloneHtml = read('public/clone.html');
  const analytics = read('public/marketing-analytics.js');
  assert.match(html, new RegExp(YANDEX_METRIKA_ID));
  assert.match(cloneHtml, new RegExp(YANDEX_METRIKA_ID));
  for (const goal of ['landing_to_bot','bot_started','free_key_received','bridge_received','paywall_viewed','payment_started','purchase_success']) {
    assert.match(analytics, new RegExp(goal));
  }
  assert.match(analytics, /webvisor:\s*false/);
});

test('CSP разрешает Метрику, но не ослабляет default-src', () => {
  const server = read('server.js');
  assert.match(server, /scriptSrc:[^\n]+mc\.yandex\.ru/);
  assert.match(server, /connectSrc:[^\n]+mc\.yandex\.ru/);
  assert.match(server, /defaultSrc:\s*\["'self'"\]/);
});

test('скрытая мобильная панель не расширяет документ', () => {
  const css = read('public/campaign-readiness.css');
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /\.consult-panel\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(css, /\.consult-panel\.open\s*\{[^}]*visibility:\s*visible/s);
});

test('дата рождения из будущего отклоняется сервером', async () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await assert.rejects(
    calculateNatalChart({ name: 'Будущее', date: tomorrow, time: '12:00', place: 'Москва', latitude: 55.7558, longitude: 37.6173 }),
    (error) => error?.code === 'FUTURE_BIRTH_DATE',
  );
});
