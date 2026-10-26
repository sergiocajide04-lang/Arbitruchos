import type { ActivityType, CaloriesKind, DistanceUnit, WorkoutSource } from '@/domain/types';
import type { IsoDate } from '@/lib/dates';

/** Palabra reconocida con su caja horizontal (en píxeles de la imagen procesada). */
export interface OcrWord {
  text: string;
  confidence: number; // 0-100
  x0: number;
  x1: number;
}

/** Fila visual de texto (palabras con la misma altura en la imagen). */
export interface OcrLine {
  text: string;
  confidence: number; // 0-100
  words?: OcrWord[];
  /** Ancho de la imagen, para normalizar posiciones horizontales. */
  pageWidth?: number;
}

export type FieldStatus = 'ok' | 'uncertain' | 'missing' | 'derived';

export interface OcrField<T> {
  value: T | null;
  /** 0-1: combinación de la confianza del OCR y de la asociación con su etiqueta. */
  confidence: number;
  status: FieldStatus;
  /** Texto original reconocido. */
  raw?: string;
  /** Explicación para el usuario cuando el campo es dudoso. */
  note?: string;
}

export interface DistanceValue {
  value: number;
  unit: DistanceUnit;
  km: number;
}

export interface ParsedWorkout {
  source: OcrField<WorkoutSource>;
  activityType: OcrField<ActivityType>;
  distance: OcrField<DistanceValue>;
  durationS: OcrField<number>;
  paceS: OcrField<number>;
  speedKmh: OcrField<number>;
  calories: OcrField<number>;
  caloriesKind: CaloriesKind | null;
  caloriesTotal: number | null;
  watts: OcrField<number>;
  date: OcrField<IsoDate>;
  time: OcrField<string>;
  /** Avisos generales (imagen borrosa, datos incoherentes…). */
  warnings: string[];
  meanConfidence: number;
  lineCount: number;
}

export interface OcrProgress {
  stage: 'preparing' | 'loading' | 'recognizing' | 'parsing';
  /** 0-1 */
  progress: number;
}

export class OcrError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'too_large' | 'decode' | 'engine' | 'cancelled' | 'empty',
  ) {
    super(message);
    this.name = 'OcrError';
  }
}
