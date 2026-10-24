// National post for a date: cover (all areas), one chart per area, EV charging per area, one caption.
// Every area is validated on its own; an area that fails is left out and logged.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { ReactNode } from 'react';
import { dateText, dayName, lastYearText, recordText } from '../caption.ts';
import { loadConfig, paths, type Config } from '../config.ts';
import { kr } from '../costs.ts';
import { shiftDays } from '../data/history.ts';
import { ore } from '../data/prices.ts';
import { allowedNumbers, buildAreaDay, cheapestArea, factCheckAgainst, isOk, orderedAreas, type AreaDay } from '../national.ts';
import { Cover } from '../render/cover.tsx';
import { DayAhead } from '../render/dayAhead.tsx';
import { EvCard } from '../render/evCard.tsx';
import { renderPng, SIZES } from '../render/render.ts';
import { recordGenerate } from '../status.ts';

const { values: args } = parseArgs({ options: { date: { type: 'string' } } });
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const date = args.date ?? shiftDays(today, 1);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must look like 2026-10-25');
const config = loadConfig();

const results = [];
for (const code of orderedAreas(config)) results.push(await buildAreaDay(config, code, date));
const days = results.filter(isOk);
for (const r of results) {
  if (isOk(r)) console.log(`  ${r.config.area.code} ${r.config.area.name}: ${r.validation.passed.length} checks passed, avg ${ore(r.stats.avg)} øre`);
  else console.warn(`  ! ${r.config.area.code} ${r.config.area.name} left out: ${r.error}`);
}
// For the dashboard; nothing is recorded before the prices are out (that is not a problem).
if (results.some((r) => isOk(r) || r.validation)) {
  recordGenerate(
    date,
    results.map((r) => {
      const window = (w: { from: string; to: string; avg: number }) => ({ from: w.from, to: w.to, avg: w.avg });
      const base = { code: r.config.area.code, name: r.config.area.name, passed: r.validation?.passed.length ?? 0, warnings: r.validation?.warnings ?? [] };
      return isOk(r)
        ? { ...base, ok: true, errors: [], avg: r.stats.avg, cheapest: window(r.stats.cheapest), dearest: window(r.stats.dearest) }
        : { ...base, ok: false, errors: r.validation?.errors.length ? r.validation.errors : [r.error] };
    }),
  );
}

if (days.length === 0) {
  console.log(`No valid prices for ${date} yet (usually after 13:00 the day before).`);
} else {
  const text = nationalCaption(date, days, config);
  const problems = factCheckAgainst(text, allowedNumbers(date, days, config));
  if (problems.length) throw new Error(`Caption failed the fact-check: ${problems.join('; ')}`);

  const outDir = path.join(paths.output, date);
  fs.mkdirSync(outDir, { recursive: true });
  const images = { feed: [] as string[], story: [] as string[] };
  const save = async (name: string, node: ReactNode, format: 'feed' | 'story') => {
    fs.writeFileSync(path.join(outDir, name), await renderPng(node, SIZES[format]));
    images[format].push(name);
    console.log(`  ✓ ${name}`);
  };

  await save(`strom_${date}_0_norge.png`, <Cover date={date} days={days} config={config} format="feed" />, 'feed');
  await save(`strom_${date}_0_norge_story.png`, <Cover date={date} days={days} config={config} format="story" />, 'story');
  for (const d of days) {
    const badges = [
      ...(d.extras.record ? [{ text: recordText(d.extras.record, date)!, tone: d.extras.record.kind === 'cheapest' ? ('good' as const) : ('warn' as const) }] : []),
      ...(d.extras.lastYear ? [{ text: lastYearText(d.extras.lastYear, d.stats.avg)!, tone: 'neutral' as const }] : []),
    ];
    for (const format of ['feed', 'story'] as const) {
      const name = `strom_${date}_${d.config.area.code}${format === 'story' ? '_story' : ''}.png`;
      await save(name, <DayAhead date={date} hours={d.hours} stats={d.stats} todayAvg={d.todayAvg} config={d.config} format={format} badges={badges} />, format);
    }
  }
  await save(`strom_${date}_elbil.png`, <EvCard date={date} days={days} config={config} format="feed" />, 'feed');

  const summary = days.map((d) => ({ code: d.config.area.code, name: d.config.area.name, avg: d.stats.avg, cheapest: d.stats.cheapest, dearest: d.stats.dearest, validation: d.validation }));
  const leftOut = results.filter((r) => !isOk(r)).map((r) => ({ code: r.config.area.code, error: 'error' in r ? r.error : '' }));
  fs.writeFileSync(path.join(outDir, 'post.json'), JSON.stringify({ date, mode: 'national', images, areas: summary, leftOut, caption: text }, null, 2));
  fs.writeFileSync(path.join(outDir, 'caption.txt'), text);
  console.log(`\n${text}`);
}

/** One line per area, the cheapest area, EV charging, a swipe hint and a short source line. */
function nationalCaption(day: string, list: AreaDay[], cfg: Config): string {
  const lo = cheapestArea(list);
  const evLo = lo.extras.costs[0];
  const first = list[0];
  const evFirst = first.extras.costs[0];
  return [
    `Strøm i morgen, ${dayName(day)} ${dateText(day)} ⚡`,
    '',
    ...list.map((d) => `${d.config.area.name}: ${ore(d.stats.avg)} øre · billigst kl. ${d.stats.cheapest.from}–${d.stats.cheapest.to}`),
    '',
    `💚 Billigst i landet: ${lo.config.area.name} (${ore(lo.stats.avg)} øre i snitt)`,
    evLo && evFirst
      ? `🚗 Lade elbilen (${cfg.appliances[0].kwh} kWh) til billigste tid: ca. ${kr(evLo.cheap)} i ${lo.config.area.name}${first !== lo ? `, ${kr(evFirst.cheap)} på ${first.config.area.name}` : ''}`
      : '',
    '👉 Sveip for din landsdel: pris time for time, billigste og dyreste timer.',
    '',
    `Spotpris inkl. mva (Nord-Norge uten mva), uten nettleie. ${cfg.source.short}`,
    cfg.brand.hashtags.join(' '),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}
