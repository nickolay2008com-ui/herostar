import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('поиск встроен в единый consult contract и запускается server-side detector', async () => {
  const [server, ai, auth] = await Promise.all([
    read('server.js'),
    read('src/ai.js'),
    read('src/auth.js'),
  ]);

  assert.match(server, /product === 'clone' && explicitWebSearchIntent\(question\)/);
  assert.match(server, /buildSanitizedSearchRequest\(question, history\)/);
  assert.match(server, /reserveWebSearchUsage\(/);
  assert.match(server, /performWebSearch\(/);
  assert.match(server, /webSearch: publicWebSearchPayload\(webSearch\)/);
  assert.match(server, /searchRequested && !req\.user/);
  assert.match(server, /answer:\s*null/);
  assert.match(server, /answerForWebSearchOutcome\(webSearch\)/);
  assert.match(auth, /if \(explicitWebSearchIntent\(req\.body\?\.question\)\) return/);
  assert.match(ai, /externalContext/);
  assert.match(ai, /недоверенным источником фактов/);
  assert.doesNotMatch(ai, /tools:\s*\[\{\s*type:\s*['"]web_search/);
});

test('клиент отображает только безопасные кликабельные источники через DOM API', async () => {
  const [client, styles, html] = await Promise.all([
    read('public/clone.js'),
    read('public/clone-web-search.css'),
    read('public/clone/live/index.html'),
  ]);

  assert.match(client, /url\.protocol !== 'https:'/);
  assert.match(client, /document\.createElement\('a'\)/);
  assert.match(client, /link\.rel = 'noopener noreferrer nofollow'/);
  assert.match(client, /renderWebSearch\(pending\.querySelector\('div'\), data\.webSearch\)/);
  assert.match(client, /item\.metadata\?\.webSearch/);
  assert.match(client, /Поиск доступен после сохранения Клона/);
  assert.match(client, /Бесплатный поиск уже использован/);
  assert.match(client, /data\.webSearch\?\.status === 'telegram_required'/);
  assert.match(client, /state\.pendingRequest = \{ question, userElement \}/);
  assert.match(client, /startAuthPoll\(pending\)/);
  assert.match(client, /data\.webSearch\?\.requested && !state\.user/);
  assert.match(client, /webSearch\.quota\?\.accessTier === 'premium'/);
  assert.match(client, /Лимит поиска на сегодня исчерпан/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(html, /clone-web-search\.css/);
});
