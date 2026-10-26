import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, History, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Avatar, EmptyState, ErrorBlock, LoadingBlock, Segmented } from '@/components/ui/misc';
import { parseGoals, previewTarget } from '@/domain/calc/goals';
import type { Match } from '@/domain/types';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { NoSeasonState } from '@/features/seasons/NoSeasonState';
import { SeasonPicker } from '@/features/seasons/SeasonPicker';
import { useSeasonData } from '@/hooks/useSeasonData';
import { addDays, formatLongDate, formatWeekRange, weekStartOf } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatKm, formatRelative } from '@/lib/format';
import { deleteMatch, listAudit, updateMatch } from '@/services/api';
import { describeAudit } from './audit';

const GRACE_MS = 30 * 60 * 1000;

export function HistoryPage() {
  const [tab, setTab] = useState<'matches' | 'changes'>('matches');
  const { season } = useActiveGroup();
  return (
    <>
      <PageHeader title="Historial" subtitle="Partidos de la temporada y registro de cambios." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Sección"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'matches', label: 'Partidos' },
            { value: 'changes', label: 'Cambios' },
          ]}
        />
        <SeasonPicker />
      </div>
      {tab === 'matches' ? season ? <MatchesList /> : <NoSeasonState /> : <AuditList />}
    </>
  );
}

