// Sunday, national: the week's average per area, with the change from the week before and the cheapest day.

import type { Config } from '../config.ts';
import { dateText } from '../caption.ts';
import { ore } from '../data/prices.ts';
import type { Format } from './render.ts';
import { Slide, TEXT } from './ui.tsx';
import { weekChangeText, type WeekSummary } from './weekly.tsx';

export interface AreaWeek {
  name: string;
  code: string;
  week: WeekSummary;
}

export function WeeklyNational({ areas, config, format }: { areas: AreaWeek[]; config: Config; format: Format }) {
  const c = config.colors;
  const story = format === 'story';
  const w0 = areas[0].week;
  const max = Math.max(...areas.map((a) => a.week.avg), 1);
  const lo = areas.reduce((a, b) => (b.week.avg < a.week.avg ? b : a));
  const hi = areas.reduce((a, b) => (b.week.avg > a.week.avg ? b : a));
  return (
    <Slide
      config={config}
      format={format}
      kicker={`Uke ${w0.week} · ${dateText(w0.days[0].date)} – ${dateText(w0.days[6].date)} · hele Norge`}
      title="Uka som"
      accentTitle="gikk"
      footnote={`Snitt per landsdel for uka, øre/kWh inkl. mva (Nord-Norge uten mva), uten nettleie og påslag. ${config.source.attribution}.`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: story ? 30 : 22, marginTop: story ? 50 : 34, backgroundColor: c.panel, borderRadius: 16, padding: '24px 26px' }}>
        {areas.map((a) => {
          const tone = a === lo ? c.cheap : a === hi ? c.expensive : c.bar;
          return (
            <div key={a.code} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: 300, flexShrink: 0 }}>
                <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 29 }}>{a.name}</span>
                <span style={{ fontFamily: TEXT, fontSize: 18, color: c.muted }}>{weekChangeText(a.week) ?? 'første uke'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: Math.max(4, (Math.max(a.week.avg, 0) / max) * 380), height: 24, backgroundColor: tone, borderRadius: '0 4px 4px 0' }} />
                <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, whiteSpace: 'nowrap' }}>{`${ore(a.week.avg)} øre`}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', marginTop: story ? 40 : 26, borderLeft: `6px solid ${c.cheap}`, paddingLeft: 16 }}>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: story ? 30 : 26 }}>{`Billigst: ${lo.name} (${ore(lo.week.avg)} øre) · dyrest: ${hi.name} (${ore(hi.week.avg)} øre)`}</span>
      </div>
    </Slide>
  );
}
