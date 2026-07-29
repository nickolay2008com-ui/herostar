import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('главная показывает активность за последний день', async () => {
  const source = await readFile(new URL('../public/hero-conversion.js', import.meta.url), 'utf8');

  assert.match(source, /за последний день/);
  assert.doesNotMatch(source, /за сутки/);
  assert.doesNotMatch(source, /за последние 24 часа/);
});
