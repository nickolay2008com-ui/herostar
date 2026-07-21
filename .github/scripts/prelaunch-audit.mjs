import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env.HEROSTAR_URL || 'https://herostar.up.railway.app';
const outDir = 'audit-artifacts';
await fs.mkdir(outDir, { recursive: true });

const checks = [];
const add = (name, ok, details = '', severity = 'blocker') => {
  checks.push({ name, ok: Boolean(ok), severity, details: String(details || '') });
  console.log(`${ok ? 'PASS' : severity === 'blocker' ? 'FAIL' : 'WARN'} | ${name}${details ? ` | ${details}` : ''}`);
};

async function json(path, options = {}) {
  const response = await fetch(new URL(path, BASE), options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const homeResponse = await fetch(BASE, { redirect: 'follow' });
const home = await homeResponse.text();
add('Главная отвечает 200', homeResponse.ok, `${homeResponse.status}`);
add('Есть CSP', Boolean(homeResponse.headers.get('content-security-policy')), homeResponse.headers.get('content-security-policy') || '', 'warning');
add('Есть HSTS', Boolean(homeResponse.headers.get('strict-transport-security')), homeResponse.headers.get('strict-transport-security') || '', 'warning');
add('Meta description задан', /<meta\s+name="description"/i.test(home), '', 'warning');
add('Яндекс Метрика установлена', /mc\.yandex|metrika|ym\(/i.test(home), 'На странице не найден счётчик или загрузчик Метрики');
add('Есть политика конфиденциальности', /политик[аи]\s+конфиденциальности|privacy/i.test(home), 'На главной нет ссылки или текста');
add('Есть оферта/условия оплаты', /оферт|условия\s+оплаты|возврат/i.test(home), 'На главной нет ссылки или текста');
add('Есть контакт исполнителя', /mailto:|поддержк|контакт/i.test(home), 'На главной нет понятного контакта', 'warning');

const health = await json('/health');
add('Health API', health.response.ok && health.payload.ok === true, `${health.response.status}`);

const config = await json('/api/config');
add('Config API', config.response.ok, `${config.response.status}`);
for (const [key, label, severity] of [
  ['telegramConfigured', 'Telegram настроен', 'blocker'],
  ['paymentsConfigured', 'ЮKassa настроена', 'blocker'],
  ['adminConfigured', 'Админ-доступ настроен', 'blocker'],
  ['openaiConfigured', 'OpenAI для консультации настроен', 'warning'],
]) add(label, config.payload[key] === true, `${key}=${config.payload[key]}`, severity);
add('Цена 990 ₽', Number(config.payload.price) === 990, `price=${config.payload.price}`, 'warning');
add('Демо-режим доступен', config.payload.demoMode === true, `demoMode=${config.payload.demoMode}`, 'warning');

for (const asset of ['/styles.css','/app.js','/analytics.js','/treasure-experience.js','/place-autocomplete.js','/deep-dive-ui.js','/typography.css','/placidus.css']) {
  const response = await fetch(new URL(asset, BASE));
  add(`Ресурс ${asset}`, response.ok, `${response.status}`);
}

const places = await json('/api/places?q=%D0%A1%D0%B0%D0%BD');
add('Подсказки города работают', places.response.ok && Array.isArray(places.payload.items) && places.payload.items.length > 0, `items=${places.payload.items?.length || 0}`);

const visitorId = `prelaunch-${Date.now()}`;
const demo = await json('/api/charts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
  body: JSON.stringify({ demo: true }),
});
const chart = demo.payload.chart;
const cards = demo.payload.portrait?.cards || [];
add('Демо-карта создаётся', demo.response.status === 201 && Boolean(chart), `${demo.response.status}`);
add('Ядро Плацидуса', chart?.version === '0.2-placidus' && /Плацидус/i.test(chart?.system || ''), `${chart?.version} · ${chart?.system}`);
add('12 куспидов', Array.isArray(chart?.houses?.cusps) && chart.houses.cusps.length === 12, `cusps=${chart?.houses?.cusps?.length || 0}`);
const cuspDiffs = chart?.houses?.cusps?.map((v, i, a) => ((a[(i + 1) % a.length] - v + 360) % 360)) || [];
add('Дома действительно неравные', new Set(cuspDiffs.map(v => Math.round(v * 10))).size > 3, cuspDiffs.map(v => v.toFixed(1)).join(', '));
add('Все планеты имеют дом', chart?.planets?.every(p => Number.isInteger(p.house) && p.house >= 1 && p.house <= 12), '');
add('11 карточек', cards.length === 11, `cards=${cards.length}`);
add('Ровно 3 бесплатных карточки', cards.filter(c => !c.locked).length === 3, `free=${cards.filter(c => !c.locked).length}`);
add('Закрытый текст не утекает', cards.slice(3).every(c => !c.deepDive && c.locked), '');
add('Первые 3 имеют глубокий разбор', cards.slice(0,3).every(c => c.deepDive), '');
add('Токен карты выдан', Boolean(demo.payload.accessToken), '');

if (demo.payload.id && demo.payload.accessToken) {
  const stored = await json(`/api/charts/${demo.payload.id}`, { headers: { 'X-Chart-Token': demo.payload.accessToken } });
  add('Карта повторно открывается', stored.response.ok && stored.payload.chart?.version === '0.2-placidus', `${stored.response.status}`);
}

const event = await json('/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
  body: JSON.stringify({ eventType: 'page_view', visitorId, metadata: { source: 'prelaunch-audit' } }),
});
add('Внутренняя аналитика принимает события', event.response.status === 202, `${event.response.status}`);

const badEvent = await json('/api/events', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType: 'forbidden_test' }),
});
add('Неизвестные события отклоняются', badEvent.response.status === 400, `${badEvent.response.status}`, 'warning');

