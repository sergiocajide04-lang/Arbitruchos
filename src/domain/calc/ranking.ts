import type { IsoDate } from '@/lib/dates';
import {
  buildWeeklyLedger,
  isCountable,
  summarizeSeason,
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
  km_desc: 'Más kilómetros',
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
      (w) => w.user_id === userId && isCountable(w, season) && w.week_start <= currentWeek,
    );
    return {
      userId,
      weeks,
      summary: summarizeSeason(weeks, season.compliance_policy),
      workoutCount: counted.length,
      pace: aggregatePace(counted),
    };
  });
}

/** Las filas sin objetivo (pct null) van siempre al final con los criterios de porcentaje. */
export function sortRanking(rows: readonly RankingRow[], sort: RankingSort): RankingRow[] {
  const byPct = (dir: 1 | -1) => (a: RankingRow, b: RankingRow) => {
    const pa = a.summary.pct;
    const pb = b.summary.pct;
    if (pa === null && pb === null) return b.summary.completedKm - a.summary.completedKm;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return dir * (pa - pb) || b.summary.completedKm - a.summary.completedKm;
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
