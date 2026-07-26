import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('мобильный вход начинает с ситуации и честно объясняет Telegram', async () => {
  const [html, live] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.js'),
  ]);

  assert.match(html, />Когда неясно,<br>как поступить</);
  assert.match(html, />Начать с вопроса/);
  assert.match(html, /Первые 3 ответа — здесь\. После Telegram бесплатный диалог продолжается без лимита\./);
  assert.match(html, /data-go-intent/);
  assert.match(live, /querySelectorAll\('\[data-go-intent\]'\)/);
  assert.match(live, /heroQuestion\.scrollIntoView/);
  const hero = html.slice(html.indexOf('<section class="live-hero"'), html.indexOf('<section class="live-intent"'));
  assert.doesNotMatch(hero, /Premium|Премиум|Полный режим/);
});

test('поле ситуации идёт раньше объяснения механики и не скачет после загрузки JavaScript', async () => {
  const [html, live] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.js'),
  ]);

  assert.ok(html.indexOf('class="live-intent"') < html.indexOf('class="live-flow"'));
  assert.match(html, /class="live-intent-meta"/);
  assert.match(html, /id="heroQuestionHint"/);
  assert.match(html, /id="heroQuestionCount"/);
  assert.doesNotMatch(live, /document\.createElement\('div'\)[\s\S]*?live-intent-meta/);
});

test('мобильные преимущества компактны, а sticky CTA не появляется до осознанного скролла', async () => {
  const [styles, live] = await Promise.all([
    read('public/clone/live/live.css'),
    read('public/clone/live/live.js'),
  ]);

  assert.match(styles, /\.live-benefits\s*\{[^}]*position:\s*static[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.match(styles, /\.live-hero\s*\{[^}]*margin-bottom:\s*0/s);
  assert.match(live, /window\.scrollY > window\.innerHeight \* \.6/);
  assert.match(live, /!primaryActionVisible && !intentFormVisible/);
  assert.match(live, /observer\.observe\(heroForm\)/);
});
