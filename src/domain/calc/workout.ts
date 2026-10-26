/** Normalización y comprobaciones de los datos de un entrenamiento. */
import type { DistanceUnit } from '@/domain/types';
import type { IsoDate } from '@/lib/dates';

export const KM_PER_MILE = 1.609344;

export function toKm(value: number, unit: DistanceUnit): number {
  switch (unit) {
    case 'km':
      return value;
    case 'm':
      return value / 1000;
    case 'mi':
      return value * KM_PER_MILE;
  }
}

/** Redondeo a 3 decimales (precisión de la columna distance_km). */
export function roundKm(km: number): number {
  return Math.round(km * 1000) / 1000;
}

export function paceFrom(distanceKm: number, durationS: number): number {
  return durationS / distanceKm;
}

export function speedFrom(distanceKm: number, durationS: number): number {
  return distanceKm / (durationS / 3600);
}

export interface ConsistencyCheck {
  consistent: boolean;
  /** Ritmo derivado de distancia y duración (s/km). */
  derivedPace: number;
  /** Diferencia relativa entre el ritmo indicado y el derivado (0.05 = 5 %). */
  deviation: number;
}

/**
 * Comprueba si el ritmo indicado es coherente con distancia y duración.
 * Tolerancia por defecto del 8 %: las apps usan a veces tiempo en movimiento
 * para el ritmo y tiempo total para la duración.
 */
export function checkPaceConsistency(
  distanceKm: number,
  durationS: number,
  paceS: number,
  tolerance = 0.08,
): ConsistencyCheck {
  const derivedPace = paceFrom(distanceKm, durationS);
  const deviation = Math.abs(derivedPace - paceS) / paceS;
  return { consistent: deviation <= tolerance, derivedPace, deviation };
}

export function checkSpeedConsistency(distanceKm: number, durationS: number, speedKmh: number, tolerance = 0.08) {
  const derived = speedFrom(distanceKm, durationS);
  const deviation = Math.abs(derived - speedKmh) / speedKmh;
  return { consistent: deviation <= tolerance, derived, deviation };
}

/**
 * Huella de los datos normalizados. Sirve para AVISAR de un posible duplicado
 * (misma fecha, misma distancia redondeada a 10 m y misma duración); nunca bloquea.
 */
export function workoutFingerprint(input: { activityDate: IsoDate; distanceKm: number; durationS: number | null }): string {
  const km = (Math.round(input.distanceKm * 100) / 100).toFixed(2);
  return `v1|${input.activityDate}|${km}|${input.durationS ?? 'na'}`;
}

/** Duración "hh:mm:ss", "mm:ss" o minutos → segundos. null si no es válida. */
export function parseDurationInput(input: string): number | null {
  const raw = input.trim();
  if (raw === '') return null;
  const parts = raw.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  let seconds: number;
  if (nums.length === 3) {
    const [h, m, s] = nums as [number, number, number];
    if (m > 59 || s > 59) return null;
    seconds = h * 3600 + m * 60 + s;
  } else if (nums.length === 2) {
    const [m, s] = nums as [number, number];
    if (s > 59) return null;
    seconds = m * 60 + s;
  } else {
    seconds = nums[0]! * 60;
  }
  return seconds > 0 ? seconds : null;
}

/** Ritmo "m:ss" → segundos por km. */
export function parsePaceInput(input: string): number | null {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(input);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s > 0 ? s : null;
}

/** Número con coma o punto decimal → number. Vacío → null (nunca 0). */
export function parseDecimalInput(input: string): number | null {
  const raw = input.trim().replace(/\s/g, '');
  if (raw === '') return null;
  if (!/^\d+([.,]\d+)?$/.test(raw)) return null;
  return Number(raw.replace(',', '.'));
}
