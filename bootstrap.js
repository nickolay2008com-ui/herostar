import express from 'express';
import { scopeCloneAccess } from './src/clone-access-middleware.js';
import {
  startTelegramLinkUpdatePolling,
  telegramLinkAuthMiddleware,
} from './src/telegram-link-auth.js';

const originalUse = express.application.use;
const originalStatic = express.static;

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
startTelegramLinkUpdatePolling();
