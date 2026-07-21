import { normalizeDegrees, signedAngularDelta } from './utils.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const SCAN_STEP = 0.25;
const ROOT_TOLERANCE = 1e-10;

function equatorialPosition(longitude, obliquity) {
  const lambda = normalizeDegrees(longitude) * DEG;
  const epsilon = obliquity * DEG;
  return {
    rightAscension: normalizeDegrees(Math.atan2(Math.sin(lambda) * Math.cos(epsilon), Math.cos(lambda)) * RAD),
    declination: Math.asin(Math.sin(epsilon) * Math.sin(lambda)) * RAD,
  };
}

function semiDiurnalArc(longitude, latitude, obliquity) {
  const { declination } = equatorialPosition(longitude, obliquity);
  const value = -Math.tan(latitude * DEG) * Math.tan(declination * DEG);
  if (value < -1 || value > 1) return null;
  return Math.acos(Math.max(-1, Math.min(1, value))) * RAD;
}

function targetHourAngle(house, semiArc) {
  if (house === 11) return -semiArc / 3;
  if (house === 12) return -(2 * semiArc) / 3;
  if (house === 2) return -60 - (2 * semiArc) / 3;
  if (house === 3) return -120 - semiArc / 3;
  throw new Error(`Unsupported Placidus intermediate house: ${house}`);
}

function cuspResidual(longitude, { armc, latitude, obliquity, house }) {
  const position = equatorialPosition(longitude, obliquity);
  const semiArc = semiDiurnalArc(longitude, latitude, obliquity);
  if (semiArc === null) return Number.NaN;
  const hourAngle = signedAngularDelta(position.rightAscension, armc);
  return signedAngularDelta(targetHourAngle(house, semiArc), hourAngle);
}

function bisectRoot(left, right, context) {
  let leftValue = cuspResidual(left, context);
  let rightValue = cuspResidual(right, context);
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (left + right) / 2;
    const middleValue = cuspResidual(middle, context);
    if (!Number.isFinite(middleValue)) return null;
    if (Math.abs(middleValue) < ROOT_TOLERANCE) return normalizeDegrees(middle);
    if (leftValue * middleValue <= 0) {
      right = middle;
      rightValue = middleValue;
    } else {
      left = middle;
      leftValue = middleValue;
    }
  }

  return normalizeDegrees((left + right) / 2);
}

function findIntermediateCusp(house, context, expectedLongitude) {
  const roots = [];
  let previousLongitude = 0;
  let previousValue = cuspResidual(previousLongitude, { ...context, house });

  for (let longitude = SCAN_STEP; longitude <= 360; longitude += SCAN_STEP) {
    const currentValue = cuspResidual(longitude, { ...context, house });
    if (Number.isFinite(currentValue) && Math.abs(currentValue) < 1e-8) {
      roots.push(normalizeDegrees(longitude));
    }
    if (
      Number.isFinite(previousValue)
      && Number.isFinite(currentValue)
      && previousValue * currentValue < 0
      && Math.abs(previousValue - currentValue) < 120
    ) {
      const root = bisectRoot(previousLongitude, longitude, { ...context, house });
      if (root !== null) roots.push(root);
    }
    previousLongitude = longitude;
    previousValue = currentValue;
  }

  const unique = roots.filter((root, index) => roots.findIndex((candidate) => (
    Math.abs(signedAngularDelta(root, candidate)) < 1e-6
  )) === index);
  if (!unique.length) throw new Error(`Placidus cusp ${house} is unavailable at this latitude.`);

  return unique.sort((a, b) => (
    Math.abs(signedAngularDelta(expectedLongitude, a)) - Math.abs(signedAngularDelta(expectedLongitude, b))
  ))[0];
}

function validateCusps(cusps) {
  if (!Array.isArray(cusps) || cusps.length !== 12 || cusps.some((value) => !Number.isFinite(value))) {
    throw new Error('Placidus calculation did not return twelve valid cusps.');
  }
  for (let index = 0; index < 12; index += 1) {
    const width = normalizeDegrees(cusps[(index + 1) % 12] - cusps[index]);
    if (width <= 0 || width >= 180) throw new Error('Placidus cusps are not in zodiac order.');
  }
}

export function calculatePlacidusCusps({ armc, latitude, obliquity, ascendant, mc }) {
  const context = { armc: normalizeDegrees(armc), latitude, obliquity };
  const cusp2 = findIntermediateCusp(2, context, normalizeDegrees(ascendant + 30));
  const cusp3 = findIntermediateCusp(3, context, normalizeDegrees(ascendant + 60));
  const cusp11 = findIntermediateCusp(11, context, normalizeDegrees(ascendant + 300));
  const cusp12 = findIntermediateCusp(12, context, normalizeDegrees(ascendant + 330));

  const cusps = [
    normalizeDegrees(ascendant),
    cusp2,
    cusp3,
    normalizeDegrees(mc + 180),
    normalizeDegrees(cusp11 + 180),
    normalizeDegrees(cusp12 + 180),
    normalizeDegrees(ascendant + 180),
    normalizeDegrees(cusp2 + 180),
    normalizeDegrees(cusp3 + 180),
    normalizeDegrees(mc),
    cusp11,
    cusp12,
  ];
  validateCusps(cusps);
  return cusps;
}

export function houseForLongitude(longitude, cusps) {
  if (!Array.isArray(cusps) || cusps.length !== 12) return null;
  const point = normalizeDegrees(longitude);
  for (let index = 0; index < 12; index += 1) {
    const start = normalizeDegrees(cusps[index]);
    const end = normalizeDegrees(cusps[(index + 1) % 12]);
    const width = normalizeDegrees(end - start);
    const offset = normalizeDegrees(point - start);
    if (offset < width || Math.abs(offset) < 1e-9) return index + 1;
  }
  return null;
}
