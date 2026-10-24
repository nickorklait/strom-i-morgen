// Image 1 of the national post: tomorrow in every area. A bar per area (average), cheapest area green and
// dearest amber (both also named in text), and each area's cheapest hours underneath its name.

import type { Config } from '../config.ts';
import { dateText, dayName } from '../caption.ts';
import { ore } from '../data/prices.ts';
import { cheapestArea, dearestArea, type AreaDay } from '../national.ts';
import type { Format } from './render.ts';
import { Slide, TEXT } from './ui.tsx';

export function Cover({ date, days, config, format }: { date: string; days: AreaDay[]; config: Config; format: Format }) {
  const c = config.colors;
  const story = format === 'story';
  const lo = cheapestArea(days);
  const hi = dearestArea(days);
  const max = Math.max(...days.map((d) => d.stats.avg), 1);
  const trackW = 380;
  return (
    <Slide
      config={config}
      format={format}
      kicker={`${dayName(date)} ${dateText(date)} · hele Norge`}
      title="Strøm i"
      accentTitle="morgen"
      footnote={`Snitt per landsdel, øre/kWh inkl. mva (Nord-Norge uten mva), uten nettleie og påslag. ${config.source.attribution}.`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: story ? 30 : 20, marginTop: story ? 50 : 32, backgroundColor: c.panel, borderRadius: 16, padding: '24px 26px' }}>
        {days.map((d) => {
          const tone = d === lo ? c.cheap : d === hi ? c.expensive : c.bar;
          const note = d === lo ? 'Billigst i landet' : d === hi ? 'Dyrest i landet' : null;
          return (
            <div key={d.config.area.code} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: 300, flexShrink: 0 }}>
                <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 29 }}>{d.config.area.name}</span>
                <span style={{ fontFamily: TEXT, fontSize: 18, color: c.muted }}>{`billigst kl. ${d.stats.cheapest.from}–${d.stats.cheapest.to}`}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: Math.max(4, (Math.max(d.stats.avg, 0) / max) * trackW), height: 24, backgroundColor: tone, borderRadius: '0 4px 4px 0' }} />
                  <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, whiteSpace: 'nowrap' }}>{`${ore(d.stats.avg)} øre`}</span>
                </div>
                {note && <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 17, color: c.muted }}>{note}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', marginTop: story ? 40 : 26, borderLeft: `6px solid ${c.accent}`, paddingLeft: 16 }}>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: story ? 32 : 28 }}>{story ? 'Trykk videre for din landsdel' : 'Sveip for din landsdel'}</span>
      </div>
    </Slide>
  );
}
