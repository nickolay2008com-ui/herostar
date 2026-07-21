import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env.HEROSTAR_URL || 'https://herostar.up.railway.app';
const outDir = 'final-audit';
await fs.mkdir(outDir, { recursive: true });
const checks = [];
const add = (name, ok, details = '', severity = 'technical') => {
  checks.push({ name, ok: Boolean(ok), severity, details: String(details || '') });
  console.log(`${ok ? 'PASS' : severity === 'legal' ? 'LEGAL' : severity === 'warning' ? 'WARN' : 'FAIL'} | ${name}${details ? ` | ${details}` : ''}`);
};
const safe = async (name, fn, severity = 'technical') => {
  try {
    const value = await fn();
    if (value && typeof value === 'object' && 'ok' in value) add(name, value.ok, value.details || '', severity);
    else add(name, Boolean(value), '', severity);
  } catch (error) {
    add(name, false, error?.message || String(error), severity);
  }
};
async function json(path, options = {}) {
  const response = await fetch(new URL(path, BASE), options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

let browser;
try {
  const homeResponse = await fetch(BASE);
  const home = await homeResponse.text();
  add('Главная отвечает', homeResponse.ok, `${homeResponse.status}`);
  const csp = homeResponse.headers.get('content-security-policy') || '';
  add('CSP включает Метрику', csp.includes('mc.yandex.ru') && csp.includes("default-src 'self'"), csp);
  add('HSTS включён', Boolean(homeResponse.headers.get('strict-transport-security')), homeResponse.headers.get('strict-transport-security') || '');
  add('Счётчик Метрики указан', /yandex-metrika-id" content="110783019/.test(home), '110783019');
  add('Политика конфиденциальности доступна', /href="\/privacy/.test(home), 'Нужна ссылка и страница с реальными данными оператора', 'legal');
  add('Публичная оферта доступна', /href="\/offer/.test(home), 'Нужна ссылка и страница с реальными реквизитами исполнителя', 'legal');
  add('Контакт исполнителя указан', /mailto:|телефон|поддержк/i.test(home), 'Нужны реальные email/телефон', 'legal');

  const config = await json('/api/config');
  add('Telegram настроен', config.payload.telegramConfigured === true, `value=${config.payload.telegramConfigured}`);
  add('ЮKassa настроена', config.payload.paymentsConfigured === true, `value=${config.payload.paymentsConfigured}`);
  add('Админ-доступ настроен', config.payload.adminConfigured === true, `value=${config.payload.adminConfigured}`);
  add('OpenAI-консультант настроен', config.payload.openaiConfigured === true, `value=${config.payload.openaiConfigured}`);
  add('Цена соответствует странице', Number(config.payload.price) === 990, `price=${config.payload.price}`);

  for (const asset of ['/styles.css','/campaign-readiness.css','/marketing-analytics.js','/form-guard.js','/place-autocomplete.js','/app.js']) {
    const response = await fetch(new URL(asset, BASE));
    add(`Ресурс ${asset}`, response.ok, `${response.status}`);
  }

  const places = await json('/api/places?q=%D0%A1%D0%B0%D0%BD');
  add('Photon возвращает варианты по «Сан»', places.response.ok && Array.isArray(places.payload.items) && places.payload.items.length > 0, `status=${places.response.status}, items=${places.payload.items?.length || 0}`);

  const birthPayload = {
    name: 'Тест запуска', date: '1990-01-01', time: '12:00',
    place: 'Москва, Россия', latitude: 55.7558, longitude: 37.6173,
  };
  const chartResult = await json('/api/charts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': `final-audit-${Date.now()}` }, body: JSON.stringify(birthPayload),
  });
  const chart = chartResult.payload.chart;
  const cards = chartResult.payload.portrait?.cards || [];
  add('Обычная карта создаётся', chartResult.response.status === 201 && Boolean(chart), `${chartResult.response.status}`);
  add('Используется Плацидус', chart?.version === '0.2-placidus' && /Плацидус/.test(chart?.system || ''), `${chart?.version} · ${chart?.system}`);
  const cusps = chart?.houses?.cusps || [];
  add('Возвращаются 12 куспидов', cusps.length === 12 && cusps.every(c => Number.isFinite(c.longitude)), `cusps=${cusps.length}`);
  const widths = cusps.map((c, i) => ((cusps[(i + 1) % 12].longitude - c.longitude + 360) % 360));
  add('Дома неравные', new Set(widths.map(v => Math.round(v * 10))).size > 3, widths.map(v => v.toFixed(1)).join(', '));
  add('11 карточек', cards.length === 11, `cards=${cards.length}`);
  add('Три карточки бесплатны', cards.filter(c => !c.locked).length === 3, `free=${cards.filter(c => !c.locked).length}`);
  add('Восемь карточек закрыты', cards.filter(c => c.locked).length === 8, `locked=${cards.filter(c => c.locked).length}`);
  add('Закрытые карточки не отдают deepDive', cards.filter(c => c.locked).every(c => !c.deepDive), '');
  add('Первые три содержат deepDive', cards.slice(0, 3).every(c => c.deepDive), '');

  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const futureResult = await json('/api/charts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...birthPayload, date: future }),
  });
  add('Будущая дата отклоняется', futureResult.response.status === 400 && futureResult.payload.code === 'FUTURE_BIRTH_DATE', `${futureResult.response.status} · ${futureResult.payload.code}`);

  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error' && !/mc\.yandex/.test(msg.text())) errors.push(msg.text()); });
    await page.goto(`${BASE}/?utm_source=yandex&utm_medium=cpc&utm_campaign=final_audit&yclid=final-test`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.screenshot({ path: `${outDir}/${viewport.name}-landing.png`, fullPage: true });
    const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, width: document.documentElement.clientWidth }));
    add(`${viewport.name}: нет горизонтального выезда`, geometry.overflow <= 1, JSON.stringify(geometry));
    add(`${viewport.name}: нет JS-ошибок`, errors.length === 0, errors.join(' | '));
    add(`${viewport.name}: Метрика инициализирована`, await page.evaluate(() => typeof window.ym === 'function' && Boolean(document.querySelector('script[src*="mc.yandex.ru/metrika/tag.js"]'))), '');
    add(`${viewport.name}: yclid сохранён`, await page.evaluate(() => JSON.parse(localStorage.getItem('herostar_first_touch') || '{}').yclid === 'final-test'), '');

    if (viewport.name === 'mobile') {
      await safe('mobile: подсказки города видны', async () => {
        await page.locator('input[name="place"]').fill('Сан');
        await page.locator('.place-option').first().waitFor({ state: 'visible', timeout: 15000 });
        return { ok: await page.locator('.place-option').count() > 0, details: `options=${await page.locator('.place-option').count()}` };
      });
      await page.locator('.place-option').first().click();
      add('mobile: координаты подтверждены', await page.locator('#placeStatus.success').isVisible(), await page.locator('#placeStatus').textContent());
      await page.locator('input[name="name"]').fill('Мобильный тест');
      await page.locator('input[name="date"]').fill('1990-01-01');
      await page.locator('input[name="time"]').fill('12:00');
      await page.locator('#birthForm .primary-button').click();
      await page.locator('#map:not(.hidden)').waitFor({ state: 'visible', timeout: 45000 });
      add('mobile: карта открылась из формы', await page.locator('#map').isVisible(), '');
      add('mobile: 11 карточек', await page.locator('.treasure-card').count() === 11, `cards=${await page.locator('.treasure-card').count()}`);
      add('mobile: 8 закрытых карточек', await page.locator('.treasure-card.locked-card').count() === 8, `locked=${await page.locator('.treasure-card.locked-card').count()}`);
      add('mobile: 12 номеров домов', await page.locator('.house-label').count() === 12, `labels=${await page.locator('.house-label').count()}`);
      const first = page.locator('.treasure-card').first();
      if (!((await first.getAttribute('class')) || '').includes('open')) await first.locator('.card-trigger').click();
      await first.locator('[data-open-deep]').click();
      await page.locator('.deep-dive-modal').waitFor({ state: 'visible' });
      add('mobile: глубокий разбор открывается', true, '');
      add('mobile: пять вкладок', await page.locator('.deep-dive-tabs button').count() === 5, `tabs=${await page.locator('.deep-dive-tabs button').count()}`);
      await page.keyboard.press('Escape');
      const locked = page.locator('.treasure-card.locked-card').first();
      await locked.scrollIntoViewIfNeeded();
      await locked.locator('.card-trigger').click();
      await locked.locator('[data-open-pay]').click();
      await page.locator('#authModal:not(.hidden)').waitFor({ state: 'visible' });
      add('mobile: закрытая карта ведёт к Telegram', true, '');
      add('mobile: Telegram widget создан', await page.locator('#telegramSlot script[data-telegram-login]').count() === 1, `count=${await page.locator('#telegramSlot script[data-telegram-login]').count()}`);
      await page.screenshot({ path: `${outDir}/mobile-map.png`, fullPage: true });
    }
    await page.close();
  }
} catch (error) {
  add('Аудит завершился без системного падения', false, error?.stack || error?.message || String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  const technical = checks.filter(c => !c.ok && c.severity === 'technical');
  const legal = checks.filter(c => !c.ok && c.severity === 'legal');
  const warnings = checks.filter(c => !c.ok && c.severity === 'warning');
  const summary = { total: checks.length, passed: checks.filter(c => c.ok).length, technicalBlockers: technical.length, legalBlockers: legal.length, warnings: warnings.length };
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify({ baseUrl: BASE, generatedAt: new Date().toISOString(), summary, checks }, null, 2));
  await fs.writeFile(`${outDir}/report.md`, ['# HeroStar final launch audit', '', `- Passed: ${summary.passed}/${summary.total}`, `- Technical blockers: ${summary.technicalBlockers}`, `- Legal blockers: ${summary.legalBlockers}`, `- Warnings: ${summary.warnings}`, '', ...checks.map(c => `- ${c.ok ? '✅' : c.severity === 'legal' ? '⚖️' : c.severity === 'warning' ? '⚠️' : '❌'} **${c.name}**${c.details ? ` — ${c.details}` : ''}`)].join('\n'));
  console.log(`SUMMARY | ${summary.passed}/${summary.total} | technical=${technical.length} | legal=${legal.length} | warnings=${warnings.length}`);
  if (technical.length) process.exitCode = 1;
}
