import type { IsoDate } from '@/lib/dates';
import {
  buildWeeklyLedger,
  isCountable,
  summarizeSeason,
  workoutPeriod,
  type MatchLike,
  type SeasonRules,
  type SeasonSummary,
  type WeekLedger,
  type WorkoutLike,
} from './compliance';
import { aggregatePace } from './stats';

export interface RankingRow {
  userId: string;
  summary: SeasonSummary;
  weeks: WeekLedger[];
  workoutCount: number;
  pace: number | null;
}

export type RankingSort = 'pct_desc' | 'pct_asc' | 'km_desc' | 'pending_asc';

export const RANKING_SORT_LABELS: Record<RankingSort, string> = {
  pct_desc: 'Mayor cumplimiento',
  pct_asc: 'Menor cumplimiento',
  km_desc: 'Más km corridos',
  pending_asc: 'Menos pendientes',
};

export function buildRanking(
  userIds: readonly string[],
  matches: readonly MatchLike[],
  workouts: readonly WorkoutLike[],
  season: SeasonRules,
  currentWeek: IsoDate,
): RankingRow[] {
  return userIds.map((userId) => {
    const weeks = buildWeeklyLedger(userId, matches, workouts, season, currentWeek);
    const counted = workouts.filter(
      (w) => w.user_id === userId && isCountable(w, season) && workoutPeriod(w) <= currentWeek,
    );
    return {
      userId,
      weeks,
      summary: summarizeSeason(weeks),
      workoutCount: counted.length,
      pace: aggregatePace(counted),
    };
  });
}

/**
 * La clasificación de la competición ordena por cumplimiento (≤ 100 %). A igual
 * porcentaje desempatan los km válidos y después los pendientes, nunca los km
 * deportivos (los excedentes no dan ventaja). Sin objetivo (pct null): al final.
 */
export function sortRanking(rows: readonly RankingRow[], sort: RankingSort): RankingRow[] {
  const tieBreak = (a: RankingRow, b: RankingRow) =>
    b.summary.attributableKm - a.summary.attributableKm || a.summary.pendingKm - b.summary.pendingKm;
  const byPct = (dir: 1 | -1) => (a: RankingRow, b: RankingRow) => {
    const pa = a.summary.pct;
    const pb = b.summary.pct;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return dir * (pa - pb) || tieBreak(a, b);
  };
  const copy = [...rows];
  switch (sort) {
    case 'pct_desc':
      return copy.sort(byPct(-1));
    case 'pct_asc':
      return copy.sort(byPct(1));
    case 'km_desc':
      return copy.sort((a, b) => b.summary.completedKm - a.summary.completedKm);
    case 'pending_asc':
      return copy.sort((a, b) => a.summary.pendingKm - b.summary.pendingKm || byPct(-1)(a, b));
  }
}
