import type { Config } from './config.ts';
import type { DayStats } from './data/prices.ts';

export interface Cost {
  name: string;
  detail: string;
  /** Kroner in the cheapest and the most expensive window (spot price incl. VAT only). */
  cheap: number;
  dear: number;
}

/** Everyday uses in kroner: consumption × average price in the cheapest / most expensive window. */
export const costs = (s: DayStats, config: Config): Cost[] =>
  config.appliances.map((a) => ({ name: a.name, detail: a.detail, cheap: (a.kwh * s.cheapest.avg) / 100, dear: (a.kwh * s.dearest.avg) / 100 }));

/** "13 kr", "2,40 kr", "0,45 kr". */
export const kr = (n: number) => (Math.abs(n) >= 10 ? `${Math.round(n)} kr` : `${n.toFixed(2).replace('.', ',')} kr`);
