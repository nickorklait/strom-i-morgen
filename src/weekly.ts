import type { Config } from './config.ts';
import { dateText } from './caption.ts';
import { shiftDays, type AverageFn } from './data/history.ts';
import { ore } from './data/prices.ts';
import { weekChangeText, type WeekDay, type WeekSummary } from './render/weekly.tsx';

const SHORT = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const LONG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/** ISO-8601 week number and its year. */
export function isoWeek(day: string): { year: number; week: number } {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 864e5 + 1) / 7) };
}

export const isSunday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
export const weekKey = (sunday: string) => {
  const { year, week } = isoWeek(sunday);
  return `uke-${year}-W${String(week).padStart(2, '0')}`;
};

/** Monday–Sunday ending on `sunday`, with the week before for comparison. Null if a day is missing. */
export async function buildWeek(sunday: string, average: AverageFn): Promise<WeekSummary | null> {
  const days: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftDays(sunday, -i);
    const avg = await average(date);
    if (avg === null) return null;
    days.push({ date, short: SHORT[new Date(`${date}T12:00:00Z`).getUTCDay()], avg });
  }
  const prev: number[] = [];
  for (let i = 13; i >= 7; i--) {
    const a = await average(shiftDays(sunday, -i));
    if (a !== null) prev.push(a);
  }
  const avg = days.reduce((n, d) => n + d.avg, 0) / 7;
  return {
    week: isoWeek(sunday).week,
    days,
    avg,
    prevAvg: prev.length === 7 ? prev.reduce((a, b) => a + b, 0) / 7 : null,
    cheapest: days.reduce((a, b) => (b.avg < a.avg ? b : a)),
    dearest: days.reduce((a, b) => (b.avg > a.avg ? b : a)),
  };
}

const dayLong = (d: WeekDay) => LONG[new Date(`${d.date}T12:00:00Z`).getUTCDay()];

export function weeklyCaption(w: WeekSummary, config: Config): string {
  const change = weekChangeText(w);
  return [
    `Uka som gikk (uke ${w.week}, ${config.area.name}) 📊`,
    '',
    `Snitt: ${ore(w.avg)} øre/kWh${change ? ` – ${change}` : ''}`,
    `💚 Billigst: ${dayLong(w.cheapest)} ${dateText(w.cheapest.date)} (${ore(w.cheapest.avg)} øre)`,
    `🔶 Dyrest: ${dayLong(w.dearest)} ${dateText(w.dearest.date)} (${ore(w.dearest.avg)} øre)`,
    '',
    'Følg med i morgen kl. 14 for neste døgns priser ⚡',
    '',
    `Spotpris inkl. mva, uten nettleie og påslag. ${config.source.attribution}.`,
    config.brand.hashtags.join(' '),
  ].join('\n');
}

/** Every number in the weekly caption must come from the data. */
export function factCheckWeekly(text: string, w: WeekSummary): string[] {
  const allowed = new Set<number>([w.week, ore(w.avg), ore(w.cheapest.avg), ore(w.dearest.avg), 14, ...w.days.flatMap((d) => [Number(d.date.slice(8, 10))])]);
  if (w.prevAvg) allowed.add(Math.abs(Math.round(((w.avg - w.prevAvg) / w.prevAvg) * 100)));
  const body = text.replace(/#[\p{L}\p{N}_]+/gu, ' ');
  return [...body.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => !allowed.has(n)).map((n) => `number "${n}" is not in the data`);
}
