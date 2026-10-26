import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Flag,
  History,
  ListChecks,
  Plus,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, ProgressBar, StatusBadge } from '@/components/ui/misc';
import { combineSummaries, summarizeSeason, type SeasonSummary, type WeekLedger } from '@/domain/calc/compliance';
import { sortRanking } from '@/domain/calc/ranking';
import { ACTIVITY_LABELS, SOURCE_LABELS } from '@/domain/types';
import { useAuth, useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { useRanking } from '@/hooks/useSeasonData';
import { addDays, formatShortDate, formatWeekRange, isoWeekNumber, seasonWeekIndex } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatKm, formatPct, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NoSeasonState } from '@/features/seasons/NoSeasonState';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 14) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export function DashboardPage() {
  const user = useUser();
  const { profile } = useAuth();
  const { season, profileOf } = useActiveGroup();
  const data = useRanking();

  const firstName = profile?.display_name.split(' ')[0] ?? '';

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{greeting()}</p>
          <h1 className="truncate font-display text-[34px] font-bold uppercase italic leading-none tracking-tight sm:text-4xl">
            {firstName || 'Árbitro'}
          </h1>
        </div>
        {season && (
          <Link to="/temporada" className="shrink-0">
            <Badge tone={season.status === 'active' ? 'accent' : 'neutral'} className="py-1 text-xs">
              {season.name}
            </Badge>
          </Link>
        )}
      </header>

      {!season ? (
        <NoSeasonState />
      ) : data.isLoading ? (
        <LoadingBlock />
      ) : data.error ? (
        <ErrorBlock message={toUserMessage(data.error)} onRetry={data.refetch} />
      ) : (
        <DashboardContent userId={user.id} data={data} profileOf={profileOf} />
      )}
    </div>
  );
}

