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
});

test('мобильные элементы сохраняют читаемость и удобную зону касания', async () => {
  const styles = await readFile(
    new URL('../public/hero-conversion.css', import.meta.url),
    'utf8',
  );

  assert.match(styles, /\.social-proof-copy\s*\{\s*display:\s*contents/);
  assert.match(styles, /\.value-carousel-controls button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(styles, /\.top-actions \.ghost-button,[^}]*\.mode-tabs button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.field input\s*\{[^}]*font-size:\s*16px/s);
});
