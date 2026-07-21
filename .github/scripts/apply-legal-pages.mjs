import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, content) { await fs.writeFile(path, content); }
async function replaceExact(path, from, to) {
  const source = await read(path);
  if (!source.includes(from)) throw new Error(`Не найден ожидаемый фрагмент в ${path}: ${from.slice(0, 120)}`);
  await write(path, source.replace(from, to));
}

await replaceExact(
  'server.js',
  "import { searchPlaces, unpackSelectedPlace } from './src/places.js';\nimport { randomToken, sha256, publicError } from './src/utils.js';",
  "import { searchPlaces, unpackSelectedPlace } from './src/places.js';\nimport { getLegalConfig, renderLegalPage } from './src/legal.js';\nimport { randomToken, sha256, publicError } from './src/utils.js';",
);

await replaceExact(
  'server.js',
  "      price: Number(process.env.FULL_MAP_PRICE || '990'),\n      user: req.user",
  "      price: Number(process.env.FULL_MAP_PRICE || '990'),\n      legalConfigured: getLegalConfig().configured,\n      legalContactUrl: getLegalConfig().contactUrl,\n      legalContactLabel: getLegalConfig().contactLabel,\n      user: req.user",
);

await replaceExact(
  'server.js',
  "app.post('/api/payments/create', requireUser, async (req, res, next) => {\n  try {",
  "app.post('/api/payments/create', requireUser, async (req, res, next) => {\n  try {\n    if (!getLegalConfig().configured) {\n      throw publicError('Оплата временно закрыта до публикации реквизитов исполнителя.', 503, 'LEGAL_DETAILS_REQUIRED');\n    }",
);

await replaceExact(
  'server.js',
  "app.get('/admin', (_req, res) => {\n  res.redirect('/admin.html');\n});",
  "for (const kind of ['privacy', 'consent', 'terms', 'offer', 'refunds']) {\n  app.get(`/${kind}`, (_req, res) => {\n    res.type('html').send(renderLegalPage(kind));\n  });\n}\n\napp.get('/admin', (_req, res) => {\n  res.redirect('/admin.html');\n});",
);

await replaceExact(
  'public/app.js',
  "  els.priceLabel.textContent = `${new Intl.NumberFormat('ru-RU').format(state.config.price)} ₽`;\n  renderUser();",
  "  els.priceLabel.textContent = `${new Intl.NumberFormat('ru-RU').format(state.config.price)} ₽`;\n  const paymentReady = Boolean(state.config.legalConfigured);\n  els.payButton.disabled = !paymentReady;\n  els.payButton.dataset.legalReady = String(paymentReady);\n  const paymentStatus = document.querySelector('#paymentAvailability');\n  if (paymentStatus) {\n    paymentStatus.textContent = paymentReady\n      ? 'Нажимая кнопку, вы принимаете оферту и условия возврата.'\n      : 'Оплата временно закрыта до публикации регистрационных реквизитов исполнителя.';\n  }\n  renderUser();",
);

await replaceExact(
  'public/app.js',
  "async function startPayment() {\n  els.payButton.disabled = true;",
  "async function startPayment() {\n  if (!state.config?.legalConfigured) {\n    toast('Оплата временно закрыта. Связаться с владельцем можно в Telegram @ainicki.');\n    return;\n  }\n  els.payButton.disabled = true;",
);

await replaceExact(
  'public/index.html',
  "          <button class=\"primary-button\" type=\"submit\">\n            <span>Найти мои сокровища</span>\n            <b>🗝</b>\n          </button>\n          <p class=\"microcopy\">Без регистрации. Сразу откроются 3 полных разбора: ресурс, блок, ключ и действие. Это инструмент саморефлексии, не прогноз.</p>",
  "          <label class=\"legal-consent\">\n            <input name=\"personalDataConsent\" type=\"checkbox\" required>\n            <span>Я согласен на <a href=\"/consent\" target=\"_blank\">обработку персональных данных</a> и ознакомился с <a href=\"/privacy\" target=\"_blank\">политикой конфиденциальности</a>.</span>\n          </label>\n          <button class=\"primary-button\" type=\"submit\">\n            <span>Найти мои сокровища</span>\n            <b>🗝</b>\n          </button>\n          <p class=\"microcopy\">Без регистрации. Сразу откроются 3 полных разбора: ресурс, блок, ключ и действие. Это инструмент саморефлексии, не прогноз.</p>",
);

