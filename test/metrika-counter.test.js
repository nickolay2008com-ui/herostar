import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const analyticsUrl = new URL('../public/marketing-analytics.js', import.meta.url);

test('HeroStar отправляет цели только в собственный счётчик Метрики', async () => {
  const source = await readFile(analyticsUrl, 'utf8');

  assert.match(source, /HERO_STAR_COUNTER_ID\s*=\s*110937602/);
  assert.doesNotMatch(source, /110783019/);
  assert.match(source, /metrikaMeta\.content\s*=\s*String\(HERO_STAR_COUNTER_ID\)/);
});
