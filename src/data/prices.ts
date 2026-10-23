// Day-ahead electricity prices from hvakosterstrommen.no (open and free; credit requested).
// API: /api/v1/prices/YYYY/MM-DD_NOx.json, prices in NOK/kWh excl. VAT, published ~13:00 the day before.

import fs from 'node:fs';
import path from 'node:path';
import { paths, type Config } from '../config.ts';

export interface RawPrice {
  NOK_per_kWh: number;
  EUR_per_kWh: number;
  EXR: number;
  time_start: string;
  time_end: string;
}

export interface HourPrice {
  /** ISO start of the hour (with offset). */
  start: string;
  /** Local hour "HH" (Europe/Oslo). On the autumn DST day "02" appears twice. */
  hour: string;
  /** Øre/kWh including VAT for the area. */
  ore: number;
}

const URL = (date: string, area: string) => `https://www.hvakosterstrommen.no/api/v1/prices/${date.slice(0, 4)}/${date.slice(5, 7)}-${date.slice(8, 10)}_${area}.json`;
const cacheFile = (date: string, area: string) => path.join(paths.prices, `${date}_${area}.json`);

/** Prices for a day: from the local cache, or fetched once and cached. Null when not published yet. */
export async function fetchDay(date: string, config: Config, fetchFn: typeof fetch = fetch): Promise<RawPrice[] | null> {
  const file = cacheFile(date, config.area.code);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetchFn(URL(date, config.area.code), { headers: { 'User-Agent': config.source.userAgent, Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Price API: HTTP ${res.status}`);
  const data = (await res.json()) as RawPrice[];
  if (!Array.isArray(data) || data.length < 23) throw new Error(`Price API: unexpected response (${Array.isArray(data) ? data.length : typeof data} entries)`);
  fs.mkdirSync(paths.prices, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return data;
}

const osloHour = (iso: string) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/**
 * One price per hour in øre/kWh incl. VAT. Works for hourly and 15-minute data (averaged per hour),
 * and for the 23- and 25-hour DST days: hours are grouped by their actual start time, not by label.
 */
export function toHourly(raw: RawPrice[], vat: number): HourPrice[] {
  const groups = new Map<number, number[]>();
  for (const p of raw) {
    const hourStart = Math.floor(Date.parse(p.time_start) / 3.6e6) * 3.6e6;
    groups.set(hourStart, [...(groups.get(hourStart) ?? []), p.NOK_per_kWh]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, values]) => {
      const start = raw.find((p) => Math.floor(Date.parse(p.time_start) / 3.6e6) * 3.6e6 === ms)!.time_start;
      const nok = values.reduce((a, b) => a + b, 0) / values.length;
      return { start, hour: osloHour(start), ore: nok * (1 + vat) * 100 };
    });
}

export interface DayStats {
  avg: number;
  min: HourPrice;
  max: HourPrice;
  /** Cheapest run of consecutive hours, for washing/charging. */
  cheapest: { from: string; to: string; avg: number; indexes: number[] };
  negativeHours: number;
}

/** "HH" for the end of an hour; midnight at the end of the day is written "24" ("kl. 21–24"). */
const endHour = (h: HourPrice) => {
  const end = osloHour(new Date(Date.parse(h.start) + 3.6e6).toISOString());
  return end === "00" ? "24" : end;
};

export function dayStats(hours: HourPrice[], windowHours: number): DayStats {
  const avg = hours.reduce((n, h) => n + h.ore, 0) / hours.length;
  const min = hours.reduce((a, b) => (b.ore < a.ore ? b : a));
  const max = hours.reduce((a, b) => (b.ore > a.ore ? b : a));
  let best = { i: 0, avg: Infinity };
  for (let i = 0; i + windowHours <= hours.length; i++) {
    const w = hours.slice(i, i + windowHours).reduce((n, h) => n + h.ore, 0) / windowHours;
    if (w < best.avg) best = { i, avg: w };
  }
  const indexes = Array.from({ length: windowHours }, (_, k) => best.i + k);
  return {
    avg,
    min,
    max,
    cheapest: { from: hours[best.i].hour, to: endHour(hours[best.i + windowHours - 1]), avg: best.avg, indexes },
    negativeHours: hours.filter((h) => h.ore < 0).length,
  };
}

/** Prices shown as whole øre. */
export const ore = (n: number) => Math.round(n);
export { endHour };
