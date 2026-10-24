// Sunday summary for all areas: one image with each area's week average and change from the week before.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, paths } from '../config.ts';
import { applySettings, readControls } from '../controls.ts';
import { averageFetcher } from '../data/history.ts';
import { ore } from '../data/prices.ts';
import { areaConfig, factCheckAgainst, orderedAreas } from '../national.ts';
import { renderPng, SIZES } from '../render/render.ts';
import { WeeklyNational, type AreaWeek } from '../render/weeklyNational.tsx';
import { weekChangeText } from '../render/weekly.tsx';
import { buildWeek, isSunday, weekKey } from '../weekly.ts';

const { values: args } = parseArgs({ options: { end: { type: 'string' } } });
const config = applySettings(loadConfig(), readControls().settings);
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const sunday = args.end ?? today;

if (!config.weekly.enabled || !isSunday(sunday)) {
  console.log(args.end ? `${sunday} is not a Sunday.` : 'Weekly summary is made on Sundays.');
} else {
  const areas: AreaWeek[] = [];
  for (const code of orderedAreas(config)) {
    const cfg = areaConfig(config, code);
    const week = await buildWeek(sunday, averageFetcher(cfg));
    if (week) areas.push({ code, name: cfg.area.name, week });
    else console.warn(`  ! ${code}: not all days available, left out`);
  }
  if (areas.length === 0) {
    console.log(`No complete week ending ${sunday}.`);
  } else {
    const lo = areas.reduce((a, b) => (b.week.avg < a.week.avg ? b : a));
    const w = areas[0].week;
    const text = [
      `Uka som gikk (uke ${w.week}) – hele Norge 📊`,
      '',
      ...areas.map((a) => `${a.name}: ${ore(a.week.avg)} øre${weekChangeText(a.week) ? ` (${weekChangeText(a.week)})` : ''}`),
      '',
      `💚 Billigst: ${lo.name}`,
      'Følg med i morgen kl. 14 for neste døgns priser ⚡',
      '',
      `Snitt for uka, spotpris inkl. mva (Nord-Norge uten mva), uten nettleie. ${config.source.short}`,
      config.brand.hashtags.join(' '),
    ].join('\n');
    const allowed = [w.week, 14, ...areas.flatMap((a) => [ore(a.week.avg), ...(a.week.prevAvg ? [Math.abs(Math.round(((a.week.avg - a.week.prevAvg) / a.week.prevAvg) * 100))] : [])])];
    const problems = factCheckAgainst(text, allowed);
    if (problems.length) throw new Error(`Weekly caption failed the fact-check: ${problems.join('; ')}`);

    const key = weekKey(sunday);
    const outDir = path.join(paths.output, key);
    fs.mkdirSync(outDir, { recursive: true });
    const images = { feed: [`${key}_feed.png`], story: [`${key}_story.png`] };
    fs.writeFileSync(path.join(outDir, images.feed[0]), await renderPng(<WeeklyNational areas={areas} config={config} format="feed" />, SIZES.feed));
    fs.writeFileSync(path.join(outDir, images.story[0]), await renderPng(<WeeklyNational areas={areas} config={config} format="story" />, SIZES.story));
    fs.writeFileSync(path.join(outDir, 'post.json'), JSON.stringify({ key, sunday, mode: 'national', images, caption: text }, null, 2));
    console.log(`  ✓ ${images.feed[0]}\n  ✓ ${images.story[0]}\n\n${text}`);
  }
}
