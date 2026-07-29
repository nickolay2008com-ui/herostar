import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('единая первая карточка сразу объясняет продукт и принимает ситуацию', async () => {
  const [html, live] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.js'),
  ]);

  assert.match(html, />Когда неясно,<br>как поступить</);
  assert.match(html, /Спросите Клона, собранного по вашей натальной карте\./);
  assert.match(html, /Опишите ситуацию своими словами — Клон уточнит важное\./);
  assert.match(html, />Узнать, как поступил бы Клон/);
  assert.match(html, /3 ответа бесплатно · без регистрации на старте\./);
  assert.match(html, /data-go-intent/);
  assert.match(live, /querySelectorAll\('\[data-go-intent\]'\)/);
  assert.match(live, /heroQuestion\.scrollIntoView/);
  const hero = html.slice(html.indexOf('<section class="live-hero"'), html.indexOf('<section class="live-insights"'));
  assert.match(hero, /class="live-hero-scene"/);
  assert.match(hero, /id="heroQuestionForm"/);
  assert.match(hero, /id="liveIntentTitle"/);
  assert.doesNotMatch(hero, /Premium|Премиум|Полный режим/);
});

test('поле ситуации идёт раньше объяснения механики и не скачет после загрузки JavaScript', async () => {
  const [html, live] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.js'),
  ]);

  assert.ok(html.indexOf('class="live-hero-intent"') < html.indexOf('class="live-flow"'));
  assert.doesNotMatch(html, /<section class="live-intent"/);
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

test('главная и диалог разделены каноническим маршрутом без дублирования интерфейса', async () => {
  const [html, live, clone, gears, server, telegram] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.js'),
    read('public/clone.js'),
    read('public/clone-ui-gears.js'),
    read('server.js'),
    read('src/telegram-link-auth.js'),
  ]);

  assert.match(html, /id="liveHomeLink" href="\/clone\/live\/" hidden/);
  assert.match(html, /> На главную</);
  assert.match(server, /app\.get\(\['\/clone\/live\/chat', '\/clone\/live\/chat\/'\]/);
  assert.match(server, /sendFile\('public\/clone\/live\/index\.html'/);
  assert.match(clone, /const LIVE_CHAT_PATH = '\/clone\/live\/chat'/);
  assert.match(clone, /function isLiveHomePage\(\)/);
  assert.match(clone, /if \(!isLiveHomePage\(\)\) \{/);
  assert.match(clone, /url\.pathname = location\.pathname\.startsWith\('\/clone\/live'\) \? LIVE_CHAT_PATH : '\/clone\/'/);
  assert.match(live, /localStorage\.setItem\(RETURN_KEY, LIVE_CHAT_PATH\)/);
  assert.match(gears, /storedReturnPath\.startsWith\('\/clone\/live'\)[\s\S]*?'\/clone\/live\/chat'/);
  assert.match(telegram, /\$\{baseUrl\}\/clone\/live\/chat\?/);
  assert.doesNotMatch(server, /public\/clone\/live\/chat\/index\.html/);
});

test('мобильная первая карточка сохраняет изображение и sticky CTA не появляется до осознанного скролла', async () => {
  const [styles, live] = await Promise.all([
    read('public/clone/live/live.css'),
    read('public/clone/live/live.js'),
  ]);

  assert.match(styles, /@media\s*\(max-width:640px\)[\s\S]*?\.live-hero-scene\s*\{[^}]*height:\s*138px[^}]*flex-basis:\s*138px/s);
  assert.match(styles, /@media\s*\(max-width:\s*360px\)[\s\S]*?\.live-hero-scene\s*\{[^}]*height:\s*118px/s);
  assert.doesNotMatch(styles, /\.live-hero \.live-(?:lead|primary|benefits)\s*\{[^}]*display:\s*none/s);
  assert.match(live, /window\.scrollY > window\.innerHeight \* \.6/);
  assert.match(live, /!primaryActionVisible && !intentFormVisible/);
  assert.match(live, /observer\.observe\(primaryHeroAction\)/);
  assert.match(live, /observer\.observe\(heroForm\)/);
});

test('hero сохраняет спокойную и читаемую визуальную иерархию', async () => {
  const styles = await read('public/clone/live/live.css');

  assert.match(styles, /\.live-accent\s*\{[^}]*font-size:\s*clamp\(22px,2\.3vw,31px\)/s);
  assert.match(styles, /\.live-free-note\s*\{[^}]*font-size:\s*12px[^}]*text-align:\s*center/s);
  assert.match(styles, /@media\s*\(max-width:900px\)[\s\S]*?\.live-accent\s*\{[^}]*font-size:\s*clamp\(23px,5vw,29px\)/);
  assert.match(styles, /@media\s*\(max-width:640px\)[\s\S]*?\.live-accent\s*\{[^}]*font-size:\s*21px/);
});
