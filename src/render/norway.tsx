// "Hele Norge i morgen": the five price areas, north to south, as horizontal bars.
// Our own area is the only coloured bar (accent); the others are neutral. Values are labelled at the bar end.

import type { Config } from '../config.ts';
import { dateText, dayName } from '../caption.ts';
import { ore } from '../data/prices.ts';
import type { Format } from './render.ts';
import { Slide, TEXT } from './ui.tsx';

export interface AreaAverage {
  code: string;
  name: string;
  avg: number;
  vat: number;
}

/** "Vestlandet betaler 54 øre mer enn Nord-Norge" (difference between the dearest and cheapest area). */
export function spreadText(areas: AreaAverage[]): string | null {
  if (areas.length < 2) return null;
  const lo = areas.reduce((a, b) => (b.avg < a.avg ? b : a));
  const hi = areas.reduce((a, b) => (b.avg > a.avg ? b : a));
  const diff = ore(hi.avg) - ore(lo.avg);
  return diff >= 5 ? `${hi.name} betaler ${diff} øre mer enn ${lo.name}` : 'Nesten lik pris i hele landet';
}

export function Norway({ date, areas, config, format }: { date: string; areas: AreaAverage[]; config: Config; format: Format }) {
  const c = config.colors;
  const story = format === 'story';
  const max = Math.max(...areas.map((a) => a.avg), 1);
  const trackW = 480;
  const spread = spreadText(areas);
  return (
    <Slide
      config={config}
      format={format}
      kicker={`${dayName(date)} ${dateText(date)}`}
      title="Hele Norge"
      accentTitle="i morgen"
      footnote={`Snittpris per landsdel, øre/kWh inkl. mva (Nord-Norge har ikke mva). Uten nettleie og påslag. ${config.source.attribution}.`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: story ? 34 : 24, marginTop: story ? 60 : 40, backgroundColor: c.panel, borderRadius: 16, padding: '28px 28px' }}>
        {areas.map((a) => {
          const own = a.code === config.area.code;
          const w = Math.max(4, (Math.max(a.avg, 0) / max) * trackW);
          return (
            <div key={a.code} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: 230, flexShrink: 0 }}>
                <span style={{ fontFamily: TEXT, fontWeight: own ? 800 : 600, fontSize: 30 }}>{a.name}</span>
                <span style={{ fontFamily: TEXT, fontSize: 17, color: c.muted }}>{a.code}{a.vat === 0 ? ' · uten mva' : ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: w, height: 24, backgroundColor: own ? c.accent : c.bar, borderRadius: '0 4px 4px 0' }} />
                <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, color: c.text, whiteSpace: 'nowrap' }}>{`${ore(a.avg)} øre`}</span>
              </div>
            </div>
          );
        })}
      </div>
      {spread && (
        <div style={{ display: 'flex', marginTop: story ? 44 : 30, borderLeft: `6px solid ${c.accent}`, paddingLeft: 16 }}>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: story ? 32 : 28 }}>{spread}</span>
        </div>
      )}
    </Slide>
  );
}
