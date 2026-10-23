// Slide 2: "Hva koster det i morgen?" Everyday uses in kroner, cheapest vs most expensive window.
// A table, not a chart: the job is comparing two numbers per row, and the saving is spelled out.

import type { Config } from '../config.ts';
import { dateText, dayName } from '../caption.ts';
import { kr, type Cost } from '../costs.ts';
import type { DayStats } from '../data/prices.ts';
import { SIZES, type Format } from './render.ts';

const DISPLAY = 'Barlow Condensed';
const TEXT = 'Inter';

export function CostCard({ date, s, items, config, format }: { date: string; s: DayStats; items: Cost[]; config: Config; format: Format }) {
  const c = config.colors;
  const { width, height } = SIZES[format];
  const story = format === 'story';
  const pad = 56;
  const head = (label: string, sub: string, marker: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 220, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: marker }} />
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 21, color: c.text }}>{label}</span>
      </div>
      <span style={{ fontFamily: TEXT, fontSize: 18, color: c.muted }}>{sub}</span>
    </div>
  );
  const ev = items[0];
  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', backgroundColor: c.surface, color: c.text, fontFamily: TEXT }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: `${story ? 200 : 60}px ${pad}px 0` }}>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 24, letterSpacing: 3, color: c.muted, textTransform: 'uppercase' }}>{`${dayName(date)} ${dateText(date)}`}</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 120 : 104, lineHeight: 0.9, textTransform: 'uppercase', marginTop: 10 }}>Hva koster</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 120 : 104, lineHeight: 0.9, textTransform: 'uppercase', color: c.accent }}>det i morgen?</span>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: story ? 56 : 40, backgroundColor: c.panel, borderRadius: 16, padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 14, borderBottom: `1px solid ${c.line}` }}>
            <span style={{ flex: 1, fontFamily: TEXT, fontWeight: 600, fontSize: 21, color: c.muted }}>Strømdelen</span>
            {head(`Billigste ${config.cheapWindowHours} t`, `kl. ${s.cheapest.from}–${s.cheapest.to}`, c.cheap)}
            {head(`Dyreste ${config.cheapWindowHours} t`, `kl. ${s.dearest.from}–${s.dearest.to}`, c.expensive)}
          </div>
          {items.map((it) => (
            <div key={it.name} style={{ display: 'flex', alignItems: 'center', padding: `${story ? 26 : 20}px 0`, borderBottom: `1px solid ${c.line}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32 }}>{it.name}</span>
                <span style={{ fontFamily: TEXT, fontSize: 19, color: c.muted }}>{it.detail}</span>
              </div>
              <span style={{ width: 220, textAlign: 'right', fontFamily: TEXT, fontWeight: 600, fontSize: 38 }}>{kr(it.cheap)}</span>
              <span style={{ width: 220, textAlign: 'right', fontFamily: TEXT, fontWeight: 600, fontSize: 38, color: c.muted }}>{kr(it.dear)}</span>
            </div>
          ))}
        </div>

        {ev && ev.dear - ev.cheap >= 1 && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: story ? 44 : 30, borderLeft: `6px solid ${c.cheap}`, paddingLeft: 16 }}>
            <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: story ? 32 : 28 }}>{`${ev.name} kl. ${s.cheapest.from}–${s.cheapest.to} og spar ca. ${kr(ev.dear - ev.cheap)}`}</span>
          </div>
        )}

        <span style={{ fontFamily: TEXT, fontSize: 18, color: c.muted, marginTop: 'auto', marginBottom: 14, lineHeight: 1.4 }}>
          {`Kun strømprisen (spot inkl. mva) – nettleie og påslag kommer i tillegg. Forbruket er omtrentlig. ${config.source.attribution}.`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, backgroundColor: '#ffffff', padding: `20px ${pad}px`, marginBottom: story ? 190 : 0 }}>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 15, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase' }}>{config.sponsor.label}</span>
        <div style={{ display: 'flex', flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', border: `3px dashed ${c.surface}`, borderRadius: 12 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, color: c.surface, textTransform: 'uppercase' }}>{config.sponsor.text}</span>
        </div>
      </div>
    </div>
  );
}
