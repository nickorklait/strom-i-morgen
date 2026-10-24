// The dashboard (output/<profile>/index.html): is everything OK, what goes out next, tomorrow's prices
// and data checks per area, what has been published, settings and the activity log. Buttons post
// actions to /api/action (Cloudflare function → GitHub → the workflow applies them).
// Time-dependent warnings (a post that should have gone out) are also checked live in the browser,
// so the page warns even if no run has updated it since.

import type { Config } from './config.ts';
import type { Controls } from './controls.ts';
import { MAX_CAPTION } from './controlsSchema.ts';
import { ore, priceUrl } from './data/prices.ts';
import { addDays, type Unit } from './publish/plan.ts';
import type { PublishedEntry } from './publish/state.ts';
import type { AreaCheck, Status } from './status.ts';
import { isSunday, weekKey } from './weekly.ts';

export interface DashboardInput {
  config: Config;
  controls: Controls;
  status: Status;
  published: Record<string, PublishedEntry>;
  /** Posts that exist in output/ (tomorrow, today, this week's summary). */
  units: Unit[];
  /** When the Instagram token was last refreshed (ISO), if known. */
  tokenRefreshedAt: string | null;
  /** Oslo local "YYYY-MM-DDTHH:MM". */
  now: string;
  /** ISO time the page is built. */
  builtAt: string;
  /** "owner/repo", for links to the workflow runs. */
  repo: string | null;
}

export interface Problem {
  level: 'bad' | 'warn';
  text: string;
  /** Depends on the time: shown by the browser's live check, not baked into the page. */
  live?: boolean;
}

/** A post the account is expected to have published: key, from when, and until when it is useful. */
export interface Expected {
  key: string;
  label: string;
  publishAt: string;
  expiresAt: string;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const DAYS = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
const MONTHS = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const dayText = (d: string) => `${DAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${Number(d.slice(8, 10))}. ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
export const when = (t: string) => `${dayText(t.slice(0, 10))} kl. ${t.slice(11, 16)}`;

/** Add minutes to an Oslo local "YYYY-MM-DDTHH:MM" (naive; fine for thresholds of minutes to hours). */
export function addMinutes(t: string, min: number): string {
  const d = new Date(`${t}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + min);
  return d.toISOString().slice(0, 16);
}

/** Minutes after publishAt before a missing post is a warning (GitHub's schedule can be late), and an error (after the last retry). */
export const LATE_WARN = 60;
export const LATE_BAD = 180;

/** The daily posts for today and tomorrow, and on Sundays the weekly summary. */
export function expectedPosts(config: Config, now: string): Expected[] {
  const today = now.slice(0, 10);
  const daily = (date: string): Expected => ({ key: `${date}-feed`, label: `Strømpris ${dayText(date)}`, publishAt: `${addDays(date, -1)}T${config.publish.time}`, expiresAt: `${date}T${config.publish.lastUsefulTime}` });
  const list = [daily(today), daily(addDays(today, 1))];
  if (config.weekly.enabled && isSunday(today)) list.push({ key: `${weekKey(today)}-feed`, label: 'Uka som gikk', publishAt: `${today}T${config.weekly.time}`, expiresAt: `${today}T${config.weekly.lastUsefulTime}` });
  return list;
}

/** Posts that should have gone out by now and have not (not skipped, not paused). */
export function latePosts(expected: Expected[], published: Record<string, unknown>, controls: Controls, now: string): (Expected & { level: Problem['level'] })[] {
  if (controls.paused) return [];
  return expected
    .filter((e) => !published[e.key] && !controls.skip.includes(e.key) && now < e.expiresAt && now >= addMinutes(e.publishAt, LATE_WARN))
    .map((e) => ({ ...e, level: now >= addMinutes(e.publishAt, LATE_BAD) ? ('bad' as const) : ('warn' as const) }));
}

export const tokenDaysLeft = (refreshedAt: string | null, nowMs: number) => (refreshedAt && Date.parse(refreshedAt) > 0 ? Math.floor((Date.parse(refreshedAt) + 60 * 864e5 - nowMs) / 864e5) : null);

