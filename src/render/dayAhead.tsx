// "Strøm i morgen": tomorrow's hourly prices as a bar chart with the key numbers.
// Chart rules: bars <= 24px with a 4px rounded top and square base, 1px solid recessive gridlines,
// neutral bars with only two highlights (cheapest window, most expensive hour), always labelled in text.

import type { Config } from '../config.ts';
import { dateText, dayName, changeText } from '../caption.ts';
import { endHour, ore, type DayStats, type HourPrice } from '../data/prices.ts';
import { SIZES, type Format } from './render.ts';

const DISPLAY = 'Barlow Condensed';
const TEXT = 'Inter';

function Bolt({ size, c }: { size: number; c: Config['colors'] }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size, backgroundColor: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">
        <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" fill={c.surface} />
      </svg>
    </div>
  );
}

function Tile({ label, value, sub, marker, c, scale }: { label: string; value: string; sub: string; marker?: string; c: Config['colors']; scale: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: c.panel, borderRadius: 16, padding: `${16 * scale}px ${18 * scale}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {marker && <div style={{ width: 12 * scale, height: 12 * scale, borderRadius: 3, backgroundColor: marker }} />}
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 20 * scale, color: c.muted }}>{label}</span>
      </div>
      <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 46 * scale, color: c.text, marginTop: 2 }}>{value}</span>
      <span style={{ fontFamily: TEXT, fontSize: 19 * scale, color: c.muted }}>{sub}</span>
    </div>
  );
}

/** A round step for gridlines: 10, 20, 25, 50, 100, ... */
function niceStep(range: number, lines = 4): number {
  const raw = range / lines;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}

function Chart({ hours, s, c, width, height }: { hours: HourPrice[]; s: DayStats; c: Config['colors']; width: number; height: number }) {
  const axisW = 54;
  const xAxisH = 34;
  const plotW = width - axisW;
  const plotH = height - xAxisH;
  const lo = Math.min(0, s.min.ore);
  const step = niceStep(Math.max(s.max.ore, 1) - lo);
  const top = Math.ceil((s.max.ore * 1.12) / step) * step;
  const bottom = lo < 0 ? Math.floor(lo / step) * step : 0;
  const y = (v: number) => plotH - ((v - bottom) / (top - bottom)) * plotH;
  const slot = plotW / hours.length;
  const barW = Math.min(24, slot - 6);
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 0.001; v += step) ticks.push(v);
  const cheap = new Set(s.cheapest.indexes);
  const maxIdx = hours.indexOf(s.max);
  const minIdx = hours.indexOf(s.min);

  return (
    <div style={{ display: 'flex', position: 'relative', width, height }}>
      {/* gridlines + y labels */}
      {ticks.map((v) => (
        <div key={`g${v}`} style={{ position: 'absolute', left: 0, top: y(v) - 10, width, height: 20, display: 'flex', alignItems: 'center' }}>
          <span style={{ width: axisW - 10, textAlign: 'right', fontFamily: TEXT, fontSize: 16, color: c.muted }}>{Math.round(v)}</span>
          <div style={{ marginLeft: 10, flex: 1, height: 1, backgroundColor: v === 0 ? c.muted : c.line }} />
        </div>
      ))}
      {/* bars */}
      {hours.map((h, i) => {
        const v = h.ore;
        const yTop = y(Math.max(v, 0));
        const yBase = y(Math.min(v, 0));
        const color = i === maxIdx ? c.expensive : cheap.has(i) ? c.cheap : c.bar;
        const left = axisW + i * slot + (slot - barW) / 2;
        return (
          <div
            key={h.start}
            style={{
              position: 'absolute', left, top: yTop, width: barW, height: Math.max(2, yBase - yTop), backgroundColor: color,
              borderRadius: v >= 0 ? '4px 4px 0 0' : '0 0 4px 4px',
            }}
          />
        );
      })}
      {/* direct labels: only the most expensive and the cheapest hour */}
      {[
        { i: maxIdx, text: `${ore(s.max.ore)}` },
        { i: minIdx, text: `${ore(s.min.ore)}` },
      ].map(({ i, text }) => (
        <span
          key={`l${i}`}
          style={{ position: 'absolute', left: axisW + i * slot + slot / 2 - 30, width: 60, textAlign: 'center', top: y(Math.max(hours[i].ore, 0)) - 30, fontFamily: TEXT, fontWeight: 800, fontSize: 20, color: c.text }}
        >
          {text}
        </span>
      ))}
      {/* x labels every 3 hours */}
      {hours.map((h, i) =>
        Number(h.hour) % 3 === 0 && (i === 0 || hours[i - 1].hour !== h.hour) ? (
          <span key={`x${h.start}`} style={{ position: 'absolute', left: axisW + i * slot + slot / 2 - 20, width: 40, textAlign: 'center', top: plotH + 8, fontFamily: TEXT, fontSize: 17, color: c.muted }}>
            {h.hour}
          </span>
        ) : null,
      )}
    </div>
  );
}

export interface DayAheadProps {
  date: string;
  hours: HourPrice[];
  stats: DayStats;
  todayAvg: number | null;
  config: Config;
  format: Format;
}

export function DayAhead({ date, hours, stats: s, todayAvg, config, format }: DayAheadProps) {
  const c = config.colors;
  const { width, height } = SIZES[format];
  const story = format === 'story';
  const pad = 56;
  const scale = story ? 1.1 : 1;
  const change = changeText(s.avg, todayAvg);
  const maxEnd = endHour(s.max);
  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', backgroundColor: c.surface, color: c.text, fontFamily: TEXT }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: `${story ? 200 : 52}px ${pad}px 0` }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Bolt size={story ? 96 : 84} c={c} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 28, letterSpacing: 5, textTransform: 'uppercase' }}>{config.brand.name}</span>
            <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 20, letterSpacing: 4, color: c.muted, textTransform: 'uppercase' }}>{config.brand.tagline} · {config.area.code}</span>
          </div>
        </div>

        {/* day */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: story ? 40 : 26 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 150 : 124, lineHeight: 0.88, textTransform: 'uppercase' }}>{dayName(date)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <div style={{ width: 60, height: 7, backgroundColor: c.accent }} />
            <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 28, letterSpacing: 2, textTransform: 'uppercase' }}>{dateText(date)} {date.slice(0, 4)}</span>
          </div>
        </div>

        {/* key numbers */}
        <div style={{ display: 'flex', gap: 12, marginTop: story ? 44 : 28 }}>
          <Tile c={c} scale={scale} label="Snitt" value={`${ore(s.avg)} øre`} sub={change ?? 'per kWh'} />
          <Tile c={c} scale={scale} label="Billigst" marker={c.cheap} value={`${ore(s.cheapest.avg)} øre`} sub={`kl. ${s.cheapest.from}–${s.cheapest.to} (snitt)`} />
          <Tile c={c} scale={scale} label="Dyrest" marker={c.expensive} value={`${ore(s.max.ore)} øre`} sub={`kl. ${s.max.hour}–${maxEnd}`} />
        </div>

        {/* chart */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: story ? 44 : 26, backgroundColor: c.panel, borderRadius: 16, padding: '18px 18px 12px' }}>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 19, color: c.muted, marginBottom: 14 }}>Pris per time · øre/kWh inkl. mva</span>
          <Chart hours={hours} s={s} c={c} width={width - pad * 2 - 36} height={story ? 600 : 500} />
        </div>

        {/* tip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: story ? 34 : 22, borderLeft: `6px solid ${c.cheap}`, paddingLeft: 16 }}>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: story ? 30 : 26 }}>{`Vask og lad kl. ${s.cheapest.from}–${s.cheapest.to}${s.negativeHours ? ` · negativ pris i ${s.negativeHours} t` : ''}`}</span>
        </div>

        <span style={{ fontFamily: TEXT, fontSize: 17, color: c.muted, marginTop: 'auto', marginBottom: 14 }}>{`${config.source.attribution} · Spotpris inkl. mva, uten nettleie og påslag`}</span>
      </div>

      {/* sponsor slot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, backgroundColor: '#ffffff', padding: `20px ${pad}px`, marginBottom: story ? 190 : 0 }}>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 15, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase' }}>{config.sponsor.label}</span>
        <div style={{ display: 'flex', flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', border: `3px dashed ${c.surface}`, borderRadius: 12 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, color: c.surface, textTransform: 'uppercase', letterSpacing: 1 }}>{config.sponsor.text}</span>
        </div>
      </div>
    </div>
  );
}
