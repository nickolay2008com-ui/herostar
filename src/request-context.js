import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runRequestContext(value, callback) {
  return storage.run(value || {}, callback);
}

export function currentRequestContext() {
  return storage.getStore() || {};
}
