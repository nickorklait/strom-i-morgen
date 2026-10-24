import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Which account to run for: STROM_PROFILE=norge (all areas in one account, the default) or no1 … no5 (one area).
 * config/config.json holds the shared settings; config/profiles/<profile>.json the area-specific ones.
 * Each profile has its own images, publish log and Instagram token; the price cache is shared.
 */
export const PROFILE = (process.env.STROM_PROFILE ?? 'norge').toLowerCase();
if (!/^[a-z0-9-]+$/.test(PROFILE)) throw new Error(`Invalid STROM_PROFILE "${PROFILE}"`);

export const paths = {
  prices: path.join(ROOT, 'data', 'prices'),
  fonts: path.join(ROOT, 'assets', 'fonts'),
  output: path.join(ROOT, 'output', PROFILE),
  /** Publish log and encrypted token for this profile. */
  state: path.join(ROOT, 'data', PROFILE),
};

export interface Config {
  /** "national": one account for all areas (carousel per area). "area" (default): one account per area. */
  mode?: 'area' | 'national';
  /** National mode: the order of the areas in the post. */
  national?: { order: string[] };
  brand: { name: string; tagline: string; hashtags: string[] };
  /** Price area (NO1–NO5), its display name and VAT rate (NO4 has none). */
  area: { code: string; name: string; vat: number };
  /** Length of the "cheapest window" suggested for washing, charging etc. */
  cheapWindowHours: number;
  source: { name: string; url: string; attribution: string; userAgent: string; short: string };
  colors: { surface: string; panel: string; line: string; text: string; muted: string; accent: string; bar: string; cheap: string; expensive: string };
  sponsor: { label: string; text: string };
  /** Everyday uses turned into kroner (approximate consumption, stated on the image). */
  appliances: { name: string; detail: string; kwh: number }[];
  /** "Cheapest day since …": how far back to look, and the minimum gap worth mentioning. */
  history: { lookbackDays: number; minGapDays: number };
  /** All price areas, north to south (for the "Hele Norge" slide). NO4 has no VAT. */
  areas: { code: string; name: string; vat: number }[];
  /** Sunday summary of the week: published on Sunday between these times. */
  weekly: { enabled: boolean; time: string; lastUsefulTime: string };
  publish: {
    /** Nothing is sent to Instagram unless true. */
    enabled: boolean;
    apiVersion: string;
    stories: boolean;
    /** Publish from this time the day before (prices are out ~13:00). */
    time: string;
    /** Do not publish after this time on the day itself (old news by then). */
    lastUsefulTime: string;
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function merge<T>(base: T, over: unknown): T {
  if (!isObject(base) || !isObject(over)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObject(v) && isObject(out[k]) ? merge(out[k], v) : v;
  return out as T;
}

export function loadConfig(profile = PROFILE): Config {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'config.json'), 'utf8')) as Config;
  const file = path.join(ROOT, 'config', 'profiles', `${profile}.json`);
  return fs.existsSync(file) ? merge(base, JSON.parse(fs.readFileSync(file, 'utf8'))) : base;
}

/** "inkl. mva", or for areas without VAT (Nord-Norge) "uten mva". */
export const vatShort = (c: Config) => (c.area.vat > 0 ? 'inkl. mva' : 'uten mva');
/** "Spotpris inkl. mva, uten nettleie og påslag" (or "… uten mva (Nord-Norge har ikke mva) …"). */
export const priceBasis = (c: Config) => (c.area.vat > 0 ? 'Spotpris inkl. mva, uten nettleie og påslag' : 'Spotpris uten mva (ingen mva i Nord-Norge), uten nettleie og påslag');
