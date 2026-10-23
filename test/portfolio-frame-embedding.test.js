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
    const allowedDocuments = ['/clone/live', '/clone/live/', '/clone/live/index.html', '/clone/live/chat', '/clone/live/chat/', '/clone/live/chat?create=1', '/clone/live/chat?auth=ok&chart=test'];
    const otherPaths = ['/', '/admin', '/api/profile', '/clone/', '/clone/admin/', '/clone/live/chat/admin', '/clone/live/chat.html', '/clone/live/app.js'];
    for (const path of [...allowedDocuments, ...otherPaths]) {
      const response = await fetch(`${base}${path}`);
      const csp = response.headers.get('content-security-policy');
      const ancestors = csp.match(/(?:^|;)frame-ancestors ([^;]*)/)[1].split(' ');
      assert.equal(ancestors.includes('https://evo.allyai.ru'), allowedDocuments.includes(path), path);
      assert.ok(!ancestors.includes('*'));
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /default-src 'self'/);
      if (path.startsWith('/clone/live/') && !path.endsWith('.js')) assert.equal(response.headers.get('x-frame-options'), null);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
