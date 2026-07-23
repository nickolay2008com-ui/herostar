import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cloneFileUrl = new URL('../public/clone.html', import.meta.url);
const cloneIndexUrl = new URL('../public/clone/index.html', import.meta.url);

test('страница /clone/ совпадает с основной страницей клона', async () => {
  const [cloneFile, cloneIndex] = await Promise.all([
    readFile(cloneFileUrl, 'utf8'),
    readFile(cloneIndexUrl, 'utf8'),
  ]);
  assert.equal(cloneIndex, cloneFile);
  assert.match(cloneIndex, /<title>Звёздный клон/);
  assert.match(cloneIndex, /src="\/clone\.js"/);
});
