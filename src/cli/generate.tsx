// npm run generate [-- --date 2026-10-24]
// Builds the "Strøm i morgen" post (feed + story + caption) for a date (default: tomorrow, Oslo time)
// into output/<date>/. Nothing is published: this is the prototype.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { caption, factCheckNumbers } from '../caption.ts';
import { loadConfig, paths } from '../config.ts';
import { dayStats, fetchDay, toHourly } from '../data/prices.ts';
import { DayAhead } from '../render/dayAhead.tsx';
import { CostCard } from '../render/costCard.tsx';
import { Norway, type AreaAverage } from '../render/norway.tsx';
import { costs } from '../costs.ts';
import { averageFetcher, recordFor, vsLastYear } from '../data/history.ts';
import { lastYearText, recordText, type Extras } from '../caption.ts';
import { renderPng, SIZES, type Format } from '../render/render.ts';

const osloDate = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const { values: args } = parseArgs({ options: { date: { type: 'string' } } });
const date = args.date ?? addDays(osloDate(new Date()), 1);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must look like 2026-10-24');

const config = loadConfig();
const raw = await fetchDay(date, config);
if (!raw) {
  console.log(`Prices for ${date} are not published yet (usually after 13:00 the day before).`);
  process.exit(0);
}
const hours = toHourly(raw, config.area.vat);
const stats = dayStats(hours, config.cheapWindowHours);
const todayRaw = await fetchDay(addDays(date, -1), config);
const todayAvg = todayRaw ? dayStats(toHourly(todayRaw, config.area.vat), config.cheapWindowHours).avg : null;

// History: past days are fetched once and cached (first run may take a little while).
const average = averageFetcher(config);
const extras: Extras = {
  record: await recordFor(date, stats.avg, average, config),
  lastYear: await vsLastYear(date, stats.avg, average),
  costs: costs(stats, config),
  areas: await areaAverages(date),
};

/** Tomorrow's average in every price area (each area with its own VAT rule). */
async function areaAverages(day: string): Promise<AreaAverage[]> {
  const out: AreaAverage[] = [];
  for (const a of config.areas) {
    try {
      const r = await fetchDay(day, config, fetch, a.code);
      if (r) out.push({ code: a.code, name: a.name, vat: a.vat, avg: dayStats(toHourly(r, a.vat), config.cheapWindowHours).avg });
    } catch {
      // A missing area just leaves it out of the slide.
    }
  }
  return out.length === config.areas.length ? out : [];
}
const badges = [
  ...(extras.record ? [{ text: recordText(extras.record, date)!, tone: extras.record.kind === 'cheapest' ? ('good' as const) : ('warn' as const) }] : []),
  ...(extras.lastYear ? [{ text: lastYearText(extras.lastYear)!, tone: 'neutral' as const }] : []),
];

const text = caption(date, stats, todayAvg, config, extras);
const problems = factCheckNumbers(text, date, stats, todayAvg, hours.length, extras, config);
if (problems.length) throw new Error(`Caption failed the fact-check: ${problems.join('; ')}`);

const outDir = path.join(paths.output, date);
fs.mkdirSync(outDir, { recursive: true });
for (const format of ['feed', 'story'] as Format[]) {
  const file = path.join(outDir, `strom_${date}_${format}.png`);
  fs.writeFileSync(file, await renderPng(<DayAhead date={date} hours={hours} stats={stats} todayAvg={todayAvg} config={config} format={format} badges={badges} />, SIZES[format]));
  console.log(`  ✓ ${path.relative(process.cwd(), file)}`);
}
const costFile = path.join(outDir, `strom_${date}_kostnad.png`);
fs.writeFileSync(costFile, await renderPng(<CostCard date={date} s={stats} items={extras.costs} config={config} format="feed" />, SIZES.feed));
console.log(`  ✓ ${path.relative(process.cwd(), costFile)}`);
if (extras.areas?.length) {
  const norwayFile = path.join(outDir, `strom_${date}_norge.png`);
  fs.writeFileSync(norwayFile, await renderPng(<Norway date={date} areas={extras.areas} config={config} format="feed" />, SIZES.feed));
  console.log(`  ✓ ${path.relative(process.cwd(), norwayFile)}`);
}
fs.writeFileSync(path.join(outDir, 'caption.txt'), text);
fs.writeFileSync(path.join(outDir, 'post.json'), JSON.stringify({ date, area: config.area.code, hours, stats, todayAvg, extras, caption: text }, null, 2));
console.log(`\n${text}`);
