import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const analyticsUrl = new URL('../public/marketing-analytics.js', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);

test('HeroStar использует официальный код одного собственного счётчика Метрики', async () => {
  const [analyticsSource, indexSource] = await Promise.all([
    readFile(analyticsUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
  ]);
  const allSources = `${indexSource}\n${analyticsSource}`;

  assert.match(indexSource, /yandex-metrika-id" content="110937602"/);
  assert.match(indexSource, /https:\/\/mc\.yandex\.ru\/metrika\/tag\.js\?id=110937602/);
  assert.match(indexSource, /ym\(110937602, 'init', \{ssr:true, webvisor:false, clickmap:true/);
  assert.match(indexSource, /https:\/\/mc\.yandex\.ru\/watch\/110937602/);
  assert.match(analyticsSource, /HERO_STAR_COUNTER_ID\s*=\s*110937602/);
  assert.doesNotMatch(analyticsSource, /installMetrika/);
  assert.doesNotMatch(allSources, /110783019/);

  const initCalls = indexSource.match(/ym\(110937602, 'init'/g) || [];
  assert.equal(initCalls.length, 1);
});
