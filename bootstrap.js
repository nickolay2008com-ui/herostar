import express from 'express';
import { scopeCloneAccess } from './src/clone-access-middleware.js';
import {
  handleTelegramLinkUpdates,
  startTelegramLinkUpdatePolling,
  telegramLinkAuthMiddleware,
} from './src/telegram-link-auth.js';

const originalUse = express.application.use;
const originalStatic = express.static;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const url = String(args[0]?.url || args[0] || '');
  if (/api\.telegram\.org\/bot[^/]+\/getUpdates(?:\?|$)/i.test(url)) {
    response.clone().json()
      .then((payload) => handleTelegramLinkUpdates(payload?.result, { fetchImpl: originalFetch }))
      .catch((error) => console.error('Не удалось обработать Telegram-вход по ссылке:', error));
  }
  return response;
};

express.application.use = function patchedUse(...handlers) {
  const result = originalUse.apply(this, handlers);
  if (handlers.some((handler) => typeof handler === 'function' && handler.name === 'attachUser')) {
    originalUse.call(this, scopeCloneAccess);
    originalUse.call(this, telegramLinkAuthMiddleware);
  }
  return result;
};

express.static = (root, options = {}) => originalStatic(root, {
  ...options,
  maxAge: 0,
  etag: true,
  setHeaders(res, filePath, stat) {
    const requestUrl = String(res.req?.originalUrl || '');
    const isVersionedAsset = /[?&]v=[^&]+/.test(requestUrl) && /\.(?:css|js)(?:\?|$)/i.test(requestUrl);
    if (isVersionedAsset) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.removeHeader('Pragma');
      res.removeHeader('Expires');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    if (typeof options.setHeaders === 'function') options.setHeaders(res, filePath, stat);
  },
});

try {
  await import('./server.js');
} finally {
  express.application.use = originalUse;
  express.static = originalStatic;
}

const { startPaymentRecovery } = await import('./src/payment-recovery.js');
void startPaymentRecovery().catch((error) => {
  console.error('Не удалось запустить восстановление платежей:', error);
});

const { startPracticeNotifications } = await import('./src/practice-notifications.js');
void startPracticeNotifications().catch((error) => {
  console.error('Не удалось запустить практические Telegram-уведомления:', error);
});
startTelegramLinkUpdatePolling({ fetchImpl: originalFetch });
