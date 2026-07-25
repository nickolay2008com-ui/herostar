import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('основной HeroStar помечает внутренние события своим продуктом', () => {
  const analytics = source('public/analytics.js');

  assert.match(analytics, /const PRODUCT = 'herostar'/);
  assert.match(analytics, /const ACTION_PREFIX = 'herostar_'/);
  assert.match(analytics, /product: PRODUCT/);
  assert.match(analytics, /action: `\$\{ACTION_PREFIX\}\$\{eventType\}`/);
});

test('маркетинговые цели основной карты не срабатывают на маршруте Клона', () => {
  const marketing = source('public/marketing-analytics.js');

  assert.match(marketing, /function isHeroStarProductPage\(\)/);
  assert.match(marketing, /location\.pathname === '\/'/);
  assert.match(marketing, /request\.product !== 'clone'/);
  assert.match(marketing, /product: PRODUCT/);
});

test('все цели Яндекс.Метрики Клона имеют префикс clone_', () => {
  const clone = source('public/clone.js');
  const goals = [...clone.matchAll(/goal\(['"]([^'"]+)['"]/g)].map((match) => match[1]);

  assert.ok(goals.length > 0, 'В clone.js должны быть цели Яндекс.Метрики');
  assert.ok(goals.every((goal) => goal.startsWith('clone_')), `Найдены общие цели: ${goals.join(', ')}`);
  assert.doesNotMatch(clone, /goal\(['"]free_key_received['"]/);
  assert.match(clone, /metadata: \{ product: 'clone', action/);
});