/** The newest dated data check (tomorrow once prices are out, otherwise today). */
function latestCheck(status: Status, today: string): [string, AreaCheck[]] | null {
  const dates = Object.keys(status.generate ?? {}).filter((d) => d >= today).sort().reverse();
  return dates.length ? [dates[0], status.generate![dates[0]].areas] : null;
}

/** Everything that needs attention, worst first. Time-dependent checks are repeated live in the browser. */
export function problems(d: DashboardInput): Problem[] {
  const out: Problem[] = [];
  const nowMs = Date.parse(d.builtAt);
  if (!d.config.publish.enabled) out.push({ level: 'warn', text: 'Publisering er slått av i oppsettet (publish.enabled).' });
  if (d.controls.paused) out.push({ level: 'warn', text: 'Automatisk publisering er på pause. Trykk «Start igjen» når den skal gå som normalt.' });
  for (const f of d.status.publish?.failed ?? []) out.push({ level: 'bad', text: `Publisering av ${f.key} feilet: ${f.error}` });
  const latest = latestCheck(d.status, d.now.slice(0, 10));
  if (latest) {
    const [date, areas] = latest;
    for (const a of areas.filter((x) => !x.ok)) out.push({ level: 'bad', text: `${a.name} er utelatt fra innlegget for ${dayText(date)}: ${a.errors.join('; ')}` });
    for (const a of areas) for (const w of a.warnings) out.push({ level: 'warn', text: `${a.name}, ${dayText(date)}: ${w}` });
  }
  for (const l of latePosts(expectedPosts(d.config, d.now), d.published, d.controls, d.now)) out.push({ level: l.level, text: lateText(l), live: true });
  const days = tokenDaysLeft(d.tokenRefreshedAt, nowMs);
  if (days !== null && days <= 0) out.push({ level: 'bad', text: 'Instagram-tilgangen er utløpt. Lag en ny nøkkel og oppdater GitHub-secret INSTAGRAM_ACCESS_TOKEN.' });
  else if (days !== null && days <= 14) out.push({ level: 'warn', text: `Instagram-tilgangen utløper om ${days} dager. Den fornyes vanligvis automatisk; sjekk siste kjøring.` });
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}

const lateText = (e: Expected) => `${e.label} skulle vært publisert ${when(e.publishAt)} og er ikke publisert ennå.`;

