import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('мобильный hero использует тот же образ девушки с двойником, что и desktop', async () => {
  const [html, styles] = await Promise.all([
    readFile(new URL('../public/clone/live/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/clone/live/live-mobile-hero.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /live-mobile-hero\.css\?v=20260730-mobiletitle1/);
  assert.match(styles, /background-image:\s*var\(--live-female-image\)/);
  assert.doesNotMatch(styles, /url\(/);
});

test('заголовок остаётся внутри изображения на компактных телефонах', async () => {
  const styles = await readFile(
    new URL('../public/clone/live/live-mobile-hero.css', import.meta.url),
    'utf8',
  );

  assert.match(styles, /@media\s*\(max-width:\s*640px\)/);
  assert.match(styles, /\.live-product \.live-hero\s*\{[^}]*min-height:\s*clamp\(292px, 82vw, 344px\)/s);
  assert.match(styles, /\.live-product \.live-hero-copy\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*justify-content:\s*flex-end/s);
  assert.match(styles, /\.live-product \.live-home h1\s*\{[^}]*max-width:\s*270px[^}]*font-size:\s*clamp\(31px, 9\.2vw, 38px\)/s);
});
