export const DAY_MS = 24 * 60 * 60 * 1000;
export const ALIGNMENT_MS = 30 * DAY_MS;
export const CLONE_SUPPORT_PREFIX = 'clone_support_';
export const CLONE_SUPPORT_MIN_AMOUNT = 100;
export const CLONE_SUPPORT_MAX_AMOUNT = 10000;
export const CLONE_SUPPORT_SUGGESTED_AMOUNTS = Object.freeze([199, 499, 999]);

export const OFFER_CODES = Object.freeze({
  FULL_MAP: 'herostar_full_map',
  CLONE_DAY: 'clone_day',
  CLONE_ALIGNMENT: 'clone_alignment',
  CLONE_SUPPORT: 'clone_support',
});

function money(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number);
}

export function normalizeCloneSupportAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount)
    || amount < CLONE_SUPPORT_MIN_AMOUNT
    || amount > CLONE_SUPPORT_MAX_AMOUNT) return null;
  return amount;
}

export function cloneSupportOfferCode(amount) {
  const normalized = normalizeCloneSupportAmount(amount);
  return normalized ? `${CLONE_SUPPORT_PREFIX}${normalized}` : null;
}

export function parseCloneSupportOfferCode(value) {
  const code = String(value || '').trim().toLowerCase();
  const match = code.match(/^clone_support_(\d{1,5})$/);
  if (!match) return null;
  const amount = normalizeCloneSupportAmount(Number(match[1]));
  if (!amount) return null;
  return {
    code: `${CLONE_SUPPORT_PREFIX}${amount}`,
    product: 'clone',
    title: 'Поддержка HeroStar',
    amount,
    durationHours: null,
    support: true,
  };
}

export function isCloneSupportOffer(value) {
  return Boolean(parseCloneSupportOfferCode(value));
}

export function cloneSupportConfig() {
  return Object.freeze({
    codePrefix: CLONE_SUPPORT_PREFIX,
    title: 'Поддержать HeroStar',
    minAmount: CLONE_SUPPORT_MIN_AMOUNT,
    maxAmount: CLONE_SUPPORT_MAX_AMOUNT,
    suggestedAmounts: [...CLONE_SUPPORT_SUGGESTED_AMOUNTS],
  });
}

export function offerCatalog(env = process.env) {
  const fullMapAmount = money(env.FULL_MAP_DISCOUNT_PRICE, 199);
  const fullMapOriginalAmount = money(env.FULL_MAP_ORIGINAL_PRICE, 999);

  return Object.freeze({
    [OFFER_CODES.FULL_MAP]: {
      code: OFFER_CODES.FULL_MAP,
      product: 'herostar',
      title: 'Полная карта HeroStar',
      amount: fullMapAmount,
      originalAmount: fullMapOriginalAmount > fullMapAmount ? fullMapOriginalAmount : null,
      durationHours: null,
    },
    [OFFER_CODES.CLONE_DAY]: {
      code: OFFER_CODES.CLONE_DAY,
      product: 'clone',
      title: 'День со Звёздным клоном',
      amount: money(env.CLONE_DAY_PRICE, 499),
      durationHours: 24,
    },
    [OFFER_CODES.CLONE_ALIGNMENT]: {
      code: OFFER_CODES.CLONE_ALIGNMENT,
      product: 'clone',
      title: 'Сонастройка со Звёздным клоном',
      amount: money(env.CLONE_ALIGNMENT_PRICE, 1499),
      upgradeAmount: money(env.CLONE_ALIGNMENT_UPGRADE_PRICE, 1000),
      durationDays: 30,
    },
  });
}
