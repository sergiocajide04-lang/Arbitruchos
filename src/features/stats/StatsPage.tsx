import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { ErrorBlock, LoadingBlock, ProgressBar, Segmented, Stat } from '@/components/ui/misc';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { NoSeasonState } from '@/features/seasons/NoSeasonState';
import { SeasonPicker } from '@/features/seasons/SeasonPicker';
import { formatShortDate } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatDuration, formatDurationLong, formatKm, formatPace, formatPct } from '@/lib/format';
import {
  CompliancePctChart,
  CumulativeChart,
  KmPerWeekChart,
  MonthlyChart,
  MonthlyPaceChart,
  PaceChart,
  TargetVsCompletedChart,
} from './charts';
import type { Period } from './series';
import { GROUP_ID, useMemberStats } from './useMemberStats';

export default function StatsPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const { season, activeMembers, profileOf } = useActiveGroup();
  const userId = params.get('u') ?? user.id;
  const [period, setPeriod] = useState<Period>('season');
  const s = useMemberStats(userId, period);
  const who = userId === GROUP_ID ? 'El grupo' : userId === user.id ? 'Tú' : profileOf(userId)?.display_name ?? 'Miembro';

  return (
    <>
      <PageHeader title="Estadísticas" subtitle={season?.name} />
      {!season ? (
        <NoSeasonState />
      ) : !s || s.isLoading ? (
        <LoadingBlock />
      ) : s.error ? (
        <ErrorBlock message={toUserMessage(s.error)} onRetry={s.refetch} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <label>
              <span className="sr-only">Ver estadísticas de</span>
              <Select
                value={userId}
                onChange={(e) => setParams(e.target.value === user.id ? {} : { u: e.target.value }, { replace: true })}
                className="h-9 w-auto rounded-lg py-0 text-sm"
              >
                <option value={user.id}>Mis estadísticas</option>
                <option value={GROUP_ID}>Todo el grupo</option>
                {activeMembers
                  .filter((m) => m.user_id !== user.id)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profile.display_name}
                    </option>
                  ))}
              </Select>
            </label>
            <SeasonPicker />
          </div>

          {/* ---------- Temporada acumulada ---------- */}
          <Card className="relative overflow-hidden">
            <div aria-hidden className="track-texture pointer-events-none absolute inset-0" />
            <div className="relative p-5 sm:p-6">
              <p className="eyebrow">Temporada acumulada · {who}</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <p className="num text-5xl font-bold leading-none sm:text-6xl">
                  {formatKm(s.summary.completedKm)}
                  <span className="ml-1.5 text-xl text-muted">de {formatKm(s.summary.targetKm)} km</span>
                </p>
                <p className="num text-4xl font-bold leading-none text-accent-text">{formatPct(s.summary.pct)}</p>
              </div>
              <ProgressBar value={s.summary.pct} size="lg" className="mt-4" label="Kilómetros hechos sobre el objetivo acumulado" />
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Stat label="Objetivo acumulado" value={formatKm(s.summary.targetKm)} unit="km" hint={`${s.matches.length} partidos`} />
                <Stat label="Km hechos" value={formatKm(s.summary.completedKm)} unit="km" emphasis />
                <Stat
                  label={s.summary.pendingKm > 0 ? 'Pendientes' : 'Por encima'}
                  value={formatKm(s.summary.pendingKm > 0 ? s.summary.pendingKm : s.summary.extraKm)}
                  unit="km"
                />
                <Stat label="Ritmo medio temporada" value={formatPace(s.seasonStats.pace)} unit={s.seasonStats.pace ? '/km' : undefined} hint="Ponderado por distancia" />
                <Stat label="Entrenamientos" value={s.seasonStats.count} hint="Registrados y computables" />
                <Stat
                  label="Distancia media"
                  value={s.seasonStats.avgKm !== null ? formatKm(s.seasonStats.avgKm, true) : '—'}
                  unit={s.seasonStats.avgKm !== null ? 'km' : undefined}
                />
                <Stat label="Tiempo total" value={s.seasonStats.timedCount ? formatDurationLong(s.seasonStats.totalDurationS) : '—'} />
                <Stat
                  label="Mejor ritmo"
                  value={formatPace(s.best?.pace)}
                  unit={s.best ? '/km' : undefined}
                  hint={s.best ? `${formatShortDate(s.best.workout.activity_date)}${s.isGroup ? ` · ${profileOf(s.best.workout.user_id)?.display_name ?? ''}` : ''}` : undefined}
                />
              </div>
            </div>
          </Card>

          {/* ---------- Evolución mensual ---------- */}
          <div className="grid gap-5 lg:grid-cols-2">
            <MonthlyChart data={s.monthly} />
            <MonthlyPaceChart data={s.monthly} />
          </div>

          {/* ---------- Detalle por semanas ---------- */}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Detalle por semanas</h2>
            <Segmented
              label="Periodo"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'season', label: 'Temporada' },
                { value: '12w', label: '12 semanas' },
                { value: '4w', label: '4 semanas' },
              ]}
            />
          </div>
          <Card>
            <CardHeader title="En el periodo" as="h3" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 p-4 sm:grid-cols-4 sm:p-5">
              <Stat label="Km" value={formatKm(s.stats.totalKm)} unit="km" />
              <Stat label="Entrenamientos" value={s.stats.count} />
              <Stat label="Ritmo medio" value={formatPace(s.stats.pace)} unit={s.stats.pace ? '/km' : undefined} />
              <Stat label="Duración media" value={formatDuration(s.stats.avgDurationS)} />
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <CumulativeChart data={s.weekly} />
            <KmPerWeekChart data={s.weekly} />
            <PaceChart data={s.weekly} />
            <CompliancePctChart data={s.weekly} />
            <div className="lg:col-span-2">
              <TargetVsCompletedChart data={s.weekly} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            {s.season.compliance_policy === 'season_total'
              ? 'Objetivo acumulado = suma de los goles de todos los partidos registrados. Km hechos = suma de todos los entrenamientos confirmados que computan. Cumplimiento = km hechos ÷ objetivo acumulado.'
              : 'Cumplimiento según la metodología de la temporada (ver Temporada).'}{' '}
            Ritmo medio = tiempo total ÷ distancia total de los entrenamientos con duración
            conocida. Mejor ritmo: actividad de al menos 1 km.
          </p>
        </div>
      )}
    </>
  );
}
