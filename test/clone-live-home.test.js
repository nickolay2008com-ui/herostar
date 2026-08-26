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

test('три основных входа помогают начать и передают вопрос в существующий поток', async () => {
  const [html, styles, live, metrics] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.css'),
    read('public/clone/live/live.js'),
    read('public/clone/live/live-metrics.js'),
  ]);

  assert.equal((html.match(/class="clone-insight-slide"/g) || []).length, 3);
  assert.match(html, /Три темы, с которых легко начать/);
  assert.match(html, /У вас ответ будет другим — по вашей карте/);
  assert.match(html, /<h4>Отношения<\/h4>/);
  assert.match(html, /<h4>Работа и деньги<\/h4>/);
  assert.match(html, /<h4>Что со мной происходит<\/h4>/);
  assert.match(html, /data-insight-topic="relationship"/);
  assert.match(html, /data-insight-topic="work-money"/);
  assert.match(html, /data-insight-topic="self-state"/);
  assert.match(html, /Почему именно так\?/);
  assert.equal((html.match(/data-clone-prompt=/g) || []).length, 3);
  assert.equal((html.match(/data-insight-cta/g) || []).length, 3);

  // Mobile keeps the swipe carousel, while desktop shows the three choices at once.
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /\.clone-insight-slide\s*\{[^}]*flex:\s*0 0 100%/s);
  assert.match(styles, /flex-basis:\s*calc\(100% - 22px\)/);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.clone-insight-controls\s*\{\s*display:\s*none;\s*\}/);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.clone-insight-viewport\s*\{[^}]*scroll-snap-type:\s*none/s);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.clone-insight-track\s*\{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/s);

  assert.doesNotMatch(live, /setInterval/);
  assert.match(live, /rememberQuestion\(prompt, true\)/);
  assert.match(live, /window\.setTimeout\(openCreation/);
  assert.match(live, /INSIGHT_INDEX_KEY/);
  assert.match(metrics, /clone_insight_slider_viewed/);
  assert.match(metrics, /clone_insight_selected/);
  assert.match(metrics, /clone_second_question/);
});

test('desktop делает поле вопроса главным действием и облегчает объясняющие блоки', async () => {
  const [html, styles] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone/live/live.css'),
  ]);

  assert.match(html, /live\.css\?v=20260826-desktop1/);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.live-hero\s*\{\s*min-height:\s*600px;\s*\}/);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.live-primary\s*\{\s*display:\s*none;\s*\}/);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.live-benefits\s*\{\s*display:\s*none;\s*\}/);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.live-intent\s*\{[^}]*margin:\s*-92px 28px 0/s);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.live-steps article\s*\{[^}]*min-height:\s*0/s);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.live-steps i\s*\{\s*display:\s*none;\s*\}/);
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

test('мобильные преимущества компактны, а sticky CTA не появляется до осознанного скролла', async () => {
  const [styles, live] = await Promise.all([
    read('public/clone/live/live.css'),
    read('public/clone/live/live.js'),
  ]);

  assert.match(styles, /@media\s*\(max-width:640px\)[\s\S]*?\.live-hero\s*\{[^}]*min-height:\s*clamp\(210px,58vw,250px\)/);
  assert.match(styles, /\.live-accent,[\s\S]*?\.live-primary\s*\{\s*display:\s*none/);
  assert.match(styles, /\.live-actions\s*\{[^}]*position:\s*absolute[^}]*top:\s*10px[^}]*right:\s*10px/s);
  assert.match(live, /window\.scrollY > window\.innerHeight \* \.6/);
  assert.match(live, /!primaryActionVisible && !intentFormVisible/);
  assert.match(live, /observer\.observe\(heroForm\)/);
});

test('hero сохраняет спокойную и читаемую визуальную иерархию', async () => {
  const styles = await read('public/clone/live/live.css');

  assert.match(styles, /\.live-accent\s*\{[^}]*font-size:\s*clamp\(24px,2\.6vw,36px\)/s);
  assert.match(styles, /\.live-trust-line\s*\{[^}]*color:\s*#b7b0bf[^}]*font-size:\s*13px/s);
  assert.match(styles, /@media\s*\(min-width:901px\)[\s\S]*?\.live-actions\s*\{[^}]*margin-bottom:\s*24px/s);
  assert.match(styles, /@media\s*\(max-width:900px\)[\s\S]*?\.live-accent\s*\{[^}]*font-size:\s*clamp\(25px,7vw,36px\)/);
  assert.match(styles, /@media\s*\(max-width:640px\)[\s\S]*?\.live-accent,[\s\S]*?\.live-primary\s*\{\s*display:\s*none/);
});
