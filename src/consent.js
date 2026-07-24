import { publicError } from './utils.js';

export const PERSONAL_DATA_CONSENT_VERSION = '2026-07-24';
export const PERSONAL_DATA_CONSENT_DOCUMENT = '/consent';

export function requirePersonalDataConsent(payload, { demo = false } = {}) {
  if (demo) return null;
  const accepted = payload?.personalDataConsent === true
    || payload?.personalDataConsent === 'true'
    || payload?.personalDataConsent === 'on';
  if (!accepted) {
    throw publicError(
      'Подтвердите отдельное согласие на обработку персональных данных.',
      400,
      'PERSONAL_DATA_CONSENT_REQUIRED',
    );
  }
  return {
    version: PERSONAL_DATA_CONSENT_VERSION,
    documentUrl: PERSONAL_DATA_CONSENT_DOCUMENT,
  };
}
