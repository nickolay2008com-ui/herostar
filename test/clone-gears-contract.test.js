import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Telegram возвращает пользователя в live-клон, а выбранный диалог восстанавливается по chart', async () => {
  const [server, clone, living, admin] = await Promise.all([
    read('server.js'),
    read('public/clone.js'),
    read('public/clone-living.js'),
    read('public/clone-admin-page.js'),
  ]);
  assert.match(server, /rawState\.startsWith\('clone:'\)/);
  assert.match(server, /res\.redirect\(`\/clone\/live\/chat\?auth=ok/);
  assert.match(clone, /window\.mountCloneTelegramLink\(container\)/);
  assert.doesNotMatch(clone, /telegram-widget\.js/);
  assert.match(living, /window\.mountCloneTelegramLink = enhanceTelegramSlot/);
  assert.match(living, /\/api\/auth\/telegram-link/);
  assert.match(clone, /requestedChartId/);
  assert.match(admin, /\/clone\/\?chart=/);
});

test('вопрос и ответ сохраняются одной транзакцией после генерации', async () => {
  const [server, store, auth] = await Promise.all([
    read('server.js'),
    read('src/store.js'),
    read('src/auth.js'),
  ]);
  assert.match(store, /saveConsultationExchange/);
  assert.match(store, /BEGIN[\s\S]+COMMIT/);
  assert.ok(server.indexOf('answerConsultationWithFactors({') < server.indexOf('saveConsultationExchange({'));
  assert.match(auth, /req\.cloneReservationId = reservation\.reservationId/);
  assert.doesNotMatch(auth, /req\.body\.question = `\[\[clone-reservation:/);
});

test('режим клона закреплён на сервере и имеет безопасный fallback', async () => {
  const [ai, profiles, server] = await Promise.all([
    read('src/ai.js'),
    read('src/consultation-profiles.js'),
    read('server.js'),
  ]);
  assert.match(ai, /resolveConsultationProfile/);
  assert.match(ai, /product === 'clone'/);
  assert.doesNotMatch(ai, /Ваш звёздный клон, вероятнее всего/);
  assert.match(ai, /status: 'unavailable'/);
  assert.match(server, /CLONE_AI_UNAVAILABLE/);
  assert.ok(server.indexOf("consultation.status === 'unavailable'") < server.indexOf('saveConsultationExchange({'));
  assert.match(profiles, /Рассмотри описанную ситуацию не как прогноз поступка человека/);
  assert.match(profiles, /полную картину одного решения/);
  assert.match(profiles, /factorBudget: Object\.freeze\(\{ min: 3, max: 6 \}\)/);
});

test('заявленная карта больше не открывается старым анонимным ключом', async () => {
  const server = await read('server.js');
  assert.match(server, /if \(record\.userId\) \{[\s\S]+String\(record\.userId\) === String\(req\.user\.telegram_id\)/);
});
