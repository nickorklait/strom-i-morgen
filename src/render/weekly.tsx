// "Uka som gikk" (Sunday): the week's daily averages as 7 bars, cheapest day green, dearest amber,
// with the week average and the change from the week before.

import type { Config } from '../config.ts';
import { dateText } from '../caption.ts';
import { ore } from '../data/prices.ts';
import type { Format } from './render.ts';
import { Slide, TEXT, Tile } from './ui.tsx';

export interface WeekDay {
  date: string;
  /** "Man", "Tir", ... */
  short: string;
  avg: number;
}

export interface WeekSummary {
  week: number;
  days: WeekDay[];
  avg: number;
  prevAvg: number | null;
  cheapest: WeekDay;
  dearest: WeekDay;
}

/** "−12 % fra uka før" / "+8 % fra uka før". */
export const weekChangeText = (w: WeekSummary) => {
  if (w.prevAvg === null || w.prevAvg <= 0) return null;
  const pct = Math.round(((w.avg - w.prevAvg) / w.prevAvg) * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)} % fra uka før`;
};

export function Weekly({ w, config, format }: { w: WeekSummary; config: Config; format: Format }) {
  const c = config.colors;
  const story = format === 'story';
  const chartH = story ? 600 : 500;
  const dm = (d: WeekDay) => `${d.short} ${Number(d.date.slice(8, 10))}.${Number(d.date.slice(5, 7))}`;
  const max = Math.max(...w.days.map((d) => d.avg), 1) * 1.15;
  const first = w.days[0].date;
  const last = w.days[w.days.length - 1].date;
  return (
    <Slide
      config={config}
      format={format}
      kicker={`Uke ${w.week} · ${dateText(first)} – ${dateText(last)} · ${config.area.name}`}
      title="Uka som"
      accentTitle="gikk"
      footnote={`Snittpris per dag, øre/kWh inkl. mva, uten nettleie og påslag. ${config.source.attribution}.`}
    >
      <div style={{ display: 'flex', gap: 12, marginTop: story ? 50 : 34 }}>
        <Tile c={c} label="Snitt uka" value={`${ore(w.avg)} øre`} sub={weekChangeText(w) ?? undefined} />
        <Tile c={c} label="Billigst" marker={c.cheap} value={`${ore(w.cheapest.avg)} øre`} sub={dm(w.cheapest)} />
        <Tile c={c} label="Dyrest" marker={c.expensive} value={`${ore(w.dearest.avg)} øre`} sub={dm(w.dearest)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: story ? 44 : 26, backgroundColor: c.panel, borderRadius: 16, padding: '24px 24px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: chartH, borderBottom: `1px solid ${c.muted}` }}>
          {w.days.map((d) => {
            const isMin = d === w.cheapest;
            const isMax = d === w.dearest;
            return (
              <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: chartH }}>
                {(isMin || isMax) && <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 22, marginBottom: 8 }}>{ore(d.avg)}</span>}
                <div style={{ width: 24, height: Math.max(2, (Math.max(d.avg, 0) / max) * (chartH - 40)), backgroundColor: isMin ? c.cheap : isMax ? c.expensive : c.bar, borderRadius: '4px 4px 0 0' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10 }}>
          {w.days.map((d) => (
            <span key={d.date} style={{ width: 60, textAlign: 'center', fontFamily: TEXT, fontSize: 18, color: c.muted }}>{d.short}</span>
          ))}
        </div>
      </div>
    </Slide>
  );
}
