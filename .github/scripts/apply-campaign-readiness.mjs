import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, content) { await fs.writeFile(path, content); }
async function replaceExact(path, from, to) {
  const current = await read(path);
  if (!current.includes(from)) throw new Error(`Не найден ожидаемый фрагмент в ${path}: ${from.slice(0, 100)}`);
  await write(path, current.replace(from, to));
}

// Photon принимает русские запросы, но не принимает lang=ru как значение API-параметра.
await replaceExact('src/places.js', "  endpoint.searchParams.set('lang', 'ru');\n", '');

// Метрика загружается внешним модулем; разрешаем только её официальные endpoints.
await replaceExact(
  'server.js',
  "        scriptSrc: [\"'self'\", 'https://telegram.org', 'https://oauth.telegram.org'],",
  "        scriptSrc: [\"'self'\", 'https://telegram.org', 'https://oauth.telegram.org', 'https://mc.yandex.ru'],",
);
await replaceExact(
  'server.js',
  "        connectSrc: [\"'self'\"],",
  "        connectSrc: [\"'self'\", 'https://mc.yandex.ru', 'https://mc.yandex.com'],",
);

// Сервер не принимает дату рождения из будущего.
await replaceExact(
  'src/astro.js',
  "  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw publicError('Укажите корректную дату рождения.');\n  if (!unknownTime && !/^\\d{2}:\\d{2}$/.test(time)) throw publicError('Укажите время рождения или отметьте, что оно неизвестно.');",
  "  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw publicError('Укажите корректную дату рождения.');\n  const birthDate = DateTime.fromISO(date, { zone: 'UTC' });\n  if (!birthDate.isValid || birthDate.toISODate() !== date) throw publicError('Укажите корректную дату рождения.');\n  if (birthDate.startOf('day') > DateTime.utc().startOf('day')) {\n    throw publicError('Дата рождения не может быть в будущем.', 400, 'FUTURE_BIRTH_DATE');\n  }\n  if (!unknownTime && !/^\\d{2}:\\d{2}$/.test(time)) throw publicError('Укажите время рождения или отметьте, что оно неизвестно.');",
);

// Подтверждённую оплату передаём клиентской аналитике только после реального premium=true.
await replaceExact(
  'public/app.js',
  "        toast(state.config.user?.premium ? 'Полная карта открыта.' : 'Платёж ещё подтверждается. Обновите карту чуть позже.');",
  "        const paymentSucceeded = Boolean(state.config.user?.premium);\n        toast(paymentSucceeded ? 'Полная карта открыта.' : 'Платёж ещё подтверждается. Обновите карту чуть позже.');\n        if (paymentSucceeded) {\n          window.dispatchEvent(new CustomEvent('herostar:purchase-success', {\n            detail: { price: Number(state.config.price || 990), currency: 'RUB' },\n          }));\n        }",
);

await write('public/marketing-analytics.js', `const META_SELECTOR = 'meta[name="yandex-metrika-id"]';
const COUNTER_ID = Number(document.querySelector(META_SELECTOR)?.content || 0);
const ATTRIBUTION_KEY = 'herostar_first_touch';
const GOALS = new Set([
  'landing_to_bot',
  'bot_started',
  'free_key_received',
  'bridge_received',
  'paywall_viewed',
  'payment_started',
  'purchase_success',
]);

function readAttribution() {
  const params = new URLSearchParams(location.search);
  const current = Object.fromEntries(
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']
      .map((key) => [key, params.get(key)])
      .filter(([, value]) => value),
  );
  if (Object.keys(current).length) {
    try { localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current)); } catch {}
    return current;
  }
  try { return JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}'); } catch { return {}; }
}

const attribution = readAttribution();

function installMetrika() {
  if (!COUNTER_ID || window.ym) return;
  window.ym = function ymQueue(...args) {
    (window.ym.a = window.ym.a || []).push(args);
  };
  window.ym.l = Date.now();
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://mc.yandex.ru/metrika/tag.js';
  script.referrerPolicy = 'strict-origin-when-cross-origin';
  document.head.append(script);
  window.ym(COUNTER_ID, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
    ecommerce: false,
  });
}

export function reachHeroStarGoal(goal, params = {}) {
  if (!COUNTER_ID || !GOALS.has(goal)) return;
  installMetrika();
  window.ym(COUNTER_ID, 'reachGoal', goal, { ...attribution, ...params });
}

window.herostarReachGoal = reachHeroStarGoal;
installMetrika();

const previousFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const response = await previousFetch(input, init);
  try {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin === location.origin && method === 'POST' && response.ok) {
      if (url.pathname === '/api/charts') {
        let request = {};
        try { request = JSON.parse(String(init.body || '{}')); } catch {}
        if (!request.demo) reachHeroStarGoal('free_key_received');
      }
      if (url.pathname === '/api/payments/create') {
        reachHeroStarGoal('payment_started', { order_price: 990, currency: 'RUB' });
      }
    }
  } catch {
    // Аналитика никогда не мешает основному запросу.
  }
  return response;
};

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('auth') === 'ok') reachHeroStarGoal('bot_started');

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.matches('#loginButton')) reachHeroStarGoal('landing_to_bot');
    if (target.matches('[data-open-deep]')) reachHeroStarGoal('bridge_received');
    if (target.matches('[data-open-pay]')) reachHeroStarGoal('paywall_viewed');
  });
});

window.addEventListener('herostar:purchase-success', (event) => {
  reachHeroStarGoal('purchase_success', {
    order_price: Number(event.detail?.price || 990),
    currency: event.detail?.currency || 'RUB',
  });
});
`);

