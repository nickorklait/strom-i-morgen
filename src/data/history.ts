// Comparisons with earlier days: "cheapest day since 2 May", "−34 % vs the same day last year".
// Past days are fetched once and cached like every other day (the API has history back to Dec 2021).

import type { Config } from '../config.ts';
import { dayStats, fetchDay, isCached, toHourly } from './prices.ts';

export const shiftDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Same calendar date one year earlier (29 Feb → 28 Feb). */
export const lastYear = (day: string) => {
  const y = Number(day.slice(0, 4)) - 1;
  const md = day.slice(5) === '02-29' ? '02-28' : day.slice(5);
  return `${y}-${md}`;
};

export type AverageFn = (date: string) => Promise<number | null>;

/** Daily average in øre incl. VAT, or null when the day is not available. */
export function averageFetcher(config: Config, fetchFn: typeof fetch = fetch): AverageFn {
  return async (date) => {
    try {
      // Be polite to the free API: a short pause before each day that is not cached yet.
      if (!isCached(date, config)) await new Promise((r) => setTimeout(r, 150));
      const raw = await fetchDay(date, config, fetchFn);
      return raw ? dayStats(toHourly(raw, config.area.vat), config.cheapWindowHours).avg : null;
    } catch {
      return null;
    }
  };
}

export interface PriceRecord {
  kind: 'cheapest' | 'dearest';
  /** The last day that was cheaper (or dearer); null = none within the lookback. */
  since: string | null;
  days: number;
}

/**
 * Is this the cheapest (or most expensive) day for a while? Walks back until a day beats it.
 * Only reported when at least `minGapDays` days have passed, so it stays newsworthy.
 */
export async function recordFor(date: string, avg: number, average: AverageFn, config: Config): Promise<PriceRecord | null> {
  let cheaperSince: string | null | undefined;
  let dearerSince: string | null | undefined;
  for (let d = 1; d <= config.history.lookbackDays && (cheaperSince === undefined || dearerSince === undefined); d++) {
    const day = shiftDays(date, -d);
    const a = await average(day);
    if (a === null) continue;
    if (cheaperSince === undefined && a < avg) cheaperSince = day;
    if (dearerSince === undefined && a > avg) dearerSince = day;
  }
  const gap = (since: string | null | undefined) => (since === undefined || since === null ? config.history.lookbackDays : (Date.parse(date) - Date.parse(since)) / 864e5 - 1);
  const cheapGap = gap(cheaperSince);
  const dearGap = gap(dearerSince);
  if (cheapGap >= config.history.minGapDays) return { kind: 'cheapest', since: cheaperSince ?? null, days: Math.round(cheapGap) };
  if (dearGap >= config.history.minGapDays) return { kind: 'dearest', since: dearerSince ?? null, days: Math.round(dearGap) };
  return null;
}

/** Percentage change vs the same date last year, rounded; null when not available. */
export async function vsLastYear(date: string, avg: number, average: AverageFn): Promise<{ pct: number; avg: number } | null> {
  const before = await average(lastYear(date));
  if (before === null || before <= 0) return null;
  return { pct: Math.round(((avg - before) / before) * 100), avg: before };
}
