import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cloneHtmlUrl = new URL('../public/clone.html', import.meta.url);
const cloneIndexUrl = new URL('../public/clone/index.html', import.meta.url);
const hotfixUrl = new URL('../public/clone-conversion-hotfix.js', import.meta.url);

test('оба адреса клона используют один конверсионный сценарий', async () => {
  const [html, index] = await Promise.all([
    readFile(cloneHtmlUrl, 'utf8'),
    readFile(cloneIndexUrl, 'utf8'),
  ]);

  assert.equal(index, html);
  assert.match(html, /Telegram подключается перед первым ответом/);
  assert.ok(html.indexOf('/clone.js') < html.indexOf('/clone-conversion-hotfix.js'));
});

test('после первого полезного ответа появляется честное платное продолжение', async () => {
  const script = await readFile(hotfixUrl, 'utf8');

  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /completedAnswerExists/);
  assert.match(script, /clone_offer_after_first_answer/);
  assert.match(script, /postAnswerOffer/);
  assert.match(script, /Разовая оплата/);
  assert.match(script, /x-chart-token/);
});
