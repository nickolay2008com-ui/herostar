import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('главная ставит форму раньше вторичных доказательств на мобильном', async () => {
  const [html, styles] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/hero-conversion.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /class="hero-supporting"/);
  assert.match(styles, /grid-template-areas:\s*"copy panel"\s*"support panel"/);
  assert.match(
    styles,
    /@media\s*\(max-width:\s*950px\)[\s\S]*?grid-template-areas:\s*"copy"\s*"panel"\s*"support"/,
  );
  assert.match(styles, /@media\s*\(max-width:\s*950px\)[\s\S]*?\.hero-copy\s*\{\s*text-align:\s*left/);
});

test('мобильный первый экран сохраняет читаемость и удобные зоны касания', async () => {
  const styles = await readFile(
    new URL('../public/hero-conversion.css', import.meta.url),
    'utf8',
  );

  assert.match(styles, /\.social-proof-copy\s*\{\s*display:\s*contents/);
  assert.match(styles, /\.value-carousel-controls button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(styles, /\.top-actions \.ghost-button,[^}]*\.mode-tabs button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.field input\s*\{[^}]*min-height:\s*48px[^}]*font-size:\s*16px/s);
  assert.match(styles, /\.primary-button\s*\{\s*min-height:\s*52px/);
  assert.match(styles, /\.proof-row\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
});

test('карта, чат и оплата имеют отдельную мобильную композицию', async () => {
  const styles = await readFile(
    new URL('../public/styles-components.css', import.meta.url),
    'utf8',
  );

  assert.match(styles, /\.map-actions\s*\{[^}]*grid-template-columns:\s*1fr 1fr[^}]*width:\s*100%/s);
  assert.match(styles, /\.mode-tabs\s*\{[^}]*env\(safe-area-inset-top\)[^}]*scrollbar-width:\s*none/s);
  assert.match(styles, /\.consult-panel\s*\{\s*width:\s*100%[^}]*border-left:\s*0/s);
  assert.match(styles, /\.consult-form textarea\s*\{[^}]*font-size:\s*16px/s);
  assert.match(styles, /\.modal-backdrop\s*\{[^}]*align-items:\s*end[^}]*padding:\s*0/s);
  assert.match(styles, /\.modal\s*\{[^}]*max-height:\s*calc\(100dvh - 12px\)[^}]*overflow-y:\s*auto[^}]*border-radius:\s*24px 24px 0 0/s);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});
