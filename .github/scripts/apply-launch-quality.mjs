import fs from 'node:fs/promises';

async function replaceExact(path, from, to) {
  const source = await fs.readFile(path, 'utf8');
  if (!source.includes(from)) throw new Error(`Не найден фрагмент в ${path}`);
  await fs.writeFile(path, source.replace(from, to));
}

await replaceExact(
  'server.js',
  "        connectSrc: [\"'self'\", 'https://mc.yandex.ru', 'https://mc.yandex.com'],",
  "        connectSrc: [\"'self'\", 'https://mc.yandex.ru', 'https://mc.yandex.com', 'wss://mc.yandex.com'],",
);

await replaceExact(
  'public/index.html',
  '  <title>HeroStar — карта ваших ресурсов и сильных сторон</title>\n  <link rel="stylesheet" href="/styles.css">',
  '  <title>HeroStar — карта ваших ресурсов и сильных сторон</title>\n  <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n  <link rel="stylesheet" href="/styles.css">',
);

await fs.writeFile('test/launch-quality.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(\`../${'${path}'}\`, import.meta.url), 'utf8');

test('главная содержит локальный favicon', () => {
  assert.match(read('public/index.html'), /href="\\/favicon\\.svg"/);
  assert.match(read('public/favicon.svg'), /<svg/);
});

test('CSP разрешает служебный WebSocket Метрики', () => {
  assert.match(read('server.js'), /wss:\\/\\/mc\\.yandex\\.com/);
});

test('критичные мобильные подписи не мельче 12px', () => {
  const css = read('public/campaign-readiness.css');
  for (const selector of ['.field small', '.microcopy', '.eyebrow', '.proof-row span', '.treasure-legend small']) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${'${'}'}()|[\\]\\\\]/g, '\\$&')));
  }
  assert.match(css, /font-size:\\s*12px/);
});
`);

await fs.rm('.github/scripts/apply-launch-quality.mjs');
await fs.rm('.github/workflows/apply-launch-quality.yml');
