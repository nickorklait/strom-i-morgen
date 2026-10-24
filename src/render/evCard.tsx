// Last image of the national post: charging an EV tomorrow in every area, cheapest vs most expensive window.
// A table: the job is comparing two amounts per row; the saving is spelled out.

import type { Config } from '../config.ts';
import { dateText, dayName } from '../caption.ts';
import { kr } from '../costs.ts';
import type { AreaDay } from '../national.ts';
import type { Format } from './render.ts';
import { Slide, TEXT } from './ui.tsx';

export function EvCard({ date, days, config, format }: { date: string; days: AreaDay[]; config: Config; format: Format }) {
  const c = config.colors;
  const story = format === 'story';
  const ev = config.appliances[0];
  const col = (label: string, marker: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 230, justifyContent: 'flex-end' }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: marker }} />
      <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 20 }}>{label}</span>
    </div>
  );
  return (
    <Slide
      config={config}
      format={format}
      kicker={`${dayName(date)} ${dateText(date)} · ${ev.name.toLowerCase()} ${ev.detail}`}
      title="Lade elbilen"
      accentTitle="i morgen"
      footnote={`Kun strømprisen (spot inkl. mva, Nord-Norge uten mva) – nettleie og påslag kommer i tillegg. Billigste/dyreste ${config.cheapWindowHours} timer i strekk. ${config.source.attribution}.`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: story ? 50 : 34, backgroundColor: c.panel, borderRadius: 16, padding: '20px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12, borderBottom: `1px solid ${c.line}` }}>
          <span style={{ flex: 1, fontFamily: TEXT, fontWeight: 600, fontSize: 20, color: c.muted }}>Landsdel</span>
          {col('Billigst', c.cheap)}
          {col('Dyrest', c.expensive)}
        </div>
        {days.map((d) => {
          const cost = d.extras.costs[0];
          return (
            <div key={d.config.area.code} style={{ display: 'flex', alignItems: 'center', padding: `${story ? 22 : 16}px 0`, borderBottom: `1px solid ${c.line}` }}>
              <span style={{ flex: 1, fontFamily: TEXT, fontWeight: 600, fontSize: 29 }}>{d.config.area.name}</span>
              <div style={{ display: 'flex', flexDirection: 'column', width: 230, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32 }}>{kr(cost.cheap)}</span>
                <span style={{ fontFamily: TEXT, fontSize: 17, color: c.muted }}>{`kl. ${d.stats.cheapest.from}–${d.stats.cheapest.to}`}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', width: 230, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32, color: c.muted }}>{kr(cost.dear)}</span>
                <span style={{ fontFamily: TEXT, fontSize: 17, color: c.muted }}>{`kl. ${d.stats.dearest.from}–${d.stats.dearest.to}`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Slide>
  );
}
