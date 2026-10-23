// Shared pieces for the newer slides (header, tiles, sponsor slot, footnote).
import type { ReactNode } from 'react';
import type { Config } from '../config.ts';
import { SIZES, type Format } from './render.ts';

export const DISPLAY = 'Barlow Condensed';
export const TEXT = 'Inter';

export function Bolt({ size, c }: { size: number; c: Config['colors'] }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size, backgroundColor: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">
        <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" fill={c.surface} />
      </svg>
    </div>
  );
}

export function Tile({ label, value, sub, marker, c }: { label: string; value: string; sub?: string; marker?: string; c: Config['colors'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: c.panel, borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {marker && <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: marker }} />}
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 20, color: c.muted }}>{label}</span>
      </div>
      <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 42, color: c.text, marginTop: 2 }}>{value}</span>
      {sub && <span style={{ fontFamily: TEXT, fontSize: 19, color: c.muted }}>{sub}</span>}
    </div>
  );
}

/** Page frame: header with the mark, big title, content, footnote and sponsor slot. Story keeps Instagram's safe areas. */
export function Slide({ config, format, kicker, title, accentTitle, footnote, children }: {
  config: Config; format: Format; kicker: string; title: string; accentTitle?: string; footnote: string; children: ReactNode;
}) {
  const c = config.colors;
  const { width, height } = SIZES[format];
  const story = format === 'story';
  const pad = 56;
  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', backgroundColor: c.surface, color: c.text, fontFamily: TEXT }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: `${story ? 200 : 56}px ${pad}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Bolt size={64} c={c} />
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 22, letterSpacing: 3, color: c.muted, textTransform: 'uppercase' }}>{kicker}</span>
        </div>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 120 : 100, lineHeight: 0.9, textTransform: 'uppercase', marginTop: 24 }}>{title}</span>
        {accentTitle && <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 120 : 100, lineHeight: 0.9, textTransform: 'uppercase', color: c.accent }}>{accentTitle}</span>}
        {children}
        <span style={{ fontFamily: TEXT, fontSize: 18, color: c.muted, marginTop: 'auto', marginBottom: 14, lineHeight: 1.4 }}>{footnote}</span>
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
