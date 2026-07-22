import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const analyticsUrl = new URL('../public/marketing-analytics.js', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);

test('HeroStar использует только собственный счётчик Метрики во всех точках входа', async () => {
  const [analyticsSource, indexSource] = await Promise.all([
    readFile(analyticsUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
  ]);
  const allSources = `${indexSource}\n${analyticsSource}`;

  assert.match(indexSource, /yandex-metrika-id" content="110937602"/);
  assert.match(analyticsSource, /HERO_STAR_COUNTER_ID\s*=\s*110937602/);
  assert.doesNotMatch(allSources, /110783019/);
  assert.match(analyticsSource, /metrikaMeta\.content\s*=\s*String\(HERO_STAR_COUNTER_ID\)/);
});
