/**
 * Estadísticas de rendimiento.
 *
 * Ritmo medio agregado (ponderado): Σ duración / Σ distancia, usando SOLO los
 * entrenamientos con duración conocida. Nunca se promedian ritmos de carreras
 * distintas (eso sobrevaloraría las carreras cortas).
 *
 * Mejor ritmo: el menor ritmo (s/km) de un entrenamiento con duración conocida
 * y una distancia mínima de 1 km, para descartar tramos cortos poco representativos.
 */
import { round3, type WorkoutLike } from './compliance';

export const BEST_PACE_MIN_KM = 1;

export function paceOf(distanceKm: number, durationS: number | null): number | null {
  if (durationS === null || durationS <= 0 || distanceKm <= 0) return null;
  return durationS / distanceKm;
}

export function aggregatePace(workouts: ReadonlyArray<Pick<WorkoutLike, 'distance_km' | 'duration_s'>>): number | null {
  let km = 0;
  let seconds = 0;
  for (const w of workouts) {
    if (w.duration_s === null || w.duration_s <= 0) continue;
    km += Number(w.distance_km);
    seconds += w.duration_s;
  }
  return km > 0 ? seconds / km : null;
}

export function bestPace<T extends Pick<WorkoutLike, 'distance_km' | 'duration_s'>>(
  workouts: readonly T[],
  minKm = BEST_PACE_MIN_KM,
): { pace: number; workout: T } | null {
  let best: { pace: number; workout: T } | null = null;
  for (const w of workouts) {
    if (Number(w.distance_km) < minKm) continue;
    const pace = paceOf(Number(w.distance_km), w.duration_s);
    if (pace !== null && (best === null || pace < best.pace)) best = { pace, workout: w };
  }
  return best;
}

export interface WorkoutStats {
  count: number;
  totalKm: number;
  avgKm: number | null;
  longestKm: number | null;
  totalDurationS: number;
  /** Duración media de los entrenamientos con duración conocida. */
  avgDurationS: number | null;
  timedCount: number;
  pace: number | null;
  bestPace: number | null;
}

export function workoutStats(workouts: ReadonlyArray<Pick<WorkoutLike, 'distance_km' | 'duration_s'>>): WorkoutStats {
  const count = workouts.length;
  const totalKm = round3(workouts.reduce((acc, w) => acc + Number(w.distance_km), 0));
  const timed = workouts.filter((w) => w.duration_s !== null && w.duration_s > 0);
  const totalDurationS = timed.reduce((acc, w) => acc + (w.duration_s ?? 0), 0);
  return {
    count,
    totalKm,
    avgKm: count > 0 ? totalKm / count : null,
    longestKm: count > 0 ? Math.max(...workouts.map((w) => Number(w.distance_km))) : null,
    totalDurationS,
    avgDurationS: timed.length > 0 ? totalDurationS / timed.length : null,
    timedCount: timed.length,
    pace: aggregatePace(workouts),
    bestPace: bestPace(workouts)?.pace ?? null,
  };
}
