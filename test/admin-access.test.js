import assert from 'node:assert/strict';
import test from 'node:test';
import { isAdminUser } from '../src/auth.js';

const adminEnvNames = [
  'TELEGRAM_ADMIN_IDS',
  'TELEGRAM_ADMIN_ID',
  'TELEGRAM_ADMIN_USERNAMES',
  'TELEGRAM_ADMIN_USERNAME',
];

async function withAdminEnvironment(values, callback) {
  const previous = Object.fromEntries(adminEnvNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of adminEnvNames) delete process.env[name];
    Object.assign(process.env, values);
    await callback();
  } finally {
    for (const name of adminEnvNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('владелец HeroStar получает резервный доступ по username', () => withAdminEnvironment({}, () => {
  assert.equal(isAdminUser({ telegram_id: '100', username: 'ainicki' }), true);
  assert.equal(isAdminUser({ telegram_id: '100', username: 'AINICKI' }), true);
}));

test('числовые Telegram ID поддерживают запятые, пробелы и точки с запятой', () => withAdminEnvironment({
  TELEGRAM_ADMIN_IDS: '111, 222;\n333',
}, () => {
  assert.equal(isAdminUser({ telegram_id: '222', username: 'someone' }), true);
  assert.equal(isAdminUser({ telegram_id: '444', username: 'someone' }), false);
}));

test('администратор распознаётся по username, @username и ссылке t.me', () => withAdminEnvironment({
  TELEGRAM_ADMIN_USERNAMES: '@first, https://t.me/Second; t.me/third',
}, () => {
  assert.equal(isAdminUser({ telegram_id: '1', username: 'first' }), true);
  assert.equal(isAdminUser({ telegram_id: '2', username: 'SECOND' }), true);
  assert.equal(isAdminUser({ telegram_id: '3', username: 'third' }), true);
  assert.equal(isAdminUser({ telegram_id: '4', username: 'fourth' }), false);
}));

test('пользователь без Telegram ID не получает доступ', () => withAdminEnvironment({
  TELEGRAM_ADMIN_USERNAMES: 'someone',
}, () => {
  assert.equal(isAdminUser({ username: 'someone' }), false);
  assert.equal(isAdminUser(null), false);
}));
