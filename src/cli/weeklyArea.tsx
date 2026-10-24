// npm run weekly [-- --end 2026-10-25]
// On Sundays (or for --end): builds "Uka som gikk" for Monday–Sunday into output/uke-YYYY-Www/.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, paths } from '../config.ts';
import { averageFetcher } from '../data/history.ts';
import { renderPng, SIZES, type Format } from '../render/render.ts';
import { Weekly } from '../render/weekly.tsx';
import { buildWeek, factCheckWeekly, isSunday, weekKey, weeklyCaption } from '../weekly.ts';

const { values: args } = parseArgs({ options: { end: { type: 'string' } } });
const config = loadConfig();
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const sunday = args.end ?? today;
if (!config.weekly.enabled || !isSunday(sunday)) {
  console.log(args.end ? `${sunday} is not a Sunday.` : 'Weekly summary is made on Sundays.');
  process.exit(0);
}

const w = await buildWeek(sunday, averageFetcher(config));
if (!w) {
  console.log(`Not all days of the week ending ${sunday} are available yet.`);
  process.exit(0);
}
const text = weeklyCaption(w, config);
const problems = factCheckWeekly(text, w);
if (problems.length) throw new Error(`Weekly caption failed the fact-check: ${problems.join('; ')}`);

const key = weekKey(sunday);
const outDir = path.join(paths.output, key);
fs.mkdirSync(outDir, { recursive: true });
for (const format of ['feed', 'story'] as Format[]) {
  const file = path.join(outDir, `${key}_${format}.png`);
  fs.writeFileSync(file, await renderPng(<Weekly w={w} config={config} format={format} />, SIZES[format]));
  console.log(`  ✓ ${path.relative(process.cwd(), file)}`);
}
fs.writeFileSync(path.join(outDir, 'post.json'), JSON.stringify({ key, sunday, week: w, caption: text }, null, 2));
fs.writeFileSync(path.join(outDir, 'caption.txt'), text);
console.log(`\n${text}`);
