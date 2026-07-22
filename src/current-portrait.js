import { buildFallbackPortrait } from './narrative.js';

export function currentPortrait(record) {
  const storedPortrait = record?.portraitData || null;
  if (!record?.chartData) return storedPortrait;

  try {
    return buildFallbackPortrait(record.chartData);
  } catch {
    return storedPortrait;
  }
}
