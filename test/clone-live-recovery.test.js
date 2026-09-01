import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('failed Clone answer exposes one-tap retry without retyping the saved question', async () => {
  const metrics = await read('public/clone/live/live-metrics.js');
  assert.match(metrics, /retryCloneAnswer/);
  assert.match(metrics, /Повторить ответ/);
  assert.match(metrics, /form\.requestSubmit\(\)/);
  assert.match(metrics, /clone_answer_retry_clicked/);
});

test('retry appears only for the recoverable Clone AI failure copy', async () => {
  const metrics = await read('public/clone/live/live-metrics.js');
  assert.match(metrics, /клон не смог ответить по сути\|попробуйте ещё раз/i);
  assert.match(metrics, /Boolean\(input\.value\.trim\(\)\)/);
});
