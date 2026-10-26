import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Download, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Badge, EmptyState } from '@/components/ui/misc';
import { buildRanking } from '@/domain/calc/ranking';
import {
  ACTIVITY_LABELS,
  POLICY_LABELS,
  SEASON_STATUS_LABELS,
  SOURCE_LABELS,
  type ActivityType,
  type CompliancePolicy,
  type Season,
  type SeasonStatus,
} from '@/domain/types';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { TIMEZONES } from '@/features/group/onboarding';
import { useSeasonData } from '@/hooks/useSeasonData';
import { daysBetween, formatLongDate, todayInTimeZone } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { downloadFile, toCsv } from '@/lib/utils';
import { createSeason, updateSeason, type SeasonInput } from '@/services/api';

export function SeasonPage() {
  const { seasons, season, setSeasonId, isAdmin } = useActiveGroup();
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; season: Season } | null>(null);

  return (
    <>
      <PageHeader
        title="Temporada"
        subtitle="Fechas, reglas de cumplimiento y exportación de datos."
        actions={
          isAdmin && (
            <Button size="sm" onClick={() => setForm({ mode: 'create' })}>
              <Plus aria-hidden /> Nueva
            </Button>
          )
        }
      />
      {seasons.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarRange}
            title="Sin temporadas"
            description={isAdmin ? 'Crea la primera temporada para empezar el reto.' : 'Un administrador debe crear la temporada.'}
            action={isAdmin ? <Button onClick={() => setForm({ mode: 'create' })}>Crear temporada</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {season && <SeasonDetails season={season} onEdit={() => setForm({ mode: 'edit', season })} />}
          {seasons.length > 1 && (
            <Card>
              <CardHeader title="Todas las temporadas" />
              <ul className="mt-2 divide-y divide-border/60 pb-2">
                {seasons.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSeasonId(s.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2/60 sm:px-5"
                      aria-current={s.id === season?.id ? 'true' : undefined}
                    >
                      <span>
                        <span className="block text-sm font-semibold">{s.name}</span>
                        <span className="text-xs text-muted">
                          {formatLongDate(s.start_date)} – {formatLongDate(s.end_date)}
                        </span>
                      </span>
                      <Badge tone={s.status === 'active' ? 'accent' : 'neutral'}>{SEASON_STATUS_LABELS[s.status]}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      {form && <SeasonFormDialog initial={form.mode === 'edit' ? form.season : null} onClose={() => setForm(null)} />}
    </>
  );
}

function SeasonDetails({ season, onEdit }: { season: Season; onEdit(): void }) {
  const { isAdmin, group, activeMembers, profileOf } = useActiveGroup();
  const data = useSeasonData();
  const total = daysBetween(season.start_date, season.end_date) + 1;
  const elapsed = Math.min(total, Math.max(0, daysBetween(season.start_date, data.today) + 1));

  const exportData = (format: 'csv' | 'json') => {
    const name = (id: string) => profileOf(id)?.display_name ?? id;
    const matches = data.matches.map((m) => ({
      arbitro: name(m.referee_id),
      fecha_partido: m.match_date,
      semana: m.week_start,
      competicion: m.competition,
      local: m.home_team,
      visitante: m.away_team,
      goles_local: m.home_goals,
      goles_visitante: m.away_goals,
      objetivo_km: m.target_km,
      motivo_correccion: m.change_reason,
    }));
    const workouts = data.workouts.map((w) => ({
      arbitro: name(w.user_id),
      fecha: w.activity_date,
      semana: w.week_start,
      actividad: ACTIVITY_LABELS[w.activity_type],
      fuente: SOURCE_LABELS[w.source],
      metodo: w.entry_method,
      distancia_km: w.distance_km,
      duracion_s: w.duration_s,
      ritmo_s_km: w.avg_pace_s_per_km,
      estado: w.validation_status,
      computa: data.countable(w),
    }));
    const ranking = buildRanking(
      activeMembers.map((m) => m.user_id),
      data.matches,
      data.workouts,
      season,
      data.currentWeek,
    ).map((r) => ({
      arbitro: name(r.userId),
      objetivo_km: r.summary.targetKm,
      corridos_km: r.summary.completedKm,
      atribuibles_km: r.summary.attributableKm,
      pendientes_km: r.summary.pendingKm,
      cumplimiento_pct: r.summary.pct === null ? null : Math.round(r.summary.pct * 10) / 10,
      entrenamientos: r.workoutCount,
    }));
    const slug = `refrun-${season.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${todayInTimeZone(season.timezone)}`;
    if (format === 'json') {
      downloadFile(`${slug}.json`, JSON.stringify({ grupo: group.name, temporada: season, clasificacion: ranking, partidos: matches, entrenamientos: workouts }, null, 2), 'application/json');
    } else {
      downloadFile(`${slug}-clasificacion.csv`, '﻿' + toCsv(ranking), 'text/csv;charset=utf-8');
      downloadFile(`${slug}-partidos.csv`, '﻿' + toCsv(matches), 'text/csv;charset=utf-8');
      downloadFile(`${slug}-entrenamientos.csv`, '﻿' + toCsv(workouts), 'text/csv;charset=utf-8');
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow={SEASON_STATUS_LABELS[season.status]}
        title={season.name}
        action={
          isAdmin && (
            <Button size="sm" variant="secondary" onClick={onEdit}>
              <Pencil aria-hidden /> Editar
            </Button>
          )
        }
      />
      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <div className="flex justify-between text-xs text-muted">
            <span>{formatLongDate(season.start_date)}</span>
            <span>{formatLongDate(season.end_date)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Avance de la temporada" aria-valuemin={0} aria-valuemax={total} aria-valuenow={elapsed}>
            <div className="h-full rounded-full bg-fg/40" style={{ width: `${(elapsed / total) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            Día {elapsed} de {total}
          </p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-surface-2/60 p-3">
            <dt className="text-xs text-muted">Metodología de cumplimiento</dt>
            <dd className="mt-0.5 font-medium">{POLICY_LABELS[season.compliance_policy]}</dd>
            <dd className="mt-1 text-xs text-muted">
              {season.compliance_policy === 'season_total'
                ? 'Los goles de cada partido se suman al objetivo de la temporada y todos los km corridos se suman al total. Cumplimiento = km hechos ÷ objetivo acumulado.'
                : season.compliance_policy === 'weekly_independent'
                  ? 'Cada semana se evalúa por separado. Los km de más se conservan, pero no compensan otras semanas.'
                  : 'Los km de más en una semana compensan los déficits de semanas anteriores.'}
            </dd>
          </div>
          <div className="rounded-xl bg-surface-2/60 p-3">
            <dt className="text-xs text-muted">Actividades que computan</dt>
            <dd className="mt-0.5 font-medium">{season.counted_activity_types.map((t) => ACTIVITY_LABELS[t]).join(', ')}</dd>
          </div>
          <div className="rounded-xl bg-surface-2/60 p-3">
            <dt className="text-xs text-muted">Semanas</dt>
            <dd className="mt-0.5 font-medium">De lunes a domingo · zona horaria {season.timezone}</dd>
          </div>
          <div className="rounded-xl bg-surface-2/60 p-3">
            <dt className="text-xs text-muted">Registros manuales</dt>
            <dd className="mt-0.5 font-medium">{season.manual_requires_review ? 'Requieren revisión de un administrador' : 'Cuentan directamente'}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
          <Button size="sm" variant="secondary" onClick={() => exportData('csv')} disabled={data.isLoading}>
            <Download aria-hidden /> Exportar CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exportData('json')} disabled={data.isLoading}>
            <Download aria-hidden /> Exportar JSON
          </Button>
        </div>
      </div>
    </Card>
  );
}

const ALL_TYPES = Object.keys(ACTIVITY_LABELS) as ActivityType[];

function SeasonFormDialog({ initial, onClose }: { initial: Season | null; onClose(): void }) {
  const { group } = useActiveGroup();
  const queryClient = useQueryClient();
  const [v, setV] = useState<SeasonInput>(
    initial
      ? {
          name: initial.name,
          start_date: initial.start_date,
          end_date: initial.end_date,
          timezone: initial.timezone,
          status: initial.status,
          compliance_policy: initial.compliance_policy,
          counted_activity_types: initial.counted_activity_types,
          manual_requires_review: initial.manual_requires_review,
        }
      : {
          name: '',
          start_date: '',
          end_date: '',
          timezone: group.timezone,
          status: 'active',
          compliance_policy: 'season_total',
          counted_activity_types: ['run', 'treadmill'],
          manual_requires_review: false,
        },
  );
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SeasonInput>(k: K, val: SeasonInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const policyChanged = !!initial && initial.compliance_policy !== v.compliance_policy;

  const save = useMutation({
    mutationFn: () => (initial ? updateSeason(initial.id, v) : createSeason(group.id, v)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['seasons', group.id] });
      toast.success(initial ? 'Temporada actualizada (cambio registrado en el historial).' : 'Temporada creada.');
      onClose();
    },
    onError: (e) => setError(toUserMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (v.name.trim().length < 2) return setError('Pon un nombre a la temporada.');
    if (!v.start_date || !v.end_date) return setError('Indica las fechas de inicio y fin.');
    if (v.end_date < v.start_date) return setError('La fecha de fin debe ser posterior a la de inicio.');
    if (v.counted_activity_types.length === 0) return setError('Elige al menos un tipo de actividad que compute.');
    save.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={initial ? 'Editar temporada' : 'Nueva temporada'} className="sm:max-w-xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Field label="Nombre">
          <Input value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={60} placeholder="Temporada 2026-27" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio">
            <Input type="date" value={v.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </Field>
          <Field label="Fin">
            <Input type="date" value={v.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Estado" hint="Solo puede haber una temporada activa. Una cerrada no admite cambios.">
            <Select value={v.status} onChange={(e) => set('status', e.target.value as SeasonStatus)}>
              {(Object.keys(SEASON_STATUS_LABELS) as SeasonStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SEASON_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zona horaria">
            <Select value={v.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {[...new Set([v.timezone, ...TIMEZONES])].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Metodología de cumplimiento"
          warning={policyChanged ? 'Cambiar la metodología recalcula los porcentajes de toda la temporada. El cambio quedará registrado.' : undefined}
        >
          <Select value={v.compliance_policy} onChange={(e) => set('compliance_policy', e.target.value as CompliancePolicy)}>
            {(Object.keys(POLICY_LABELS) as CompliancePolicy[]).map((p) => (
              <option key={p} value={p}>
                {POLICY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Actividades que computan para el objetivo</legend>
          <div className="grid grid-cols-2 gap-2">
            {ALL_TYPES.map((t) => (
              <Checkbox
                key={t}
                label={ACTIVITY_LABELS[t]}
                checked={v.counted_activity_types.includes(t)}
                onChange={(c) =>
                  set('counted_activity_types', c ? [...v.counted_activity_types, t] : v.counted_activity_types.filter((x) => x !== t))
                }
              />
            ))}
          </div>
        </fieldset>
        <Checkbox
          label="Los registros manuales requieren revisión"
          description="Si se activa, los entrenamientos introducidos a mano no cuentan hasta que un administrador los valide."
          checked={v.manual_requires_review}
          onChange={(c) => set('manual_requires_review', c)}
        />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            {initial ? 'Guardar cambios' : 'Crear temporada'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
