import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';

/** Instagram only accepts JPEG. Decode the PNG through resvg (no PNG library) and encode with jpeg-js. */
export function pngToJpeg(png: Buffer, width: number, height: number, quality = 92): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/png;base64,${png.toString('base64')}" width="${width}" height="${height}"/></svg>`;
  const rendered = new Resvg(svg, { background: '#ffffff' }).render();
  if (rendered.width !== width || rendered.height !== height) throw new Error(`Unexpected render size ${rendered.width}x${rendered.height}`);
  return Buffer.from(jpeg.encode({ data: rendered.pixels, width, height }, quality).data);
}

/** Width/height from a PNG header (IHDR). */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.readUInt32BE(12) !== 0x49484452) throw new Error('Not a PNG file');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
