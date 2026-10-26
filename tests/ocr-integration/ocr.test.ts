// @vitest-environment node
/**
 * Integración real: Tesseract.js (el mismo motor y modelo que usa la app) sobre
 * capturas sintéticas + agrupación en filas + análisis de campos.
 * El preprocesado del navegador (canvas) no se ejecuta aquí; se aplica el mismo
 * algoritmo `enhance` sobre los píxeles decodificados.
 * Ejecutar con: npm run test:ocr   (tarda ~20-40 s)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { groupIntoRows } from '@/features/ocr/engine';
import { parseOcrLines } from '@/features/ocr/parse';
import { enhance } from '@/features/ocr/preprocess';

const dir = join(process.cwd(), 'tests', 'ocr-integration', 'fixtures');
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Record<string, Record<string, unknown>>;
const langPath = join(process.cwd(), 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int');

// --- PNG mínimo (RGBA 8 bits, sin entrelazado) para aplicar el preprocesado ---------
function decodePng(buf: Buffer) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const chunks: Buffer[] = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') chunks.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const v = line[x]!;
      cur[x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + pr) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = cur[s]!;
      out[d + 1] = cur[channels > 1 ? s + 1 : s]!;
      out[d + 2] = cur[channels > 1 ? s + 2 : s]!;
      out[d + 3] = 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function encodePng(width: number, height: number, rgba: Uint8ClampedArray) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let worker: Awaited<ReturnType<typeof createWorker>>;

beforeAll(async () => {
  worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1', user_defined_dpi: '300' });
}, 120_000);

afterAll(async () => {
  await worker?.terminate();
});

async function run(name: string) {
  const img = decodePng(readFileSync(join(dir, name)));
  enhance(img.data, img.width, img.height);
  const result = await worker.recognize(encodePng(img.width, img.height, img.data), {}, { blocks: true });
  type Blocks = Array<{ paragraphs: Array<{ lines: Parameters<typeof groupIntoRows>[0] }> }>;
  const lines = ((result.data.blocks ?? []) as unknown as Blocks).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  return parseOcrLines(groupIntoRows(lines, img.width), '2026-10-25');
}

describe('OCR real sobre capturas sintéticas', () => {
  for (const name of Object.keys(expected)) {
    it(`reconoce ${name}`, async () => {
      const r = await run(name);
      const e = expected[name]!;
      expect(r.distance.value?.km).toBeCloseTo(e.km as number, 3);
      if (e.durationS) expect(r.durationS.value).toBe(e.durationS);
      if (e.paceS) expect(r.paceS.value).toBe(e.paceS);
      if (e.calories) expect(r.calories.value).toBe(e.calories);
      if (e.caloriesKind) expect(r.caloriesKind).toBe(e.caloriesKind);
      if (e.source) expect(r.source.value).toBe(e.source);
      if (e.activityType) expect(r.activityType.value).toBe(e.activityType);
      if (e.date) expect(r.date.value).toBe(e.date);
    }, 60_000);
  }
});
