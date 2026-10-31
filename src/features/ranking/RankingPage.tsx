import { CheckCircle2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Avatar, EmptyState, ErrorBlock, LoadingBlock, ProgressBar, Segmented } from '@/components/ui/misc';
import { combineSummaries, effectiveWeek, weekOf } from '@/domain/calc/compliance';
import { RANKING_SORT_LABELS, sortRanking, type RankingRow, type RankingSort } from '@/domain/calc/ranking';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { NoSeasonState } from '@/features/seasons/NoSeasonState';
import { SeasonPicker } from '@/features/seasons/SeasonPicker';
import { useRanking } from '@/hooks/useSeasonData';
import { formatWeekRange } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatKm, formatPace, formatPct } from '@/lib/format';
import { PREF_KEYS, readPref, writePref } from '@/lib/storage';
import { cn } from '@/lib/utils';

type Scope = 'season' | 'week';

interface Display {
  userId: string;
  target: number;
  valid: number;
  completed: number;
  pending: number;
  pct: number | null;
  workouts: number;
  pace: number | null;
  met: boolean;
}

function fromRow(row: RankingRow, scope: Scope, currentWeek: string): Display {
  if (scope === 'season') {
    return {
      userId: row.userId,
      target: row.summary.targetKm,
      valid: row.summary.attributableKm,
      completed: row.summary.completedKm,
      pending: row.summary.pendingKm,
      pct: row.summary.pct,
      workouts: row.workoutCount,
      pace: row.pace,
      met: row.summary.targetKm > 0 && row.summary.pendingKm === 0,
    };
  }
  // Semana: objetivo efectivo = deuda arrastrada + objetivo nuevo.
  const w = weekOf(row.weeks, currentWeek, currentWeek);
  const e = effectiveWeek(w);
  return {
    userId: row.userId,
    target: e.effectiveTargetKm,
    valid: e.validKm,
    completed: e.completedKm,
    pending: e.pendingKm,
    pct: e.pct,
    workouts: w.workoutCount,
    pace: null,
    met: e.effectiveTargetKm > 0 && e.pendingKm === 0,
  };
}

