import { ChevronRight, Filter, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, StatusBadge } from '@/components/ui/misc';
import { ACTIVITY_LABELS, SOURCE_LABELS, type ActivityType, type Workout, type WorkoutSource } from '@/domain/types';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { NoSeasonState } from '@/features/seasons/NoSeasonState';
import { SeasonPicker } from '@/features/seasons/SeasonPicker';
import { useSeasonData } from '@/hooks/useSeasonData';
import { formatMonthYear, formatShortDate, formatWeekRange, monthKey } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatDuration, formatKm, formatPace } from '@/lib/format';

interface Filters {
  user: string; // 'all' | 'me' | userId
  period: string; // 'all' | 'w:YYYY-MM-DD' | 'm:YYYY-MM'
  day: string;
  source: WorkoutSource | '';
  type: ActivityType | '';
}

export function WorkoutsPage() {
  const user = useUser();
  const { season, activeMembers, members, profileOf } = useActiveGroup();
  const data = useSeasonData();
  const [filters, setFilters] = useState<Filters>({ user: 'all', period: 'all', day: '', source: '', type: '' });
  const [showFilters, setShowFilters] = useState(false);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const weeks = useMemo(() => [...new Set(data.workouts.map((w) => w.week_start))].sort().reverse(), [data.workouts]);
  const months = useMemo(() => [...new Set(data.workouts.map((w) => monthKey(w.activity_date)))].sort().reverse(), [data.workouts]);

  const filtered = useMemo(
    () =>
      data.workouts.filter((w) => {
        if (filters.user === 'me' && w.user_id !== user.id) return false;
        if (filters.user !== 'all' && filters.user !== 'me' && w.user_id !== filters.user) return false;
        if (filters.period.startsWith('w:') && w.week_start !== filters.period.slice(2)) return false;
        if (filters.period.startsWith('m:') && monthKey(w.activity_date) !== filters.period.slice(2)) return false;
        if (filters.day && w.activity_date !== filters.day) return false;
        if (filters.source && w.source !== filters.source) return false;
        if (filters.type && w.activity_type !== filters.type) return false;
        return true;
      }),
    [data.workouts, filters, user.id],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of filtered) {
      const list = map.get(w.week_start) ?? [];
      list.push(w);
      map.set(w.week_start, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const activeFilterCount = [filters.user !== 'all', filters.period !== 'all', !!filters.day, !!filters.source, !!filters.type].filter(Boolean).length;
  const memberOptions = members.length > 0 ? members : activeMembers;

  return (
    <>
      <PageHeader
        title="Entrenamientos"
        subtitle={season ? `${data.workouts.length} registros en la temporada` : undefined}
        actions={
          <Button asChild size="sm">
            <Link to="/anadir/entrenamiento">Añadir</Link>
          </Button>
        }
      />
      {!season ? (
        <NoSeasonState />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeasonPicker />
            <Button variant="secondary" size="sm" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="filtros">
              <Filter aria-hidden /> Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({ user: 'all', period: 'all', day: '', source: '', type: '' })}>
                Quitar filtros
              </Button>
            )}
          </div>

          {showFilters && (
            <Card id="filtros" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Persona">
                <Select value={filters.user} onChange={(e) => set('user', e.target.value)}>
                  <option value="all">Todo el grupo</option>
                  <option value="me">Solo yo</option>
                  {memberOptions
                    .filter((m) => m.user_id !== user.id)
                    .map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.profile.display_name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Periodo">
                <Select value={filters.period} onChange={(e) => set('period', e.target.value)}>
                  <option value="all">Toda la temporada</option>
                  <optgroup label="Meses">
                    {months.map((m) => (
                      <option key={m} value={`m:${m}`}>
                        {formatMonthYear(`${m}-01`)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Semanas">
                    {weeks.map((w) => (
                      <option key={w} value={`w:${w}`}>
                        {formatWeekRange(w)}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
              <Field label="Día">
                <Input type="date" value={filters.day} min={season.start_date} max={season.end_date} onChange={(e) => set('day', e.target.value)} />
              </Field>
              <Field label="Fuente">
                <Select value={filters.source} onChange={(e) => set('source', e.target.value as WorkoutSource | '')}>
                  <option value="">Todas</option>
                  {(Object.keys(SOURCE_LABELS) as WorkoutSource[]).map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Actividad">
                <Select value={filters.type} onChange={(e) => set('type', e.target.value as ActivityType | '')}>
                  <option value="">Todas</option>
                  {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
            </Card>
          )}

          {data.isLoading ? (
            <LoadingBlock />
          ) : data.error ? (
            <ErrorBlock message={toUserMessage(data.error)} onRetry={data.refetch} />
          ) : grouped.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListChecks}
                title={data.workouts.length === 0 ? 'Aún no hay entrenamientos' : 'Nada con estos filtros'}
                description={
                  data.workouts.length === 0
                    ? 'Sube la captura de tu próxima carrera y empezará a contar para tu objetivo.'
                    : 'Prueba a cambiar o quitar los filtros.'
                }
                action={
                  data.workouts.length === 0 ? (
                    <Button asChild>
                      <Link to="/anadir/entrenamiento">Registrar entrenamiento</Link>
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            grouped.map(([week, items]) => {
              const counted = items.filter(data.countable).reduce((a, w) => a + w.distance_km, 0);
              return (
                <section key={week} aria-labelledby={`wk-${week}`}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 id={`wk-${week}`} className="eyebrow">
                      Semana {formatWeekRange(week)}
                    </h2>
                    <p className="num text-sm font-semibold text-muted">{formatKm(counted)} km computables</p>
                  </div>
                  <Card>
                    <ul className="divide-y divide-border/60">
                      {items.map((w) => {
                        const p = profileOf(w.user_id);
                        return (
                          <li key={w.id}>
                            <Link to={`/entrenamientos/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                              <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {w.user_id === user.id ? 'Tú' : p?.display_name ?? 'Miembro'}
                                  <span className="font-normal text-muted"> · {formatShortDate(w.activity_date)}</span>
                                </p>
                                <p className="truncate text-xs text-muted">
                                  {ACTIVITY_LABELS[w.activity_type]} · {SOURCE_LABELS[w.source]}
                                  {w.duration_s ? ` · ${formatDuration(w.duration_s)}` : ''}
                                  {w.avg_pace_s_per_km ? ` · ${formatPace(w.avg_pace_s_per_km)} /km` : ''}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {w.validation_status !== 'confirmed' && <StatusBadge status={w.validation_status} />}
                                  {w.validation_status === 'confirmed' && !data.countable(w) && <Badge>No computa</Badge>}
                                  {w.entry_method === 'manual' && <Badge>Manual</Badge>}
                                </div>
                              </div>
                              <p className="num shrink-0 text-xl font-bold">
                                {formatKm(w.distance_km, true)}
                                <span className="ml-0.5 text-xs text-muted">km</span>
                              </p>
                              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                </section>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
