// One account for all of Norway: tomorrow's prices for every price area, each validated on its own.
// An area that fails validation is left out of the post (and logged); the others still go out.

import type { Config } from './config.ts';
import type { Extras } from './caption.ts';
import { costs } from './costs.ts';
import { averageFetcher, recordFor, shiftDays, vsLastYear } from './data/history.ts';
import { dayStats, fetchDay, ore, toHourly, type DayStats, type HourPrice } from './data/prices.ts';
import { checkExchangeRate, merge as mergeValidation, validateDay, type Validation } from './data/validate.ts';

export interface AreaDay {
  config: Config;
  hours: HourPrice[];
  stats: DayStats;
  todayAvg: number | null;
  extras: Extras;
  validation: Validation;
}

export type AreaResult = AreaDay | { config: Config; error: string; validation?: Validation };
export const isOk = (r: AreaResult): r is AreaDay => !('error' in r);

/** The shared config with one area (and its name in the header) swapped in. */
export function areaConfig(base: Config, code: string): Config {
  const a = base.areas.find((x) => x.code === code);
  if (!a) throw new Error(`Unknown price area ${code}`);
  return { ...base, area: { code: a.code, name: a.name, vat: a.vat }, brand: { ...base.brand, tagline: `Spotpris ${a.name}` } };
}

export async function buildAreaDay(base: Config, code: string, date: string): Promise<AreaResult> {
  const config = areaConfig(base, code);
  const raw = await fetchDay(date, config);
  if (!raw) return { config, error: 'ikke publisert ennå' };
  const validation = mergeValidation(validateDay(raw, date), await checkExchangeRate(raw, date, config.source.userAgent));
  if (validation.errors.length) return { config, error: validation.errors.join('; '), validation };
  const hours = toHourly(raw, config.area.vat);
  const stats = dayStats(hours, config.cheapWindowHours);
  const todayRaw = await fetchDay(shiftDays(date, -1), config).catch(() => null);
  const todayAvg = todayRaw && validateDay(todayRaw, shiftDays(date, -1)).errors.length === 0 ? dayStats(toHourly(todayRaw, config.area.vat), config.cheapWindowHours).avg : null;
  const average = averageFetcher(config);
  const extras: Extras = {
    record: await recordFor(date, stats.avg, average, config),
    lastYear: await vsLastYear(date, stats.avg, average),
    costs: costs(stats, config),
  };
  return { config, hours, stats, todayAvg, extras, validation };
}

/** The areas in the configured order (most people first). */
export const orderedAreas = (config: Config) => config.national?.order ?? config.areas.map((a) => a.code);

export const cheapestArea = (days: AreaDay[]) => days.reduce((a, b) => (b.stats.avg < a.stats.avg ? b : a));
export const dearestArea = (days: AreaDay[]) => days.reduce((a, b) => (b.stats.avg > a.stats.avg ? b : a));

/** Every number a national caption may contain. */
export function allowedNumbers(date: string, days: AreaDay[], config: Config): number[] {
  const kr = (n: number) => (Math.abs(n) >= 10 ? Math.round(n) : Number(n.toFixed(2)));
  return [
    Number(date.slice(8, 10)), Number(date.slice(0, 4)), ...Array.from({ length: 25 }, (_, h) => h),
    ...config.appliances.map((a) => a.kwh),
    ...days.flatMap((d) => [ore(d.stats.avg), ore(d.stats.cheapest.avg), ore(d.stats.dearest.avg), ore(d.stats.min.ore), ore(d.stats.max.ore)]),
    ...days.flatMap((d) => d.extras.costs.flatMap((c) => [kr(c.cheap), kr(c.dear), kr(c.dear - c.cheap)])),
  ];
}

/** Numbers in a caption that are not in the data (hashtags and area codes are ignored). */
export function factCheckAgainst(text: string, allowed: number[]): string[] {
  const set = new Set(allowed);
  const body = text.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/NO\d/g, ' ');
  return [...body.matchAll(/-?\d+(?:[.,]\d+)?/g)]
    .map((m) => m[0])
    .filter((n) => !set.has(Math.abs(Number(n.replace(',', '.')))))
    .map((n) => `number "${n}" is not in the data`);
}
