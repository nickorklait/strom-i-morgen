// npm run publish [-- --date 2026-10-24] [--dry-run] [--now] [--check]
// Publishes the day's post (feed + story) to Instagram when it is due. Run `npm run generate` first.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, paths } from '../config.ts';
import { cloudflaredAvailable, tunnelHost } from '../publish/host.ts';
import { InstagramClient, InstagramError, refreshToken } from '../publish/instagram.ts';
import { pngSize, pngToJpeg } from '../publish/jpeg.ts';
import { addDays, isDue, unitsFor } from '../publish/plan.ts';
import { loadCredentials, readPublished, recordPublished, saveCredentials } from '../publish/state.ts';

const { values: args } = parseArgs({
  options: { date: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, now: { type: 'boolean', default: false }, check: { type: 'boolean', default: false } },
});
const config = loadConfig();
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
const date = args.date ?? addDays(now.slice(0, 10), 1);
const postFile = path.join(paths.output, date, 'post.json');
if (!fs.existsSync(postFile)) {
  console.log(`No post for ${date} yet (run npm run generate; prices come ~13:00 the day before).`);
  process.exit(0);
}
const post = JSON.parse(fs.readFileSync(postFile, 'utf8')) as { caption: string };
const published = readPublished();
const due = unitsFor(date, post.caption, config).filter((u) => isDue(u, published, now, args.now));
if (due.length === 0) {
  console.log(`Nothing due for ${date} (now ${now.replace('T', ' ')}).`);
  process.exit(0);
}
console.log(`Due: ${due.map((u) => u.key).join(', ')}`);

const runDir = path.join(paths.output, '_publish');
fs.rmSync(runDir, { recursive: true, force: true });
fs.mkdirSync(runDir, { recursive: true });
for (const u of due) {
  const png = fs.readFileSync(path.join(paths.output, date, u.image));
  const { width, height } = pngSize(png);
  fs.writeFileSync(path.join(runDir, u.image.replace(/\.png$/, '.jpg')), pngToJpeg(png, width, height));
}

if (args['dry-run'] || !config.publish.enabled) {
  console.log(`Dry run${config.publish.enabled ? '' : ' (publish.enabled is false)'}: nothing was sent. JPEGs in ${path.relative(process.cwd(), runDir)}.`);
  process.exit(0);
}

const { me, ig } = await connect();
console.log(`Publishing to @${me.username}.`);
const host = await tunnelHost(runDir);
let failed = 0;
try {
  for (const u of due) {
    const url = host.url(u.image.replace(/\.png$/, '.jpg'));
    try {
      const ids = u.kind === 'feed' ? [await ig.publishFeed([url], u.caption ?? '', `Strømpriser for ${date}, time for time`)] : await ig.publishStories([url]);
      const permalink = u.kind === 'feed' ? await ig.permalink(ids[0]).catch(() => null) : null;
      recordPublished(u.key, { publishedAt: new Date().toISOString(), kind: u.kind, mediaIds: ids, permalink });
      console.log(`  ✓ ${u.key}${permalink ? `  ${permalink}` : ''}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${u.key}: ${e instanceof InstagramError ? `${e.message} (status ${e.status})` : (e as Error).message}`);
    }
  }
} finally {
  await host.close();
}
if (failed) process.exitCode = 1;
