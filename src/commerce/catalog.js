export const DAY_MS = 24 * 60 * 60 * 1000;
export const ALIGNMENT_MS = 30 * DAY_MS;

export const OFFER_CODES = Object.freeze({
  FULL_MAP: 'herostar_full_map',
  CLONE_DAY: 'clone_day',
  CLONE_ALIGNMENT: 'clone_alignment',
});

function money(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number);
}

export function offerCatalog(env = process.env) {
  return Object.freeze({
    [OFFER_CODES.FULL_MAP]: {
      code: OFFER_CODES.FULL_MAP,
      product: 'herostar',
      title: 'Полная карта HeroStar',
      amount: money(env.FULL_MAP_PRICE, 990),
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
