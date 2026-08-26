import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live route загружает отдельный App-shell без второго чата', async () => {
  const [gears, app, styles, html] = await Promise.all([
    read('public/clone-ui-gears.js'),
    read('public/clone/live/live-app.js'),
    read('public/clone/live/live-app.css'),
    read('public/clone/live/index.html'),
  ]);

  assert.match(gears, /const liveInterface = location\.pathname\.startsWith\('\/clone\/live'\)/);
  assert.match(gears, /live-app\.css\?v=20260826-app1/);
  assert.match(gears, /live-app\.js\?v=20260826-app1/);
  assert.match(app, /const CHAT_PATH = \^\\\/clone\\\/live\\\/chat/);
  assert.match(app, /function setAppView\(view/);
  assert.match(app, /conversation\.classList\.toggle\('hidden', profileMode\)/);
  assert.match(app, /logicPanel\.classList\.toggle\('hidden', !profileMode\)/);
  assert.equal((html.match(/id="questionForm"/g) || []).length, 1);
  assert.equal((html.match(/id="messages"/g) || []).length, 1);
  assert.doesNotMatch(app, /createElement\('form'\)|createElement\("form"\)/);
  assert.ok(styles.length > 0);
});

test('диалог сохраняет позицию чтения при переходе в Мою карту', async () => {
  const app = await read('public/clone/live/live-app.js');

  assert.match(app, /savedMessageScrollTop = messages\.scrollTop/);
  assert.match(app, /messages\.scrollTop = Math\.min\(savedMessageScrollTop/);
  assert.match(app, /button\.setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(app, /button\.setAttribute\('aria-current', 'page'\)/);
});

test('факторы конкретного ответа доступны по раскрытию рядом с ответом', async () => {
  const [app, styles] = await Promise.all([
    read('public/clone/live/live-app.js'),
    read('public/clone/live/live-app.css'),
  ]);

  assert.match(app, /summary\.textContent = 'Почему Клон решил так\?'/);
  assert.match(app, /logicFactors\.querySelectorAll\('\.factor'\)/);
  assert.match(app, /meaningfulCloneAnswers\(\)\.at\(-1\)/);
  assert.match(app, /renderAnswerFactorDetails\(answer, snapshot\)/);
  assert.match(styles, /\.answer-factor-details > summary\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.answer-factor-item/);
});

test('mobile App-shell оставляет нижнюю навигацию только для Диалога и Моей карты', async () => {
  const [app, styles] = await Promise.all([
    read('public/clone/live/live-app.js'),
    read('public/clone/live/live-app.css'),
  ]);

  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.workspace \.side-head,[\s\S]*?\.workspace \.side-note\s*\{\s*display:\s*none !important;/);
  assert.match(styles, /\.conversation-started \.app-chat-title/);
  assert.match(app, /по вашей натальной карте/);
});

test('desktop показывает карту отдельным view, а не постоянной колонкой рядом с разговором', async () => {
  const styles = await read('public/clone/live/live-app.css');

  assert.match(styles, /#dialogView\.dialog-layout\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(styles, /#dialogView \.logic:not\(\.profile-mode\)\s*\{\s*display:\s*none !important;/);
  assert.match(styles, /#dialogView \.logic\.profile-mode:not\(\.hidden\)\s*\{[^}]*display:\s*block/s);
});