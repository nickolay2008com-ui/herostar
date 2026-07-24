import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Telegram возвращает пользователя в клон, а выбранный диалог восстанавливается по chart', async () => {
  const [server, clone, admin] = await Promise.all([
    read('server.js'),
    read('public/clone.js'),
    read('public/clone-admin-page.js'),
  ]);
  assert.match(server, /rawState\.startsWith\('clone:'\)/);
  assert.match(server, /res\.redirect\(`\/clone\/\?auth=ok/);
  assert.match(clone, /callback\.searchParams\.set\('state', `clone:/);
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
  assert.ok(server.indexOf('answerConsultation({') < server.indexOf('saveConsultationExchange({'));
  assert.match(auth, /req\.cloneReservationId = reservation\.reservationId/);
  assert.doesNotMatch(auth, /req\.body\.question = `\[\[clone-reservation:/);
});

test('режим клона закреплён на сервере и имеет безопасный fallback', async () => {
  const [ai, profiles] = await Promise.all([
    read('src/ai.js'),
    read('src/consultation-profiles.js'),
  ]);
  assert.match(ai, /resolveConsultationProfile/);
  assert.match(ai, /product === 'clone'/);
  assert.match(ai, /Ваш звёздный клон, вероятнее всего/);
  assert.match(profiles, /не прогноз поступков пользователя/);
});

test('заявленная карта больше не открывается старым анонимным ключом', async () => {
  const server = await read('server.js');
  assert.match(server, /if \(record\.userId\) \{[\s\S]+String\(record\.userId\) === String\(req\.user\.telegram_id\)/);
});