const ago = (iso: string | undefined, nowMs: number) => {
  if (!iso) return 'aldri';
  const min = Math.round((nowMs - Date.parse(iso)) / 60000);
  if (min < 1) return 'nå nettopp';
  if (min < 60) return `${min} min siden`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} t siden` : `${Math.round(h / 24)} dager siden`;
};

const CSS = `
:root { color-scheme: light; --bg: #f3f5f8; --card: #ffffff; --line: #dde3eb; --text: #0c1b2e; --muted: #5b6b80; --accent: #f5c400; --navy: #0c1b2e;
  --ok: #15803d; --ok-bg: #dcfce7; --warn: #a15c00; --warn-bg: #fef3c7; --bad: #b91c1c; --bad-bg: #fee2e2; --cheap: #1a8a60; --dear: #a86a0b; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --bg: #0c1b2e; --card: #13263f; --line: #24395a; --text: #f2f5f9; --muted: #a9b8cc;
  --ok: #4ade80; --ok-bg: #12351f; --warn: #fbbf24; --warn-bg: #3a2c0a; --bad: #f87171; --bad-bg: #3b1515; --cheap: #1fa874; --dear: #d8962a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
a { color: inherit; }
header.top { background: var(--navy); color: #fff; padding: 14px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
.brand { display: flex; gap: 12px; align-items: center; }
.mark { width: 42px; height: 42px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.brand h1 { margin: 0; font-size: 18px; } .brand small { color: #a9b8cc; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
main { max-width: 900px; margin: 0 auto; padding: 16px; }
h2 { font-size: 17px; margin: 28px 0 10px; }
.btn { display: inline-flex; align-items: center; min-height: 40px; padding: 8px 14px; border-radius: 10px; border: 1px solid transparent; background: var(--navy); color: #fff; font: 600 14px/1 inherit; cursor: pointer; text-decoration: none; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .btn { background: var(--accent); color: #0c1b2e; } }
.btn.ghost { background: transparent; color: var(--text); border-color: var(--line); }
.btn.light { background: rgba(255,255,255,.12); color: #fff; border-color: rgba(255,255,255,.25); }
.btn.sm { min-height: 34px; padding: 6px 10px; font-size: 13px; }
.health { border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.health.ok { background: var(--ok-bg); color: var(--ok); font-weight: 600; }
.health .p { display: flex; gap: 8px; align-items: baseline; }
.health .p.bad { color: var(--bad); } .health .p.warn { color: var(--warn); }
.health.problems { background: var(--card); border: 1px solid var(--line); }
.tag { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; padding: 2px 6px; border-radius: 6px; flex: 0 0 auto; }
.tag.bad { background: var(--bad-bg); color: var(--bad); } .tag.warn { background: var(--warn-bg); color: var(--warn); } .tag.ok { background: var(--ok-bg); color: var(--ok); }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
@media (min-width: 640px) { .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.card .k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
.card .v { font-size: 20px; font-weight: 700; margin-top: 2px; }
.card .s { font-size: 13px; color: var(--muted); }
.v.ok { color: var(--ok); } .v.warn { color: var(--warn); } .v.bad { color: var(--bad); }
.unit { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px; margin-bottom: 10px; }
.unit.skipped { opacity: .55; }
.unit .t { font-weight: 700; } .unit .m { font-size: 13px; color: var(--muted); }
.strip { display: flex; gap: 6px; overflow-x: auto; margin: 10px 0; padding-bottom: 4px; }
.strip img { height: 120px; width: auto; border-radius: 6px; background: var(--navy); flex: 0 0 auto; }
.cap { font-size: 13px; white-space: pre-wrap; background: var(--bg); border-radius: 10px; padding: 8px 10px; max-height: 9em; overflow: auto; }
.btns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.tablewrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 9px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
th { font-size: 12px; color: var(--muted); font-weight: 600; }
tr:last-child td { border-bottom: 0; }
td.num { text-align: right; font-variant-numeric: tabular-nums; } th.num { text-align: right; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: 0; }
.list { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.list > div { padding: 9px 12px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 10px; font-size: 14px; }
.list > div:last-child { border-bottom: 0; }
.muted, .when { color: var(--muted); } .when { white-space: nowrap; font-size: 13px; }
.hint { font-size: 13px; color: var(--muted); }
form.settings { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
form.settings label { display: flex; gap: 10px; align-items: center; margin: 6px 0; }
form.settings input { width: 20px; height: 20px; }
details.help { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; margin-bottom: 8px; }
details.help summary { font-weight: 600; cursor: pointer; }
.banner { position: sticky; top: 0; z-index: 5; background: #1e3a8a; color: #fff; padding: 10px 16px; font-size: 14px; display: none; }
.banner.show { display: block; }
dialog { border: 0; border-radius: 16px; padding: 0; width: min(560px, calc(100vw - 32px)); background: var(--card); color: var(--text); }
dialog::backdrop { background: rgba(0,0,0,.5); }
dialog .in { padding: 16px; }
dialog textarea { width: 100%; min-height: 240px; font: 14px/1.45 inherit; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--text); }
`;

const BOLT = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" fill="#0c1b2e"/></svg>';

function unitBlock(u: Unit, d: DashboardInput): string {
  const c = d.controls;
  const skipped = c.skip.includes(u.key);
  const edited = u.kind === 'feed' && c.captions[u.key];
  const caption = edited ? c.captions[u.key] : u.caption;
  const due = u.publishAt <= d.now;
  const state = skipped ? '<span class="tag warn">Hoppes over</span>' : due ? '<span class="tag warn">Venter på neste kjøring</span>' : '';
  const data = esc(JSON.stringify({ key: u.key, caption: caption ?? '', original: u.caption ?? '', edited: !!edited }));
  const strip = u.images.map((img, i) => `<a href="${esc(`${u.dir}/${img}`)}" target="_blank" rel="noopener"><img src="${esc(`${u.dir}/${img}`)}" alt="Bilde ${i + 1}" loading="lazy"></a>`).join('');
  const label = u.dir.startsWith('uke') ? 'Uka som gikk' : `Strømpris ${dayText(u.date)}`;
  return `<div class="unit${skipped ? ' skipped' : ''}" data-unit="${data}">
<div class="t">${esc(label)} · ${u.kind === 'feed' ? 'innlegg' : 'story'}</div>
<div class="m">${esc(when(u.publishAt))} · ${u.images.length} bilde${u.images.length > 1 ? 'r' : ''} ${state} ${edited ? '<span class="tag ok">Tekst endret</span>' : ''}</div>
<div class="strip">${strip}</div>
${caption ? `<div class="cap">${esc(caption)}</div>` : ''}
<div class="btns">
<button class="btn sm" onclick="act({type:'publish-now',key:'${esc(u.key)}'}, 'Publisere dette på Instagram nå?')">Publiser nå</button>
${skipped ? `<button class="btn sm ghost" onclick="act({type:'unskip',key:'${esc(u.key)}'})">Angre hopp over</button>` : `<button class="btn sm ghost" onclick="act({type:'skip',key:'${esc(u.key)}'}, 'Hoppe over dette innlegget? Det publiseres ikke automatisk.')">Hopp over</button>`}
${u.kind === 'feed' ? `<button class="btn sm ghost" onclick="editCaption(this)">Rediger tekst</button>` : ''}
</div></div>`;
}

function priceTable(date: string, areas: AreaCheck[]): string {
  const ok = areas.filter((a) => a.ok);
  const lo = ok.length ? ok.reduce((a, b) => (b.avg! < a.avg! ? b : a)) : null;
  const hi = ok.length ? ok.reduce((a, b) => (b.avg! > a.avg! ? b : a)) : null;
  const rows = areas
    .map((a) => {
      const mark = a === lo ? '<span class="dot" style="background:var(--cheap)"></span>' : a === hi ? '<span class="dot" style="background:var(--dear)"></span>' : '<span class="dot" style="background:transparent"></span>';
      const check = a.ok ? `<span class="tag ok">${a.passed} OK</span>${a.warnings.length ? ' <span class="tag warn">Merknad</span>' : ''}` : `<span class="tag bad">Utelatt</span>`;
      return `<tr><td>${mark}${esc(a.name)}${a === lo ? ' <span class="muted">· billigst</span>' : a === hi ? ' <span class="muted">· dyrest</span>' : ''}</td>
<td class="num">${a.ok ? `${ore(a.avg!)} øre` : '–'}</td>
<td>${a.cheapest ? `kl. ${a.cheapest.from}–${a.cheapest.to} <span class="muted">(${ore(a.cheapest.avg)})</span>` : '–'}</td>
<td>${a.dearest ? `kl. ${a.dearest.from}–${a.dearest.to} <span class="muted">(${ore(a.dearest.avg)})</span>` : '–'}</td>
<td>${check}</td>
<td><a href="${esc(priceUrl(date, a.code))}" target="_blank" rel="noopener">Rådata ↗</a></td></tr>`;
    })
    .join('');
  return `<h3 style="font-size:15px;margin:14px 0 8px">${esc(dayText(date))}</h3><div class="tablewrap"><table>
<thead><tr><th>Landsdel</th><th class="num">Snitt</th><th>Billigste 3 t</th><th>Dyreste 3 t</th><th>Datasjekk</th><th>Kilde</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function dashboardPage(d: DashboardInput): string {
  const { config, controls: c, status: s } = d;
  const nowMs = Date.parse(d.builtAt);
  const today = d.now.slice(0, 10);
  const list = problems(d).filter((p) => !p.live);
  const actions = d.repo ? `https://github.com/${d.repo}/actions` : null;

  const health = list.length
    ? `<div class="health problems" id="health">${list.map((p) => `<div class="p ${p.level}"><span class="tag ${p.level}">${p.level === 'bad' ? 'Feil' : 'Obs'}</span><span>${esc(p.text)}</span></div>`).join('')}</div>`
    : `<div class="health ok" id="health"><div class="p">✓ Alt i orden</div></div>`;

  // Cards
  const tomorrow = addDays(today, 1);
  const nextPublished = !!d.published[`${tomorrow}-feed`];
  const latest = latestCheck(s, today);
  const okAreas = latest ? latest[1].filter((a) => a.ok).length : 0;
  const days = tokenDaysLeft(d.tokenRefreshedAt, nowMs);
  const card = (k: string, v: string, cls: string, sub = '', extra = '') => `<div class="card"><div class="k">${k}</div><div class="v ${cls}">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}${extra}</div>`;
  const cards = `<div class="cards">
${card('Autopilot', c.paused ? 'På pause' : config.publish.enabled ? 'På' : 'Av', c.paused || !config.publish.enabled ? 'warn' : 'ok', `daglig kl. ${esc(config.publish.time)}`, `<button class="btn sm ${c.paused ? '' : 'ghost'}" style="margin-top:8px" onclick="act({type:'${c.paused ? 'resume' : 'pause'}'}, '${c.paused ? 'Starte automatisk publisering igjen?' : 'Sette automatisk publisering på pause?'}')">${c.paused ? 'Start igjen' : 'Pause'}</button>`)}
${card('I morgen', nextPublished ? 'Publisert' : `Kl. ${esc(config.publish.time)}`, nextPublished ? 'ok' : '', esc(dayText(tomorrow)))}
${card('Data', latest ? `${okAreas}/${latest[1].length} landsdeler` : 'Venter', !latest ? '' : okAreas === latest[1].length ? 'ok' : 'bad', latest ? `${esc(dayText(latest[0]))} · ${latest[1].reduce((n, a) => n + a.passed, 0)} sjekker OK` : 'prisene kommer ca. kl. 13')}
${card('Instagram-tilgang', days === null ? 'Ukjent' : days > 0 ? `${days} dager` : 'Utløpt', days === null ? 'warn' : days > 14 ? 'ok' : days > 0 ? 'warn' : 'bad', 'fornyes automatisk hver uke')}
</div>`;

  const upcoming = d.units.filter((u) => !d.published[u.key] && d.now < u.expiresAt).sort((a, b) => a.publishAt.localeCompare(b.publishAt) || a.kind.localeCompare(b.kind));
  const prices = [tomorrow, today].filter((dt) => s.generate?.[dt]).map((dt) => priceTable(dt, s.generate![dt].areas)).join('');

  const pub = Object.entries(d.published).sort((a, b) => b[1].publishedAt.localeCompare(a[1].publishedAt)).slice(0, 12);
  const pubList = pub.length
    ? `<div class="list">${pub.map(([k, e]) => `<div><span>${esc(k.replace(/-(feed|story)$/, ''))} <span class="muted">${e.kind === 'story' ? `story · ${e.mediaIds.length} bilder` : 'innlegg'}</span></span><span class="when">${e.permalink ? `<a href="${esc(e.permalink)}" target="_blank" rel="noopener">Åpne ↗</a> · ` : ''}${esc(ago(e.publishedAt, nowMs))}</span></div>`).join('')}</div>`
    : '<p class="hint">Ingenting publisert ennå.</p>';
  const lastRun = s.publish ? `Siste kjøring ${esc(ago(s.publish.at, nowMs))}: ${s.publish.published.length ? `publiserte ${esc(s.publish.published.join(', '))}` : 'ingenting å publisere'}${s.publish.failed.length ? `, ${s.publish.failed.length} feilet` : ''}.` : '';

  const settings = `<form class="settings" onsubmit="saveSettings(event)">
<label><input type="checkbox" name="stories" ${config.publish.stories ? 'checked' : ''}> Publiser også stories (forsiden + én per landsdel)</label>
<label><input type="checkbox" name="weekly" ${config.weekly.enabled ? 'checked' : ''}> Ukeoppsummering på søndager (kl. ${esc(config.weekly.time)})</label>
<button class="btn" style="margin-top:10px">Lagre innstillinger</button>
</form>`;

  const log = c.log.length
    ? `<div class="list">${c.log.slice(0, 15).map((l) => `<div><span>${esc(l.action)} <span class="muted">– ${esc(l.by)}</span></span><span class="when">${esc(ago(l.at, nowMs))}</span></div>`).join('')}</div>`
    : '<p class="hint">Ingen endringer ennå.</p>';

  const help = `
<details class="help"><summary>Et innlegg er ikke publisert</summary><p>Systemet prøver kl. 14:15 og 16:15. GitHub kan starte kjøringene opptil en time forsinket. Er det fortsatt ikke ute: trykk «Publiser nå» på innlegget over, eller se feilmeldingen i ${actions ? `<a href="${esc(actions)}" target="_blank" rel="noopener">GitHub-kjøringene</a>` : 'GitHub-kjøringene'}.</p></details>
<details class="help"><summary>En landsdel er utelatt</summary><p>Prisene for den landsdelen besto ikke datasjekken (for eksempel manglende timer eller feil valutakurs), så den ble holdt utenfor i stedet for å vise feil tall. De andre landsdelene publiseres som normalt. Se rådata-lenken i tabellen. Kommer riktige data senere, tas landsdelen med i neste kjøring – men et innlegg som allerede er publisert, endres ikke.</p></details>
<details class="help"><summary>Noe feil er publisert</summary><p>Slett innlegget i Instagram-appen. Det publiseres ikke på nytt automatisk (det står i publiseringsloggen). Trykk «Pause» hvis du vil stoppe videre publisering mens du ser på det.</p></details>
<details class="help"><summary>Instagram-tilgangen er utløpt</summary><p>Lag en ny nøkkel i Meta-appen (Instagram → API-oppsett → Generer token) og legg den inn som GitHub-secret <code>INSTAGRAM_ACCESS_TOKEN</code>. Neste kjøring tar den i bruk.</p></details>`;

  const expected = expectedPosts(config, d.now).map((e) => ({ ...e, done: !!d.published[e.key], skipped: c.skip.includes(e.key) }));
  const live = { expected, paused: c.paused, builtAt: d.builtAt, lateWarn: LATE_WARN, lateBad: LATE_BAD };

  return `<!doctype html>
<html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Strøm i morgen – dashboard</title><meta name="theme-color" content="#0c1b2e"><style>${CSS}</style></head>
<body><div class="banner" id="banner"></div>
<header class="top"><div class="brand"><div class="mark">${BOLT}</div><div><h1>${esc(config.brand.name)} · Dashboard</h1><small>${config.mode === 'national' ? 'Hele Norge, alle landsdeler' : esc(config.area.name)}</small></div></div>
<div class="toolbar">${actions ? `<a class="btn light" href="${esc(actions)}" target="_blank" rel="noopener">GitHub-kjøringer</a>` : ''}</div></header>
<main>
${health}
<div id="live"></div>
${cards}
<h2>Neste innlegg</h2>${upcoming.length ? upcoming.map((u) => unitBlock(u, d)).join('') : `<p class="hint">Ingenting venter akkurat nå. Prisene for i morgen kommer ca. kl. 13, og innlegget lages ved neste kjøring.</p>`}
<h2>Priser og datasjekk</h2>${prices || '<p class="hint">Ingen priser hentet ennå.</p>'}
<p class="hint">Snitt per landsdel i øre/kWh, spotpris inkl. mva (Nord-Norge uten mva). Hver landsdel sjekkes for sammenhengende timer, rimelige verdier og at kronebeløpet stemmer med euro × kursen fra Norges Bank. Grønn prikk = billigst, oransje = dyrest.</p>
<h2>Publisert</h2>${pubList}${lastRun ? `<p class="hint">${lastRun}</p>` : ''}
<h2>Innstillinger</h2>${settings}
<h2>Aktivitetslogg</h2>${log}
<h2>Hvis noe skjer</h2>${help}
<h2>Kilder</h2><div class="list">
<div><a href="${esc(config.source.url)}" target="_blank" rel="noopener">${esc(config.source.name)}</a><span class="when">strømpriser per time</span></div>
<div><a href="https://www.norges-bank.no/tema/Statistikk/Valutakurser/" target="_blank" rel="noopener">Norges Bank</a><span class="when">valutakurs euro → kroner (kontroll)</span></div>
${actions ? `<div><a href="${esc(actions)}" target="_blank" rel="noopener">GitHub Actions</a><span class="when">kjøringer og feillogg</span></div>` : ''}
</div>
<p class="hint">Sist oppdatert ${esc(new Date(d.builtAt).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' }))}. Endringer du gjør her lagres i loggen med e-postadressen din.</p>
</main>
<dialog id="capDialog"><div class="in"><h3 style="margin:0 0 8px">Rediger tekst</h3>
<textarea id="capText" maxlength="${MAX_CAPTION}" oninput="document.getElementById('capCount').textContent=this.value.length"></textarea>
<div class="hint" style="margin:4px 0"><span id="capCount">0</span>/${MAX_CAPTION} tegn. Sjekk at tallene stemmer med bildene.</div>
<div class="hint" style="margin:8px 0 0">Automatisk tekst:</div><div class="cap" id="capOrig"></div>
<div class="btns"><button class="btn" onclick="saveCaption()">Lagre</button><button class="btn ghost" id="capReset" onclick="resetCaption()">Bruk automatisk tekst</button><button class="btn ghost" onclick="capDialog.close()">Avbryt</button></div>
</div></dialog>
<script>const LIVE = ${JSON.stringify(live).replace(/</g, '\\u003c')};${JS}</script>
</body></html>`;
}

// Live checks in the browser: a post that is late now, and a page that has not been updated for a day.
const JS = `
function osloNow() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T'); }
function addMin(t, m) { const d = new Date(t + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + m); return d.toISOString().slice(0, 16); }
function liveChecks() {
  const now = osloNow(); const out = [];
  if (!LIVE.paused) for (const e of LIVE.expected) {
    if (e.done || e.skipped || now >= e.expiresAt || now < addMin(e.publishAt, LIVE.lateWarn)) continue;
    const bad = now >= addMin(e.publishAt, LIVE.lateBad);
    out.push([bad ? 'bad' : 'warn', e.label + ' skulle vært publisert kl. ' + e.publishAt.slice(11) + ' og er ikke publisert' + (bad ? '. Trykk «Publiser nå» eller se GitHub-kjøringene.' : ' ennå. Neste forsøk kl. 16:15.')]);
  }
  if (Date.now() - Date.parse(LIVE.builtAt) > 26 * 3600e3) out.push(['bad', 'Siden er ikke oppdatert på over et døgn. Kjøringene i GitHub kan ha stoppet.']);
  if (!out.length) return;
  const h = document.getElementById('health');
  if (h.classList.contains('ok')) { h.className = 'health problems'; h.innerHTML = ''; }
  for (const [lvl, text] of out) {
    const p = document.createElement('div'); p.className = 'p ' + lvl;
    p.innerHTML = '<span class="tag ' + lvl + '">' + (lvl === 'bad' ? 'Feil' : 'Obs') + '</span>';
    const s = document.createElement('span'); s.textContent = text; p.appendChild(s); h.prepend(p);
  }
}
liveChecks();
function banner(t) { const b = document.getElementById('banner'); b.textContent = t; b.classList.add('show'); }
async function act(action, question) {
  if (question && !confirm(question)) return;
  let r;
  try { r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); }
  catch { alert('Knappene virker bare på det publiserte dashboardet.'); return; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { alert(j.error || 'Noe gikk galt.'); return; }
  banner('Sendt ✓ Endringen er tatt imot og vises her om ca. 3–5 minutter' + (action.type === 'publish-now' ? ' (innlegget publiseres da).' : '.'));
}
let current = null;
function editCaption(btn) {
  current = JSON.parse(btn.closest('.unit').dataset.unit);
  const t = document.getElementById('capText'); t.value = current.caption;
  document.getElementById('capCount').textContent = t.value.length;
  document.getElementById('capOrig').textContent = current.original;
  document.getElementById('capReset').style.display = current.edited ? '' : 'none';
  document.getElementById('capDialog').showModal();
}
function saveCaption() { const text = document.getElementById('capText').value; document.getElementById('capDialog').close(); act({ type: 'caption', key: current.key, text }); }
function resetCaption() { document.getElementById('capDialog').close(); act({ type: 'caption', key: current.key, text: null }); }
function saveSettings(e) { e.preventDefault(); const f = e.target; act({ type: 'settings', settings: { stories: f.stories.checked, weekly: f.weekly.checked } }); }
`;
