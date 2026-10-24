// npm run dashboard: builds output/<profile>/index.html from the posts in output/ and the state in data/<profile>/.
// In the cloud it runs after every workflow run and is deployed to Cloudflare Pages with the images.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, paths } from '../config.ts';
import { applySettings, readControls } from '../controls.ts';
import { dashboardPage } from '../dashboard.ts';
import { addDays, unitsFor, weeklyUnits, type Unit } from '../publish/plan.ts';
import { loadCredentials, readPublished } from '../publish/state.ts';
import { readStatus } from '../status.ts';
import { isSunday, weekKey } from '../weekly.ts';

const controls = readControls();
const config = applySettings(loadConfig(), controls.settings);
const now = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T');
const today = now.slice(0, 10);

const readPost = (dir: string) => {
  const f = path.join(paths.output, dir, 'post.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as { caption: string; sunday?: string; images?: { feed: string[]; story: string[] } }) : null;
};
const units: Unit[] = [];
for (const date of [today, addDays(today, 1)]) {
  const p = readPost(date);
  if (p) units.push(...unitsFor(date, p.caption, config, p.images));
}
if (isSunday(today)) {
  const p = readPost(weekKey(today));
  if (p) units.push(...weeklyUnits(weekKey(today), today, p.caption, config, p.images));
}

let tokenRefreshedAt: string | null = null;
try {
  tokenRefreshedAt = loadCredentials()?.refreshedAt ?? null;
} catch {
  // Unknown is shown as such on the dashboard.
}

const html = dashboardPage({ config, controls, status: readStatus(), published: readPublished(), units, tokenRefreshedAt, now, builtAt: new Date().toISOString(), repo: process.env.GITHUB_REPOSITORY ?? null });
fs.mkdirSync(paths.output, { recursive: true });
fs.writeFileSync(path.join(paths.output, 'index.html'), html);
console.log(`Dashboard: ${path.relative(process.cwd(), path.join(paths.output, 'index.html'))}`);
