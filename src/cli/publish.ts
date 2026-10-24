// npm run publish [-- --date 2026-10-24] [--dry-run] [--now] [--check] [--only 2026-10-24-feed]
// Publishes the day's post (feed + story) to Instagram when it is due. Run `npm run generate` first.
// Follows the dashboard (data/<profile>/controls.json): pause, skipped posts, edited captions, settings.
// --only publishes that one post now (the dashboard's "Publiser nå"), also while paused, but never twice.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, paths } from '../config.ts';
import { applySettings, readControls } from '../controls.ts';
import { recordPublish } from '../status.ts';
import { cloudflaredAvailable, tunnelHost } from '../publish/host.ts';
import { InstagramClient, InstagramError, refreshToken } from '../publish/instagram.ts';
import { pngSize, pngToJpeg } from '../publish/jpeg.ts';
import { addDays, isDue, unitsFor, weeklyUnits, type Unit } from '../publish/plan.ts';
import { isSunday, weekKey } from '../weekly.ts';
import { loadCredentials, readPublished, recordPublished, saveCredentials } from '../publish/state.ts';

const { values: args } = parseArgs({
  options: { date: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, now: { type: 'boolean', default: false }, check: { type: 'boolean', default: false }, only: { type: 'string' } },
});
const controls = readControls();
const config = applySettings(loadConfig(), controls.settings);
const osloNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T');

async function connect() {
  const creds = loadCredentials();
  if (!creds?.token) throw new Error('Missing INSTAGRAM_ACCESS_TOKEN (GitHub secret in the cloud, .env locally).');
  if (Date.now() - Date.parse(creds.refreshedAt) > 7 * 864e5) {
    try {
      const r = await refreshToken(creds.token);
      Object.assign(creds, { token: r.token, refreshedAt: new Date().toISOString() });
      console.log(`Access token refreshed (valid ${Math.round(r.expiresInSeconds / 86400)} days).`);
    } catch (e) {
      console.warn(`Token refresh not done (${(e as Error).message}); using the current token.`);
    }
  }
  const me = await new InstagramClient({ userId: 'me', token: creds.token, apiVersion: config.publish.apiVersion }).whoAmI();
  creds.userId = me.userId;
  if (creds.refreshedAt !== new Date(0).toISOString()) saveCredentials(creds);
  return { me, ig: new InstagramClient({ userId: me.userId, token: creds.token, apiVersion: config.publish.apiVersion }) };
}

if (args.check) {
  const { me, ig } = await connect();
  console.log(`Token OK: @${me.username} (${me.accountType ?? 'unknown type'}). API posts last 24 h: ${await ig.quotaUsage()}. cloudflared: ${cloudflaredAvailable() ? 'found' : 'MISSING'}.`);
  process.exit(0);
}

const now = osloNow();
const today = now.slice(0, 10);
const only = args.only;
const onlyDir = only?.replace(/-(feed|story)$/, '');
const date = args.date ?? (onlyDir && /^\d{4}-\d{2}-\d{2}$/.test(onlyDir) ? onlyDir : addDays(today, 1));
const readPost = (dir: string) => {
  const f = path.join(paths.output, dir, 'post.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as { caption: string; sunday?: string; images?: { feed: string[]; story: string[] } }) : null;
};
const candidates: Unit[] = [];
const daily = readPost(date);
if (daily) candidates.push(...unitsFor(date, daily.caption, config, daily.images));
else console.log(`No post for ${date} yet (run npm run generate; prices come ~13:00 the day before).`);
const weekDir = onlyDir?.startsWith('uke-') ? onlyDir : config.weekly.enabled && isSunday(today) ? weekKey(today) : null;
const weekly = weekDir ? readPost(weekDir) : null;
if (weekDir && weekly) candidates.push(...weeklyUnits(weekDir, weekly.sunday ?? today, weekly.caption, config, weekly.images));
// An edited caption from the dashboard wins over the generated one.
for (const u of candidates) if (u.kind === 'feed' && controls.captions[u.key]) u.caption = controls.captions[u.key];

const published = readPublished();
const skipped = candidates.filter((u) => controls.skip.includes(u.key)).map((u) => u.key);
let due: Unit[];
if (only) {
  due = candidates.filter((u) => u.key === only && !published[u.key]);
  if (!due.length) {
    console.log(published[only] ? `${only} is already published; never twice.` : `${only} not found (is the post generated?).`);
    if (!published[only]) process.exitCode = 1;
  }
} else if (controls.paused) {
  console.log('Paused from the dashboard: nothing is published automatically.');
  due = [];
} else {
  due = candidates.filter((u) => isDue(u, published, now, args.now) && !skipped.includes(u.key));
}
if (due.length === 0) {
  if (!args['dry-run']) recordPublish({ paused: controls.paused, published: [], failed: [], skipped });
  if (!only) console.log(`Nothing due (now ${now.replace('T', ' ')}).`);
  process.exit();
}
console.log(`Due: ${due.map((u) => u.key).join(', ')}`);

const runDir = path.join(paths.output, '_publish');
fs.rmSync(runDir, { recursive: true, force: true });
fs.mkdirSync(runDir, { recursive: true });
for (const u of due) {
  u.images = u.images.filter((img) => fs.existsSync(path.join(paths.output, u.dir, img)));
  for (const img of u.images) {
    const png = fs.readFileSync(path.join(paths.output, u.dir, img));
    const { width, height } = pngSize(png);
    fs.writeFileSync(path.join(runDir, img.replace(/\.png$/, '.jpg')), pngToJpeg(png, width, height));
  }
}

if (args['dry-run'] || !config.publish.enabled) {
  console.log(`Dry run${config.publish.enabled ? '' : ' (publish.enabled is false)'}: nothing was sent. JPEGs in ${path.relative(process.cwd(), runDir)}.`);
  process.exit(0);
}

const { me, ig } = await connect();
console.log(`Publishing to @${me.username}.`);
const host = await tunnelHost(runDir);
const done: string[] = [];
const failures: { key: string; error: string }[] = [];
try {
  for (const u of due) {
    const urls = u.images.map((img) => host.url(img.replace(/\.png$/, '.jpg')));
    try {
      const ids = u.kind === 'feed' ? [await ig.publishFeed(urls, u.caption ?? '', u.dir.startsWith('uke') ? 'Strømpriser uka som gikk' : `Strømpriser for ${u.date}, time for time, per landsdel`)] : await ig.publishStories(urls);
      const permalink = u.kind === 'feed' ? await ig.permalink(ids[0]).catch(() => null) : null;
      recordPublished(u.key, { publishedAt: new Date().toISOString(), kind: u.kind, mediaIds: ids, permalink });
      done.push(u.key);
      console.log(`  ✓ ${u.key}${permalink ? `  ${permalink}` : ''}`);
    } catch (e) {
      const error = e instanceof InstagramError ? `${e.message} (status ${e.status})` : (e as Error).message;
      failures.push({ key: u.key, error });
      console.error(`  ✗ ${u.key}: ${error}`);
    }
  }
} finally {
  await host.close();
  recordPublish({ paused: controls.paused, published: done, failed: failures, skipped });
}
if (failures.length) process.exitCode = 1;
