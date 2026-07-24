import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clonePage = readFileSync(new URL('../public/clone/index.html', import.meta.url), 'utf8');
const mobileStyles = readFileSync(new URL('../public/clone-mobile.css', import.meta.url), 'utf8');

test('страница клона подключает отдельные мобильные стили', () => {
  assert.match(clonePage, /href="\/clone-mobile\.css\?v=20260724"/);
});

test('мобильная раскладка не расширяет рабочую область за экран', () => {
  assert.match(mobileStyles, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobileStyles, /\.conversation-head\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(mobileStyles, /\.composer\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobileStyles, /\.message\s*>\s*div\s*\{[\s\S]*?max-width:\s*calc\(100%\s*-\s*44px\)/);
});
