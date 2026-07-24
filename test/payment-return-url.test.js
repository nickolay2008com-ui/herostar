import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAppUrl } from '../src/payments.js';

test('адрес возврата принимает Railway-домен без протокола', () => {
  assert.equal(
    publicAppUrl({
      APP_URL: 'herostar.up.railway.app',
      NODE_ENV: 'production',
    }),
    'https://herostar.up.railway.app',
  );
});

test('адрес возврата убирает лишний путь clone из APP_URL', () => {
  assert.equal(
    publicAppUrl({
      APP_URL: 'https://herostar.up.railway.app/clone/',
      NODE_ENV: 'production',
    }),
    'https://herostar.up.railway.app',
  );
});

test('ошибочный APP_URL не блокирует оплату при наличии Railway-домена', () => {
  assert.equal(
    publicAppUrl({
      APP_URL: 'совсем не адрес',
      RAILWAY_PUBLIC_DOMAIN: 'herostar.up.railway.app',
      NODE_ENV: 'production',
    }),
    'https://herostar.up.railway.app',
  );
});

test('типичная запись https без двоеточия автоматически исправляется', () => {
  assert.equal(
    publicAppUrl({
      APP_URL: 'https//herostar.up.railway.app',
      NODE_ENV: 'production',
    }),
    'https://herostar.up.railway.app',
  );
});
