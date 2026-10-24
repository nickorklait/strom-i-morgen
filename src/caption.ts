import { priceBasis, type Config } from './config.ts';
import { endHour, ore, type DayStats } from './data/prices.ts';
import { kr, type Cost } from './costs.ts';
import type { PriceRecord } from './data/history.ts';
import type { AreaAverage } from './render/norway.tsx';

const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

export const dayName = (date: string) => DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
export const dateText = (date: string) => `${Number(date.slice(8, 10))}. ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** "ned 77 øre fra i dag" / "opp 12 øre fra i dag" / "omtrent som i dag". */
export function changeText(avg: number, todayAvg: number | null): string | null {
  if (todayAvg === null) return null;
  const d = ore(avg) - ore(todayAvg);
  if (Math.abs(d) < 2) return 'omtrent som i dag';
  return `${d < 0 ? 'ned' : 'opp'} ${Math.abs(d)} øre fra i dag`;
}

export interface Extras {
  record: PriceRecord | null;
  lastYear: { pct: number; avg: number } | null;
  costs: Cost[];
  /** All price areas (for the "Hele Norge" line and slide). */
  areas?: AreaAverage[];
}

const withYear = (day: string, ref: string) => `${dateText(day)}${day.slice(0, 4) !== ref.slice(0, 4) ? ` ${day.slice(0, 4)}` : ''}`;

/** "Billigste dag siden 2. mai" / "Dyreste dag på over ett år". */
export function recordText(r: PriceRecord | null, date: string): string | null {
  if (!r) return null;
  const what = r.kind === 'cheapest' ? 'Billigste' : 'Dyreste';
  return r.since ? `${what} dag siden ${withYear(r.since, date)}` : `${what} dag på over ett år`;
}

/** "−34 % mot samme dag i fjor". */
export function lastYearText(v: { pct: number; avg: number } | null, now: number): string | null {
  if (!v) return null;
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±');
  // Percentages on tiny amounts mislead (5 → 22 øre is "+315 %"): below 20 øre last year, show øre instead.
  if (v.avg < SMALL_BASE) {
    const d = ore(now) - ore(v.avg);
    return `${sign(d)}${Math.abs(d)} øre mot samme dag i fjor`;
  }
  return `${sign(v.pct)}${Math.abs(v.pct)} % mot samme dag i fjor`;
}
export const SMALL_BASE = 20;

/** "🇳🇴 Hele Norge: billigst i Nord-Norge (3 øre), dyrest i Vestlandet (74 øre). Se bilde 3." */
function areaLine(areas?: AreaAverage[]): string {
  if (!areas || areas.length < 2) return '';
  const lo = areas.reduce((a, b) => (b.avg < a.avg ? b : a));
  const hi = areas.reduce((a, b) => (b.avg > a.avg ? b : a));
  return `🇳🇴 Hele Norge: billigst i ${lo.name} (${ore(lo.avg)} øre), dyrest i ${hi.name} (${ore(hi.avg)} øre). Se bilde 3.`;
}

export function caption(date: string, s: DayStats, todayAvg: number | null, config: Config, extras: Extras = { record: null, lastYear: null, costs: [] }): string {
  const change = changeText(s.avg, todayAvg);
  const trend = change === null ? '' : change.startsWith('ned') ? ' 📉' : change.startsWith('opp') ? ' 📈' : '';
  const maxEnd = endHour(s.max);
  return [
    `Strøm i morgen, ${dayName(date)} ${dateText(date)} (${config.area.name}) ⚡`,
    '',
    `Snitt: ${ore(s.avg)} øre/kWh${change ? ` – ${change}${trend}` : ''}`,
    [recordText(extras.record, date), lastYearText(extras.lastYear, s.avg)].filter(Boolean).length ? `📅 ${[recordText(extras.record, date), lastYearText(extras.lastYear, s.avg)].filter(Boolean).join(' · ')}` : '',
    `💚 Billigst: kl. ${s.cheapest.from}–${s.cheapest.to} (${ore(s.cheapest.avg)} øre i snitt)`,
    `🔶 Dyrest: kl. ${s.max.hour}–${maxEnd} (${ore(s.max.ore)} øre)`,
    s.negativeHours > 0 ? `Obs: negativ pris i ${s.negativeHours} timer!` : '',
    '',
    `Tips: Sett på vaskemaskin, oppvask og lading kl. ${s.cheapest.from}–${s.cheapest.to}.`,
    extras.costs[0] ? `🚗 ${extras.costs[0].name} (${config.appliances[0].kwh} kWh): ca. ${kr(extras.costs[0].cheap)} kl. ${s.cheapest.from}–${s.cheapest.to}, mot ${kr(extras.costs[0].dear)} kl. ${s.dearest.from}–${s.dearest.to}. Se bilde 2 for mer.` : '',
    '',
    areaLine(extras.areas),
    `${priceBasis(config).replace(' og påslag', '')}. ${config.source.short}`,
    config.brand.hashtags.join(' '),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}

/**
 * Every number in a caption must come from the data (prices, hours, the date, counts).
 * Guards template changes and, later, captions written by an AI model.
 */
export function factCheckNumbers(text: string, date: string, s: DayStats, todayAvg: number | null, hoursInDay: number, extras?: Extras, config?: Config): string[] {
  const allowed = new Set<number>([
    ore(s.avg), ore(s.min.ore), ore(s.max.ore), ore(s.cheapest.avg), s.negativeHours, hoursInDay,
    Number(date.slice(8, 10)), Number(date.slice(0, 4)),
    ...Array.from({ length: 25 }, (_, h) => h), // clock hours
  ]);
  if (todayAvg !== null) allowed.add(Math.abs(ore(s.avg) - ore(todayAvg)));
  if (extras?.lastYear) {
    allowed.add(Math.abs(extras.lastYear.pct));
    allowed.add(Math.abs(ore(s.avg) - ore(extras.lastYear.avg)));
  }
  if (extras?.record?.since) [Number(extras.record.since.slice(8, 10)), Number(extras.record.since.slice(0, 4))].forEach((n) => allowed.add(n));
  for (const c of extras?.costs ?? []) for (const v of [c.cheap, c.dear]) allowed.add(Number(kr(v).replace(' kr', '').replace(',', '.')));
  for (const a of config?.appliances ?? []) allowed.add(a.kwh);
  allowed.add(2); // "bilde 2"
  allowed.add(3); // "bilde 3"
  for (const a of extras?.areas ?? []) allowed.add(ore(a.avg));
  const body = text.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/NO\d/g, ' ');
  return [...body.matchAll(/-?\d+(?:[.,]\d+)?/g)]
    .map((m) => m[0])
    .filter((n) => !allowed.has(Math.abs(Number(n.replace(',', '.')))))
    .map((n) => `number "${n}" is not in the data`);
}
