import type { Config } from './config.ts';
import { endHour, ore, type DayStats } from './data/prices.ts';

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

export function caption(date: string, s: DayStats, todayAvg: number | null, config: Config): string {
  const change = changeText(s.avg, todayAvg);
  const trend = change === null ? '' : change.startsWith('ned') ? ' 📉' : change.startsWith('opp') ? ' 📈' : '';
  const maxEnd = endHour(s.max);
  return [
    `Strøm i morgen, ${dayName(date)} ${dateText(date)} (${config.area.name}) ⚡`,
    '',
    `Snitt: ${ore(s.avg)} øre/kWh${change ? ` – ${change}${trend}` : ''}`,
    `💚 Billigst: kl. ${s.cheapest.from}–${s.cheapest.to} (${ore(s.cheapest.avg)} øre i snitt)`,
    `🔶 Dyrest: kl. ${s.max.hour}–${maxEnd} (${ore(s.max.ore)} øre)`,
    s.negativeHours > 0 ? `Obs: negativ pris i ${s.negativeHours} timer!` : '',
    '',
    `Tips: Sett på vaskemaskin, oppvask og lading kl. ${s.cheapest.from}–${s.cheapest.to}.`,
    '',
    `Spotpris inkl. mva, uten nettleie og påslag. ${config.source.attribution}.`,
    config.brand.hashtags.join(' '),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}

/**
 * Every number in a caption must come from the data (prices, hours, the date, counts).
 * Guards template changes and, later, captions written by an AI model.
 */
export function factCheckNumbers(text: string, date: string, s: DayStats, todayAvg: number | null, hoursInDay: number): string[] {
  const allowed = new Set<number>([
    ore(s.avg), ore(s.min.ore), ore(s.max.ore), ore(s.cheapest.avg), s.negativeHours, hoursInDay,
    Number(date.slice(8, 10)), Number(date.slice(0, 4)),
    ...Array.from({ length: 25 }, (_, h) => h), // clock hours
  ]);
  if (todayAvg !== null) allowed.add(Math.abs(ore(s.avg) - ore(todayAvg)));
  const body = text.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/NO\d/g, ' ');
  return [...body.matchAll(/-?\d+(?:[.,]\d+)?/g)]
    .map((m) => m[0])
    .filter((n) => !allowed.has(Math.abs(Number(n.replace(',', '.')))))
    .map((n) => `number "${n}" is not in the data`);
}