await write('public/form-guard.js', `const birthDateInput = document.querySelector('input[name="date"]');

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return \`${'${year}'}-${'${month}'}-${'${day}'}\`;
}

if (birthDateInput) {
  birthDateInput.max = localIsoDate();
  birthDateInput.addEventListener('input', () => {
    birthDateInput.setCustomValidity(
      birthDateInput.value && birthDateInput.value > birthDateInput.max
        ? 'Дата рождения не может быть в будущем.'
        : '',
    );
  });
}
`);

await write('public/campaign-readiness.css', `/* Launch readiness: off-canvas panels must not enlarge the mobile document. */
html, body {
  max-width: 100%;
  overflow-x: clip;
}

.consult-panel {
  visibility: hidden;
  pointer-events: none;
}

.consult-panel.open {
  visibility: visible;
  pointer-events: auto;
}

@supports not (overflow: clip) {
  html, body { overflow-x: hidden; }
}
`);

await replaceExact(
  'public/styles.css',
  "@import url('/typography.css');",
  "@import url('/typography.css');\n@import url('/campaign-readiness.css');",
);
await replaceExact(
  'public/index.html',
  '  <meta name="description" content="HeroStar показывает 11 ваших природных ресурсов: где они проявляются, что их блокирует и как использовать их в жизни.">',
  '  <meta name="description" content="HeroStar показывает 11 ваших природных ресурсов: где они проявляются, что их блокирует и как использовать их в жизни.">\n  <meta name="yandex-metrika-id" content="110783019">',
);
await replaceExact(
  'public/index.html',
  '  <script type="module" src="/analytics.js"></script>\n  <script type="module" src="/treasure-experience.js"></script>',
  '  <script type="module" src="/analytics.js"></script>\n  <script type="module" src="/marketing-analytics.js"></script>\n  <script type="module" src="/form-guard.js"></script>\n  <script type="module" src="/treasure-experience.js"></script>',
);

await write('test/campaign-readiness.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateNatalChart } from '../src/astro.js';

const read = (path) => fs.readFileSync(new URL(\`../${'${path}'}\`, import.meta.url), 'utf8');

test('поиск городов не отправляет Photon неподдерживаемый lang=ru', () => {
  const source = read('src/places.js');
  assert.doesNotMatch(source, /searchParams\\.set\\(['"]lang['"],\\s*['"]ru['"]\\)/);
});

test('рекламная аналитика содержит подтверждённый счётчик и цели', () => {
  const html = read('public/index.html');
  const analytics = read('public/marketing-analytics.js');
  assert.match(html, /110783019/);
  for (const goal of ['landing_to_bot','bot_started','free_key_received','bridge_received','paywall_viewed','payment_started','purchase_success']) {
    assert.match(analytics, new RegExp(goal));
  }
  assert.match(analytics, /webvisor:\\s*false/);
});

test('CSP разрешает Метрику, но не ослабляет default-src', () => {
  const server = read('server.js');
  assert.match(server, /scriptSrc:[^\\n]+mc\\.yandex\\.ru/);
  assert.match(server, /connectSrc:[^\\n]+mc\\.yandex\\.ru/);
  assert.match(server, /defaultSrc:\\s*\\["'self'"\\]/);
});

test('скрытая мобильная панель не расширяет документ', () => {
  const css = read('public/campaign-readiness.css');
  assert.match(css, /overflow-x:\\s*clip/);
  assert.match(css, /\\.consult-panel\\s*\\{[^}]*visibility:\\s*hidden/s);
  assert.match(css, /\\.consult-panel\\.open\\s*\\{[^}]*visibility:\\s*visible/s);
});

test('дата рождения из будущего отклоняется сервером', async () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await assert.rejects(
    calculateNatalChart({ name: 'Будущее', date: tomorrow, time: '12:00', place: 'Москва', latitude: 55.7558, longitude: 37.6173 }),
    (error) => error?.code === 'FUTURE_BIRTH_DATE',
  );
});
`);

// Временный механизм применения не должен попасть в итоговую ветку.
await fs.rm('.github/scripts/apply-campaign-readiness.mjs');
await fs.rm('.github/workflows/apply-campaign-readiness.yml');
