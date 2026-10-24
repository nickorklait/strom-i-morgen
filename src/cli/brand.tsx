// npm run brand: profile picture and a pinned introduction post for the Instagram account.
// Output in output/brand/. Posted by hand (profile picture and the intro post are one-offs).

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, paths, priceBasis } from '../config.ts';
import { renderPng, SIZES } from '../render/render.ts';

const config = loadConfig();
const c = config.colors;
const out = path.join(paths.output, 'brand');
fs.mkdirSync(out, { recursive: true });

const bolt = (size: number, fill: string) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" fill={fill} />
  </svg>
);

// Profile picture: Instagram shows it as a small circle, so only the mark, no text.
const avatar = (
  <div style={{ width: 1080, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
    <div style={{ width: 760, height: 760, borderRadius: 760, backgroundColor: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bolt(470, c.surface)}</div>
  </div>
);
fs.writeFileSync(path.join(out, 'profilbilde.png'), await renderPng(avatar, { width: 1080, height: 1080 }));

const point = (title: string, text: string) => (
  <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
    <div style={{ width: 14, height: 14, borderRadius: 14, backgroundColor: c.accent, marginTop: 14, flexShrink: 0 }} />
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 36 }}>{title}</span>
      <span style={{ fontFamily: 'Inter', fontSize: 28, color: c.muted }}>{text}</span>
    </div>
  </div>
);

// Pinned intro post: what the account is, when it posts, where the data comes from.
const intro = (
  <div style={{ width: 1080, height: 1350, display: 'flex', flexDirection: 'column', backgroundColor: c.surface, color: c.text, fontFamily: 'Inter' }}>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '72px 64px 0' }}>
      <div style={{ width: 150, height: 150, borderRadius: 150, backgroundColor: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bolt(92, c.surface)}</div>
      <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 150, lineHeight: 0.88, marginTop: 44, textTransform: 'uppercase' }}>Strøm i</span>
      <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 150, lineHeight: 0.88, textTransform: 'uppercase', color: c.accent }}>morgen</span>
      <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 34, marginTop: 30 }}>{`Morgendagens strømpris for ${config.area.name}, hver dag.`}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, marginTop: 56 }}>
        {point('Ca. kl. 14 hver dag', 'Når prisene for neste døgn er klare')}
        {point('Billigste timer', 'Når du bør vaske, tørke og lade')}
        {point('Time for time', priceBasis(config))}
      </div>
      <span style={{ fontSize: 20, color: c.muted, marginTop: 'auto', marginBottom: 18 }}>{`${config.source.attribution} · Prisområde ${config.area.code}`}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, backgroundColor: '#ffffff', padding: '20px 64px' }}>
      <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase' }}>{config.sponsor.label}</span>
      <div style={{ display: 'flex', flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', border: `3px dashed ${c.surface}`, borderRadius: 12 }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 30, color: c.surface, textTransform: 'uppercase' }}>{config.sponsor.text}</span>
      </div>
    </div>
  </div>
);
fs.writeFileSync(path.join(out, 'intro_feed.png'), await renderPng(intro, SIZES.feed));

fs.writeFileSync(
  path.join(out, 'tekster.txt'),
  `PROFILNAVN
Strøm i morgen – ${config.area.name}

BIO (maks 150 tegn)
⚡ Morgendagens strømpris for ${config.area.name} (${config.area.code}), hver dag ca. kl. 14
💚 Billigste timer til vask og lading
Data: hvakosterstrommen.no

TEKST TIL INTRO-INNLEGGET (fest det øverst)
Velkommen til Strøm i morgen ⚡

Hver dag rundt kl. 14 – når prisene for neste døgn er klare – legger vi ut morgendagens strømpris for ${config.area.name}, time for time.

💚 Se når strømmen er billigst, og flytt vask, tørk og lading dit.
🔶 Se når den er dyrest, og unngå de timene.

Prisene er ${priceBasis(config).toLowerCase()} fra strømselskapet. ${config.source.attribution}.

Følg kontoen og slå på varsler for å få prisen hver dag.
${config.brand.hashtags.join(' ')}
`,
);
console.log(`Brand files in ${path.relative(process.cwd(), out)}: profilbilde.png, intro_feed.png, tekster.txt`);
