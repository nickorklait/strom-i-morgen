import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const paths = {
  prices: path.join(ROOT, 'data', 'prices'),
  fonts: path.join(ROOT, 'assets', 'fonts'),
  output: path.join(ROOT, 'output'),
};

export interface Config {
  brand: { name: string; tagline: string; hashtags: string[] };
  /** Price area (NO1–NO5), its display name and VAT rate (NO4 has none). */
  area: { code: string; name: string; vat: number };
  /** Length of the "cheapest window" suggested for washing, charging etc. */
  cheapWindowHours: number;
  source: { name: string; url: string; attribution: string; userAgent: string };
  colors: { surface: string; panel: string; line: string; text: string; muted: string; accent: string; bar: string; cheap: string; expensive: string };
  sponsor: { label: string; text: string };
  /** Everyday uses turned into kroner (approximate consumption, stated on the image). */
  appliances: { name: string; detail: string; kwh: number }[];
  /** "Cheapest day since …": how far back to look, and the minimum gap worth mentioning. */
  history: { lookbackDays: number; minGapDays: number };
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

export const loadConfig = (): Config => JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'config.json'), 'utf8'));
