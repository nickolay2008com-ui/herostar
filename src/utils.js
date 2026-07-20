import crypto from 'node:crypto';

export function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

export function signedAngularDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index < 0) return [part, ''];
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function publicError(message, status = 400, code = 'BAD_REQUEST') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