await replaceExact(
  'public/index.html',
  "      <button class=\"primary-button\" id=\"payButton\" type=\"button\">Открыть полную карту — <span id=\"priceLabel\">990 ₽</span></button>\n      <p class=\"microcopy\">Оплата через ЮKassa. Доступ откроется автоматически.</p>",
  "      <button class=\"primary-button\" id=\"payButton\" type=\"button\" disabled>Открыть полную карту — <span id=\"priceLabel\">990 ₽</span></button>\n      <p class=\"microcopy\" id=\"paymentAvailability\">Проверяем готовность оплаты…</p>\n      <p class=\"microcopy legal-inline\"><a href=\"/offer\" target=\"_blank\">Публичная оферта</a> · <a href=\"/refunds\" target=\"_blank\">Условия возврата</a></p>",
);

await replaceExact(
  'public/index.html',
  "  <div class=\"toast\" id=\"toast\" role=\"status\"></div>",
  "  <footer class=\"site-footer\">\n    <div><a class=\"brand\" href=\"/\"><span class=\"brand-mark\">✦</span><span>HeroStar</span></a><p>Персональная карта ресурсов для саморефлексии. Не заменяет профильного специалиста.</p></div>\n    <nav aria-label=\"Документы и связь\">\n      <a href=\"/privacy\">Конфиденциальность</a>\n      <a href=\"/consent\">Согласие</a>\n      <a href=\"/terms\">Соглашение</a>\n      <a href=\"/offer\">Оферта</a>\n      <a href=\"/refunds\">Возвраты</a>\n      <a href=\"https://t.me/ainicki\" target=\"_blank\" rel=\"noopener noreferrer\">Telegram @ainicki</a>\n    </nav>\n  </footer>\n\n  <div class=\"toast\" id=\"toast\" role=\"status\"></div>",
);

const campaignCss = await read('public/campaign-readiness.css');
await write('public/campaign-readiness.css', `${campaignCss}\n\n.legal-consent {\n  display: grid;\n  grid-template-columns: 18px minmax(0, 1fr);\n  gap: 10px;\n  align-items: start;\n  margin: 4px 0 15px;\n  color: #8f8b9a;\n  font-size: 12px;\n  line-height: 1.55;\n}\n\n.legal-consent input {\n  width: 18px;\n  height: 18px;\n  margin: 1px 0 0;\n  accent-color: #bda9ff;\n}\n\n.legal-consent a,\n.legal-inline a,\n.site-footer a { color: #d5c8ff; text-decoration: none; }\n.legal-consent a:hover,\n.legal-inline a:hover,\n.site-footer a:hover { text-decoration: underline; }\n\n.site-footer {\n  width: min(100% - 40px, 1240px);\n  margin: 70px auto 20px;\n  padding: 26px 0 18px;\n  display: flex;\n  justify-content: space-between;\n  gap: 30px;\n  border-top: 1px solid rgba(255,255,255,.08);\n  color: #777382;\n}\n\n.site-footer > div { max-width: 420px; }\n.site-footer p { margin: 10px 0 0; font-size: 12px; line-height: 1.55; }\n.site-footer nav { display: flex; flex-wrap: wrap; justify-content: flex-end; align-content: start; gap: 10px 17px; max-width: 620px; }\n.site-footer nav a { font-size: 12px; }\n\n.primary-button:disabled {\n  cursor: not-allowed;\n  filter: grayscale(.45);\n  opacity: .58;\n}\n\n@media (max-width: 660px) {\n  .site-footer { width: min(100% - 28px, 1240px); flex-direction: column; margin-top: 50px; }\n  .site-footer nav { justify-content: flex-start; }\n}\n`);

