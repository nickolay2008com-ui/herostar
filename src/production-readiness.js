import { getLegalConfig } from './legal.js';
import { publicError } from './utils.js';

function clean(value) {
  return String(value || '').trim();
}

function validHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function getPaymentReadiness(env = process.env) {
  const issues = [];
  const production = clean(env.NODE_ENV).toLowerCase() === 'production';
  const appUrl = clean(env.APP_URL || env.PUBLIC_BASE_URL || env.APP_BASE_URL);

  if (!clean(env.YOOKASSA_SHOP_ID)) issues.push('YOOKASSA_SHOP_ID');
  if (!clean(env.YOOKASSA_SECRET_KEY)) issues.push('YOOKASSA_SECRET_KEY');

  if (production) {
    if (!getLegalConfig(env).configured) issues.push('LEGAL_DETAILS');
    if (!clean(env.DATABASE_URL)) issues.push('DATABASE_URL');
    const sessionSecret = clean(env.SESSION_SECRET);
    if (sessionSecret.length < 32 || sessionSecret === 'development-only-change-me') issues.push('SESSION_SECRET');
    if (!clean(env.TELEGRAM_BOT_TOKEN)) issues.push('TELEGRAM_BOT_TOKEN');
    if (!appUrl || !validHttpsUrl(appUrl)) issues.push('APP_URL_HTTPS');
  }

  return {
    ready: issues.length === 0,
    production,
    issues,
  };
}

export function requirePaymentReadiness(env = process.env) {
  const readiness = getPaymentReadiness(env);
  if (!readiness.ready) {
    const error = publicError(
      'Оплата временно недоступна: сервис завершает обязательную проверку настроек.',
      503,
      'PAYMENTS_NOT_READY',
    );
    error.details = readiness.issues;
    throw error;
  }
  return readiness;
}
