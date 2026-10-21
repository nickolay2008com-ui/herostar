import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import helmet from 'helmet';
import { attachUser } from '../src/auth.js';

test('only Clone Live documents add the exact portfolio origin without weakening other directives', async () => {
  const app = express();
  app.use(helmet());
  app.use(attachUser);
  app.use((_req, res) => res.send('document'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/clone/live/', '/clone/live/index.html', '/', '/admin', '/api/profile', '/clone/live/app.js']) {
      const response = await fetch(`${base}${path}`);
      const csp = response.headers.get('content-security-policy');
      const ancestors = csp.match(/(?:^|;)frame-ancestors ([^;]*)/)[1].split(' ');
      assert.equal(ancestors.includes('https://evo.allyai.ru'), ['/clone/live/', '/clone/live/index.html'].includes(path), path);
      assert.ok(!ancestors.includes('*'));
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /default-src 'self'/);
      if (path.startsWith('/clone/live/') && !path.endsWith('.js')) assert.equal(response.headers.get('x-frame-options'), null);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
