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

test('слайдер доказывает пользу Клона и передаёт выбранный вопрос в существующий поток', async () => {
  const [html, styles, live, metrics] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.css'),
    read('public/clone/live/live.js'),
    read('public/clone/live/live-metrics.js'),
  ]);

  assert.equal((html.match(/class="clone-insight-slide"/g) || []).length, 4);
  assert.match(html, /Что можно узнать у своего Клона/);
  assert.match(html, /У вас ответ будет другим — по вашей карте/);
  assert.match(html, /Почему именно так\?/);
  assert.match(html, /data-clone-prompt=/);
  assert.doesNotMatch(html, /Сменить работу или остаться\?/);
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /\.clone-insight-slide\s*\{[^}]*flex:\s*0 0 100%/s);
  assert.match(styles, /flex-basis:\s*calc\(100% - 22px\)/);
  assert.doesNotMatch(live, /setInterval/);
  assert.match(live, /rememberQuestion\(prompt, true\)/);
  assert.match(live, /window\.setTimeout\(openCreation/);
  assert.match(live, /INSIGHT_INDEX_KEY/);
  assert.match(metrics, /clone_insight_slider_viewed/);
  assert.match(metrics, /clone_insight_selected/);
  assert.match(metrics, /clone_second_question/);
});

test('мобильные преимущества компактны, а sticky CTA не появляется до осознанного скролла', async () => {
  const [styles, live] = await Promise.all([
    read('public/clone/live/live.css'),
    read('public/clone/live/live.js'),
  ]);

  assert.match(styles, /\.live-benefits\s*\{[^}]*position:\s*static[^}]*grid-template-columns:\s*repeat\(3[^}]*margin-top:\s*18px/s);
  assert.match(styles, /\.live-hero\s*\{[^}]*margin-bottom:\s*0/s);
  assert.match(live, /window\.scrollY > window\.innerHeight \* \.6/);
  assert.match(live, /!primaryActionVisible && !intentFormVisible/);
  assert.match(live, /observer\.observe\(heroForm\)/);
});

test('hero сохраняет спокойную и читаемую визуальную иерархию', async () => {
  const styles = await read('public/clone/live/live.css');

  assert.match(styles, /\.live-accent\s*\{[^}]*font-size:\s*clamp\(24px,2\.6vw,36px\)/s);
  assert.match(styles, /\.live-trust-line\s*\{[^}]*color:\s*#b7b0bf[^}]*font-size:\s*13px/s);
  assert.match(styles, /@media\s*\(min-width:901px\)\s*\{[^}]*\.live-actions\s*\{[^}]*margin-bottom:\s*24px/s);
  assert.match(styles, /@media\s*\(max-width:900px\)[\s\S]*?\.live-accent\s*\{[^}]*font-size:\s*clamp\(25px,7vw,36px\)/);
  assert.match(styles, /@media\s*\(max-width:640px\)[\s\S]*?\.live-accent\s*\{[^}]*font-size:\s*27px/);
});