export function RankingPage() {
  const user = useUser();
  const { season, profileOf } = useActiveGroup();
  const data = useRanking();
  const [sort, setSort] = useState<RankingSort>(() => (readPref(PREF_KEYS.rankingSort) as RankingSort | null) ?? 'pct_desc');
  const [scope, setScope] = useState<Scope>('season');

  const rows = useMemo(() => {
    // Para el ámbito semanal se reutiliza la ordenación con los datos de la semana.
    const adapted: RankingRow[] =
      scope === 'season'
        ? data.rows
        : data.rows.map((r) => {
            const d = fromRow(r, 'week', data.currentWeek);
            return { ...r, summary: { ...r.summary, pct: d.pct, attributableKm: d.valid, completedKm: d.completed, pendingKm: d.pending } };
          });
    return sortRanking(adapted, sort).map((r) => fromRow(data.rows.find((o) => o.userId === r.userId)!, scope, data.currentWeek));
  }, [data.rows, data.currentWeek, scope, sort]);

  const groupTotal = useMemo(() => combineSummaries(data.rows.map((r) => r.summary)), [data.rows]);

  const changeSort = (s: RankingSort) => {
    setSort(s);
    writePref(PREF_KEYS.rankingSort, s);
  };

  return (
    <>
      <PageHeader
        title="Clasificación"
        subtitle={
          season ? (scope === 'season' ? `${season.name} · cumplimiento de objetivos` : `Semana ${formatWeekRange(data.currentWeek)}`) : undefined
        }
      />
      {!season ? (
        <NoSeasonState />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              label="Ámbito"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'season', label: 'Temporada' },
                { value: 'week', label: 'Esta semana' },
              ]}
            />
            <div className="flex items-center gap-2">
              <SeasonPicker />
              <label className="flex items-center gap-2 text-sm text-muted">
                <span className="whitespace-nowrap">Ordenar por</span>
                <Select value={sort} onChange={(e) => changeSort(e.target.value as RankingSort)} className="h-9 w-auto rounded-lg py-0 text-sm text-fg">
                  {(Object.keys(RANKING_SORT_LABELS) as RankingSort[]).map((k) => (
                    <option key={k} value={k}>
                      {RANKING_SORT_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </div>

          {!data.isLoading && scope === 'season' && groupTotal.targetKm > 0 && (
            <div className="card relative overflow-hidden p-4 sm:p-5">
              <div aria-hidden className="track-texture pointer-events-none absolute inset-0" />
              <div className="relative">
                <p className="eyebrow">Entre todos</p>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <p className="num text-3xl font-bold leading-none">
                    {formatKm(groupTotal.attributableKm)}
                    <span className="ml-1 text-base text-muted">válidos de {formatKm(groupTotal.targetKm)} km</span>
                  </p>
                  <p className="num text-3xl font-bold leading-none text-accent-text">{formatPct(groupTotal.pct)}</p>
                </div>
                <ProgressBar value={groupTotal.pct} className="mt-3" label="Cumplimiento del grupo" />
                <p className="mt-2 text-xs text-muted">
                  {formatKm(groupTotal.completedKm)} km corridos en total · {formatKm(groupTotal.pendingKm)} km pendientes
                </p>
              </div>
            </div>
          )}

          {data.isLoading ? (
            <LoadingBlock />
          ) : data.error ? (
            <ErrorBlock message={toUserMessage(data.error)} onRetry={data.refetch} />
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState icon={Trophy} title="Sin miembros activos" />
            </Card>
          ) : (
            <ol className="space-y-3" aria-label="Clasificación del grupo">
              {rows.map((r, i) => {
                const p = profileOf(r.userId);
                const me = r.userId === user.id;
                return (
                  <li key={r.userId}>
                    <Link
                      to={me ? '/perfil' : `/miembros/${r.userId}`}
                      className={cn(
                        'card block p-4 transition hover:border-accent/40 sm:p-5',
                        me && 'border-accent/40 ring-1 ring-accent/20',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="num w-6 text-center text-xl font-bold text-muted" aria-label={`Posición ${i + 1}`}>
                          {i + 1}
                        </span>
                        <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">
                            {p?.display_name ?? 'Miembro'}
                            {me && <span className="ml-1.5 text-xs font-medium text-accent-text">(tú)</span>}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted">
                            {r.met ? (
                              <>
                                <CheckCircle2 className="size-3.5 text-accent-text" aria-hidden /> Al día
                              </>
                            ) : r.target === 0 ? (
                              'Sin objetivo todavía'
                            ) : (
                              `Le faltan ${formatKm(r.pending)} km`
                            )}
                          </p>
                        </div>
                        <p className="num text-3xl font-bold leading-none">{formatPct(r.pct)}</p>
                      </div>
                      <ProgressBar value={r.pct} className="mt-3" label={`Cumplimiento de ${p?.display_name ?? 'miembro'}`} />
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                        <Metric label={scope === 'season' ? 'Objetivos' : 'Obj. efectivo'} value={`${formatKm(r.target)} km`} />
                        <Metric label="Válidos" value={`${formatKm(r.valid)} km`} />
                        <Metric label="Pendientes" value={`${formatKm(r.pending)} km`} />
                        <Metric label="Corridos" value={`${formatKm(r.completed)} km`} />
                        <Metric label="Entrenos" value={String(r.workouts)} />
                        {scope === 'season' && <Metric label="Ritmo medio" value={r.pace ? `${formatPace(r.pace)} /km` : '—'} />}
                      </dl>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Cumplimiento = km válidos ÷ objetivos de las semanas ya iniciadas (máximo 100 %). Los km de más compensan deudas de semanas
            anteriores, pero nunca generan saldo para semanas futuras: el excedente solo cuenta en «Corridos» y en las estadísticas.{' '}
            El ritmo medio es tiempo total ÷ distancia total.
          </p>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-muted">{label}</dt>
      <dd className="num mt-0.5 text-base font-semibold">{value}</dd>
    </div>
  );
}
