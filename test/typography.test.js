import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('основной интерфейс подключает локальную типографическую систему', async () => {
  const [styles, typography] = await Promise.all([
    read('public/styles.css'),
    read('public/typography.css'),
  ]);

  assert.match(styles, /typography\.css/);
  assert.match(typography, /Segoe UI Variable Display/);
  assert.match(typography, /Segoe UI Variable Text/);
  assert.match(typography, /font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(typography, /https?:\/\//);
});

test('админ-панель использует ту же типографическую систему', async () => {
  const [html, typography] = await Promise.all([
    read('public/admin.html'),
    read('public/admin-typography.css'),
  ]);

  assert.match(html, /admin-typography\.css/);
  assert.match(typography, /--font-display/);
  assert.match(typography, /text-wrap:\s*balance/);
  assert.doesNotMatch(typography, /https?:\/\//);
});
