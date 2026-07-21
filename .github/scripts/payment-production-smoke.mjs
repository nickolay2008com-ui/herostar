const BASE = process.env.HEROSTAR_URL || 'https://herostar.up.railway.app';
let failed = 0;
function check(name, ok, details = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${details ? ` | ${details}` : ''}`);
  if (!ok) failed += 1;
}

const homeResponse = await fetch(BASE);
const home = await homeResponse.text();
check('Главная отвечает', homeResponse.ok, String(homeResponse.status));
check('Поле контакта для чека опубликовано', /id="receiptContact"/.test(home));
check('Оффер 11 сокровищ сохранён', /Открыть мои 11 сокровищ/.test(home));

const appResponse = await fetch(new URL('/app.js', BASE));
const app = await appResponse.text();
check('Клиент валидирует контакт', /normalizedReceiptContact/.test(app));
check('Клиент передаёт receiptContact', /JSON\.stringify\(\{ chartId: state\.current\?\.id, receiptContact \}\)/.test(app));

const configResponse = await fetch(new URL('/api/config', BASE));
const config = await configResponse.json();
check('ЮKassa настроена в production', configResponse.ok && config.paymentsConfigured === true, `paymentsConfigured=${config.paymentsConfigured}`);
check('Цена 990 ₽', Number(config.price) === 990, `price=${config.price}`);

const paymentResponse = await fetch(new URL('/api/payments/create', BASE), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chartId: '', receiptContact: 'audit@example.com' }),
});
check('Платёжный маршрут требует Telegram-вход', [401, 403].includes(paymentResponse.status), `status=${paymentResponse.status}`);
check('Неавторизованный smoke не создал платёж', !paymentResponse.ok, `status=${paymentResponse.status}`);

if (failed) {
  console.error(`SUMMARY | ${failed} checks failed`);
  process.exit(1);
}
console.log('SUMMARY | all payment production checks passed without creating a payment');
