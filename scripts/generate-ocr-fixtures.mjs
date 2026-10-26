// Genera capturas SINTÉTICAS (datos inventados, sin información personal) que imitan
// los diseños de Strava, Apple Fitness y una consola de gimnasio, para las pruebas
// de integración del OCR (npm run test:ocr). Uso: node scripts/generate-ocr-fixtures.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(process.cwd(), 'tests', 'ocr-integration', 'fixtures');
mkdirSync(out, { recursive: true });

const W = 750;
const text = (x, y, s, { size = 28, weight = 400, fill = '#111', anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;

const fixtures = {
  // Strava (modo claro, español, cuadrícula de 2 columnas)
  'strava-es.png': {
    h: 900,
    bg: '#ffffff',
    body: [
      text(40, 60, '9:41', { size: 26, weight: 700 }),
      text(40, 160, 'Carrera de la mañana', { size: 40, weight: 700 }),
      text(40, 210, '20 de octubre de 2026 a las 7:30', { size: 26, fill: '#555' }),
      text(40, 320, 'Distancia', { size: 26, fill: '#666' }),
      text(400, 320, 'Ritmo medio', { size: 26, fill: '#666' }),
      text(40, 370, '8,42 km', { size: 44, weight: 700 }),
      text(400, 370, '5:46 /km', { size: 44, weight: 700 }),
      text(40, 470, 'Tiempo en movimiento', { size: 26, fill: '#666' }),
      text(400, 470, 'Desnivel positivo', { size: 26, fill: '#666' }),
      text(40, 520, '48:35', { size: 44, weight: 700 }),
      text(400, 520, '45 m', { size: 44, weight: 700 }),
      text(40, 620, 'Calorías', { size: 26, fill: '#666' }),
      text(40, 670, '612 Cal', { size: 44, weight: 700 }),
      text(40, 820, 'STRAVA', { size: 30, weight: 700, fill: '#fc4c02' }),
    ],
    expect: { km: 8.42, durationS: 2915, paceS: 346, calories: 612, source: 'strava', date: '2026-10-20' },
  },
  // Apple Fitness (modo oscuro, etiqueta encima del valor)
  'apple-dark-en.png': {
    h: 1000,
    bg: '#000000',
    body: [
      text(40, 110, 'Outdoor Run', { size: 40, weight: 700, fill: '#fff' }),
      text(40, 220, 'Workout Time', { size: 28, fill: '#ddd' }),
      text(400, 220, 'Distance', { size: 28, fill: '#ddd' }),
      text(40, 275, '0:29:28', { size: 48, weight: 700, fill: '#ffd60a' }),
      text(400, 275, '5.12KM', { size: 48, weight: 700, fill: '#5ac8fa' }),
      text(40, 400, 'Active Kilocalories', { size: 28, fill: '#ddd' }),
      text(400, 400, 'Total Kilocalories', { size: 28, fill: '#ddd' }),
      text(40, 455, '301KCAL', { size: 48, weight: 700, fill: '#ff375f' }),
      text(400, 455, '355KCAL', { size: 48, weight: 700, fill: '#ff375f' }),
      text(40, 580, 'Avg. Pace', { size: 28, fill: '#ddd' }),
      text(40, 635, '5:45/KM', { size: 48, weight: 700, fill: '#64d2ff' }),
    ],
    expect: { km: 5.12, durationS: 1768, calories: 301, caloriesKind: 'active', source: 'apple' },
  },
  // Consola de máquina (mayúsculas, metros)
  'gym-console.png': {
    h: 700,
    bg: '#e9efe9',
    body: [
      text(40, 90, 'ASSAULTRUNNER', { size: 34, weight: 700 }),
      text(40, 200, 'TIME', { size: 30, weight: 700 }),
      text(400, 200, 'CALORIES', { size: 30, weight: 700 }),
      text(40, 260, '12:10', { size: 54, weight: 700 }),
      text(400, 260, '160', { size: 54, weight: 700 }),
      text(40, 380, 'DISTANCE', { size: 30, weight: 700 }),
      text(400, 380, 'SPEED', { size: 30, weight: 700 }),
      text(40, 440, '2150 M', { size: 54, weight: 700 }),
      text(400, 440, '10.6 KM/H', { size: 54, weight: 700 }),
      text(40, 560, 'WATTS', { size: 30, weight: 700 }),
      text(40, 620, '150', { size: 54, weight: 700 }),
    ],
    expect: { km: 2.15, durationS: 730, calories: 160, source: 'gym_console', activityType: 'treadmill' },
  },
};

const manifest = {};
for (const [name, f] of Object.entries(fixtures)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${f.h}" viewBox="0 0 ${W} ${f.h}"><rect width="100%" height="100%" fill="${f.bg}"/>${f.body.join('')}</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng();
  writeFileSync(join(out, name), png);
  manifest[name] = f.expect;
}
writeFileSync(join(out, 'expected.json'), JSON.stringify(manifest, null, 2));
console.log(`[ocr-fixtures] ${Object.keys(fixtures).length} capturas sintéticas en tests/ocr-integration/fixtures`);
