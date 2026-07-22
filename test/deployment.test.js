import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const railwayConfigUrl = new URL('../railway.json', import.meta.url);

test('Railway запускает production через bootstrap с Telegram-практиками', async () => {
  const config = JSON.parse(await readFile(railwayConfigUrl, 'utf8'));

  assert.equal(config.deploy?.startCommand, 'node bootstrap.js');
  assert.equal(config.deploy?.healthcheckPath, '/health');
});