const paymentUnauth = await json('/api/payments/create', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chartId: demo.payload.id || '' }),
});
add('Оплата защищена авторизацией', [401,403].includes(paymentUnauth.response.status), `${paymentUnauth.response.status}`);

for (const route of ['/privacy','/offer']) {
  const response = await fetch(new URL(route, BASE), { redirect: 'manual' });
  add(`Страница ${route}`, response.ok, `${response.status}`, 'warning');
}

const browser = await chromium.launch({ headless: true });
for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
]) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  await page.goto(`${BASE}/?utm_source=yandex&utm_medium=cpc&utm_campaign=prelaunch&yclid=audit-test`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.screenshot({ path: `${outDir}/${viewport.name}-landing.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  add(`${viewport.name}: нет горизонтального переполнения`, overflow <= 1, `overflow=${overflow}px`);
  add(`${viewport.name}: нет JS-ошибок`, consoleErrors.length === 0, consoleErrors.join(' | '), 'warning');
  add(`${viewport.name}: главный CTA виден`, await page.locator('#birthForm .primary-button').isVisible(), '');

  if (viewport.name === 'mobile') {
    const place = page.locator('input[name="place"]');
    await place.fill('Сан');
    await page.locator('.place-option').first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await page.locator('.place-option').count();
    add('mobile: список городов появляется', count > 0, `options=${count}`);
    await page.locator('.place-option').first().click();
    add('mobile: выбранный город подтверждён', await page.locator('#placeStatus.success').isVisible(), await page.locator('#placeStatus').textContent());

    await page.locator('#demoButton').click();
    await page.locator('#map:not(.hidden)').waitFor({ state: 'visible', timeout: 45000 });
    add('mobile: карта открылась', await page.locator('#map').isVisible(), '');
    add('mobile: 11 карточек в интерфейсе', await page.locator('.treasure-card').count() === 11, `cards=${await page.locator('.treasure-card').count()}`);
    add('mobile: круг содержит номера домов', await page.locator('.house-number').count() === 12, `houses=${await page.locator('.house-number').count()}`);

    const firstCard = page.locator('.treasure-card').first();
    if (!(await firstCard.getAttribute('class')).includes('open')) await firstCard.locator('.card-trigger').click();
    await firstCard.locator('[data-open-deep]').click();
    await page.locator('.deep-dive-modal').waitFor({ state: 'visible', timeout: 10000 });
    add('mobile: глубокое окно открывается', await page.locator('.deep-dive-modal').isVisible(), '');
    add('mobile: пять вкладок глубины', await page.locator('.deep-dive-tabs button').count() === 5, `tabs=${await page.locator('.deep-dive-tabs button').count()}`);
    await page.keyboard.press('Escape');

    const locked = page.locator('.treasure-card.locked-card').first();
    await locked.locator('.card-trigger').click();
    await locked.locator('[data-open-pay]').click();
    await page.locator('#authModal:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
    add('mobile: paywall ведёт к Telegram', await page.locator('#authModal').isVisible(), '');
    const telegramScript = page.locator('#telegramSlot script[data-telegram-login]');
    add('mobile: Telegram widget создаётся', await telegramScript.count() === 1, `count=${await telegramScript.count()}`);
    await page.screenshot({ path: `${outDir}/mobile-map.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();

const blockers = checks.filter(c => !c.ok && c.severity === 'blocker');
const warnings = checks.filter(c => !c.ok && c.severity === 'warning');
const report = { baseUrl: BASE, generatedAt: new Date().toISOString(), summary: { total: checks.length, passed: checks.filter(c => c.ok).length, blockers: blockers.length, warnings: warnings.length }, checks };
await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
await fs.writeFile(`${outDir}/report.md`, [
  '# HeroStar prelaunch audit',
  '',
  `- Passed: ${report.summary.passed}/${report.summary.total}`,
  `- Blockers: ${blockers.length}`,
  `- Warnings: ${warnings.length}`,
  '',
  ...checks.map(c => `- ${c.ok ? '✅' : c.severity === 'blocker' ? '❌' : '⚠️'} **${c.name}**${c.details ? ` — ${c.details}` : ''}`),
].join('\n'));

console.log(`SUMMARY | ${report.summary.passed}/${report.summary.total} passed | ${blockers.length} blockers | ${warnings.length} warnings`);
if (blockers.length) process.exitCode = 1;
