import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getLegalConfig, renderLegalPage } from '../src/legal.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('юридические страницы публикуют Telegram и не публикуют email', () => {
  for (const kind of ['privacy','consent','terms','offer','refunds']) {
    const html = renderLegalPage(kind, {});
    assert.match(html, /https:\/\/t\.me\/ainicki/);
    assert.match(html, /@ainicki/);
    assert.doesNotMatch(html, /nickolay2008\.com@gmail\.com/i);
    assert.doesNotMatch(html, /mailto:/i);
  }
});

test('оплата юридически не готова без ФИО и ОГРНИП', () => {
  assert.equal(getLegalConfig({}).configured, false);
  assert.equal(getLegalConfig({ LEGAL_FULL_NAME: 'Иванов Иван Иванович', LEGAL_OGRNIP: '123456789012345' }).configured, true);
});

test('форма требует отдельное согласие и показывает все документы', () => {
  const html = read('public/index.html');
  assert.match(html, /name="personalDataConsent"[^>]*required/);
  for (const path of ['/privacy','/consent','/terms','/offer','/refunds']) assert.match(html, new RegExp(path));
  assert.match(html, /https:\/\/t\.me\/ainicki/);
  assert.doesNotMatch(html, /nickolay2008\.com@gmail\.com/i);
});

test('платёж не зависит от публикации регистрационных реквизитов', () => {
  const server = read('server.js');
  const app = read('public/app.js');
  assert.doesNotMatch(server, /LEGAL_DETAILS_REQUIRED/);
  assert.doesNotMatch(app, /state\.config\?\.legalConfigured/);
  assert.match(server, /PAYMENTS_NOT_CONFIGURED/);
  assert.match(app, /state\.config\?\.paymentsConfigured/);
});
