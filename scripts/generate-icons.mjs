// Genera favicon, iconos PWA, apple-touch-icon y pantallas de inicio de iOS a partir
// de la geometría del símbolo definida en src/config/brand.json.
// Uso: npm run icons   (los PNG resultantes se versionan en public/)
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const brand = JSON.parse(readFileSync(join(root, 'src', 'config', 'brand.json'), 'utf8'));
const { colors, mark } = brand;

/** Símbolo como grupo SVG (sin fondo) en un lienzo de 512. */
function markGroup({ ring = colors.lime, lines = colors.white, hubInner = colors.background } = {}) {
  const { hub, crownStem: s, crownCap: c } = mark;
  return `
    <rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${ring}"/>
    <rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="${c.rx}" fill="${ring}"/>
    <path d="${mark.ring}" fill="none" stroke="${ring}" stroke-width="${mark.ringWidth}" stroke-linecap="round"/>
    ${mark.speedLines
      .map((d) => `<path d="${d}" fill="none" stroke="${lines}" stroke-width="${mark.speedLineWidth}" stroke-linecap="round"/>`)
      .join('\n    ')}
    <path d="${mark.hand}" fill="none" stroke="${ring}" stroke-width="${mark.handWidth}" stroke-linecap="round"/>
    <circle cx="${hub.cx}" cy="${hub.cy}" r="${hub.r}" fill="${ring}"/>
    <circle cx="${hub.cx}" cy="${hub.cy}" r="${hub.innerR}" fill="${hubInner}"/>`;
}

/** Icono cuadrado: fondo + símbolo escalado `scale` y centrado. */
function iconSvg({ radius = 112, scale = 0.86, background = colors.background } = {}) {
  const offset = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${radius}" fill="${background}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${markGroup()}
  </g>
</svg>`;
}

function splashSvg(width, height) {
  const size = Math.round(Math.min(width, height) * 0.34);
  const x = (width - size) / 2;
  const y = (height - size) / 2 - height * 0.04;
  const fontSize = Math.round(size * 0.3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${colors.background}"/>
  <g transform="translate(${x} ${y}) scale(${size / 512})">${markGroup()}</g>
  <g transform="translate(${width / 2} ${y + size + fontSize * 1.4})">
    <rect x="${-fontSize * 1.6}" y="${-fontSize * 0.08}" width="${fontSize * 3.2}" height="${fontSize * 0.16}" rx="${fontSize * 0.08}" fill="${colors.lime}" opacity="0.9"/>
  </g>
</svg>`;
}

function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' }).render().asPng();
}

const pub = join(root, 'public');
const icons = join(pub, 'icons');
mkdirSync(icons, { recursive: true });

// Favicon vectorial
writeFileSync(join(pub, 'favicon.svg'), iconSvg({ radius: 120, scale: 0.9 }));
// Símbolo suelto (sin fondo) para usos en documentación
writeFileSync(
  join(pub, 'icons', 'mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${markGroup()}</svg>`,
);

const outputs = [
  ['favicon-32.png', iconSvg({ radius: 120, scale: 0.92 }), 32],
  ['icon-192.png', iconSvg(), 192],
  ['icon-512.png', iconSvg(), 512],
  // Maskable: fondo a sangre y símbolo dentro de la zona segura (círculo del 80 %)
  ['icon-maskable-512.png', iconSvg({ radius: 0, scale: 0.66 }), 512],
  // iOS aplica su propia máscara: sin esquinas redondeadas
  ['apple-touch-icon-180.png', iconSvg({ radius: 0, scale: 0.8 }), 180],
];
for (const [name, svg, width] of outputs) writeFileSync(join(icons, name), png(svg, width));

// Pantallas de inicio de iOS (retrato) para los tamaños más comunes
export const SPLASHES = [
  [750, 1334],
  [828, 1792],
  [1125, 2436],
  [1170, 2532],
  [1179, 2556],
  [1284, 2778],
  [1290, 2796],
];
for (const [w, h] of SPLASHES) writeFileSync(join(icons, `splash-${w}x${h}.png`), png(splashSvg(w, h), w));

console.log(`[icons] Generados ${outputs.length} iconos, ${SPLASHES.length} splash y favicon.svg`);
