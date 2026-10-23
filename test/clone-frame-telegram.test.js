import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/clone-living.js', import.meta.url), 'utf8');

function harness({ embedded = true, popup = true, returnToken = null } = {}) {
  function element(tag = 'div') {
    return { tag, dataset: {}, children: [], listeners: {}, classList: { add() {} },
      append(...nodes) { this.children.push(...nodes); },
      querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      closest() { return null; }, setAttribute() {} };
  }
  const calls = [];
  const body = element();
  const storage = { getItem() { return null; }, removeItem() {} };
  let reloads = 0;
  const location = { href: 'https://herostar.example/clone/live/chat', search: '', reload() { reloads++; } };
  const opened = popup ? { location: {}, close() {} } : null;
  const window = { open() { return opened; }, __herostarTelegramLinkReturn: returnToken };
  window.self = window;
  window.top = embedded ? {} : window;
  const context = {
    window, location, URL, URLSearchParams, localStorage: storage, sessionStorage: storage,
    history: { replaceState() {} },
    document: { body, querySelector() { return null; }, querySelectorAll() { return []; },
      createElement: element, createTextNode(text) { return { text }; }, addEventListener() {} },
    MutationObserver: class { observe() {} },
    fetch: async (path) => {
      calls.push(path);
      return { ok: true, json: async () => path.endsWith('/status')
        ? { status: 'authorized' }
        : { token: 'test-login-token', telegramUrl: 'https://t.me/TestBot?start=login_test' } };
    },
  };
  vm.runInNewContext(source, context);
  return { context, calls, body, opened, reloads: () => reloads, async login() {
    const slot = element();
    window.mountCloneTelegramLink(slot);
    await slot.children[0].listeners.click();
    return slot;
  } };
}

for (const popup of [true, false]) {
  test(`framed Telegram login hands off to the bot without consuming a cookie session (popup=${popup})`, async () => {
    const h = harness({ popup });
    const slot = await h.login();
    assert.deepEqual(h.calls, ['/api/auth/telegram-link']);
    assert.equal(h.reloads(), 0);
    assert.equal(h.context.location.href, 'https://herostar.example/clone/live/chat');
    const link = slot.children[1].children.find(node => node.tag === 'a');
    assert.equal(link.href, 'https://t.me/TestBot?start=login_test');
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener');
    assert.match(slot.children[1].textContent, /Вернуться к Звёздному клону/);
  });
}

test('top-level Telegram login still consumes the session and reloads', async () => {
  const h = harness({ embedded: false });
  await h.login();
  assert.deepEqual(h.calls, ['/api/auth/telegram-link', '/api/auth/telegram-link/status']);
  assert.equal(h.reloads(), 1);
});

test('a sanitized return token inside a frame is handed off without consumption', () => {
  const h = harness({ returnToken: 'test-return-token' });
  assert.deepEqual(h.calls, []);
  const link = h.body.children[0].children.find(node => node.tag === 'a');
  assert.equal(new URL(link.href).searchParams.get('telegram_link'), 'test-return-token');
  assert.equal(link.target, '_blank');
  assert.equal(h.reloads(), 0);
});
