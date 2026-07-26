import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('live использует реальные серверные цифры', async () => {
  const [server, html, stats] = await Promise.all([
    read('server.js'),
    read('public/clone/live/index.html'),
    read('public/clone/live/live-stats.js'),
  ]);
  assert.match(server, /app\.get\('\/api\/public\/stats'/);
  assert.match(server, /getAdminOverview\(7\)/);
  assert.match(html, /id="liveRealStats"/);
  assert.match(stats, /fetch\('\/api\/public\/stats'/);
  assert.match(stats, /if \(!total && !recent\) return/);
});

test('бесплатное и платное обещание образуют одну лестницу ценности', async () => {
  const source = `${await read('public/clone/live/index.html')}
${await read('public/clone.js')}`;
  assert.match(source, /главн(?:ый|ое) ход/i);
  assert.match(source, /3–6 значимых факторов/);
  assert.match(source, /альтернативн(?:ый|ые) ход/i);
  assert.match(source, /услови(?:е|я).*решени/i);
});

test('тарифные профили не изменены', async () => {
  const source = await read('src/consultation-profiles.js');
  assert.match(source, /promptVersion: '2026-07-23\.1145'/);
  assert.match(source, /sourceCommit: 'ad915b2bf870b27552eaf185a842702987d80da1'/);
  assert.match(source, /promptVersion: '2026-07-24\.current'/);
  assert.match(source, /sourceCommit: '9040f9f5d396c48f782373327959a6968ebab6f3'/);
});
