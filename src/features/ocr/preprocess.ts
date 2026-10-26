/**
 * Preprocesado de la captura en el navegador (en memoria, nunca se sube):
 *  - decodifica respetando la orientación EXIF;
 *  - escala a un ancho cómodo para el OCR;
 *  - convierte a escala de grises, invierte si el fondo es oscuro (modo oscuro
 *    de Strava/Apple) y estira el contraste;
 *  - estima la nitidez (varianza del laplaciano) para avisar de imágenes borrosas.
 */
import { OcrError } from './types';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const TARGET_MIN_WIDTH = 1100;
const TARGET_MAX_WIDTH = 2000;
const SUPPORTED = /^image\/(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i;

export interface PreparedImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  inverted: boolean;
  /** true si la imagen parece desenfocada. */
  blurry: boolean;
  release(): void;
}

export function assertSupportedFile(file: File): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new OcrError('La imagen supera los 15 MB. Usa una captura de pantalla normal.', 'too_large');
  }
  if (file.type && !SUPPORTED.test(file.type)) {
    throw new OcrError('Formato no compatible. Usa una captura PNG o JPG.', 'unsupported');
  }
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new OcrError(
      'No se ha podido abrir la imagen. Si es HEIC, haz una captura de pantalla (PNG) en su lugar.',
      'decode',
    );
  }
}

export async function prepareImage(file: File, signal?: AbortSignal): Promise<PreparedImage> {
  assertSupportedFile(file);
  const bitmap = await decode(file);
  try {
    if (signal?.aborted) throw new OcrError('Proceso cancelado', 'cancelled');

    const scale =
      bitmap.width < TARGET_MIN_WIDTH
        ? Math.min(2, TARGET_MIN_WIDTH / bitmap.width)
        : bitmap.width > TARGET_MAX_WIDTH
          ? TARGET_MAX_WIDTH / bitmap.width
          : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new OcrError('El navegador no permite procesar imágenes.', 'engine');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const image = ctx.getImageData(0, 0, width, height);
    const { inverted, blurry } = enhance(image.data, width, height);
    ctx.putImageData(image, 0, 0);

    return {
      canvas,
      width,
      height,
      inverted,
      blurry,
      release() {
        // Libera la memoria del lienzo lo antes posible.
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  } finally {
    bitmap.close();
  }
}

/** Escala de grises + inversión automática + estiramiento de contraste (in situ). */
export function enhance(data: Uint8ClampedArray, width: number, height: number): { inverted: boolean; blurry: boolean } {
  const n = width * height;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const g = (0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!) | 0;
    gray[i] = g;
    hist[g]!++;
    sum += g;
  }
  const inverted = sum / n < 110;

  // Percentiles 2 % y 98 % para el estiramiento.
  const lowCut = n * 0.02;
  const highCut = n * 0.98;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc <= lowCut) lo = v;
    if (acc <= highCut) hi = v;
  }
  const range = Math.max(1, hi - lo);

  for (let i = 0; i < n; i++) {
    let v = ((gray[i]! - lo) * 255) / range;
    if (inverted) v = 255 - v;
    const o = i * 4;
    const c = v < 0 ? 0 : v > 255 ? 255 : v;
    data[o] = c;
    data[o + 1] = c;
    data[o + 2] = c;
    data[o + 3] = 255;
    gray[i] = c;
  }

  return { inverted, blurry: laplacianVariance(gray, width, height) < 120 };
}

/** Varianza del laplaciano sobre una rejilla muestreada (rápido y suficiente). */
export function laplacianVariance(gray: Uint8ClampedArray, width: number, height: number): number {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = y * width + x;
      const lap = 4 * gray[i]! - gray[i - step]! - gray[i + step]! - gray[i - step * width]! - gray[i + step * width]!;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}