await write('public/legal.css', `.legal-page { min-height: 100vh; background: #080a12; color: #e9e5ef; }\n.legal-topbar { position: sticky; z-index: 10; top: 0; min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px max(18px, calc((100% - 1040px)/2)); border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(8,10,18,.88); backdrop-filter: blur(18px); }\n.legal-contact { color: #cdbdff; text-decoration: none; font-size: 13px; }\n.legal-shell { width: min(100% - 32px, 1040px); margin: 38px auto 70px; display: grid; grid-template-columns: 220px minmax(0,1fr); gap: 25px; align-items: start; }\n.legal-nav { position: sticky; top: 88px; display: grid; gap: 7px; }\n.legal-nav a { padding: 11px 13px; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; color: #8f8a98; text-decoration: none; font-size: 12px; }\n.legal-nav a[aria-current=\"page\"] { color: #f1e9d5; border-color: rgba(231,199,130,.24); background: rgba(231,199,130,.07); }\n.legal-card { padding: clamp(24px,5vw,58px); border: 1px solid rgba(255,255,255,.08); border-radius: 30px; background: linear-gradient(145deg, rgba(23,24,39,.82), rgba(11,12,21,.86)); box-shadow: 0 28px 90px rgba(0,0,0,.25); }\n.legal-kicker { margin: 0 0 10px; color: #9b91ae; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }\n.legal-card h1 { margin: 0 0 32px; font-size: clamp(34px,6vw,62px); line-height: 1.02; letter-spacing: -.05em; }\n.legal-card section { margin-top: 34px; padding-top: 4px; }\n.legal-card h2 { margin: 0 0 12px; font-size: 21px; letter-spacing: -.02em; }\n.legal-card p, .legal-card li { color: #b2adbc; font-size: 14px; line-height: 1.75; }\n.legal-card ul { padding-left: 22px; }\n.legal-card a { color: #cdbdff; }\n.legal-alert { margin: 0 0 26px; padding: 17px 18px; border: 1px solid rgba(231,199,130,.22); border-radius: 16px; background: rgba(231,199,130,.06); }\n.legal-alert strong { color: #f0d89f; }\n.legal-alert p { margin: 7px 0 0; font-size: 12px; }\n.legal-details { display: grid; gap: 8px; margin: 18px 0 0; }\n.legal-details div { display: grid; grid-template-columns: minmax(120px, .7fr) 1.3fr; gap: 14px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); }\n.legal-details dt { color: #777281; font-size: 12px; }\n.legal-details dd { margin: 0; color: #d8d2e0; font-size: 13px; overflow-wrap: anywhere; }\n.legal-footer { width: min(100% - 32px, 1040px); margin: 0 auto 28px; display: flex; justify-content: space-between; gap: 20px; color: #6f6b78; font-size: 11px; line-height: 1.5; }\n.legal-footer a { color: #cdbdff; text-decoration: none; }\n@media (max-width: 760px) { .legal-shell { grid-template-columns: 1fr; margin-top: 20px; } .legal-nav { position: static; display: flex; overflow-x: auto; padding-bottom: 4px; } .legal-nav a { white-space: nowrap; } .legal-card { padding: 26px 20px; border-radius: 23px; } .legal-card h1 { margin-bottom: 20px; } .legal-topbar { padding-inline: 14px; } .legal-contact { font-size: 12px; } .legal-footer { flex-direction: column; } .legal-details div { grid-template-columns: 1fr; gap: 4px; } }\n`);

await write('test/legal.test.js', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport { getLegalConfig, renderLegalPage } from '../src/legal.js';\n\nconst read = (path) => fs.readFileSync(new URL(\`../${'${path}'}\`, import.meta.url), 'utf8');\n\ntest('юридические страницы публикуют Telegram и не публикуют email', () => {\n  for (const kind of ['privacy','consent','terms','offer','refunds']) {\n    const html = renderLegalPage(kind, {});\n    assert.match(html, /https:\\/\\/t\\.me\\/ainicki/);\n    assert.match(html, /@ainicki/);\n    assert.doesNotMatch(html, /nickolay2008\\.com@gmail\\.com/i);\n    assert.doesNotMatch(html, /mailto:/i);\n  }\n});\n\ntest('оплата юридически не готова без ФИО и ОГРНИП', () => {\n  assert.equal(getLegalConfig({}).configured, false);\n  assert.equal(getLegalConfig({ LEGAL_FULL_NAME: 'Иванов Иван Иванович', LEGAL_OGRNIP: '123456789012345' }).configured, true);\n});\n\ntest('форма требует отдельное согласие и показывает все документы', () => {\n  const html = read('public/index.html');\n  assert.match(html, /name=\"personalDataConsent\"[^>]*required/);\n  for (const path of ['/privacy','/consent','/terms','/offer','/refunds']) assert.match(html, new RegExp(path));\n  assert.match(html, /https:\\/\\/t\\.me\\/ainicki/);\n  assert.doesNotMatch(html, /nickolay2008\\.com@gmail\\.com/i);\n});\n\ntest('сервер не начинает оплату без опубликованных реквизитов', () => {\n  const server = read('server.js');\n  assert.match(server, /LEGAL_DETAILS_REQUIRED/);\n  assert.match(server, /getLegalConfig\\(\\)\\.configured/);\n});\n`);

await fs.rm('.github/scripts/apply-legal-pages.mjs');
await fs.rm('.github/workflows/apply-legal-pages.yml');
