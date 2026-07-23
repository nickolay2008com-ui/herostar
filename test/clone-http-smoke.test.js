import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function waitFor(url, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start: ${url}`);
}

test('публичная цепочка клона открывается на реальном Express-сервере', { timeout: 40000 }, async (t) => {
  const port = 19000 + (process.pid % 1000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_URL: '',
      OPENAI_API_KEY: '',
      TELEGRAM_BOT_TOKEN: '',
      YOOKASSA_SHOP_ID: '',
      YOOKASSA_SECRET_KEY: '',
      DEMO_MODE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));

  await waitFor(`${base}/health`);
  for (const path of ['/clone', '/clone/', '/clone/admin/', '/api/config']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
  }

  const clonePage = await (await fetch(`${base}/clone/`)).text();
  assert.match(clonePage, /Звёздный клон/);
  assert.match(clonePage, /clone\.js/);

  const created = await fetch(`${base}/api/charts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ demo: true, product: 'clone' }),
  });
  assert.equal(created.status, 201);
  const chart = await created.json();
  assert.ok(chart.id);
  assert.ok(chart.accessToken);

  const restored = await fetch(`${base}/api/charts/${chart.id}`, {
    headers: { 'x-chart-token': chart.accessToken },
  });
  assert.equal(restored.status, 200);
});
