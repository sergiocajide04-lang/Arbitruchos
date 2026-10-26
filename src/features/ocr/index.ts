/**
 * API pública del módulo OCR: de un archivo de imagen a datos estructurados
 * pendientes de confirmación. La imagen solo existe en memoria durante el proceso.
 */
import type { IsoDate } from '@/lib/dates';
import { parseOcrLines } from './parse';
import { prepareImage } from './preprocess';
import { runOcr } from './engine';
import { OcrError, type OcrProgress, type ParsedWorkout } from './types';

export type { ParsedWorkout, OcrField, OcrProgress, FieldStatus } from './types';
export { OcrError } from './types';
export { assertSupportedFile, MAX_FILE_BYTES } from './preprocess';
export { parseOcrLines } from './parse';

export interface RecognizeOptions {
  today: IsoDate;
  signal?: AbortSignal;
  onProgress?: (p: OcrProgress) => void;
}

export async function recognizeWorkoutScreenshot(file: File, opts: RecognizeOptions): Promise<ParsedWorkout> {
  opts.onProgress?.({ stage: 'preparing', progress: 0 });
  const prepared = await prepareImage(file, opts.signal);
  try {
    const lines = await runOcr(prepared.canvas, { signal: opts.signal, onProgress: opts.onProgress });
    opts.onProgress?.({ stage: 'parsing', progress: 1 });
    const result = parseOcrLines(lines, opts.today);
    if (prepared.blurry) {
      result.warnings.unshift('La imagen parece borrosa: revisa con atención los valores detectados.');
    }
    if (result.lineCount === 0) {
      throw new OcrError('No se ha encontrado texto en la imagen. Prueba con otra captura o introduce los datos a mano.', 'empty');
    }
    return result;
  } finally {
    prepared.release();
  }
}
