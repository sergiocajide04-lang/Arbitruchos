import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { buildWeeklyLedger, isCountable, summarizeSeason, weekOf, type WeekLedger } from '@/domain/calc/compliance';
import { buildRanking } from '@/domain/calc/ranking';
import type { Match, Season, Workout } from '@/domain/types';
import { currentPeriodIn, todayInTimeZone, type IsoDate } from '@/lib/dates';
import { listMatches, listWorkouts } from '@/services/api';
import { useActiveGroup } from '@/features/group/GroupProvider';

export interface SeasonData {
  season: Season | null;
  matches: Match[];
  workouts: Workout[];
  isLoading: boolean;
  error: unknown;
  refetch(): void;
  today: IsoDate;
  currentWeek: IsoDate;
  ledgerFor(userId: string): WeekLedger[];
  weekFor(userId: string, weekStart?: IsoDate): WeekLedger;
  countable(w: Workout): boolean;
}

/**
 * Partidos y entrenamientos de la temporada seleccionada + utilidades de cálculo.
 * Todos los agregados se derivan aquí de los datos brutos (fuente única de verdad).
 */
export function useSeasonData(): SeasonData {
  const { group, season } = useActiveGroup();
  const tz = season?.timezone ?? group.timezone;
  const today = todayInTimeZone(tz);
  // Periodo de competición en curso (sábado 09:00 → sábado 08:59).
  const currentWeek = currentPeriodIn(tz);

  const matchesQuery = useQuery({
    queryKey: ['matches', season?.id],
    queryFn: () => listMatches(season!.id),
    enabled: !!season,
  });
  const workoutsQuery = useQuery({
    queryKey: ['workouts', group.id, season?.start_date, season?.end_date],
    queryFn: () => listWorkouts(group.id, season!.start_date, season!.end_date),
    enabled: !!season,
  });

  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const workouts = useMemo(() => workoutsQuery.data ?? [], [workoutsQuery.data]);

  return useMemo<SeasonData>(() => {
    const cache = new Map<string, WeekLedger[]>();
    const ledgerFor = (userId: string) => {
      if (!season) return [];
      let l = cache.get(userId);
      if (!l) {
        l = buildWeeklyLedger(userId, matches, workouts, season, currentWeek);
        cache.set(userId, l);
      }
      return l;
    };
    return {
      season,
      matches,
      workouts,
      isLoading: !!season && (matchesQuery.isLoading || workoutsQuery.isLoading),
      error: matchesQuery.error ?? workoutsQuery.error,
      refetch: () => {
        void matchesQuery.refetch();
        void workoutsQuery.refetch();
      },
      today,
      currentWeek,
      ledgerFor,
      weekFor: (userId, weekStart = currentWeek) => weekOf(ledgerFor(userId), weekStart, currentWeek),
      countable: (w) => (season ? isCountable(w, season) : false),
    };
  }, [season, matches, workouts, matchesQuery, workoutsQuery, today, currentWeek]);
}

export function useRanking() {
  const data = useSeasonData();
  const { activeMembers } = useActiveGroup();
  const rows = useMemo(
    () =>
      data.season
        ? buildRanking(
            activeMembers.map((m) => m.user_id),
            data.matches,
            data.workouts,
            data.season,
            data.currentWeek,
          )
        : [],
    [data.season, data.matches, data.workouts, data.currentWeek, activeMembers],
  );
  return { ...data, rows };
}

export { summarizeSeason };
