import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.ts';

/** One area's data check for a date, as shown on the dashboard. */
export interface AreaCheck {
  code: string;
  name: string;
  ok: boolean;
  /** Number of checks passed. */
  passed: number;
  errors: string[];
  warnings: string[];
  /** Averages and windows (øre), when the data passed. */
  avg?: number;
  cheapest?: { from: string; to: string; avg: number };
  dearest?: { from: string; to: string; avg: number };
}

/** Outcome of the last generate / publish, shown on the dashboard. Committed in the cloud. */
export interface Status {
  /** Per date (newest kept): which areas were built and how the data checks went. */
  generate?: Record<string, { at: string; areas: AreaCheck[] }>;
  publish?: { at: string; paused: boolean; published: string[]; failed: { key: string; error: string }[]; skipped: string[] };
}

const FILE = () => path.join(paths.state, 'status.json');
const KEEP_DATES = 7;

export function readStatus(): Status {
  return fs.existsSync(FILE()) ? JSON.parse(fs.readFileSync(FILE(), 'utf8')) : {};
}

function write(s: Status): void {
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(s, null, 2) + '\n');
}

export function recordGenerate(date: string, areas: AreaCheck[]): void {
  const s = readStatus();
  const all = { ...s.generate, [date]: { at: new Date().toISOString(), areas } };
  s.generate = Object.fromEntries(Object.entries(all).sort(([a], [b]) => b.localeCompare(a)).slice(0, KEEP_DATES));
  write(s);
}

export function recordPublish(p: Omit<NonNullable<Status['publish']>, 'at'>): void {
  const s = readStatus();
  s.publish = { at: new Date().toISOString(), ...p };
  write(s);
}
