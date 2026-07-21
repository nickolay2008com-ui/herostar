const BASE = process.env.HEROSTAR_URL || 'https://herostar.up.railway.app';
const paths = ['/', '/privacy', '/consent', '/terms', '/offer', '/refunds'];
let failed = 0;

function check(name, ok, details = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${details ? ` | ${details}` : ''}`);
  if (!ok) failed += 1;
}

for (const path of paths) {
  const response = await fetch(new URL(path, BASE), { redirect: 'follow' });
  const text = await response.text();
  check(`${path} отвечает 200`, response.ok, `${response.status}`);
  check(`${path} содержит Telegram @ainicki`, /(?:https:\/\/t\.me\/ainicki|@ainicki)/i.test(text));
  check(`${path} не содержит email`, !/nickolay2008\.com@gmail\.com|mailto:/i.test(text));
}

const configResponse = await fetch(new URL('/api/config', BASE));
const config = await configResponse.json();
check('/api/config отвечает', configResponse.ok, `${configResponse.status}`);
check('Оплата закрыта до отдельного запуска', config.legalConfigured === false, `legalConfigured=${config.legalConfigured}`);
check('Контакт конфигурации — Telegram', config.legalContactUrl === 'https://t.me/ainicki' && config.legalContactLabel === '@ainicki', `${config.legalContactUrl} · ${config.legalContactLabel}`);

const appResponse = await fetch(new URL('/app.js', BASE));
const appSource = await appResponse.text();
check('Клиент блокирует оплату без legalConfigured', /legalConfigured/.test(appSource) && /Оплата временно закрыта/.test(appSource));

if (failed) {
  console.error(`SUMMARY | ${failed} checks failed`);
  process.exit(1);
}
console.log('SUMMARY | all legal production checks passed');