function MatchesList() {
  const user = useUser();
  const { isAdmin, profileOf } = useActiveGroup();
  const data = useSeasonData();
  const [editing, setEditing] = useState<Match | null>(null);
  const [deleting, setDeleting] = useState<Match | null>(null);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (m: Match) => deleteMatch(m.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
      setDeleting(null);
      toast.success('Partido eliminado. El objetivo de esa semana se ha recalculado.');
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  if (data.isLoading) return <LoadingBlock />;
  if (data.error) return <ErrorBlock message={toUserMessage(data.error)} onRetry={data.refetch} />;
  if (data.matches.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Flag}
          title="Todavía no hay partidos"
          description="Cada partido registrado genera el objetivo semanal de su árbitro."
          action={
            <Button asChild>
              <Link to="/anadir/partido">Registrar partido</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const canEdit = (m: Match) =>
    data.season?.status !== 'closed' && (isAdmin || (m.created_by === user.id && Date.now() - new Date(m.created_at).getTime() < GRACE_MS));

  return (
    <>
      <Card>
        <ul className="divide-y divide-border/60">
          {data.matches.map((m) => {
            const p = profileOf(m.referee_id);
            const week = data.weekFor(m.referee_id, m.week_start);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {m.referee_id === user.id ? 'Tú' : p?.display_name ?? 'Miembro'}
                    <span className="num ml-2 text-base">
                      {m.home_goals}-{m.away_goals}
                    </span>
                    {(m.home_team || m.away_team) && (
                      <span className="font-normal text-muted">
                        {' '}
                        · {m.home_team ?? '—'} vs {m.away_team ?? '—'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {formatLongDate(m.match_date)}
                    {m.competition ? ` · ${m.competition}` : ''} · semana {formatWeekRange(m.week_start)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Aporta <strong className="text-fg">{m.target_km} km</strong> a un objetivo semanal de {week.targetKm} km · corridos{' '}
                    {formatKm(week.completedKm)} km
                    {m.change_reason && <span className="text-warning"> · corregido: {m.change_reason}</span>}
                  </p>
                </div>
                <span className="num text-2xl font-bold text-accent-text">
                  {m.target_km}
                  <span className="ml-0.5 text-xs text-muted">km</span>
                </span>
                {canEdit(m) && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="Corregir partido" onClick={() => setEditing(m)}>
                      <Pencil />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Eliminar partido" onClick={() => setDeleting(m)}>
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      {!isAdmin && (
        <p className="mt-3 text-xs text-muted">
          Puedes corregir tu propio partido durante 30 minutos tras registrarlo. Después, pide la corrección a un administrador.
        </p>
      )}
      {editing && <CorrectMatchDialog match={editing} onClose={() => setEditing(null)} />}
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="¿Eliminar este partido?"
        description={deleting ? `Se quitarán ${deleting.target_km} km del objetivo de la semana ${formatWeekRange(deleting.week_start)}. Los entrenamientos no se borran.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              Eliminar
            </Button>
          </>
        }
      />
    </>
  );
}

function CorrectMatchDialog({ match, onClose }: { match: Match; onClose(): void }) {
  const { isAdmin, activeMembers, profileOf } = useActiveGroup();
  const data = useSeasonData();
  const queryClient = useQueryClient();
  const [home, setHome] = useState(String(match.home_goals));
  const [away, setAway] = useState(String(match.away_goals));
  const [week, setWeek] = useState(match.week_start);
  const [referee, setReferee] = useState(match.referee_id);
  const [reason, setReason] = useState('');

  const preview = previewTarget(home, away);
  const own = weekStartOf(match.match_date);
  const weekOptions = useMemo(() => [...new Set([addDays(own, 7), own, match.week_start])], [own, match.week_start]);

  // Saldo resultante de la semana tras la corrección.
  const currentWeek = data.weekFor(referee, week);
  const newTarget = preview ? currentWeek.targetKm - (referee === match.referee_id && week === match.week_start ? match.target_km : 0) + preview.target : null;

  const save = useMutation({
    mutationFn: () => {
      const h = parseGoals(home);
      const a = parseGoals(away);
      if (!h.ok || !a.ok) throw new Error('Revisa los goles');
      return updateMatch(match.id, {
        home_goals: h.value,
        away_goals: a.value,
        week_start: week,
        referee_id: referee,
        change_reason: reason.trim(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Partido corregido. Queda registrado en el historial de cambios.');
      onClose();
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const homeErr = parseGoals(home);
  const awayErr = parseGoals(away);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Corregir partido"
      description="La corrección actualiza el objetivo y conserva el valor anterior en el historial."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={!preview || reason.trim().length < 3} onClick={() => save.mutate()}>
            Guardar corrección
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Goles equipo 1" error={homeErr.ok ? undefined : homeErr.error}>
            <Input inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value)} className="num text-center text-2xl font-bold" />
          </Field>
          <Field label="Goles equipo 2" error={awayErr.ok ? undefined : awayErr.error}>
            <Input inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value)} className="num text-center text-2xl font-bold" />
          </Field>
        </div>
        <Field label="Semana de cumplimiento">
          <Select value={week} onChange={(e) => setWeek(e.target.value)}>
            {weekOptions.map((w) => (
              <option key={w} value={w}>
                {formatWeekRange(w)}
              </option>
            ))}
          </Select>
        </Field>
        {isAdmin && (
          <Field label="Árbitro">
            <Select value={referee} onChange={(e) => setReferee(e.target.value)}>
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile.display_name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Motivo de la corrección" hint="Obligatorio. Quedará visible para el grupo.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Acta corregida, error al teclear…" />
        </Field>
        {preview && newTarget !== null && (
          <div aria-live="polite" className="rounded-xl border border-border bg-surface-2/60 p-3 text-sm">
            <p>
              Objetivo del partido: <s className="text-muted">{match.target_km} km</s> → <strong className="text-accent-text">{preview.target} km</strong>
            </p>
            <p className="mt-1 text-muted">
              Semana de {profileOf(referee)?.display_name ?? 'árbitro'} ({formatWeekRange(week)}): objetivo {newTarget} km · corridos{' '}
              {formatKm(currentWeek.completedKm)} km · pendientes {formatKm(Math.max(0, newTarget - currentWeek.completedKm))} km
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function AuditList() {
  const { group, profileOf } = useActiveGroup();
  const query = useQuery({ queryKey: ['audit', group.id], queryFn: () => listAudit(group.id, 150) });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={toUserMessage(query.error)} onRetry={() => void query.refetch()} />;
  const events = query.data ?? [];
  if (events.length === 0) {
    return (
      <Card>
        <EmptyState icon={History} title="Sin cambios registrados" />
      </Card>
    );
  }
  return (
    <Card>
      <ol className="divide-y divide-border/60">
        {events.map((ev) => {
          const actor = ev.actor_id ? profileOf(ev.actor_id) : undefined;
          const d = describeAudit(ev, profileOf);
          return (
            <li key={ev.id} className="flex gap-3 px-4 py-3 sm:px-5">
              <Avatar name={actor?.display_name ?? 'Sistema'} color={actor?.avatar_color} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{actor?.display_name ?? 'Administración'}</span> {d.title}
                </p>
                {d.detail && <p className="mt-0.5 text-xs text-muted">{d.detail}</p>}
                <p className="mt-0.5 text-xs text-muted">{formatRelative(ev.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
