/**
 * Envoltorio de Tesseract.js.
 *  - Se carga bajo demanda (import dinámico) la primera vez que se usa.
 *  - Motor, núcleo WASM y modelo de idioma se sirven desde la propia app
 *    (carpeta /ocr/, copiada de node_modules en el build): ninguna imagen ni
 *    petición sale hacia servicios de terceros.
 *  - El reconocimiento corre en un Web Worker: la interfaz no se bloquea.
 *  - Cancelable con AbortSignal; el worker se destruye siempre al terminar.
 */
import type { OcrLine, OcrProgress, OcrWord } from './types';
import { OcrError } from './types';

const BASE = import.meta.env.BASE_URL;

interface TessWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface TessLine {
  text: string;
  confidence: number;
  words: TessWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface TessBlock {
  paragraphs: Array<{ lines: TessLine[] }>;
}

/**
 * Agrupa las líneas de Tesseract en filas visuales: líneas que comparten la
 * misma franja vertical (p. ej. columnas de una cuadrícula) se unen de izquierda
 * a derecha. Así "línea anterior/siguiente" significa arriba/abajo en la imagen.
 */
export function groupIntoRows(rawLines: TessLine[], pageWidth: number): OcrLine[] {
  const sorted = [...rawLines]
    .filter((l) => l.text.trim().length > 0)
    .sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2);

  const rows: TessLine[][] = [];
  for (const line of sorted) {
    const cy = (line.bbox.y0 + line.bbox.y1) / 2;
    const row = rows[rows.length - 1];
    const ref = row?.[0];
    if (row && ref) {
      const h = Math.max(ref.bbox.y1 - ref.bbox.y0, line.bbox.y1 - line.bbox.y0);
      const refCy = (ref.bbox.y0 + ref.bbox.y1) / 2;
      if (Math.abs(cy - refCy) < h * 0.5) {
        row.push(line);
        continue;
      }
    }
    rows.push([line]);
  }

  return rows.map((row) => {
    const words: OcrWord[] = row
      .flatMap((l) => l.words)
      .filter((w) => w.text.trim().length > 0)
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .map((w) => ({ text: w.text, confidence: w.confidence, x0: w.bbox.x0, x1: w.bbox.x1 }));
    // Huecos grandes se representan con varios espacios (separan columnas).
    let text = '';
    words.forEach((w, i) => {
      if (i > 0) {
        const gap = w.x0 - words[i - 1]!.x1;
        text += gap > pageWidth * 0.06 ? '    ' : ' ';
      }
      text += w.text;
    });
    const confidence = words.length ? words.reduce((a, w) => a + w.confidence, 0) / words.length : 0;
    return { text, confidence, words, pageWidth };
  });
}

export interface RunOcrOptions {
  signal?: AbortSignal;
  onProgress?: (p: OcrProgress) => void;
}

export async function runOcr(image: HTMLCanvasElement, opts: RunOcrOptions = {}): Promise<OcrLine[]> {
  const { signal, onProgress } = opts;
  if (signal?.aborted) throw new OcrError('Proceso cancelado', 'cancelled');

  onProgress?.({ stage: 'loading', progress: 0 });
  const Tesseract = await import('tesseract.js');

  let worker: Awaited<ReturnType<typeof Tesseract.createWorker>> | null = null;
  let cancelled = false;
  const onAbort = () => {
    cancelled = true;
    void worker?.terminate();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      workerPath: `${BASE}ocr/worker.min.js`,
      corePath: `${BASE}ocr/`,
      langPath: `${BASE}ocr/lang`,
      gzip: true,
      // El modelo de idioma lo cachea el service worker; Tesseract no guarda nada en IndexedDB.
      cacheMethod: 'none',
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress?.({ stage: 'recognizing', progress: m.progress });
        else onProgress?.({ stage: 'loading', progress: m.progress });
      },
    });
    if (cancelled) throw new OcrError('Proceso cancelado', 'cancelled');

    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });

    const result = await worker.recognize(image, {}, { blocks: true, text: true });
    if (cancelled) throw new OcrError('Proceso cancelado', 'cancelled');

    const blocks = (result.data.blocks ?? []) as unknown as TessBlock[];
    const lines = blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    return groupIntoRows(lines, image.width);
  } catch (error) {
    if (cancelled) throw new OcrError('Proceso cancelado', 'cancelled');
    if (error instanceof OcrError) throw error;
    console.error('OCR', error);
    throw new OcrError('No se ha podido ejecutar el reconocimiento. Puedes introducir los datos a mano.', 'engine');
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (!cancelled) await worker?.terminate().catch(() => undefined);
    worker = null;
  }
}
