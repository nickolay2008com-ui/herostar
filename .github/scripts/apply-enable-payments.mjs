import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, content) { await fs.writeFile(path, content); }
async function replaceExact(path, from, to) {
  const source = await read(path);
  if (!source.includes(from)) throw new Error(`Не найден фрагмент в ${path}: ${from.slice(0, 120)}`);
  await write(path, source.replace(from, to));
}

await replaceExact(
  'server.js',
  "app.post('/api/payments/create', requireUser, async (req, res, next) => {\n  try {\n    if (!getLegalConfig().configured) {\n      throw publicError('Оплата временно закрыта до публикации реквизитов исполнителя.', 503, 'LEGAL_DETAILS_REQUIRED');\n    }\n    const chartId = String(req.body.chartId || '');",
  "app.post('/api/payments/create', requireUser, async (req, res, next) => {\n  try {\n    if (!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY)) {\n      throw publicError('Оплата временно недоступна. Попробуйте позже.', 503, 'PAYMENTS_NOT_CONFIGURED');\n    }\n    const chartId = String(req.body.chartId || '');",
);

await replaceExact(
  'public/app.js',
  "  const paymentReady = Boolean(state.config.legalConfigured);\n  els.payButton.disabled = !paymentReady;\n  els.payButton.dataset.legalReady = String(paymentReady);\n  const paymentStatus = document.querySelector('#paymentAvailability');\n  if (paymentStatus) {\n    paymentStatus.textContent = paymentReady\n      ? 'Нажимая кнопку, вы принимаете оферту и условия возврата.'\n      : 'Оплата временно закрыта до публикации регистрационных реквизитов исполнителя.';\n  }",
  "  const paymentReady = Boolean(state.config.paymentsConfigured);\n  els.payButton.disabled = !paymentReady;\n  els.payButton.dataset.paymentReady = String(paymentReady);\n  const paymentStatus = document.querySelector('#paymentAvailability');\n  if (paymentStatus) {\n    paymentStatus.textContent = paymentReady\n      ? 'Оплата через ЮKassa. Нажимая кнопку, вы принимаете оферту и условия возврата.'\n      : 'Оплата временно недоступна. Связаться можно в Telegram @ainicki.';\n  }",
);

await replaceExact(
  'public/app.js',
  "async function startPayment() {\n  if (!state.config?.legalConfigured) {\n    toast('Оплата временно закрыта. Связаться с владельцем можно в Telegram @ainicki.');\n    return;\n  }\n  els.payButton.disabled = true;",
  "async function startPayment() {\n  if (!state.config?.paymentsConfigured) {\n    toast('Оплата временно недоступна. Связаться можно в Telegram @ainicki.');\n    return;\n  }\n  els.payButton.disabled = true;",
);

await replaceExact(
  'test/legal.test.js',
  "test('сервер не начинает оплату без опубликованных реквизитов', () => {\n  const server = read('server.js');\n  assert.match(server, /LEGAL_DETAILS_REQUIRED/);\n  assert.match(server, /getLegalConfig\\(\\)\\.configured/);\n});",
  "test('платёж не зависит от публикации регистрационных реквизитов', () => {\n  const server = read('server.js');\n  const app = read('public/app.js');\n  assert.doesNotMatch(server, /LEGAL_DETAILS_REQUIRED/);\n  assert.doesNotMatch(app, /state\\.config\\?\\.legalConfigured/);\n  assert.match(server, /PAYMENTS_NOT_CONFIGURED/);\n  assert.match(app, /state\\.config\\?\\.paymentsConfigured/);\n});",
);

await write('test/payments-live.test.js', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst read = (path) => fs.readFileSync(new URL(\`../${'${path}'}\`, import.meta.url), 'utf8');\n\ntest('кнопка оплаты включается по готовности ЮKassa', () => {\n  const source = read('public/app.js');\n  assert.match(source, /Boolean\\(state\\.config\\.paymentsConfigured\\)/);\n  assert.match(source, /els\\.payButton\\.disabled = !paymentReady/);\n});\n\ntest('оферта и возвраты остаются рядом с оплатой', () => {\n  const html = read('public/index.html');\n  assert.match(html, /href=\"\\/offer\"/);\n  assert.match(html, /href=\"\\/refunds\"/);\n});\n\ntest('платёжный endpoint требует Telegram-пользователя и настройки ЮKassa', () => {\n  const server = read('server.js');\n  assert.match(server, /app\\.post\\('\/api\/payments\/create', requireUser/);\n  assert.match(server, /YOOKASSA_SHOP_ID/);\n  assert.match(server, /YOOKASSA_SECRET_KEY/);\n});\n`);

await fs.rm('.github/scripts/apply-enable-payments.mjs');
await fs.rm('.github/workflows/apply-enable-payments.yml');
