import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/treasure-experience.js', import.meta.url), 'utf8');

test('карта поворачивается так, чтобы ASC оказался слева', () => {
  assert.match(source, /const rotation = Math\.PI - currentAngle/);
  assert.match(source, /svg\.dataset\.ascLeft = 'true'/);
});

test('на карте добавлены противоположные углы DSC и IC', () => {
  assert.match(source, /addOppositeAngle\([^\n]+, 'DSC'\)/);
  assert.match(source, /addOppositeAngle\([^\n]+, 'IC'\)/);
});
