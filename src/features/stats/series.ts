/** Series semanales/mensuales para gráficos y tablas (derivadas de compliance/stats). */
import type { WeekLedger, WorkoutLike } from '@/domain/calc/compliance';
import { aggregatePace } from '@/domain/calc/stats';
import { addDays, monthKey, weekStartOf, weeksInRange, type IsoDate } from '@/lib/dates';

export interface WeekPoint {
  weekStart: IsoDate;
  km: number;
  target: number;
  /** null si la semana no tiene objetivo. */
  pct: number | null;
  /** s/km; null si no hay entrenos con duración. */
  pace: number | null;
  cumKm: number;
  cumTarget: number;
}

/**
 * Una fila por semana entre `from` y `to` (incluidas). Las semanas sin
 * entrenamientos valen 0 km (dato real), no se inventan valores.
 */
export function weeklySeries(
  ledger: readonly WeekLedger[],
  countedWorkouts: readonly WorkoutLike[],
  from: IsoDate,
  to: IsoDate,
): WeekPoint[] {
  const byWeek = new Map(ledger.map((w) => [w.weekStart, w]));
  let cumKm = 0;
  let cumTarget = 0;
  return weeksInRange(from, to).map((weekStart) => {
    const l = byWeek.get(weekStart);
    const km = l?.completedKm ?? 0;
    const target = l?.targetKm ?? 0;
    cumKm += km;
    cumTarget += target;
    return {
      weekStart,
      km,
      target,
      pct: target > 0 ? (km / target) * 100 : null,
      pace: aggregatePace(countedWorkouts.filter((w) => w.week_start === weekStart)),
      cumKm: Math.round(cumKm * 1000) / 1000,
      cumTarget,
    };
  });
}

export interface MonthPoint {
  month: string; // YYYY-MM
  km: number;
  workouts: number;
  /** Ritmo medio ponderado del mes (s/km); null si no hay entrenos con duración. */
  pace: number | null;
  /** Km acumulados desde el inicio de la temporada hasta este mes. */
  cumKm: number;
}

export function monthlySeries(countedWorkouts: readonly WorkoutLike[]): MonthPoint[] {
  const groups = new Map<string, WorkoutLike[]>();
  for (const w of countedWorkouts) {
    const k = monthKey(w.activity_date);
    const list = groups.get(k) ?? [];
    list.push(w);
    groups.set(k, list);
  }
  let cum = 0;
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, list]) => {
      const km = Math.round(list.reduce((acc, w) => acc + Number(w.distance_km), 0) * 1000) / 1000;
      cum += km;
      return { month, km, workouts: list.length, pace: aggregatePace(list), cumKm: Math.round(cum * 1000) / 1000 };
    });
}

export type Period = 'season' | '12w' | '4w';

/** Rango de semanas mostrado según el periodo, sin pasar de la semana actual ni del fin de temporada. */
export function periodRange(period: Period, seasonStart: IsoDate, seasonEnd: IsoDate, currentWeek: IsoDate): [IsoDate, IsoDate] {
  const lastWeek = currentWeek < weekStartOf(seasonEnd) ? currentWeek : weekStartOf(seasonEnd);
  const firstWeek = weekStartOf(seasonStart);
  if (period === 'season') return [firstWeek, lastWeek];
  const span = period === '12w' ? 11 : 3;
  const candidate = addDays(lastWeek, -7 * span);
  return [candidate > firstWeek ? candidate : firstWeek, lastWeek];
}
