import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Live App-shell использует контрастную тёмную тему только после входа', async () => {
  const [styles, html] = await Promise.all([
    read('public/clone/live/live-app.css'),
    read('public/clone/live/index.html'),
  ]);

  assert.match(styles, /--chat-canvas:\s*#070810;/i);
  assert.match(styles, /--chat-surface:\s*#11131f;/i);
  assert.match(styles, /--chat-user:\s*rgba\(145,112,255,.16\);/i);
  assert.match(styles, /--chat-accent:\s*#a989ff;/i);
  assert.match(styles, /--chat-text:\s*#f5f2ff;/i);
  assert.match(styles, /color-scheme:\s*dark;/);
  assert.match(styles, /body\.live-product\.live-chat-page\.live-app-ready:has\(\.workspace:not\(\.hidden\)\)/);
  assert.match(html, /<meta name="theme-color" content="#050812">/);
});

test('Live chat закрепляет Telegram-подобную геометрию без отдельного renderer', async () => {
  const [styles, html, app] = await Promise.all([
    read('public/clone/live/live-app.css'),
    read('public/clone/live/index.html'),
    read('public/clone/live/live-app.js'),
  ]);

  assert.match(styles, /#dialogView \.conversation\s*\{[^}]*width:\s*min\(780px,100%\);/s);
  assert.match(styles, /\.message\.user > div\s*\{[^}]*max-width:\s*min\(82%,\s*35rem\);/s);
  assert.match(styles, /\.message\.clone > div\s*\{[^}]*width:\s*fit-content;/s);
  assert.match(styles, /\.composer\s*\{[^}]*min-height:\s*60px;/s);
  assert.match(styles, /\.live-product\.live-chat-page\.live-app-ready #dialogView\.dialog-layout \.conversation \.composer\s*\{[^}]*background:\s*rgba\(23,26,41,.96\);/s);
  assert.match(styles, /overflow-wrap:\s*anywhere;/);
  assert.match(html, /id="messages"[^>]*role="log"[^>]*aria-live="polite"/);
  assert.doesNotMatch(app, /answer\.length|textContent\.length|dataset\.messageLength/);
});