function DashboardContent({
  userId,
  data,
  profileOf,
}: {
  userId: string;
  data: ReturnType<typeof useRanking>;
  profileOf: ReturnType<typeof useActiveGroup>['profileOf'];
}) {
  const season = data.season!;
  const ledger = data.ledgerFor(userId);
  const week = data.weekFor(userId);
  const nextWeek = data.weekFor(userId, addDays(data.currentWeek, 7));
  const summary = summarizeSeason(ledger, season.compliance_policy);
  const weekNo = seasonWeekIndex(season.start_date, data.currentWeek);
  const inSeason = data.today >= season.start_date && data.today <= season.end_date;
  const ranking = useMemo(() => sortRanking(data.rows, 'pct_desc'), [data.rows]);
  const accumulated = season.compliance_policy === 'season_total';
  const groupTotal = useMemo(() => combineSummaries(data.rows.map((r) => r.summary)), [data.rows]);

  const recent = useMemo(() => {
    const items: Array<{ key: string; at: string; node: ReactNode }> = [];
    for (const w of data.workouts.slice(0, 8)) {
      const p = profileOf(w.user_id);
      items.push({
        key: `w-${w.id}`,
        at: w.created_at,
        node: (
          <Link to={`/entrenamientos/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
            <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-semibold">{w.user_id === userId ? 'Tú' : p?.display_name ?? 'Miembro'}</span>
                <span className="text-muted"> · {ACTIVITY_LABELS[w.activity_type].toLowerCase()} · {SOURCE_LABELS[w.source]}</span>
              </p>
              <p className="text-xs text-muted">
                {formatShortDate(w.activity_date)} · {formatRelative(w.created_at)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="num text-lg font-bold leading-none">
                {formatKm(w.distance_km, true)}
                <span className="ml-0.5 text-xs text-muted">km</span>
              </span>
              {w.validation_status !== 'confirmed' && <StatusBadge status={w.validation_status} />}
            </div>
          </Link>
        ),
      });
    }
    for (const m of data.matches.slice(0, 5)) {
      const p = profileOf(m.referee_id);
      items.push({
        key: `m-${m.id}`,
        at: m.created_at,
        node: (
          <Link to="/historial" className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2">
              <Flag className="size-4 text-accent-text" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-semibold">{m.referee_id === userId ? 'Tu partido' : `Partido de ${p?.display_name ?? 'miembro'}`}</span>
                <span className="text-muted"> · {m.home_goals}-{m.away_goals}</span>
              </p>
              <p className="text-xs text-muted">
                Semana {formatWeekRange(m.week_start)} · {formatRelative(m.created_at)}
              </p>
            </div>
            <span className="num text-lg font-bold leading-none text-accent-text">
              +{m.target_km}
              <span className="ml-0.5 text-xs text-muted">km</span>
            </span>
          </Link>
        ),
      });
    }
    return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6);
  }, [data.workouts, data.matches, profileOf, userId]);

  return (
    <>
      {/* ---------- Tarjeta principal ---------- */}
      {accumulated ? (
        <SeasonHero
          summary={summary}
          seasonName={season.name}
          nextWeekTarget={nextWeek.targetKm}
          nextWeekStart={nextWeek.weekStart}
          workouts={ledger.reduce((a, w) => a + w.workoutCount, 0)}
        />
      ) : (
      <Card className="relative overflow-hidden">
        <div aria-hidden className="track-texture pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">
              {inSeason ? `Semana ${weekNo}` : `Semana ISO ${isoWeekNumber(data.currentWeek)}`} · {formatWeekRange(data.currentWeek)}
            </p>
            <Badge tone="neutral">En curso</Badge>
          </div>

          {week.targetKm === 0 ? (
            <div className="mt-4">
              <p className="font-display text-4xl font-bold uppercase italic leading-none">Sin objetivo</p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                No tienes ningún partido asignado a esta semana.
                {week.completedKm > 0 && ` Llevas ${formatKm(week.completedKm)} km corridos igualmente.`}
              </p>
              <Button asChild size="sm" variant="secondary" className="mt-4">
                <Link to="/anadir/partido">
                  <CalendarPlus aria-hidden /> Registrar partido
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  {week.met ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-accent-text">
                      <CheckCircle2 className="size-4" aria-hidden /> Objetivo cumplido
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Te faltan</p>
                  )}
                  <p className="num mt-1 text-[64px] font-bold leading-[0.85] tracking-tight text-fg sm:text-7xl">
                    {week.met ? formatKm(week.completedKm) : formatKm(week.pendingKm)}
                    <span className="ml-1.5 text-2xl text-muted">km</span>
                  </p>
                  {week.met && week.completedKm > week.targetKm && (
                    <p className="mt-1 text-sm text-muted">+{formatKm(week.completedKm - week.targetKm)} km por encima del objetivo</p>
                  )}
                </div>
                <p className="num pb-1 text-4xl font-bold leading-none text-accent-text">{formatPct(week.pct)}</p>
              </div>
              <ProgressBar value={week.pct} size="lg" className="mt-4" label="Progreso del objetivo semanal" />
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Objetivo</dt>
                  <dd className="num text-xl font-bold">{formatKm(week.targetKm)} km</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Corridos</dt>
                  <dd className="num text-xl font-bold">{formatKm(week.completedKm)} km</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Entrenos</dt>
                  <dd className="num text-xl font-bold">{week.workoutCount}</dd>
                </div>
              </dl>
            </>
          )}
          {nextWeek.targetKm > 0 && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2 text-xs text-muted">
              <Timer className="size-4 text-accent-text" aria-hidden />
              Próxima semana ({formatWeekRange(nextWeek.weekStart)}): <strong className="text-fg">{nextWeek.targetKm} km</strong> de objetivo
            </p>
          )}
        </div>
      </Card>
      )}

      {/* ---------- Temporada + acciones ---------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        {accumulated ? (
          <WeekCard week={week} label={inSeason ? `Semana ${weekNo}` : `Semana ISO ${isoWeekNumber(data.currentWeek)}`} />
        ) : (
        <Card>
          <CardHeader
            eyebrow="Temporada"
            title={season.name}
            action={
              <Link to="/estadisticas" className="flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
                Estadísticas <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <div className="p-4 pt-3 sm:p-5 sm:pt-3">
            {summary.weeksWithTarget === 0 ? (
              <p className="text-sm text-muted">Todavía no tienes objetivos en semanas iniciadas. El porcentaje aparecerá con tu primer partido.</p>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <p className="num text-5xl font-bold leading-none">{formatPct(summary.pct)}</p>
                  <p className="text-right text-xs text-muted">
                    {summary.weeksMet} de {summary.weeksWithTarget} semanas
                    <br />
                    con objetivo cumplido
                  </p>
                </div>
                <ProgressBar value={summary.pct} className="mt-3" label="Cumplimiento de la temporada" />
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-xs text-muted">Objetivos</dt>
                    <dd className="num text-lg font-bold">{formatKm(summary.targetKm)} km</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Corridos</dt>
                    <dd className="num text-lg font-bold">{formatKm(summary.completedKm)} km</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Pendientes</dt>
                    <dd className="num text-lg font-bold">{formatKm(summary.pendingKm)} km</dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        </Card>
        )}

        <nav aria-label="Acciones rápidas" className="grid grid-cols-2 gap-3">
          <QuickAction to="/anadir/entrenamiento" icon={Plus} label="Registrar entrenamiento" primary />
          <QuickAction to="/anadir/partido" icon={Flag} label="Registrar partido" />
          <QuickAction to="/clasificacion" icon={Trophy} label="Ver clasificación" />
          <QuickAction to="/historial" icon={History} label="Consultar historial" />
        </nav>
      </div>

      {/* ---------- Grupo + actividad ---------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            eyebrow="Grupo"
            title="Cómo va el grupo"
            action={
              <Link to="/clasificacion" className="flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
                Clasificación <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {groupTotal.targetKm > 0 && (
            <p className="mx-4 mt-3 rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2 text-xs text-muted sm:mx-5">
              Entre todos: <strong className="num text-sm text-fg">{formatKm(groupTotal.completedKm)} km</strong> de{' '}
              <strong className="num text-sm text-fg">{formatKm(groupTotal.targetKm)} km</strong> ·{' '}
              <strong className="num text-sm text-accent-text">{formatPct(groupTotal.pct)}</strong>
            </p>
          )}
          <ul className="mt-2 divide-y divide-border/60 pb-2">
            {ranking.map((row) => {
              const p = profileOf(row.userId);
              const me = row.userId === userId;
              return (
                <li key={row.userId}>
                  <Link to={me ? '/perfil' : `/miembros/${row.userId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                    <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn('truncate text-sm font-medium', me && 'text-accent-text')}>
                          {p?.display_name ?? 'Miembro'}
                          {me && <span className="sr-only"> (tú)</span>}
                        </p>
                        <p className="num shrink-0 text-base font-bold">{formatPct(row.summary.pct)}</p>
                      </div>
                      <ProgressBar value={row.summary.pct} size="sm" className="mt-1.5" label={`Cumplimiento de ${p?.display_name ?? 'miembro'}`} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            eyebrow="Actividad"
            title="Actividad reciente"
            action={
              <Link to="/entrenamientos" className="flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
                Ver todo <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Sin actividad todavía"
              description="Registra tu partido o tu primer entrenamiento para empezar la temporada."
              action={
                <Button asChild size="sm">
                  <Link to="/anadir">Añadir registro</Link>
                </Button>
              }
            />
          ) : (
            <ul className="mt-2 divide-y divide-border/60 pb-2">
              {recent.map((r) => (
                <li key={r.key}>{r.node}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function QuickAction({ to, icon: Icon, label, primary }: { to: string; icon: LucideIcon; label: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-h-[104px] flex-col justify-between rounded-2xl border p-4 transition-all active:scale-[0.98]',
        primary
          ? 'border-accent/40 bg-accent text-accent-fg shadow-glow hover:brightness-105'
          : 'border-border/70 bg-surface hover:border-accent/40 hover:bg-surface-2',
      )}
    >
      <Icon className={cn('size-6', !primary && 'text-accent-text')} aria-hidden />
      <span className="text-sm font-semibold leading-tight">{label}</span>
    </Link>
  );
}

function SeasonHero({
  summary,
  seasonName,
  nextWeekTarget,
  nextWeekStart,
  workouts,
}: {
  summary: SeasonSummary;
  seasonName: string;
  nextWeekTarget: number;
  nextWeekStart: string;
  workouts: number;
}) {
  const upToDate = summary.targetKm > 0 && summary.pendingKm === 0;
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="track-texture pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Acumulado · {seasonName}</p>
          <Link to="/estadisticas" className="flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
            Estadísticas <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {summary.targetKm === 0 ? (
          <div className="mt-4">
            <p className="font-display text-4xl font-bold uppercase italic leading-none">Sin objetivo aún</p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Registra tu primer partido: sus goles se sumarán a tu objetivo de la temporada.
              {summary.completedKm > 0 && ` Ya llevas ${formatKm(summary.completedKm)} km.`}
            </p>
            <Button asChild size="sm" variant="secondary" className="mt-4">
              <Link to="/anadir/partido">
                <CalendarPlus aria-hidden /> Registrar partido
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                {upToDate ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-accent-text">
                    <CheckCircle2 className="size-4" aria-hidden /> Vas al día
                  </p>
                ) : (
                  <p className="text-sm text-muted">Te faltan en total</p>
                )}
                <p className="num mt-1 text-[64px] font-bold leading-[0.85] tracking-tight text-fg sm:text-7xl">
                  {upToDate ? formatKm(summary.completedKm) : formatKm(summary.pendingKm)}
                  <span className="ml-1.5 text-2xl text-muted">km</span>
                </p>
                {upToDate && summary.extraKm > 0 && (
                  <p className="mt-1 text-sm text-muted">+{formatKm(summary.extraKm)} km por encima del objetivo acumulado</p>
                )}
              </div>
              <p className="num pb-1 text-4xl font-bold leading-none text-accent-text">{formatPct(summary.pct)}</p>
            </div>
            <ProgressBar value={summary.pct} size="lg" className="mt-4" label="Kilómetros hechos sobre el objetivo acumulado" />
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Objetivo acum.</dt>
                <dd className="num text-xl font-bold">{formatKm(summary.targetKm)} km</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Km hechos</dt>
                <dd className="num text-xl font-bold">{formatKm(summary.completedKm)} km</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Entrenos</dt>
                <dd className="num text-xl font-bold">{workouts}</dd>
              </div>
            </dl>
          </>
        )}
        {nextWeekTarget > 0 && (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2 text-xs text-muted">
            <Timer className="size-4 shrink-0 text-accent-text" aria-hidden />
            Incluye {nextWeekTarget} km del partido asignado a la semana del {formatWeekRange(nextWeekStart)}
          </p>
        )}
      </div>
    </Card>
  );
}

function WeekCard({ week, label }: { week: WeekLedger; label: string }) {
  return (
    <Card>
      <CardHeader eyebrow="Esta semana" title={`${label} · ${formatWeekRange(week.weekStart)}`} />
      <div className="p-4 pt-3 sm:p-5 sm:pt-3">
        <div className="flex items-end justify-between gap-3">
          <p className="num text-5xl font-bold leading-none">
            {formatKm(week.completedKm)}
            <span className="ml-1 text-lg text-muted">km</span>
          </p>
          <p className="text-right text-xs text-muted">
            {week.targetKm > 0 ? (
              <>
                de {week.targetKm} km
                <br />
                del partido de esta semana
              </>
            ) : (
              <>
                sin partido asignado
                <br />a esta semana
              </>
            )}
          </p>
        </div>
        {week.targetKm > 0 && <ProgressBar value={week.pct} className="mt-3" label="Kilómetros de esta semana" />}
        <p className="mt-3 text-xs text-muted">
          {week.workoutCount} {week.workoutCount === 1 ? 'entrenamiento' : 'entrenamientos'} esta semana. Todo lo que corras suma al acumulado de la
          temporada.
        </p>
      </div>
    </Card>
  );
}
