import { useMemo } from 'react';
import { combineSummaries, mergeLedgers, summarizeSeason } from '@/domain/calc/compliance';
import { bestPace, workoutStats } from '@/domain/calc/stats';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { useSeasonData } from '@/hooks/useSeasonData';
import { monthlySeries, periodRange, weeklySeries, type Period } from './series';

/** Identificador especial para ver las estadísticas de todo el grupo. */
export const GROUP_ID = 'grupo';

/**
 * Estadísticas de un miembro (o de todo el grupo con GROUP_ID) en la temporada
 * seleccionada. Todo se deriva de los datos brutos.
 */
export function useMemberStats(userId: string, period: Period = 'season') {
  const data = useSeasonData();
  const { activeMembers } = useActiveGroup();
  return useMemo(() => {
    const season = data.season;
    if (!season) return null;
    const isGroup = userId === GROUP_ID;
    const ids = isGroup ? activeMembers.map((m) => m.user_id) : [userId];

    const ledgers = ids.map((id) => data.ledgerFor(id));
    const ledger = isGroup ? mergeLedgers(ledgers) : ledgers[0]!;
    const summary = isGroup
      ? combineSummaries(ledgers.map((l) => summarizeSeason(l, season.compliance_policy)))
      : summarizeSeason(ledger, season.compliance_policy);

    const counted = data.workouts.filter((w) => ids.includes(w.user_id) && data.countable(w));
    const [from, to] = periodRange(period, season.start_date, season.end_date, data.currentWeek);
    const inPeriod = counted.filter((w) => w.week_start >= from && w.week_start <= to);
    const matches = data.matches.filter((m) => ids.includes(m.referee_id));
    const best = bestPace(counted);
    const longest = counted.reduce<(typeof counted)[number] | null>((a, w) => (!a || w.distance_km > a.distance_km ? w : a), null);
    return {
      season,
      isGroup,
      ledger,
      summary,
      counted,
      matches,
      stats: workoutStats(inPeriod),
      seasonStats: workoutStats(counted),
      best,
      longest,
      weekly: weeklySeries(ledger, counted, from, to),
      monthly: monthlySeries(counted),
      range: [from, to] as const,
      isLoading: data.isLoading,
      error: data.error,
      refetch: data.refetch,
    };
  }, [data, userId, period, activeMembers]);
}
