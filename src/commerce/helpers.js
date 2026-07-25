export function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function latestDate(...values) {
  const dates = values.map(asDate).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export function active(value, now = new Date()) {
  const date = asDate(value);
  return Boolean(date && date.getTime() > now.getTime());
}

export function iso(value) {
  return asDate(value)?.toISOString() || null;
}

export function addDuration(base, milliseconds) {
  return new Date(Math.max(Date.now(), asDate(base)?.getTime() || 0) + milliseconds);
}

export function chartAccessKey(userId, chartId) {
  return `${String(userId)}:${String(chartId)}`;
}
