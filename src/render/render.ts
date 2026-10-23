import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import satori, { type Font } from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { paths } from '../config.ts';

export const SIZES = { feed: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;
export type Format = keyof typeof SIZES;

let fonts: Font[] | null = null;
const loadFonts = (): Font[] =>
  (fonts ??= [
    ['BarlowCondensed-ExtraBold.ttf', 'Barlow Condensed', 800],
    ['Inter-Regular.ttf', 'Inter', 400],
    ['Inter-SemiBold.ttf', 'Inter', 600],
    ['Inter-ExtraBold.ttf', 'Inter', 800],
  ].map(([file, name, weight]) => ({ name: name as string, weight: weight as Font['weight'], style: 'normal' as const, data: fs.readFileSync(path.join(paths.fonts, file as string)) })));

export async function renderPng(node: ReactNode, size: { width: number; height: number }): Promise<Buffer> {
  const svg = await satori(node, { ...size, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size.width } }).render().asPng());
}
